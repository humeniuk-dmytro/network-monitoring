// Logic specific to the device history modal

// Global variables for modal state (will be initialized in main.js or this file if loaded first)
// let currentDeviceForHistoryModal = null;
// let currentModalHistoryData = []; 
// let modalHistorySortState = { column: 0, direction: 'desc' }; 

// DOM element references for modal (will be initialized in main.js or this file)
// let historyModal; 
// let historyModalTitle; 
// let modalHistoryTableBody; 
// let modalHistoryTableStatus; 
// let modalHistoryErrorMessages;

// Assuming sessionPingHistory and getStatusClass (from uiUpdater.js) are globally available.
// And allDevicesData from uiUpdater.js
// And normalizeTimestampForComparison, fetchHistoryForDevice, sortHistoryData, renderHistoryToTable from historyLogic.js

async function showDeviceHistory(deviceData) {
    if (!historyModal || !historyModalTitle || !modalHistoryTableBody || !modalHistoryTableStatus || !modalHistoryErrorMessages) {
        console.error("MODAL_DOM_ERROR: Один або декілька DOM елементів модального вікна історії не знайдено.");
        alert("Помилка інтерфейсу: не вдалося знайти елементи модального вікна. Будь ласка, перезавантажте сторінку.");
        return;
    }

    // Перевірка отриманих даних
    if (!deviceData || typeof deviceData.id === 'undefined' || typeof deviceData.name === 'undefined') {
        console.error("MODAL_INVALID_DEVICE_DATA: Отримано невірні дані пристрою.", deviceData);
        historyModalTitle.textContent = 'Помилка';
        modalHistoryTableBody.innerHTML = ''; 
        modalHistoryErrorMessages.textContent = 'Помилка: Отримано неповні дані для відображення історії пристрою.'; 
        modalHistoryTableStatus.textContent = '';
        historyModal.style.display = 'block';
        return;
    }

    currentDeviceForHistoryModal = deviceData; // Зберігаємо поточний об'єкт пристрою
    const deviceId = deviceData.id;
    const deviceName = deviceData.name;
    // const isSnmpDevice = deviceData.snmp_enabled; // Отримуємо SNMP статус

    historyModalTitle.textContent = `Історія пристрою: ${deviceName} (ID: ${deviceId})`;
    modalHistoryTableBody.innerHTML = ''; 
    modalHistoryErrorMessages.textContent = ''; 
    modalHistoryTableStatus.textContent = 'Завантаження історії...';
    historyModal.style.display = 'block'; 
    modalHistorySortState = { column: 0, direction: 'desc' }; 

    try {
        // Завантажуємо комбіновану історію (БД + поточна сесія)
        const historyResult = await fetchHistoryForDevice(deviceId, 'all');
        
        if (historyResult && (historyResult.ping_history || historyResult.snmp_history)) {
            currentModalHistoryData = [];
            if (historyResult.ping_history) {
                currentModalHistoryData.push(...historyResult.ping_history.map(p => ({...p, type: 'ping'})));
            }
            if (historyResult.snmp_history) {
                currentModalHistoryData.push(...historyResult.snmp_history.map(s => ({...s, type: 'snmp'})));
            }
            
            // Додаємо незбережені сесійні дані, якщо вони є і ще не включені (для 'all')
            // fetchHistoryForDevice з sourceType='all' вже має включати їх, але для певності.
            // Однак, щоб уникнути дублікатів, краще покладатися на те, що 'all' з fetchHistoryForDevice вже все робить.

            if (currentModalHistoryData.length === 0) {
                modalHistoryTableStatus.textContent = 'Історія відсутня або ще не завантажена.';
                modalHistoryTableBody.innerHTML = '<tr><td colspan="5">Історія відсутня.</td></tr>';
            } else {
                modalHistoryTableStatus.textContent = '';
                applySortAndRenderModalData(); // Сортування та рендеринг
            }
        } else {
            currentModalHistoryData = [];
            modalHistoryTableStatus.textContent = 'Не вдалося завантажити історію або вона порожня.';
            modalHistoryTableBody.innerHTML = '<tr><td colspan="5">Не вдалося завантажити історію.</td></tr>';
            console.warn("historyResult порожній або не містить очікуваних полів", historyResult);
        }
    } catch (error) {
        console.error(`Помилка завантаження історії для модального вікна (ID: ${deviceData.id}):`, error);
        modalHistoryErrorMessages.textContent = `Помилка завантаження історії: ${error.message}`;
        modalHistoryTableBody.innerHTML = '<tr><td colspan="5">Помилка завантаження історії.</td></tr>';
        currentModalHistoryData = [];
    }
}

function closeDeviceHistoryModal() {
    if (!historyModal || !modalHistoryTableBody || !modalHistoryTableStatus || !modalHistoryErrorMessages) {
        console.error("One or more history modal DOM elements are not defined for close.");
        return;
    }
    historyModal.style.display = 'none';
    currentDeviceForHistoryModal = null;
    currentModalHistoryData = [];
    modalHistoryTableBody.innerHTML = '';
    modalHistoryTableStatus.textContent = 'Завантаження історії...';
    modalHistoryErrorMessages.textContent = '';
}

function applySortAndRenderModalData() { 
    if (!modalHistoryTableBody) {
        console.error("Modal history table body not found for rendering.");
        return;
    }

    // Визначення, чи показувати колонку "Тип" у модальному вікні
    const isCurrentDeviceSnmpEnabled = currentDeviceForHistoryModal ? currentDeviceForHistoryModal.snmp_enabled : false;
    // Показуємо колонку "Тип" тільки якщо є хоча б один запис SNMP в поточній історії
    const shouldShowCheckTypeColumnInModal = currentModalHistoryData.some(item => item.check_type === 'snmp');

    // Оновлення видимості заголовка колонки "Тип"
    const typeColumnHeader = document.querySelector('#historyModal table th:nth-child(4)'); // Четвертий заголовок для "Тип"
    if (typeColumnHeader) {
        typeColumnHeader.style.display = shouldShowCheckTypeColumnInModal ? '' : 'none';
    }

    // Визначаємо ключі колонок для рендерингу
    // Базові колонки: Час, Статус, RTT, Джерело, Деталі
    let columnKeysForModal = ['timestamp_iso', 'status', 'rtt_avg_ms', 'source', 'details'];
    const baseColCount = columnKeysForModal.length;

    if (shouldShowCheckTypeColumnInModal) {
        // Вставляємо 'check_type' на правильну позицію (після rtt_avg_ms, перед source)
        // Індекс для вставки 'check_type' - це 3 (після timestamp, status, rtt)
        columnKeysForModal.splice(3, 0, 'check_type'); 
    }

    if (!currentModalHistoryData || currentModalHistoryData.length === 0) {
        const colspanValue = columnKeysForModal.length; // Використовуємо актуальну кількість колонок
        modalHistoryTableBody.innerHTML = `<tr><td colspan="${colspanValue}" style="text-align:center">Історія відсутня.</td></tr>`;
        if (modalHistoryTableStatus) modalHistoryTableStatus.textContent = 'Історія відсутня або ще не завантажена.';
        return;
    }

    const sortedData = sortHistoryData(currentModalHistoryData, modalHistorySortState, columnKeysForModal);
    
    const renderOptions = {
        columns: columnKeysForModal, // Використовуємо динамічно сформований масив
        showCheckTypeColumn: shouldShowCheckTypeColumnInModal, // Ця опція в renderHistoryToTable наразі не використовується для приховування, але може бути корисною
        showSourceColumn: true, 
        getStatusClass: typeof getStatusClass === 'function' ? getStatusClass : (status) => {
            if (status === 'online') return 'status-online';
            if (status === 'offline') return 'status-offline';
            return 'status-unknown'; 
        },
        onDetailClick: (entry, event) => {
            const cell = event.target.closest('td');
            if (!cell) return;

            // If there's already a details div, toggle it
            const existingDetails = cell.querySelector('.snmp-details-list, .ping-details');
            if (existingDetails) {
                existingDetails.remove();
                event.target.textContent = 'Деталі';
                return;
            }

            let detailsElement = null;
            
            if (entry.check_type === 'snmp' && entry.raw_output_snippet) {
                try {
                    const snmpData = JSON.parse(entry.raw_output_snippet);
                    const ul = document.createElement('ul');
                    ul.className = 'snmp-details-list';

                    for (const [key, value] of Object.entries(snmpData)) {
                        const li = document.createElement('li');
                        // Використовуємо глобальну функцію форматування formatSnmpValueForHistory
                        // та нову функцію для відображення назви
                        const displayName = getSnmpMetricDisplayName(key);
                        li.innerHTML = `<strong>${displayName}:</strong> ${formatSnmpValueForHistory(key, value)}`;
                        ul.appendChild(li);
                    }
                    detailsElement = ul;
                } catch (e) {
                    const pre = document.createElement('pre');
                    pre.className = 'ping-details';
                    pre.textContent = entry.raw_output_snippet;
                    detailsElement = pre;
                }
            } else if (entry.raw_output_snippet) {
                const pre = document.createElement('pre');
                pre.className = 'ping-details';
                pre.textContent = entry.raw_output_snippet;
                detailsElement = pre;
            } else {
                const div = document.createElement('div');
                div.className = 'ping-details';
                div.textContent = 'Деталі відсутні.';
                detailsElement = div;
            }

            // Clear any existing content and append new details
            const button = event.target;
            button.textContent = 'Приховати';
            cell.appendChild(detailsElement);
        },
        timezone: 'uk-UA'
    };

    renderHistoryToTable(modalHistoryTableBody, sortedData, renderOptions);
    updateModalSortIndicators(); // Ця функція також може потребувати коригування, якщо кількість видимих колонок змінюється
    if (modalHistoryTableStatus) modalHistoryTableStatus.textContent = '';
}

function sortModalHistoryByColumn(columnIndex) {
    if (modalHistorySortState.column === columnIndex) {
        modalHistorySortState.direction = modalHistorySortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
        modalHistorySortState.column = columnIndex;
        modalHistorySortState.direction = 'asc'; 
    }
    applySortAndRenderModalData();
}

function updateModalSortIndicators() {
    for (let i = 0; i < 5; i++) { 
        const indicator = document.getElementById(`modal-hist-sort-${i}`);
        if (indicator) {
            indicator.textContent = (modalHistorySortState.column === i) ? (modalHistorySortState.direction === 'asc' ? ' ▲' : ' ▼') : '';
        }
    }
}

async function saveCurrentDeviceSessionHistory() {
    if (!currentDeviceForHistoryModal || !currentDeviceForHistoryModal.id) {
        alert("Інформація про пристрій для збереження історії не доступна.");
        return;
    }

    const deviceId = currentDeviceForHistoryModal.id;
    const deviceName = currentDeviceForHistoryModal.name;
    const deviceIdStr = deviceId.toString();
    
    // Фільтруємо ВСІ незбережені записи для цього пристрою (і ping, і snmp)
    const unsavedEntries = (window.sessionPingHistory[deviceIdStr] || []).filter(entry => !entry.isSavedToDB);

    if (unsavedEntries.length === 0) {
        alert(`Для пристрою ${deviceName} (ID: ${deviceId}) немає незбереженої сесійної історії.`);
        return;
    }

    if (!confirm(`Зберегти ${unsavedEntries.length} незбережених записів історії для пристрою ${deviceName} (ID: ${deviceId})?`)) {
        return;
    }

    // Оновлюємо статус в модальному вікні
    const modalStatusElement = document.getElementById('modalHistoryTableStatus');
    if (modalStatusElement) modalStatusElement.textContent = `Збереження ${unsavedEntries.length} записів...`;
    const modalErrorElement = document.getElementById('historyModalErrorMessages');
    if (modalErrorElement) modalErrorElement.textContent = '';

    // Готуємо дані для відправки
    const recordsToSave = unsavedEntries.map(entry => ({
        timestamp_iso: entry.timestamp_iso,
        status: entry.status,
        rtt_avg_ms: entry.check_type === 'ping' ? entry.rtt_avg_ms : null,
        raw_output_snippet: entry.raw_output_snippet,
        check_type: entry.check_type,
        // Надсилаємо metrics тільки якщо це SNMP і вони є
        metrics: entry.check_type === 'snmp' ? entry.metrics : undefined 
    }));

    console.log(`[SaveCurrentSessionHistory - Device ${deviceId}] Records to save:`, JSON.parse(JSON.stringify(recordsToSave)));

    try {
        const response = await fetch(`/api/devices/${deviceId}/history`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ records: recordsToSave }) // Відправляємо масив записів
        });

        const result = await response.json();
        console.log(`[SaveCurrentSessionHistory - Device ${deviceId}] Response from server:`, result);

        if (!response.ok) {
            throw new Error(result.error || `HTTP помилка! Статус: ${response.status}`);
        }

        alert(result.message || `Історію для пристрою ${deviceName} (ID: ${deviceId}) успішно збережено.`);

        // Оновлюємо статус isSavedToDB для збережених записів
        if (result.saved_timestamps_iso && result.saved_timestamps_iso.length > 0) {
            unsavedEntries.forEach(sessionEntry => {
                if (result.saved_timestamps_iso.includes(sessionEntry.timestamp_iso)) {
                    sessionEntry.isSavedToDB = true;
                    console.log(`[SaveCurrentSessionHistory - Update] Dev ID ${deviceId}, TS ${sessionEntry.timestamp_iso}, Type ${sessionEntry.check_type} marked as saved.`);
                }
            });
        }
        
        // Оновлюємо дані в модальному вікні та глобальну статистику
        await reloadModalData(deviceId, deviceName); 

        if (typeof window.updateAllGlobalStats === 'function') {
            console.log("[SaveCurrentSessionHistory] Triggering global stats update after saving single device history.");
            window.updateAllGlobalStats();
        }

        // Перевіряємо, чи залишилися незбережені записи для цього пристрою в сесії
        const remainingUnsaved = (window.sessionPingHistory[deviceIdStr] || []).filter(entry => !entry.isSavedToDB);
        if (remainingUnsaved.length === 0) {
            console.log(`[SaveCurrentSessionHistory] All session entries for device ${deviceIdStr} are saved. Closing modal.`);
            delete window.sessionPingHistory[deviceIdStr];
            console.log(`[SaveCurrentSessionHistory] Cleared window.sessionPingHistory[${deviceIdStr}]`);
            closeDeviceHistoryModal();
        } else {
            console.log(`[SaveCurrentSessionHistory] Device ${deviceIdStr} still has ${remainingUnsaved.length} unsaved session entries. Modal remains open.`);
        }

        // Оновлюємо кнопку "Зберегти історію поточного пристрою", якщо вона видима
        const saveCurrentButton = document.getElementById('saveCurrentDeviceHistoryBtn');
        if (saveCurrentButton) {
            saveCurrentButton.textContent = 'Історія збережена';
            saveCurrentButton.disabled = true;
        }

    } catch (error) {
        console.error(`Помилка збереження історії для пристрою ID ${deviceId}:`, error);
        if (modalErrorElement) modalErrorElement.textContent = `Помилка: ${error.message}`;
        alert(`Помилка збереження історії для пристрою ${deviceName}: ${error.message}`);
    } finally {
        if (modalStatusElement) modalStatusElement.textContent = ''; // Очищаємо статус завантаження
    }
}

async function reloadModalData(deviceId, deviceName) {
    console.log(`[ReloadModalData] Reloading for Device ID: ${deviceId}, Name: ${deviceName}`);
    const modalTitle = document.getElementById('deviceHistoryModalTitle');
    historyModalTitle.textContent = `Історія пристрою: ${deviceName} (ID: ${deviceId}) - Оновлення...`;
    modalHistoryTableBody.innerHTML = '<tr><td colspan="5">Оновлення даних...</td></tr>';
    modalHistoryErrorMessages.textContent = '';
    const deviceIdStr = deviceId.toString();

    try {
        const historyData = await fetchHistoryForDevice(deviceId, 'all'); 

        // DEBUG LOG: Перевірка стану isSavedToDB для сесійних записів, що повертаються fetchHistoryForDevice
        if (historyData && window.sessionPingHistory[deviceIdStr]) {
            const sessionEntriesInFetchedData = historyData.ping_history.filter(e => e.source === 'session' && e.device_id.toString() === deviceIdStr)
                .concat(historyData.snmp_history.filter(e => e.source === 'session' && e.device_id.toString() === deviceIdStr));
            console.log(`[ReloadModalData - DEBUG] Session entries for DevID ${deviceIdStr} from fetchHistoryForDevice('all'):`, JSON.parse(JSON.stringify(sessionEntriesInFetchedData.map(e => ({ ts: e.timestamp_iso, type: e.check_type, saved: e.isSavedToDB })))));
            
            const globalSessionEntries = window.sessionPingHistory[deviceIdStr];
            console.log(`[ReloadModalData - DEBUG] Global window.sessionPingHistory[${deviceIdStr}] state:`, JSON.parse(JSON.stringify(globalSessionEntries.map(e => ({ ts: e.timestamp_iso, type: e.check_type, saved: e.isSavedToDB })))));
        }

        if (historyData && (historyData.ping_history.length > 0 || historyData.snmp_history.length > 0)) {
            const combinedHistory = [];
            if (historyData.ping_history) {
                combinedHistory.push(...historyData.ping_history.map(p => ({...p, type: 'ping'})));
            }
            if (historyData.snmp_history) {
                combinedHistory.push(...historyData.snmp_history.map(s => ({...s, type: 'snmp'})));
            }

            if (combinedHistory.length === 0) {
                modalHistoryTableStatus.textContent = 'Історія відсутня або оновлення не дало результатів.';
                modalHistoryTableBody.innerHTML = '<tr><td colspan="5">Історія відсутня.</td></tr>';
            } else {
                modalHistoryTableStatus.textContent = '';
                currentModalHistoryData = combinedHistory;
                applySortAndRenderModalData();
            }
        } else {
            currentModalHistoryData = [];
            modalHistoryTableStatus.textContent = 'Не вдалося оновити історію або вона порожня.';
            modalHistoryTableBody.innerHTML = '<tr><td colspan="5">Не вдалося оновити історію.</td></tr>';
        }
        historyModalTitle.textContent = `Історія пристрою: ${deviceName} (ID: ${deviceId})`;
    } catch (error) {
        console.error(`Помилка оновлення даних модального вікна для ID ${deviceId}:`, error);
        modalHistoryErrorMessages.textContent = `Помилка оновлення: ${error.message}`;
        modalHistoryTableBody.innerHTML = '<tr><td colspan="5">Помилка оновлення історії.</td></tr>';
        currentModalHistoryData = [];
        historyModalTitle.textContent = `Історія пристрою: ${deviceName} (ID: ${deviceId}) - Помилка`;
    }
}

async function openFullHistoryView() {
    if (!currentDeviceForHistoryModal || currentDeviceForHistoryModal.id == null) { // Перевіряємо .id
        displayErrorInModal("Пристрій не вибрано або ID не визначено.");
        return;
    }
    if (!modalHistoryTableStatus) { console.error("Modal status element not defined for openFullHistoryView."); return; }
    const deviceIdStr = currentDeviceForHistoryModal.id.toString();

    const deviceId = currentDeviceForHistoryModal.id; // Використовуємо .id
    const unsavedPings = (sessionPingHistory[deviceIdStr] || []).filter(p => !p.isSavedToDB);

    if (unsavedPings.length > 0) {
        if (confirm(`Є ${unsavedPings.length} незбережених записів сесійної історії для цього пристрою. Зберегти їх перед переходом до повного перегляду?`)) {
            modalHistoryTableStatus.textContent = "Збереження перед переходом...";
            try {
                // saveCurrentDeviceSessionHistory has its own alerts and confirmations
                // It will also call reloadModalData which in turn calls applySortAndRenderModalData
                await saveCurrentDeviceSessionHistory(); 
                // Check if modal is still open and status is success before proceeding
                // This check might be complex if saveCurrentDeviceSessionHistory has async operations that don't block here.
                // For simplicity, assume if no error, it was successful or user cancelled within that function.
                modalHistoryTableStatus.textContent = "Збережено. Відкриття повного перегляду...";
            } catch (e) {
                // Error already handled in saveCurrentDeviceSessionHistory, it also updates modal status.
                // modalHistoryTableStatus.textContent = "Помилка збереження. Перехід скасовано."; // This might overwrite specific error from save.
                return; 
            }
        } else {
            modalHistoryTableStatus.textContent = "Перехід без збереження...";
        }
    }
    window.open(`device_history.html?deviceId=${deviceId}`, '_blank'); // Використовуємо deviceId
}