/**
 * Нормалізує ISO рядок часу для порівняння, повертаючи мілісекунди.
 * @param {string} timestampIso - ISO рядок часу.
 * @returns {number} Час у мілісекундах або 0, якщо timestampIso невалідний.
 */
function normalizeTimestampForComparison(timestampIso) {
    if (!timestampIso) return 0;
    // Спробуємо розпарсити з мілісекундами або без, гарантуючи обробку як UTC, якщо є 'Z'
    let date;
    if (timestampIso.includes('.')) {
        date = new Date(timestampIso); // Обробляє "YYYY-MM-DDTHH:MM:SS.sssZ"
    } else if (timestampIso.endsWith('Z')) {
        // Додаємо фіктивні мілісекунди для узгодженості, якщо є Z, але немає мс
        date = new Date(timestampIso.replace('Z', '.000Z'));
    } else {
        date = new Date(timestampIso); // Для інших форматів ISO або локального часу, якщо немає Z
    }
    return date.getTime();
}

const snmpMetricDisplayNames = {
    'sysDescr': 'Опис системи',
    'sysUpTimeInstance': 'Час роботи SNMP',
    'hrSystemUptime': 'Час роботи системи',
    'laLoad1': 'Ø Навантаження (1 хв)',
    'laLoad5': 'Ø Навантаження (5 хв)',
    'laLoad15': 'Ø Навантаження (15 хв)',
    'ssCpuUser': 'CPU (користувач)',
    'ssCpuSystem': 'CPU (система)',
    'ssCpuIdle': 'CPU (простій)',
    'memTotalReal': 'RAM (загалом)',
    'memAvailReal': 'RAM (доступно)',
    'memBuffer': 'RAM (буфери)',
    'memCached': 'RAM (кеш)',
    'memTotalSwap': 'Swap (загалом)',
    'memAvailSwap': 'Swap (доступно)'
};

function getSnmpMetricDisplayName(key) {
    const displayNames = {
        'sysDescr': 'Опис системи',
        'sysUpTimeInstance': 'Час роботи (SysUpTime)',
        'hrSystemUptime': 'Час роботи (hrSystem)',
        'laLoad1': 'Load Average (1 хв)',
        'laLoad5': 'Load Average (5 хв)',
        'laLoad15': 'Load Average (15 хв)',
        'ssCpuUser': 'CPU User (%)',
        'ssCpuSystem': 'CPU System (%)',
        'ssCpuIdle': 'CPU Idle (%)',
        'memTotalReal': 'RAM: Загально',
        'memAvailReal': 'RAM: Доступно',
        'memBuffer': 'RAM: Буфери',
        'memCached': 'RAM: Кеш',
        'memTotalSwap': 'Swap: Загально',
        'memAvailSwap': 'Swap: Доступно',
        'ifDescr_enp0s1': 'Інтерфейс enp0s1: Опис',
        'ifInOctets_enp0s1': 'Інтерфейс enp0s1: Вхідні байти',
        'ifOutOctets_enp0s1': 'Інтерфейс enp0s1: Вихідні байти',
        'ifSpeed_enp0s1': 'Інтерфейс enp0s1: Швидкість',
        'ifAlias_enp0s1': 'Інтерфейс enp0s1: Псевдонім',
        'hrStorageDescr_root': 'Диск /: Опис',
        'hrStorageAllocUnits_root': 'Диск /: Розмір блоку (байт)',
        'hrStorageSize_root': 'Диск /: Загальний розмір (блоки)',
        'hrStorageUsed_root': 'Диск /: Використано (блоки)'
    };
    return displayNames[key] || key;
}

/**
 * Форматує значення SNMP метрики для відображення в історії.
 * @param {string} key - Ключ (назва) SNMP метрики.
 * @param {any} value - Значення метрики.
 * @param {Object} allMetrics - Всі доступні метрики для порівняння.
 * @returns {string} HTML рядок з форматованим значенням.
 */
function formatSnmpValueForHistory(key, value, allMetrics = {}) {
    if (typeof value === 'string' && value.toLowerCase().includes("помилка snmp")) {
        return `<span class="metric-value error">${value}</span>`;
    }
    if (value === null || typeof value === 'undefined') {
        return 'N/A';
    }
    const valStr = String(value);

    if (key === 'sysUpTimeInstance' || key === 'hrSystemUptime') {
        const ticksMatch = valStr.match(/\((\d+)\)/); // Для значень типу "Timeticks: (xxxx) dd hh:mm:ss"
        let ticks = parseInt(valStr); // Спробувати розпарсити безпосередньо, якщо це просто число
        if (ticksMatch && ticksMatch[1]) {
            ticks = parseInt(ticksMatch[1]); // Якщо є група, беремо число з неї
        }

        if (!isNaN(ticks)) {
            const hundredths = ticks; 
            const totalSeconds = Math.floor(hundredths / 100);
            const days = Math.floor(totalSeconds / (60 * 60 * 24));
            const hours = Math.floor((totalSeconds % (60 * 60 * 24)) / (60 * 60));
            const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
            const seconds = totalSeconds % 60;
            let formatted = '';
            if (days > 0) formatted += `${days}д `;
            formatted += `${String(hours).padStart(2, '0')}г ${String(minutes).padStart(2, '0')}хв ${String(seconds).padStart(2, '0')}с`;
            return formatted;
        }
    } else if (key.startsWith('mem') || key.endsWith('Octets')) { 
        const kb = parseInt(valStr); 
        if (!isNaN(kb)) {
            if (kb === 0) return `0 KB`;
            const units = ['KB', 'MB', 'GB', 'TB'];
            let size = kb;
            let unitIndex = 0;
            while (size >= 1024 && unitIndex < units.length - 1) {
                size /= 1024;
                unitIndex++;
            }
            return `${size.toFixed(2)} ${units[unitIndex]}`;
        }
    } else if (key.startsWith('laLoad')) {
        return `${valStr}`;
    } else if (key.startsWith('ssCpu')) {
        return `${valStr}%`;
    }

    // Специфічне форматування для sysUpTimeInstance та hrSystemUptime (Timeticks to human-readable)
    if ((key === 'sysUpTimeInstance' || key === 'hrSystemUptime') && /\d+/.test(value)) {
        const timeticks = parseInt(value, 10);
        if (!isNaN(timeticks)) {
            const seconds = Math.floor(timeticks / 100);
            const days = Math.floor(seconds / (3600 * 24));
            const hours = Math.floor((seconds % (3600 * 24)) / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            let formatted = '';
            if (days > 0) formatted += `${days}д `;
            if (hours > 0 || days > 0) formatted += `${hours}г `;
            if (minutes > 0 || hours > 0 || days > 0) formatted += `${minutes}хв `;
            formatted += `${seconds % 60}с`;
            return formatted.trim();
        }
    }

    // Конвертація байтів для пам'яті, диска та мережевого трафіку
    const byteKeys = [
        'memTotalReal', 'memAvailReal', 'memBuffer', 'memCached', 
        'memTotalSwap', 'memAvailSwap',
        'ifInOctets_enp0s1', 'ifOutOctets_enp0s1'
        // hrStorageAllocUnits_root - це розмір блоку, його не треба конвертувати як загальний розмір
        // hrStorageSize_root та hrStorageUsed_root - це кількість блоків, їх треба множити на hrStorageAllocUnits_root
    ];

    if (byteKeys.includes(key)) {
        const bytes = parseInt(value, 10);
        if (isNaN(bytes)) return value; 
        if (bytes === 0) return '0 Байт';
        const k = 1024;
        const sizes = ['Байт', 'КБ', 'МБ', 'ГБ', 'ТБ'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Форматування для дискового простору (hrStorageSize_root та hrStorageUsed_root)
    if ((key === 'hrStorageSize_root' || key === 'hrStorageUsed_root') && allMetrics.hrStorageAllocUnits_root) {
        const blocks = parseInt(value, 10);
        const allocationUnits = parseInt(allMetrics.hrStorageAllocUnits_root, 10);

        if (!isNaN(blocks) && !isNaN(allocationUnits) && allocationUnits > 0) {
            const bytes = blocks * allocationUnits;
            if (bytes === 0 && key === 'hrStorageUsed_root') return '0 Байт' + ` (0 блоків)`; // Окремо для використаного, якщо 0
            if (bytes === 0) return '0 Байт';
            const k = 1024;
            const sizes = ['Байт', 'КБ', 'МБ', 'ГБ', 'ТБ'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i] + ` (${blocks} блоків)`;
        } else {
            // Якщо не вдалося розрахувати, повертаємо як є з поміткою про блоки
             return String(value) + (isNaN(blocks) ? '' : ' блоків');
        }
    }

    // Для швидкості інтерфейсу
    if (key === 'ifSpeed_enp0s1') {
        const speed = parseInt(value, 10);
        if (isNaN(speed)) return value;
        if (speed === 0) return "0 bps (можливо, не визначено)";
        const k = 1000; // Для швидкостей мережі використовують 1000, а не 1024
        const sizes = ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps'];
        const i = Math.floor(Math.log(speed) / Math.log(k));
        return parseFloat((speed / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    return valStr;
}

/**
 * Асинхронно завантажує історію для вказаного пристрою з бекенду.
 * @param {number} deviceId - ID пристрою.
 * @param {string} sourceType - Тип джерела для історії ('db', 'session', 'all'). За замовчуванням 'all'.
 * @returns {Promise<object|null>} Об'єкт з історією або null у випадку помилки.
 */
async function fetchHistoryForDevice(deviceId, sourceType = 'all') {
    if (!deviceId) {
        console.error("fetchHistoryForDevice: deviceId не надано.");
        return null;
    }

    let db_records_processed = [];
    let session_records_processed = [];

    // 1. Отримуємо та обробляємо історію з БД
    if (sourceType === 'db' || sourceType === 'all') {
        try {
            const response = await fetch(`/api/devices/${deviceId}/history`);
            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                const errorMessage = errorData && errorData.error ? errorData.error : `HTTP помилка ${response.status}`;
                console.error(`Помилка завантаження історії з БД для пристрою ${deviceId}: ${errorMessage}`);
            } else {
                const db_raw = await response.json();
                db_records_processed = db_raw.map(r => ({ ...r, source: 'БД', isSavedToDB: true })); // Додаємо source та isSavedToDB для консистентності
                 // Логування
                console.log(`[historyLogic - fetchHistoryForDevice - DB Processed for DevID ${deviceId}] Processed ${db_records_processed.length} records from DB:`, JSON.parse(JSON.stringify(db_records_processed)));
            }
        } catch (error) {
            console.error(`Виняток при завантаженні історії з БД для пристрою ${deviceId}:`, error);
        }
    }

    // 2. Отримуємо та обробляємо сесійну історію
    if (sourceType === 'session' || sourceType === 'all') {
        if (window.sessionPingHistory && window.sessionPingHistory[deviceId]) {
            session_records_processed = window.sessionPingHistory[deviceId].map(r => ({
                ...r,
                source: 'Сесія' // Додаємо source до сесійних записів
            }));
            console.log(`[historyLogic - fetchHistoryForDevice - Session Processed for DevID ${deviceId}] Processed ${session_records_processed.length} records from session:`, JSON.parse(JSON.stringify(session_records_processed)));
        }
    }
    
    // 3. Фільтруємо та об'єднуємо або повертаємо потрібний тип
    let final_ping_history = [];
    let final_snmp_history = [];

    if (sourceType === 'db') {
        final_ping_history = db_records_processed.filter(r => r.check_type === 'ping');
        final_snmp_history = db_records_processed.filter(r => r.check_type === 'snmp');
    } else if (sourceType === 'session') {
        // Для sourceType 'session' повертаємо тільки ті, що з source 'Сесія' (вже оброблені)
        // І, можливо, тільки не збережені, якщо така логіка потрібна (isSavedToDB == false)
        // Поточна реалізація sessionPingHistory[deviceId].push додає isSavedToDB: false
        final_ping_history = session_records_processed.filter(r => r.check_type === 'ping' && !r.isSavedToDB);
        final_snmp_history = session_records_processed.filter(r => r.check_type === 'snmp' && !r.isSavedToDB);
    } else { // sourceType === 'all'
        const combined_map = new Map();
        // Спочатку записи з БД (вже мають source: 'БД')
        db_records_processed.forEach(r => combined_map.set(r.timestamp_iso + '_' + r.check_type, r));
        // Потім сесійні записи (вже мають source: 'Сесія')
        // Вони перезапишуть записи з БД, якщо час та тип збігаються, що є очікуваною поведінкою
        session_records_processed.forEach(r => combined_map.set(r.timestamp_iso + '_' + r.check_type, r));
        
        const combined_all_types = Array.from(combined_map.values());
        final_ping_history = combined_all_types.filter(r => r.check_type === 'ping');
        final_snmp_history = combined_all_types.filter(r => r.check_type === 'snmp');
    }

    console.log(`[historyLogic - fetchHistoryForDevice - Final for DevID ${deviceId}, SourceType: ${sourceType}] Ping count: ${final_ping_history.length}, SNMP count: ${final_snmp_history.length}`);

    return {
        ping_history: final_ping_history,
        snmp_history: final_snmp_history
    };
}

/**
 * Створює та повертає HTML елемент (td) для комірки таблиці.
 * @param {string|HTMLElement} content - Вміст комірки (текст або HTML елемент).
 * @param {string} [className] - Необов'язковий CSS клас для комірки.
 * @returns {HTMLTableCellElement} Створений елемент td.
 */
function createTableCell(content, className) {
    const cell = document.createElement('td');
    if (typeof content === 'string') {
        cell.textContent = content;
    } else if (content instanceof HTMLElement) {
        cell.appendChild(content);
    }
    if (className) {
        cell.classList.add(className);
    }
    return cell;
}

/**
 * Загальна функція для відображення даних історії у таблиці.
 * @param {HTMLTableSectionElement} tableBodyEl - Елемент tbody таблиці, куди будуть додані рядки.
 * @param {Array<Object>} historyEntries - Масив об'єктів історії для відображення.
 * @param {Object} options - Об'єкт конфігурації.
 * @param {Array<string>} options.columns - Масив ключів полів, які потрібно відобразити як колонки.
 *                                          Наприклад: ['timestamp_iso', 'status', 'rtt_avg_ms', 'check_type', 'source', 'details'].
 * @param {Function} options.getStatusClass - Функція для отримання CSS класу для статусу.
 * @param {Function} [options.onDetailClick] - (Необов'язково) Функція, яка викликається при кліку на деталі.
 *                                             Приймає (entry, event).
 * @param {string} [options.timezone] - (Необов'язково) Часова зона для відображення часу (наприклад, 'uk-UA').
 */
function renderHistoryToTable(tableBodyEl, historyEntries, options) {
    tableBodyEl.innerHTML = ''; // Очищення попередніх даних

    if (!historyEntries || historyEntries.length === 0) {
        const row = tableBodyEl.insertRow();
        const cell = row.insertCell();
        cell.colSpan = options.columns.length || 5; // Або типова кількість колонок
        cell.textContent = 'Дані історії відсутні.';
        cell.style.textAlign = 'center';
        return;
    }

    historyEntries.forEach(entry => {
        const row = tableBodyEl.insertRow();
        
        options.columns.forEach(columnKey => {
            let cellContent = entry[columnKey];
            let cellClass = null;

            switch (columnKey) {
                case 'timestamp_iso':
                    try {
                        const date = new Date(entry.timestamp_iso);
                        const localeOptions = {
                            year: 'numeric', month: '2-digit', day: '2-digit',
                            hour: '2-digit', minute: '2-digit', second: '2-digit',
                            hour12: false
                        };
                        cellContent = date.toLocaleString('uk-UA', localeOptions); 
                    } catch (e) {
                        console.warn("Invalid date for formatting:", entry.timestamp_iso, e);
                        cellContent = entry.timestamp_iso; // Fallback to raw string
                    }
                    break;
                case 'status':
                    cellClass = options.getStatusClass ? options.getStatusClass(entry.status) : null;
                    break;
                case 'rtt_avg_ms':
                    const rtt = entry.rtt_avg_ms;
                    if (rtt !== null && rtt !== undefined) {
                        cellContent = parseFloat(rtt).toFixed(3);
                        if (rtt < 50) {
                            cellClass = 'rtt-low';
                        } else if (rtt >= 50 && rtt <= 150) {
                            cellClass = 'rtt-medium';
                        } else {
                            cellClass = 'rtt-high';
                        }
                    } else {
                        cellContent = 'N/A';
                    }
                    break;
                case 'check_type':
                    cellContent = entry.check_type || 'ping';
                    if (cellContent === 'ping') {
                        cellClass = 'type-ping';
                    } else if (cellContent === 'snmp') {
                        cellClass = 'type-snmp';
                    }
                    break;
                case 'source': // Специфічно для модального вікна, але може бути в даних
                    cellContent = entry.source || 'N/A';
                    if (cellContent.toLowerCase() === 'бд') { // Або 'db' якщо зберігається так
                        cellClass = 'source-db';
                    } else if (cellContent.toLowerCase() === 'сесія') { // Або 'session' 
                        cellClass = 'source-session';
                    }
                    break;
                case 'details': // Для кнопки/посилання на деталі
                    if (options.onDetailClick) {
                        const detailButton = document.createElement('button');
                        detailButton.textContent = 'Деталі';
                        detailButton.onclick = (event) => options.onDetailClick(entry, event);
                        cellContent = detailButton;
                    } else if (entry.raw_output_snippet) {
                        const pre = document.createElement('pre');
                        pre.textContent = entry.raw_output_snippet.substring(0, 100) + (entry.raw_output_snippet.length > 100 ? '...' : '');
                        pre.style.maxHeight = '50px';
                        pre.style.overflowY = 'auto';
                        pre.style.fontSize = '0.8em';
                        pre.title = entry.raw_output_snippet;
                        cellContent = pre;
                    } else {
                        cellContent = 'N/A';
                    }
                    break;
                 // Можна додати інші специфічні обробники колонок тут
            }
            row.appendChild(createTableCell(cellContent, cellClass));
        });
    });
}

/**
 * Сортує масив записів історії на основі стану сортування.
 * @param {Array<Object>} historyData - Масив даних історії для сортування.
 * @param {Object} sortState - Об'єкт стану сортування.
 * @param {number} sortState.column - Індекс колонки для сортування (0: час, 1: статус, 2: RTT, 3: тип, 4: джерело).
 * @param {string} sortState.direction - Напрямок сортування ('asc' або 'desc').
 * @param {Array<string>} columnKeys - Масив ключів, що відповідають індексам колонок, наприклад, ['timestamp_iso', 'status', 'rtt_avg_ms', 'check_type', 'source'].
 * @returns {Array<Object>} Новий відсортований масив.
 */
function sortHistoryData(historyData, sortState, columnKeys) {
    if (!historyData) return [];
    if (!sortState || columnKeys.length === 0) return [...historyData]; // Повертаємо копію, якщо немає стану сортування

    const sortedData = [...historyData].sort((a, b) => {
        let valA, valB;
        const columnKey = columnKeys[sortState.column];

        switch (columnKey) {
            case 'timestamp_iso':
                valA = normalizeTimestampForComparison(a.timestamp_iso);
                valB = normalizeTimestampForComparison(b.timestamp_iso);
                break;
            case 'status':
                valA = (a.status || '').toLowerCase();
                valB = (b.status || '').toLowerCase();
                break;
            case 'rtt_avg_ms':
                valA = a.rtt_avg_ms === null || a.rtt_avg_ms === undefined ? -1 : parseFloat(a.rtt_avg_ms);
                valB = b.rtt_avg_ms === null || b.rtt_avg_ms === undefined ? -1 : parseFloat(b.rtt_avg_ms);
                break;
            case 'check_type':
                valA = (a.check_type || 'ping').toLowerCase();
                valB = (b.check_type || 'ping').toLowerCase();
                break;
            case 'source': // Для модального вікна
                valA = (a.source || 'N/A').toLowerCase();
                valB = (b.source || 'N/A').toLowerCase();
                break;
            default: // Якщо колонка невідома або не для сортування (напр. 'details')
                return 0;
        }

        if (valA < valB) return sortState.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortState.direction === 'asc' ? 1 : -1;
        
        // Вторинне сортування за часом (новіші спочатку), якщо основні значення однакові і це не сортування за часом
        if (columnKey !== 'timestamp_iso') {
             return normalizeTimestampForComparison(b.timestamp_iso) - normalizeTimestampForComparison(a.timestamp_iso);
        }
        return 0;
    });

    return sortedData;
}

/**
 * Збирає всю незбережену історію перевірок (пінги та SNMP) з сесійної історії для всіх пристроїв.
 * @returns {Promise<Object>} Об'єкт з незбереженими записами історії по пристроях.
 */
async function collectAllSessionPingsForSave() {
    const unsavedHistoryByDevice = {};
    
    // Перебираємо всі пристрої в сесійній історії
    Object.entries(sessionPingHistory).forEach(([deviceId, history]) => {
        // Фільтруємо тільки незбережені записи (і пінги, і SNMP) для цього пристрою
        const unsavedRecords = history.filter(record => !record.isSavedToDB);
        if (unsavedRecords.length > 0) {
            unsavedHistoryByDevice[deviceId] = unsavedRecords.map(record => ({
                timestamp_iso: record.timestamp_iso,
                status: record.status,
                rtt_avg_ms: record.rtt_avg_ms,
                raw_output_snippet: record.raw_output_snippet,
                check_type: record.check_type || 'ping', // Зберігаємо тип перевірки (ping або snmp)
                metrics: record.metrics || {} // Додаємо метрики
            }));
            console.log(`Зібрано ${unsavedRecords.length} незбережених записів для пристрою ID ${deviceId}:`, 
                       unsavedRecords.map(r => `${r.check_type}:${r.status}@${r.timestamp_iso}`));
        }
    });
    
    return unsavedHistoryByDevice;
}

/**
 * Очищає всі збережені записи історії з сесійної історії.
 */
function clearAllSessionPings() {
    Object.keys(sessionPingHistory).forEach(deviceId => {
        // Залишаємо тільки незбережені записи
        const beforeCount = sessionPingHistory[deviceId].length;
        sessionPingHistory[deviceId] = sessionPingHistory[deviceId].filter(record => !record.isSavedToDB);
        const afterCount = sessionPingHistory[deviceId].length;
        console.log(`Очищення історії для пристрою ID ${deviceId}: було ${beforeCount}, стало ${afterCount} записів`);
    });
    
    // Видаляємо пусті масиви
    Object.keys(sessionPingHistory).forEach(deviceId => {
        if (sessionPingHistory[deviceId].length === 0) {
            delete sessionPingHistory[deviceId];
            console.log(`Видалено пустий масив історії для пристрою ID ${deviceId}`);
        }
    });
}