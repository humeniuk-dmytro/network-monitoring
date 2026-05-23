// Functions for SNMP checks

// Assuming pingResultOutputDiv, displayError, sessionPingHistory are global or correctly scoped.

async function manualSnmpCheck(deviceId, batchTimestamp = null) {
    const outputDiv = document.getElementById('lastCheckResultOutput');
    if (!outputDiv) { console.error("manualSnmpCheck: outputDiv 'lastCheckResultOutput' not found"); return; }

    const deviceRow = document.querySelector(`#devicesTable tbody tr[data-device-id='${deviceId}']`);
    let deviceName = String(deviceId);
    if (deviceRow && deviceRow.cells.length > 1) {
        deviceName = deviceRow.cells[1].textContent;
    }
    outputDiv.innerHTML = `<p><i class="fas fa-spinner fa-spin"></i> Запит SNMP метрик для ${deviceName} (ID: ${deviceId})...</p>`;
    displayError(""); // from uiUpdater.js

    const timestampForHistoryRecord = batchTimestamp ? batchTimestamp : new Date().toISOString().split('.')[0] + ".000Z";

    try {
        const response = await fetch(`/api/devices/${deviceId}/snmp_metrics`);
        const result = await response.json();

        let outputHtml = '';
        let historySnippet = '';
        let snmpSessionHistoryStatus = result.overall_status || 'snmp_error';
        let metricsForHistory = result.metrics || {};

        const statusIcon = getStatusIcon(snmpSessionHistoryStatus);
        const statusClass = getStatusClass(snmpSessionHistoryStatus);
        
        outputHtml += `<h3>${statusIcon} SNMP Результат для: ${deviceName}</h3>`;
        outputHtml += `<p><strong class="${statusClass}">Загальний статус: ${snmpSessionHistoryStatus}</strong></p>`;

        if (result.error) {
            outputHtml += `<p class="error-message">Деталі помилки: ${result.error}</p>`;
            historySnippet = `Загальний статус: ${snmpSessionHistoryStatus}\nПомилка: ${result.error}`;
        }

        if (metricsForHistory && Object.keys(metricsForHistory).length > 0) {
            outputHtml += `<div class="snmp-metrics-container">
                            <h4>Детальні SNMP Метрики:</h4>`;
            const categories = {
                "Загальна інформація": ['sysDescr', 'sysUpTimeInstance', 'hrSystemUptime'],
                "Завантаження CPU": ['laLoad1', 'laLoad5', 'laLoad15'],
                "Використання CPU (%)": ['ssCpuUser', 'ssCpuSystem', 'ssCpuIdle'],
                "Пам\'ять (RAM)": ['memTotalReal', 'memAvailReal', 'memBuffer', 'memCached'],
                "Пам\'ять (Swap)": ['memTotalSwap', 'memAvailSwap'],
                "Мережевий інтерфейс (enp0s1)": ['ifDescr_enp0s1', 'ifAlias_enp0s1', 'ifInOctets_enp0s1', 'ifOutOctets_enp0s1', 'ifSpeed_enp0s1'],
                "Дисковий простір (/)": ['hrStorageDescr_root', 'hrStorageAllocUnits_root', 'hrStorageSize_root', 'hrStorageUsed_root']
            };
            let metricsFormattedForSnippetArr = [];
            for (const categoryName in categories) {
                const categoryKeys = categories[categoryName];
                let categoryHtml = '';
                let hasMetricsInCategory = false;
                for (const key of categoryKeys) {
                    if (metricsForHistory.hasOwnProperty(key)) {
                        hasMetricsInCategory = true;
                        const value = metricsForHistory[key];
                        const formattedValue = formatSnmpValueForHistory(key, value, metricsForHistory);
                        const displayName = getSnmpMetricDisplayName(key);
                        let itemClass = 'snmp-metric-item';
                        if (typeof value === 'string' && value.toLowerCase().includes("помилка")) itemClass += ' error';
                        categoryHtml += `<li class="${itemClass}">
                                            <span class="metric-name">${displayName}:</span>
                                            <span class="metric-value">${formattedValue}</span>
                                         </li>`;
                        metricsFormattedForSnippetArr.push(`${displayName}: ${formattedValue}`);
                    }
                }
                if (hasMetricsInCategory) {
                    outputHtml += `<div class="snmp-category">
                                        <h5>${categoryName}</h5>
                                        <ul class="snmp-metrics-list">${categoryHtml}</ul>
                                   </div>`;
                }
            }
            outputHtml += `</div>`;
            if (!historySnippet) historySnippet = `Загальний статус: ${snmpSessionHistoryStatus}\n${metricsFormattedForSnippetArr.join('\n')}`;
            else historySnippet += `\n${metricsFormattedForSnippetArr.join('\n')}`;
        } else if (!result.error) {
            outputHtml += `<p>Немає детальних метрик для відображення. Загальний статус: ${snmpSessionHistoryStatus}</p>`;
            if (!historySnippet) historySnippet = `Загальний статус: ${snmpSessionHistoryStatus}. Метрики відсутні.`;
        }
        
        outputHtml += `<p class="timestamp"><em>Час перевірки: ${new Date().toLocaleString('uk-UA')}</em></p>`;
        outputDiv.innerHTML = outputHtml;

        if (!sessionPingHistory[deviceId]) { 
            sessionPingHistory[deviceId] = [];
        }
        sessionPingHistory[deviceId].push({
            device_id: deviceId,
            timestamp_iso: timestampForHistoryRecord, 
            status: snmpSessionHistoryStatus, 
            rtt_avg_ms: null, 
            raw_output_snippet: historySnippet.substring(0, 2000),
            check_type: 'snmp',
            metrics: metricsForHistory,
            isSavedToDB: false 
        });
        console.log(`MANUAL_SNMP_SESSION_ADD: ID ${deviceId}, Time: ${timestampForHistoryRecord}, Status: ${snmpSessionHistoryStatus}, Metrics:`, metricsForHistory, `Type: snmp`);

        if (typeof updateDeviceRowInTable === 'function') {
            updateDeviceRowInTable(deviceId, snmpSessionHistoryStatus, new Date(timestampForHistoryRecord).toLocaleString('uk-UA'), null);
        }
        if (typeof window.triggerGlobalStatsUpdate === 'function') {
            window.triggerGlobalStatsUpdate();
        }

        // Скидаємо таймер авто-оновлення SNMP, оскільки це була ручна дія
        if (typeof window.resetAutoRefreshTimer === 'function') {
            window.resetAutoRefreshTimer('snmp', true); 
        }

    } catch (error) {
        console.error(`Помилка SNMP запиту для ID ${deviceId}:`, error);
        const displayErrorMessage = error.message || "Невідома помилка під час запиту SNMP.";
        if (outputDiv) outputDiv.innerHTML = `<h3><i class="fas fa-exclamation-circle"></i> Помилка запиту SNMP для: ${deviceName}</h3><p class="status-error"><i class="fas fa-exclamation-triangle"></i> Помилка: ${displayErrorMessage}</p>`;
        displayError(`Помилка SNMP: ${displayErrorMessage}`);
        
        const historyErrorStatus = 'snmp_request_error';
        if (!sessionPingHistory[deviceId]) {
            sessionPingHistory[deviceId] = [];
        }
        sessionPingHistory[deviceId].push({
            device_id: deviceId,
            timestamp_iso: timestampForHistoryRecord,
            status: historyErrorStatus,
            rtt_avg_ms: null,
            raw_output_snippet: `Помилка SNMP запиту: ${displayErrorMessage}`.substring(0,2000),
            check_type: 'snmp',
            metrics: {},
            isSavedToDB: false
        });
        console.log(`MANUAL_SNMP_SESSION_ERROR_ADD: ID ${deviceId}, Time: ${timestampForHistoryRecord}, Status: ${historyErrorStatus}, Type: snmp`);

        if (typeof updateDeviceRowInTable === 'function') {
            updateDeviceRowInTable(deviceId, historyErrorStatus, new Date(timestampForHistoryRecord).toLocaleString('uk-UA'), null); 
        }
        // Скидаємо таймер авто-оновлення SNMP також у випадку помилки ручного запиту
        if (typeof window.resetAutoRefreshTimer === 'function') {
            window.resetAutoRefreshTimer('snmp', true);
        }
        // Оновлюємо глобальну статистику, щоб відобразити стан помилки
        if (typeof window.triggerGlobalStatsUpdate === 'function') {
            window.triggerGlobalStatsUpdate();
        }
    }
    // Не скидаємо таймер тут, бо manualSnmpCheck - це для одного пристрою з головної таблиці.
    // Скидання таймера відбувається тільки для 'SNMP All' або з модального вікна.
} 

async function performSnmpAll(isCalledByAutoRefresh = false) {
    console.log("[performSnmpAll] Called. Is from auto-refresh:", isCalledByAutoRefresh);
    const outputDiv = document.getElementById('lastCheckResultOutput');

    if (!outputDiv) {
        console.warn("[performSnmpAll] Required DOM element 'lastCheckResultOutput' not found.");
        return;
    }

    // Перевірка та завантаження window.allDevicesData
    if (!window.allDevicesData || window.allDevicesData.length === 0) {
        console.log("[performSnmpAll] window.allDevicesData is empty. Attempting to fetch...");
        if (typeof fetchAllDevices !== 'function') {
            console.error("[performSnmpAll] fetchAllDevices function is not available!");
            outputDiv.innerHTML = '<p>Помилка: Неможливо завантажити список пристроїв.</p>';
            return;
        }
        try {
            await fetchAllDevices(); // Чекаємо на завантаження
            if (!window.allDevicesData || window.allDevicesData.length === 0) {
                console.warn("[performSnmpAll] Failed to fetch devices. Aborting SNMP All.");
                outputDiv.innerHTML = '<p>Не вдалося завантажити список пристроїв для SNMP перевірки.</p>';
                return;
            }
            console.log("[performSnmpAll] Devices fetched successfully for SNMP All. Count:", window.allDevicesData.length);
        } catch (error) {
            console.error("[performSnmpAll] Error fetching devices for SNMP All:", error);
            outputDiv.innerHTML = '<p>Помилка завантаження списку пристроїв для SNMP.</p>';
            return;
        }
    }

    outputDiv.innerHTML = '<p><i class="fas fa-tasks fa-spin"></i> Запуск SNMP перевірки для всіх пристроїв...</p>';
    displayError("");

    const batchTimestampISO = new Date().toISOString().split('.')[0] + ".000Z";

    const devicesToProcess = window.allDevicesData.filter(d => d.snmp_enabled);
    if (devicesToProcess.length === 0) {
        outputDiv.innerHTML = '<p><i class="fas fa-info-circle"></i> Немає пристроїв з увімкненим SNMP для перевірки.</p>';
        if (!isCalledByAutoRefresh && typeof window.resetAutoRefreshTimer === 'function') {
            window.resetAutoRefreshTimer('snmp', true);
        }
        return;
    }

    let allResultsHtml = '';
    let overallSuccessCount = 0;
    let overallErrorCount = 0;
    let overallSkippedCount = 0; // Для пристроїв, які не були оброблені через помилку на початку

    const promises = devicesToProcess.map(device => 
        makeSnmpRequestAndRecordHistory(device, batchTimestampISO)
    );

    const results = await Promise.allSettled(promises);
    
    results.forEach(resultItem => {
        if (resultItem.status === 'fulfilled' && resultItem.value) {
            const { deviceResultHtml, snmpStatusForHistory } = resultItem.value;
            allResultsHtml += deviceResultHtml;
            if (snmpStatusForHistory === 'snmp_ok' || snmpStatusForHistory.startsWith('snmp_ok')) { // Дозволяємо варіанти типу 'snmp_ok_with_errors'
                overallSuccessCount++;
            } else {
                overallErrorCount++;
            }
        } else {
            // Якщо проміс був відхилений або повернув порожнє значення
            overallErrorCount++; 
            // Можна додати HTML для помилки обробки конкретного пристрою, якщо потрібно
            // console.error("Error processing SNMP for a device or empty result:", resultItem.reason || "Empty value");
            // allResultsHtml += `<li>Помилка обробки SNMP для одного з пристроїв.</li>`; 
        }
    });

    let headerHtml = '';
    const icon = '<i class="fas fa-network-wired"></i>'; // Можна змінити на іконку SNMP
    headerHtml += `<h3>${icon} Результати SNMP перевірки для всіх</h3>`;
    headerHtml += `<p><strong>Загальна статистика:</strong></p>`;
    headerHtml += `<ul class="ping-stats-list">
            <li>Всього SNMP пристроїв: ${devicesToProcess.length}</li>
            <li>Успішно: <span class="status-snmp-ok">${overallSuccessCount}</span></li>
            <li>Помилки/Проблеми: <span class="status-snmp-error">${overallErrorCount}</span></li>
        </ul>`;
    headerHtml += '<ul class="ping-all-list">'; // Використовуємо той же клас для списку результатів

    outputDiv.innerHTML = headerHtml + allResultsHtml + '</ul>';
    outputDiv.innerHTML += `<p class="timestamp"><em>Час перевірки: ${new Date(batchTimestampISO).toLocaleString('uk-UA')}</em></p>`;

    if (typeof window.triggerGlobalStatsUpdate === 'function') {
        window.triggerGlobalStatsUpdate();
    }

    // Оновлення таймера (якщо не викликано авто-оновленням)
    if (!isCalledByAutoRefresh && typeof window.resetAutoRefreshTimer === 'function') {
        window.resetAutoRefreshTimer('snmp', true);
    }
}

async function makeSnmpRequestAndRecordHistory(device, commonTimestamp) {
    let deviceBriefHtml = ''; // Для короткого рядка в списку
    let deviceDetailedHtml = ''; // Для деталей, що розкриваються
    let historySnippet = '';
    let snmpStatusForHistory = 'snmp_error'; // Початковий статус за замовчуванням
    let metricsForHistory = {};

    try {
        const response = await fetch(`/api/devices/${device.id}/snmp_metrics`);
        const apiResult = await response.json();

        snmpStatusForHistory = apiResult.overall_status || 'snmp_error';
        metricsForHistory = apiResult.metrics || {};

        const statusIcon = getStatusIcon(snmpStatusForHistory);
        const statusClass = getStatusClass(snmpStatusForHistory);

        // Формування короткого рядка
        deviceBriefHtml = `<li class="ping-all-item">`; // Використовуємо клас від Ping All
        deviceBriefHtml += `${statusIcon} <strong>${device.name}</strong> (${device.ip_address}): `;
        deviceBriefHtml += `<span class="${statusClass}">${snmpStatusForHistory}</span>`;

        if (apiResult.error) {
            deviceDetailedHtml += `<p class="error-message">Деталі помилки: ${apiResult.error}</p>`;
            historySnippet = `Загальний статус: ${snmpStatusForHistory}\nПомилка: ${apiResult.error}`;
        } else if (Object.keys(metricsForHistory).length === 0) {
            deviceDetailedHtml += `<p>Немає детальних метрик для відображення. Загальний статус: ${snmpStatusForHistory}</p>`;
            if (!historySnippet) historySnippet = `Загальний статус: ${snmpStatusForHistory}. Метрики відсутні.`;
        }

        if (metricsForHistory && Object.keys(metricsForHistory).length > 0) {
            deviceDetailedHtml += '<div class="snmp-metrics-container">'; // Залишаємо старий контейнер для стилів метрик
            const categories = {
                "Загальна інформація": ['sysDescr', 'sysUpTimeInstance', 'hrSystemUptime'],
                "Завантаження CPU": ['laLoad1', 'laLoad5', 'laLoad15'],
                "Використання CPU (%)": ['ssCpuUser', 'ssCpuSystem', 'ssCpuIdle'],
                "Пам\'ять (RAM)": ['memTotalReal', 'memAvailReal', 'memBuffer', 'memCached'],
                "Пам\'ять (Swap)": ['memTotalSwap', 'memAvailSwap'],
                "Мережевий інтерфейс (enp0s1)": ['ifDescr_enp0s1', 'ifAlias_enp0s1', 'ifInOctets_enp0s1', 'ifOutOctets_enp0s1', 'ifSpeed_enp0s1'],
                "Дисковий простір (/)": ['hrStorageDescr_root', 'hrStorageAllocUnits_root', 'hrStorageSize_root', 'hrStorageUsed_root']
            };
            let metricsFormattedForSnippetArr = [];
            for (const categoryName in categories) {
                const categoryKeys = categories[categoryName];
                let categoryHtmlContent = '';
                let hasMetricsInCategory = false;
                for (const key of categoryKeys) {
                    if (metricsForHistory.hasOwnProperty(key)) {
                        hasMetricsInCategory = true;
                        const value = metricsForHistory[key];
                        const formattedValue = formatSnmpValueForHistory(key, value, metricsForHistory);
                        const displayName = getSnmpMetricDisplayName(key);
                        let itemClass = 'snmp-metric-item';
                        if (typeof value === 'string' && value.toLowerCase().includes("помилка")) itemClass += ' error';
                        categoryHtmlContent += `<li class="${itemClass}"><span class="metric-name">${displayName}:</span> <span class="metric-value">${formattedValue}</span></li>`;
                        metricsFormattedForSnippetArr.push(`${displayName}: ${formattedValue}`);
                    }
                }
                if (hasMetricsInCategory) {
                    deviceDetailedHtml += `<div class="snmp-category"><h5>${categoryName}</h5><ul class="snmp-metrics-list">${categoryHtmlContent}</ul></div>`;
                }
            }
            deviceDetailedHtml += '</div>'; // кінець snmp-metrics-container
            if (!historySnippet) historySnippet = `Статус: ${snmpStatusForHistory}\n${metricsFormattedForSnippetArr.join('\n')}`;
            else historySnippet += `\n${metricsFormattedForSnippetArr.join('\n')}`;
        } else if (!apiResult.error) { // Якщо метрик немає, але й помилки не було
             if (!historySnippet) historySnippet = `Статус: ${snmpStatusForHistory}. Метрики відсутні.`;
        }
        
        // Кнопка "Деталі" та контейнер для деталей
        if (deviceDetailedHtml.trim() !== '') {
             deviceBriefHtml += `<button class="show-details-btn" onclick="toggleSnmpDetails(${device.id})">Деталі SNMP</button>`;
             deviceBriefHtml += `<div id="snmp-details-${device.id}" class="ping-details" style="display: none;">${deviceDetailedHtml}</div>`; // Використовуємо клас ping-details
        }
        deviceBriefHtml += `</li>`;

    } catch (error) {
        console.error(`Помилка SNMP запиту для ${device.name} (ID: ${device.id}) в makeSnmpRequestAndRecordHistory:`, error);
        const displayErrorMsg = error.message || "Невідома помилка";
        const statusIcon = getStatusIcon('snmp_request_error');
        const statusClass = getStatusClass('snmp_request_error');

        deviceBriefHtml = `<li class="ping-all-item">`;
        deviceBriefHtml += `${statusIcon} <strong>${device.name}</strong> (${device.ip_address}): `;
        deviceBriefHtml += `<span class="${statusClass}">помилка запиту</span>`;
        // Можна додати кнопку "Деталі" і тут, щоб показати повідомлення про помилку
        const errorDetail = `<p class="error-message">Помилка запиту: ${displayErrorMsg}</p>`;
        deviceBriefHtml += `<button class="show-details-btn" onclick="toggleSnmpDetails(${device.id})">Деталі SNMP</button>`;
        deviceBriefHtml += `<div id="snmp-details-${device.id}" class="ping-details" style="display: none;">${errorDetail}</div>`;
        deviceBriefHtml += `</li>`;
        
        snmpStatusForHistory = 'snmp_request_error';
        historySnippet = `Помилка SNMP запиту: ${displayErrorMsg}`;
        metricsForHistory = {};
    }

    if (!sessionPingHistory[device.id]) sessionPingHistory[device.id] = [];
    sessionPingHistory[device.id].push({
        device_id: device.id,
        timestamp_iso: commonTimestamp,
        status: snmpStatusForHistory,
        rtt_avg_ms: null,
        raw_output_snippet: historySnippet.substring(0, 2000),
        check_type: 'snmp',
        metrics: metricsForHistory,
        isSavedToDB: false
    });
    console.log(`SNMP_ALL_SESSION_ADD: ID ${device.id}, Time: ${commonTimestamp}, Status: ${snmpStatusForHistory}, Type: snmp`);
    
    // Оновлення рядка в головній таблиці
    if (typeof updateDeviceRowInTable === 'function') {
        updateDeviceRowInTable(device.id, snmpStatusForHistory, new Date(commonTimestamp).toLocaleString('uk-UA'), null);
    }
    
    return { deviceResultHtml: deviceBriefHtml, snmpStatusForHistory }; // Повертаємо HTML та статус
}

// Функція для показу/приховання деталей SNMP
function toggleSnmpDetails(deviceId) {
    const detailsDiv = document.getElementById(`snmp-details-${deviceId}`);
    if (detailsDiv) {
        const isVisible = detailsDiv.style.display === 'block';
        detailsDiv.style.display = isVisible ? 'none' : 'block';
        const btn = detailsDiv.previousElementSibling; // Очікуємо, що кнопка - попередній елемент
        if (btn && btn.tagName === 'BUTTON' && btn.textContent.includes('Деталі') || btn.textContent.includes('Приховати')) {
            btn.textContent = isVisible ? 'Деталі SNMP' : 'Приховати SNMP';
        }
    }
}

// manualSnmpCheckForAll: використовується для SNMP перевірки одного пристрою з модального вікна історії
async function manualSnmpCheckForAll(deviceId, targetElementId, batchTimestamp = null) { 
    const targetElement = document.getElementById(targetElementId);
    if (!targetElement) {
        console.error(`manualSnmpCheckForAll: Element with ID ${targetElementId} not found.`);
        return;
    }
    const deviceData = window.allDevicesData?.find(d => d.id.toString() === deviceId.toString());
    const deviceName = deviceData ? deviceData.name : `ID: ${deviceId}`;
    targetElement.innerHTML = `<p><i class="fas fa-spinner fa-spin"></i> Запит SNMP для ${deviceName}...</p>`;

    // Якщо batchTimestamp не передано (звичайний випадок для цієї функції), використовуємо поточний час
    const timestampForThisCheck = batchTimestamp ? batchTimestamp : new Date().toISOString().split('.')[0] + ".000Z";

    let outputHtml = '';
    let historySnippet = '';
    let snmpSessionHistoryStatus = 'snmp_error';
    let metricsForHistory = {};

    try {
        const response = await fetch(`/api/devices/${deviceId}/snmp_metrics`);
        const result = await response.json();

        snmpSessionHistoryStatus = result.overall_status || 'snmp_error';
        metricsForHistory = result.metrics || {};

        const statusIcon = getStatusIcon(snmpSessionHistoryStatus);
        const statusClass = getStatusClass(snmpSessionHistoryStatus);
        
        outputHtml += `<div class="snmp-result-header-flex"><h3>${statusIcon} ${deviceName}</h3><span class="snmp-result-info ${statusClass}">${snmpSessionHistoryStatus}</span></div>`;

        if (result.error) {
            outputHtml += `<p class="error-message">Помилка: ${result.error}</p>`;
            historySnippet = `Статус: ${snmpSessionHistoryStatus}\nПомилка: ${result.error}`;
        }

        if (metricsForHistory && Object.keys(metricsForHistory).length > 0) {
            outputHtml += `<div class="snmp-metrics-container">`;
            const categories = {
                "Загальна інформація": ['sysDescr', 'sysUpTimeInstance', 'hrSystemUptime'],
                "Завантаження CPU": ['laLoad1', 'laLoad5', 'laLoad15'],
                "Використання CPU (%)": ['ssCpuUser', 'ssCpuSystem', 'ssCpuIdle'],
                "Пам\'ять (RAM)": ['memTotalReal', 'memAvailReal', 'memBuffer', 'memCached'],
                "Пам\'ять (Swap)": ['memTotalSwap', 'memAvailSwap'],
                "Мережевий інтерфейс (enp0s1)": ['ifDescr_enp0s1', 'ifAlias_enp0s1', 'ifInOctets_enp0s1', 'ifOutOctets_enp0s1', 'ifSpeed_enp0s1'],
                "Дисковий простір (/)": ['hrStorageDescr_root', 'hrStorageAllocUnits_root', 'hrStorageSize_root', 'hrStorageUsed_root']
            };
            let metricsFormattedForSnippetArr = [];
            for (const categoryName in categories) {
                const categoryKeys = categories[categoryName];
                let categoryHtmlContent = '';
                let hasMetricsInCategory = false;
                for (const key of categoryKeys) {
                    if (metricsForHistory.hasOwnProperty(key)) {
                        hasMetricsInCategory = true;
                        const value = metricsForHistory[key];
                        const formattedValue = formatSnmpValueForHistory(key, value, metricsForHistory);
                        const displayName = getSnmpMetricDisplayName(key);
                        let itemClass = 'snmp-metric-item';
                        if (typeof value === 'string' && value.toLowerCase().includes("помилка")) itemClass += ' error';
                        categoryHtmlContent += `<li class="${itemClass}"><span class="metric-name">${displayName}:</span> <span class="metric-value">${formattedValue}</span></li>`;
                        metricsFormattedForSnippetArr.push(`${displayName}: ${formattedValue}`);
                    }
                }
                if (hasMetricsInCategory) {
                    outputHtml += `<div class="snmp-category"><h5>${categoryName}</h5><ul class="snmp-metrics-list">${categoryHtmlContent}</ul></div>`;
                }
            }
            outputHtml += '</div>';
            if (!historySnippet) historySnippet = `Статус: ${snmpSessionHistoryStatus}\n${metricsFormattedForSnippetArr.join('\n')}`;
            else historySnippet += `\n${metricsFormattedForSnippetArr.join('\n')}`;
        } else if (!result.error) {
            outputHtml += `<p>Немає детальних метрик.</p>`;
            if (!historySnippet) historySnippet = `Статус: ${snmpSessionHistoryStatus}. Метрики відсутні.`;
        }
        outputHtml += `<p class="timestamp"><em>Час перевірки: ${new Date(timestampForThisCheck).toLocaleString('uk-UA')}</em></p>`;
        targetElement.innerHTML = outputHtml;

    } catch (error) {
        console.error(`Помилка SNMP запиту для ID ${deviceId} (модальне вікно):`, error);
        const displayErrorMessage = error.message || "Невідома помилка під час запиту SNMP.";
        outputHtml = `<h3><i class="fas fa-exclamation-circle"></i> Помилка запиту SNMP для: ${deviceName}</h3><p class="status-snmp-error"><i class="fas fa-exclamation-triangle"></i> Помилка: ${displayErrorMessage}</p>`;
        targetElement.innerHTML = outputHtml;
        snmpSessionHistoryStatus = 'snmp_request_error';
        historySnippet = `Помилка SNMP запиту: ${displayErrorMessage}`;
        metricsForHistory = {};
    }

    if (!sessionPingHistory[deviceId]) sessionPingHistory[deviceId] = [];
    sessionPingHistory[deviceId].push({
        device_id: deviceId,
        timestamp_iso: timestampForThisCheck,
        status: snmpSessionHistoryStatus,
        rtt_avg_ms: null,
        raw_output_snippet: historySnippet.substring(0, 2000),
        check_type: 'snmp',
        metrics: metricsForHistory,
        isSavedToDB: false
    });
    console.log(`MANUAL_SNMP_MODAL_SESSION_ADD: ID ${deviceId}, Time: ${timestampForThisCheck}, Status: ${snmpSessionHistoryStatus}, Type: snmp`);
    
    if (typeof updateDeviceRowInTable === 'function') {
        updateDeviceRowInTable(deviceId, snmpSessionHistoryStatus, new Date(timestampForThisCheck).toLocaleString('uk-UA'), null);
    }
    if (typeof window.resetAutoRefreshTimer === 'function') {
        window.resetAutoRefreshTimer('snmp', true);
    }
    if (typeof window.triggerGlobalStatsUpdate === 'function') {
        window.triggerGlobalStatsUpdate();
    }
}