// Functions for pinging devices and saving session history

// Assuming pingResultOutputDiv, displayPingResult, updateDeviceRowInTable, displayError, 
// sessionPingHistory, AUTO_REFRESH_INTERVAL_SECONDS, timeToNextRefresh, lastUpdateTime, 
// updateAutoRefreshInfoText, normalizeTimestampForComparison are global or correctly scoped.

async function manualPingDevice(deviceId, hostIp, isPingAllCall = false, batchTimestamp = null) {
    const deviceRow = document.querySelector(`#devicesTable tbody tr[data-device-id='${deviceId}']`);
    const deviceName = deviceRow ? (deviceRow.cells[1] ? deviceRow.cells[1].textContent : hostIp) : hostIp;

    let pingButton = null;
    if (deviceRow && !isPingAllCall) {
        pingButton = deviceRow.querySelector("button[onclick^='manualPingDevice']");
    }
    const originalButtonText = pingButton ? pingButton.textContent : "";
    
    if (pingButton) {
        pingButton.disabled = true;
        pingButton.textContent = "Пінгування...";
    }
    
    if (!isPingAllCall) {
        const outputDiv = document.getElementById('lastCheckResultOutput');
        if (!outputDiv) {
            console.error("Output div 'lastCheckResultOutput' not found in manualPingDevice!");
            if (pingButton) {
                pingButton.disabled = false;
                pingButton.textContent = originalButtonText;
            }
            return;
        }
        outputDiv.innerHTML = `<p>Пінгування ${deviceName} (${hostIp})...</p>`;
        displayError("");
    }

    try {
        const response = await fetch('/api/ping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_id: deviceId, ip_address: hostIp })
        });
        const result = await response.json();
        if (!response.ok) {
            const errorMessage = result.message || result.error || `HTTP error! status: ${response.status}`;
            throw new Error(errorMessage);
        }
        
        updateDeviceRowInTable(deviceId, result.status, new Date().toLocaleString('uk-UA'), result.rtt_avg_ms);
        
        if (!isPingAllCall) {
            displayPingResult(result, deviceName);
        }

        const timestampForHistory = batchTimestamp ? batchTimestamp : new Date().toISOString().split('.')[0] + ".000Z";
        
        if (!window.sessionPingHistory) window.sessionPingHistory = {};
        if (!window.sessionPingHistory[deviceId]) {
            window.sessionPingHistory[deviceId] = [];
        }
        window.sessionPingHistory[deviceId].push({
            device_id: deviceId,
            timestamp_iso: timestampForHistory,
            status: result.status,
            rtt_avg_ms: result.rtt_avg_ms,
            raw_output_snippet: result.raw_output_snippet,
            check_type: 'ping',
            metrics: {},
            isSavedToDB: false
        });
        console.log(`MANUAL_PING_SESSION_ADD: ID ${deviceId}, Time: ${timestampForHistory}, Status: ${result.status}, RTT: ${result.rtt_avg_ms}, Type: ping`);

        if (!isPingAllCall) displayError('');

        if (!isPingAllCall && typeof window.triggerGlobalStatsUpdate === 'function') {
            window.triggerGlobalStatsUpdate();
        }
        
        // Якщо це одиночний ручний пінг (не частина "Ping All"), скидаємо таймер авто-пінгу
        if (!isPingAllCall && typeof window.resetAutoRefreshTimer === 'function') {
            window.resetAutoRefreshTimer('ping', true); // true - викликано ручною кнопкою
        }

        return {
            id: deviceId,
            name: deviceName,
            ip_address: hostIp,
            status: result.status,
            rtt_avg_ms: result.rtt_avg_ms,
            raw_output_snippet: result.raw_output_snippet
        };

    } catch (error) {
        console.error(`Помилка при пінгуванні пристрою ${deviceId}:`, error);
        if (!isPingAllCall) {
            const outputDiv = document.getElementById('lastCheckResultOutput');
            if(outputDiv) outputDiv.innerHTML = `<p style="color:red;">Помилка пінгування ${deviceName}: ${error.message}</p>`;
            displayError(`Помилка пінгування ${deviceName}: ${error.message}`);
        }
        return {
            id: deviceId,
            name: deviceName,
            ip_address: hostIp,
            status: 'error_ping_manual',
            error: error.message,
            rtt_avg_ms: null,
            raw_output_snippet: `Помилка: ${error.message}`
        };
    } finally {
        if (pingButton) {
            pingButton.disabled = false;
            pingButton.textContent = originalButtonText;
        }
    }
}

async function performPingAll(isCalledByAutoRefresh = false) {
    console.log("[performPingAll] Called. Is from auto-refresh:", isCalledByAutoRefresh);
    const outputDiv = document.getElementById('lastCheckResultOutput');
    if (!outputDiv) {
        console.error("[performPingAll] Output div 'lastCheckResultOutput' not found!");
        return;
    }

    // Перевірка та завантаження window.allDevicesData
    if (!window.allDevicesData || window.allDevicesData.length === 0) {
        console.log("[performPingAll] window.allDevicesData is empty. Attempting to fetch...");
        if (typeof fetchAllDevices !== 'function') {
            console.error("[performPingAll] fetchAllDevices function is not available!");
            outputDiv.innerHTML = '<p><i class="fas fa-info-circle"></i> Помилка: Неможливо завантажити список пристроїв.</p>';
            return;
        }
        try {
            await fetchAllDevices(); // Чекаємо на завантаження
            if (!window.allDevicesData || window.allDevicesData.length === 0) {
                console.warn("[performPingAll] Failed to fetch devices. Aborting Ping All.");
                outputDiv.innerHTML = '<p><i class="fas fa-info-circle"></i> Не вдалося завантажити список пристроїв для Ping All.</p>';
                return;
            }
            console.log("[performPingAll] Devices fetched successfully for Ping All. Count:", window.allDevicesData.length);
        } catch (error) {
            console.error("[performPingAll] Error fetching devices for Ping All:", error);
            outputDiv.innerHTML = '<p><i class="fas fa-info-circle"></i> Помилка завантаження списку пристроїв для Ping All.</p>';
            return;
        }
    }

    const devicesToPing = window.allDevicesData;
    // Ensure pingResultOutputDiv is defined or handle error
    if (outputDiv) {
        outputDiv.innerHTML = '<h3><i class="fas fa-spinner fa-spin"></i> Перевірка всіх пристроїв...</h3>';
    } else {
        console.error("Output div 'lastCheckResultOutput' not found in performPingAll.");
        // Consider not proceeding if the primary output div is missing
        // return; 
    }
    const pingPromises = [];
    const batchTimestampISO = new Date().toISOString().split('.')[0] + ".000Z"; // Спільна мітка часу для всіх пінгів у цій пачці

    devicesToPing.forEach(device => {
        // Передаємо batchTimestampISO в manualPingDevice
        const pingPromise = manualPingDevice(device.id, device.ip_address, true, batchTimestampISO)
            .then(result => result)
            .catch(error => ({
                id: device.id,
                name: device.name,
                ip_address: device.ip_address,
                status: 'error',
                error: error.message || 'Невідома помилка пінгу'
            }));
        pingPromises.push(pingPromise);
    });

    try {
        const results = await Promise.all(pingPromises);
        
        const data = {
            message: `${results.length} пристроїв перевірено.`,
            results: results,
            timestamp: new Date().toLocaleString('uk-UA')
        };

        displayPingAllResults(data);

        if (typeof window.triggerGlobalStatsUpdate === 'function') {
            window.triggerGlobalStatsUpdate();
        }

    } catch (error) {
        console.error("Помилка під час виконання ping_all:", error);
        if (outputDiv) outputDiv.innerHTML = `<p>Сталася помилка під час масового пінгування: ${error.message}</p>`;
        // Можливо, тут також варто оновити статистику, щоб відобразити помилку
        if (typeof window.triggerGlobalStatsUpdate === 'function') {
            window.triggerGlobalStatsUpdate();
        }
    }

    // Якщо викликано НЕ автооновленням (тобто ручним натисканням кнопки "Перевірка Ping"),
    // скидаємо таймер авто-пінгу.
    if (!isCalledByAutoRefresh) {
        // Видалено стару логіку оновлення lastManualPingTime та updateAutoRefreshInfoText
        if (typeof window.resetAutoRefreshTimer === 'function') {
            window.resetAutoRefreshTimer('ping', true); // true - викликано ручною кнопкою
        }
    }
}

async function saveAllSessionHistory() {
    const saveButton = document.getElementById('saveAllHistoryBtn');
    let originalButtonHTML = "";

    if (saveButton) {
        originalButtonHTML = saveButton.innerHTML;
        saveButton.disabled = true;
        saveButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Збереження...';
    }

    // Оновлення інформації про останнє застосування
    if (typeof saveHistoryLastAppliedInfoSpan !== 'undefined' && saveHistoryLastAppliedInfoSpan) {
        saveHistoryLastAppliedInfoSpan.textContent = `Застосовано: ${new Date().toLocaleTimeString('uk-UA')}`;
    }

    const outputDiv = document.getElementById('lastCheckResultOutput');
    displayError("");

    try {
        const collectedPingsByDevice = await collectAllSessionPingsForSave();
        
        if (Object.keys(collectedPingsByDevice).length === 0) {
            if (outputDiv) outputDiv.innerHTML = "<p>Немає даних історії сесії для збереження.</p>";
            console.info("Немає даних історії сесії для збереження.");
            return;
        }
        
        // Форматуємо дані для /api/history/save_all
        const payload = Object.entries(collectedPingsByDevice).map(([deviceId, pings]) => ({
            device_id: parseInt(deviceId),
            pings: pings
        }));

        const response = await fetch('/api/history/save_all', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: "Не вдалося розпарсити відповідь сервера" }));
            throw new Error(errorData.error || errorData.message || `HTTP помилка! Статус: ${response.status}`);
        }

        const result = await response.json();
        
        // Оновлюємо статус збереження для всіх записів
        if (result.processed_device_histories) {
            result.processed_device_histories.forEach(deviceHistory => {
                const deviceId = deviceHistory.device_id;
                if (sessionPingHistory[deviceId]) {
                    deviceHistory.processed_timestamps_iso.forEach(timestamp => {
                        const normalizedTimestamp = normalizeTimestampForComparison(timestamp);
                        sessionPingHistory[deviceId].forEach(record => {
                            if (normalizeTimestampForComparison(record.timestamp_iso) === normalizedTimestamp) {
                                record.isSavedToDB = true;
                                console.log(`SAVE_ALL_UPDATE: Dev ID ${deviceId}, TS ${timestamp} marked as saved`);
                            }
                        });
                    });
                }
            });
        }

        const pingResultOutputDiv = document.getElementById('lastCheckResultOutput');
        if (pingResultOutputDiv) {
            pingResultOutputDiv.innerHTML = `<p>${result.message} Збережено нових: ${result.total_saved_new_count}, пропущено дублікатів: ${result.total_skipped_duplicates_count}.</p>`;
        }
        console.log("Історію сесії збережено:", result);
        
        // Додаємо alert для користувача
        alert(`Історію сесії успішно збережено!\nНових записів: ${result.total_saved_new_count}\nПропущено дублікатів: ${result.total_skipped_duplicates_count}`);

        // Якщо відкрите модальне вікно історії, оновлюємо його дані
        if (typeof currentDeviceForHistoryModal !== 'undefined' && currentDeviceForHistoryModal && currentDeviceForHistoryModal.id) {
            console.log("Оновлення даних модального вікна після глобального збереження");
            await reloadModalData(currentDeviceForHistoryModal.id, currentDeviceForHistoryModal.name);
        }

        // Після успішного збереження очистити sessionPings
        if (typeof clearAllSessionPings === 'function') {
            clearAllSessionPings();
        } else {
            console.warn("Функція clearAllSessionPings не знайдена. Сесійні пінги не очищено з localStorage.");
        }

        // Після успішного збереження або навіть якщо нічого не збережено (щоб оновити вигляд)
        if (typeof window.triggerGlobalStatsUpdate === 'function') {
            window.triggerGlobalStatsUpdate();
        }

    } catch (error) {
        console.error("Помилка збереження всієї історії сесії:", error);
        if (pingResultOutputDiv) pingResultOutputDiv.innerHTML = `<p style="color:red;">Помилка збереження історії: ${error.message}</p>`;
        displayError("Помилка збереження історії: " + error.message);
    } finally {
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.innerHTML = originalButtonHTML;
        }
    }
}