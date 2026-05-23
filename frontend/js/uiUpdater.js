// Functions for updating the DOM, displaying errors, status classes, rendering devices, and ping results

function displayError(message) {
    // Assuming errorMessagesDiv is a global variable defined in main.js or similar
    if (typeof errorMessagesDiv !== 'undefined') {
        errorMessagesDiv.textContent = message;
        errorMessagesDiv.style.display = message ? 'block' : 'none';
    } else {
        console.error("errorMessagesDiv is not defined. Make sure it's a global variable.");
        alert(message); // Fallback
    }
}

function getStatusClass(status) {
    status = String(status).toLowerCase();
    switch (status) {
        case 'online':
            return 'status-online';
        case 'offline':
            return 'status-offline';
        case 'timeout':
            return 'status-timeout';
        case 'error':
            return 'status-error';
        case 'online_parsing_error':
            return 'status-online-parsing-error';
        case 'snmp_ok':
            return 'status-snmp-ok';
        case 'snmp_error':
            return 'status-snmp-error';
        case 'snmp_timeout':
            return 'status-snmp-timeout';
        case 'snmp_no_response':
            return 'status-snmp-no-response';
        case 'snmp_host_down':
            return 'status-snmp-host-down';
        case 'snmp_no_access':
            return 'status-snmp-no-access';
        case 'snmp_parse_error':
            return 'status-snmp-parse-error';
        case 'unknown':
            return 'status-unknown';
        case 'na':
        default:
            return 'status-na';
    }
}

function updateDeviceRowInTable(deviceId, status, lastSeen, rtt) {
    const row = document.querySelector(`#devicesTable tbody tr[data-device-id='${deviceId}']`);
    if (row && row.cells.length >= 5) {
        row.cells[3].textContent = status;
        row.cells[3].className = getStatusClass(status);
        row.cells[4].textContent = lastSeen;
    } else {
        // console.warn(`Рядок для deviceId ${deviceId} не знайдено або структура рядка неправильна.`);
    }
}

function renderDevices(devices) {
    const tableBody = document.getElementById('devicesTable').getElementsByTagName('tbody')[0];
    if (!tableBody) {
        console.error("Table body for devices not found!");
        return;
    }
    const currentDynamicStatuses = {};
    tableBody.querySelectorAll('tr[data-device-id]').forEach(row => {
        const deviceId = row.dataset.deviceId;
        if (row.cells.length >=5) {
             currentDynamicStatuses[deviceId] = {
                status: row.cells[3].textContent,
                lastSeen: row.cells[4].textContent
            };
        }
    });

    tableBody.innerHTML = ''; 
    if (devices && devices.length > 0) {
        devices.forEach(device => {
            const row = tableBody.insertRow();
            row.dataset.deviceId = device.id;
            row.insertCell().textContent = device.id;
            row.insertCell().textContent = device.name;
            row.insertCell().textContent = device.ip_address;
            
            const statusCell = row.insertCell();
            const lastSeenCell = row.insertCell();
            
            const dynamicInfo = currentDynamicStatuses[device.id];
            const currentStatus = dynamicInfo ? dynamicInfo.status : 'N/A';
            statusCell.textContent = currentStatus;
            lastSeenCell.textContent = dynamicInfo ? dynamicInfo.lastSeen : 'N/A';
            statusCell.className = getStatusClass(currentStatus);

            const actionsCell = row.insertCell();
            
            // Створюємо контейнер для кнопок
            const dropdownContainer = document.createElement('div');
            dropdownContainer.className = 'actions-dropdown';

            const dropbtn = document.createElement('button');
            dropbtn.className = 'dropbtn';
            dropbtn.textContent = 'Дії';
            dropdownContainer.appendChild(dropbtn);

            const dropdownContent = document.createElement('div');
            dropdownContent.className = 'actions-dropdown-content';

            // Кнопка Пінг
            const pingButton = document.createElement('button');
            pingButton.textContent = 'Пінг';
            pingButton.onclick = () => manualPingDevice(device.id, device.ip_address);
            dropdownContent.appendChild(pingButton);

            // Кнопка Редагувати
            const editButton = document.createElement('button');
            editButton.textContent = 'Редагувати';
            editButton.onclick = () => showEditDeviceModal(device.id, device.name, device.ip_address, device.snmp_enabled, device.snmp_version, device.snmp_community, device.snmp_port);
            dropdownContent.appendChild(editButton);

            // Кнопка Історія
            const historyButton = document.createElement('button');
            historyButton.textContent = 'Історія';
            // Передаємо весь об'єкт device в showDeviceHistory
            historyButton.onclick = () => {
                if (typeof showDeviceHistory === 'function') {
                    showDeviceHistory(device); // Передаємо весь об'єкт device
                } else {
                    console.error('Функція showDeviceHistory не визначена.');
                    alert('Помилка: Функція для відображення історії не доступна.');
                }
            };
            dropdownContent.appendChild(historyButton);

            // Кнопка SNMP Перевірка (якщо увімкнено)
            if (device.snmp_enabled) {
                const snmpButton = document.createElement('button');
                snmpButton.textContent = 'SNMP Перевірка';
                snmpButton.onclick = () => manualSnmpCheck(device.id);
                dropdownContent.appendChild(snmpButton);
            }

            // Кнопка Видалити
            const deleteButton = document.createElement('button');
            deleteButton.textContent = 'Видалити';
            deleteButton.style.color = 'red';
            deleteButton.onclick = () => deleteDevice(device.id, device.name);
            dropdownContent.appendChild(deleteButton);

            dropdownContainer.appendChild(dropdownContent);
            actionsCell.appendChild(dropdownContainer);
        });
    } else {
        const row = tableBody.insertRow();
        const cell = row.insertCell();
        cell.colSpan = 6; 
        cell.textContent = 'Немає пристроїв для відображення.';
    }
}

async function fetchAllDevices() {
    console.log("[fetchAllDevices] Starting fetch...");
    try {
        const response = await fetch('/api/devices');
        if (!response.ok) {
            console.error("[fetchAllDevices] Network response was not ok. Status:", response.status);
            throw new Error(`Помилка HTTP: ${response.status}`);
        }
        const devices = await response.json();
        console.log("[fetchAllDevices] Fetched devices successfully. Count:", devices.length);
        
        window.allDevicesData = devices; // Оновлюємо глобальну змінну
        
        renderDevices(devices); // Відображаємо пристрої в таблиці
        return devices; // Повертаємо дані для можливого подальшого використання
    } catch (error) {
        console.error('[fetchAllDevices] Помилка отримання списку пристроїв:', error);
        displayError(`Не вдалося завантажити список пристроїв: ${error.message}`);
        window.allDevicesData = []; // Встановлюємо порожній масив у випадку помилки
        renderDevices([]); // Відображаємо порожню таблицю
        throw error; // Передаємо помилку далі, щоб її могли обробити інші функції
    }
}

function getStatusIcon(status) {
    status = String(status).toLowerCase();
    switch (status) {
        case 'online':
        case 'snmp_ok':
            return '✅'; // Green check for general online and SNMP success
        case 'offline':
        case 'snmp_host_down':
            return '❌'; // Red X for general offline and SNMP host down
        case 'timeout':
        case 'snmp_timeout':
        case 'snmp_no_response':
            return '⚠️'; // Warning for timeouts and no response
        case 'error':
        case 'online_parsing_error':
        case 'snmp_error':
        case 'snmp_no_access':
        case 'snmp_parse_error':
            return '🆘'; // SOS for various errors
        case 'unknown':
            return '❓'; // Question mark for unknown
        case 'na':
        default:
            return '❔'; // White question mark for N/A or default
    }
}

function displayPingResult(result, deviceName) {
    const outputDiv = document.getElementById('lastCheckResultOutput');
    if (!outputDiv) {
        console.error("Output div with ID 'lastCheckResultOutput' not found.");
        return;
    }
    let html = '';
    const statusClass = getStatusClass(result.status);
    const icon = getStatusIcon(result.status);

    html += `<h3>${icon} Результат для: ${deviceName || result.host_ip}</h3>`;
    
    // Статус з кольоровим індикатором
    html += `<p><strong class="${statusClass}">Статус: ${result.status}</strong></p>`;
    
    // Детальна інформація про пінг
    if (result.status === 'online' || result.status === 'online_parsing_error') {
        if (result.rtt_avg_ms !== null && typeof result.rtt_avg_ms !== 'undefined') {
            html += `<p><strong>Середній час відгуку (RTT):</strong> ${result.rtt_avg_ms.toFixed(2)} мс</p>`;
        }
    }

    // Додаємо розділ з деталями
    if (result.raw_output_snippet) {
        html += `<h4>Деталі перевірки:</h4>`;
        
        // Спроба розпарсити та форматувати вивід ping
        const lines = result.raw_output_snippet.split('\n');
        let formattedOutput = '';
        
        lines.forEach(line => {
            // Виділяємо важливі рядки
            if (line.includes('bytes from') || line.includes('статистика') || 
                line.includes('statistics') || line.includes('packets transmitted') ||
                line.includes('пакетів передано') || line.includes('round-trip') ||
                line.includes('час передачі')) {
                formattedOutput += `<strong>${line}</strong>\n`;
            } else {
                formattedOutput += line + '\n';
            }
        });
        
        html += `<pre class="ping-raw-snippet">${formattedOutput}</pre>`;
    }
    
    // Додаємо часову мітку
    html += `<p class="timestamp"><em>Час перевірки: ${new Date().toLocaleString('uk-UA')}</em></p>`;
    
    outputDiv.innerHTML = html;
}

function displayPingAllResults(data) {
    const outputDiv = document.getElementById('lastCheckResultOutput');
    if (!outputDiv) {
        console.error("Output div with ID 'lastCheckResultOutput' not found for Ping All.");
        return;
    }
    
    const icon = '<i class="fas fa-network-wired"></i>';
    let html = `<h3>${icon} ${data.message || 'Результати перевірки всіх пристроїв'}</h3>`;
    
    if (data.results && data.results.length > 0) {
        // Додаємо статистику
        const stats = {
            total: data.results.length,
            online: data.results.filter(r => r.status === 'online').length,
            offline: data.results.filter(r => r.status === 'offline').length,
            error: data.results.filter(r => ['error', 'timeout', 'online_parsing_error'].includes(r.status)).length
        };
        
        html += `<p><strong>Загальна статистика:</strong></p>`;
        html += `<ul class="ping-stats-list">
            <li>Всього перевірено: ${stats.total}</li>
            <li>Онлайн: <span class="status-online">${stats.online}</span></li>
            <li>Офлайн: <span class="status-offline">${stats.offline}</span></li>
            <li>Помилки/таймаути: <span class="status-error">${stats.error}</span></li>
        </ul>`;
        
        html += '<ul class="ping-all-list">';
        data.results.forEach(r => {
            const statusClass = getStatusClass(r.status);
            const deviceIcon = getStatusIcon(r.status);
            
            html += `<li class="ping-all-item">`;
            html += `${deviceIcon} <strong>${r.name}</strong> (${r.ip_address}): `;
            html += `<span class="${statusClass}">${r.status}</span>`;
            
            if (r.rtt_avg_ms !== null && typeof r.rtt_avg_ms !== 'undefined') {
                html += ` <span class="rtt-info">(RTT: ${r.rtt_avg_ms.toFixed(2)} мс)</span>`;
            }
            
            // Додаємо кнопку для показу деталей
            if (r.raw_output_snippet) {
                html += `<button class="show-details-btn" onclick="togglePingDetails(${r.id})">Деталі</button>`;
                html += `<div id="ping-details-${r.id}" class="ping-details" style="display: none;">`;
                html += `<pre class="ping-raw-snippet">${r.raw_output_snippet}</pre>`;
                html += `</div>`;
            }
            
            html += `</li>`;
        });
        html += '</ul>';
    } else {
        html += '<p>Немає результатів для відображення.</p>';
    }
    
    // Додаємо часову мітку
    html += `<p class="timestamp"><em>Час перевірки: ${new Date().toLocaleString('uk-UA')}</em></p>`;
    
    outputDiv.innerHTML = html;
}

// Функція для показу/приховання деталей пінгу
function togglePingDetails(deviceId) {
    const detailsDiv = document.getElementById(`ping-details-${deviceId}`);
    if (detailsDiv) {
        const isVisible = detailsDiv.style.display === 'block';
        detailsDiv.style.display = isVisible ? 'none' : 'block';
        const btn = detailsDiv.previousElementSibling;
        if (btn && btn.classList.contains('show-details-btn')) {
            btn.textContent = isVisible ? 'Деталі' : 'Приховати';
        }
    }
}