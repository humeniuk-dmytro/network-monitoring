document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const deviceIdFromQuery = urlParams.get('deviceId');

    const historyTableBody = document.getElementById('historyTableBody');
    const errorMessagesDiv = document.getElementById('errorMessages');
    const deviceInfoDiv = document.getElementById('deviceInfo');
    const historyTableStatus = document.getElementById('historyTableStatus');
    const filterStartDate = document.getElementById('filterDateFrom');
    const filterStartTime = document.getElementById('filterTimeFrom');
    const filterEndDate = document.getElementById('filterDateTo');
    const filterEndTime = document.getElementById('filterTimeTo');
    const filterStatus = document.getElementById('filterStatus');
    const filterCheckType = document.getElementById('filterCheckType');
    const applyFiltersButton = document.getElementById('applyHistoryFilters');
    const resetFiltersButton = document.getElementById('resetHistoryFilters');

    // Елементи SSH терміналу
    const sshTerminalContainer = document.getElementById('sshTerminalContainer');
    const sshOutputDiv = document.getElementById('sshOutput');
    const sshCommandInput = document.getElementById('sshCommandInput');
    const sshSendCommandBtn = document.getElementById('sshSendCommandBtn');
    const sshErrorDiv = document.getElementById('sshError');

    const sshCommandsModal = document.getElementById('sshCommandsModal');
    const showSshCommandsBtn = document.getElementById('showSshCommandsBtn');
    const closeSshCommandsModalBtn = document.getElementById('closeSshCommandsModal');
    const standardSshCommandsList = document.getElementById('standardSshCommandsList');
    const sudoSshCommandsList = document.getElementById('sudoSshCommandsList');

    const standardCommands = [
        { cmd: 'ls <шлях>', desc: 'Показати вміст директорії (напр., ls /var/log). Якщо шлях не вказано, показує вміст домашньої директорії.' },
        { cmd: 'ls -la <шлях>', desc: 'Детальний список вмісту директорії.' },
        { cmd: 'pwd', desc: 'Показати повний шлях до поточної (домашньої) директорії.' },
        { cmd: 'cat <повний_шлях_до_файлу>', desc: 'Показати вміст текстового файлу.' },
        { cmd: 'less <повний_шлях_до_файлу>', desc: 'Показати вміст файлу з прокруткою (вихід: q).' },
        { cmd: 'head <повний_шлях_до_файлу>', desc: 'Показати перші рядки файлу.' },
        { cmd: 'tail <повний_шлях_до_файлу>', desc: 'Показати останні рядки файлу.' },
        { cmd: 'echo "текст"', desc: 'Вивести текст.' },
        { cmd: 'whoami', desc: 'Показати ім\'я поточного користувача.' },
        { cmd: 'ps aux', desc: 'Показати список запущених процесів.' },
        { cmd: 'df -h', desc: 'Інформація про використання дискового простору.' },
        { cmd: 'du -sh <повний_шлях_до_директорії_або_файлу>', desc: 'Показати розмір.' },
        { cmd: 'uname -a', desc: 'Детальна інформація про систему.' },
        { cmd: 'ip a', desc: 'Конфігурація мережевих інтерфейсів.' },
        { cmd: 'ip route show', desc: 'Таблиця маршрутизації.' },
        { cmd: 'ip neigh show', desc: 'ARP-таблиця (активні сусіди).' },
        { cmd: 'ss -tulnp', desc: 'Активні мережеві з\'єднання та слухаючі порти.' },
        { cmd: 'ping -c 4 <хост>', desc: 'Перевірити доступність хоста (4 пакети).' },
        { cmd: 'traceroute <хост>', desc: 'Відстежити маршрут до хоста.' },
        { cmd: 'uptime', desc: 'Час роботи системи та середнє навантаження.' },
        { cmd: 'who', desc: 'Хто зараз увійшов у систему.' },
        { cmd: 'history', desc: 'Історія команд цієї SSH-сесії (може бути обмежена веб-терміналом).' },
        { cmd: 'free -h', desc: 'Використання оперативної та swap-пам\'яті.' },
        { cmd: 'touch <повний_шлях_до_файлу/ім\'я_файлу>', desc: 'Створити порожній файл або оновити час модифікації існуючого.' },
        { cmd: 'mkdir <повний_шлях_до_директорії/ім\'я_директорії>', desc: 'Створити нову директорію.' },
        { cmd: 'rm <повний_шлях_до_файлу>', desc: 'Видалити файл (обережно!).' },
        { cmd: 'rmdir <повний_шлях_до_порожньої_директорії>', desc: 'Видалити порожню директорію (обережно!).' }
    ];

    const sudoCommands = [
        { cmd: 'sudo systemctl status <сервіс>', desc: 'Статус сервісу (напр., snmpd, ssh).' },
        { cmd: 'sudo systemctl start <сервіс>', desc: 'Запустити сервіс.' },
        { cmd: 'sudo systemctl stop <сервіс>', desc: 'Зупинити сервіс.' },
        { cmd: 'sudo systemctl restart <сервіс>', desc: 'Перезапустити сервіс.' },
        { cmd: 'sudo systemctl enable <сервіс>', desc: 'Дозволити автозапуск сервісу.' },
        { cmd: 'sudo systemctl disable <сервіс>', desc: 'Заборонити автозапуск сервісу.' },
        { cmd: 'sudo journalctl -n 50 -u <сервіс> --no-pager', desc: 'Останні 50 логів сервісу.' },
        { cmd: 'sudo journalctl -b -n 100 --no-pager', desc: 'Останні 100 логів системи з поточного завантаження.' },
        { cmd: 'sudo apt update', desc: 'Оновити список пакетів.' },
        { cmd: 'sudo apt upgrade -y', desc: 'Оновити встановлені пакети (обережно, може потребувати місця!).' },
        { cmd: 'sudo /sbin/reboot', desc: 'Перезавантажити систему. Термінал буде заблоковано до завершення.' },
        { cmd: 'sudo /sbin/shutdown now', desc: 'Негайно вимкнути систему. Термінал буде заблоковано.' },
        { cmd: 'sudo /sbin/shutdown -h +<хвилини>', desc: 'Запланувати вимкнення (напр., +10). Термінал буде заблоковано.' },
        { cmd: 'sudo fdisk -l', desc: 'Список розділів диска (тільки для перегляду!).' },
        { cmd: 'sudo dmesg | tail -n 50', desc: 'Останні 50 повідомлень ядра (може потребувати спец. налаштування sudoers для |).' },
        { cmd: 'sudo rm <повний_шлях_до_файлу>', desc: 'Видалити файл, що належить root (дуже обережно!).' },
        { cmd: 'sudo apt install <пакет> -y', desc: 'Встановити пакет (обережно!).' },
        { cmd: 'sudo apt remove <пакет> -y', desc: 'Видалити пакет (обережно!).' }
    ];

    if (!filterStartDate || !filterStartTime || !filterEndDate || !filterEndTime || !filterStatus || !filterCheckType || !applyFiltersButton || !resetFiltersButton || !historyTableBody || !errorMessagesDiv || !deviceInfoDiv || !historyTableStatus) {
        const missingElements = [];
        if (!filterStartDate) missingElements.push("filterStartDate");
        if (!filterStartTime) missingElements.push("filterStartTime");
        if (!filterEndDate) missingElements.push("filterEndDate");
        if (!filterEndTime) missingElements.push("filterEndTime");
        if (!filterStatus) missingElements.push("filterStatus");
        if (!filterCheckType) missingElements.push("filterCheckType");
        if (!applyFiltersButton) missingElements.push("applyFiltersButton");
        if (!resetFiltersButton) missingElements.push("resetFiltersButton");
        if (!historyTableBody) missingElements.push("historyTableBody");
        if (!errorMessagesDiv) missingElements.push("errorMessagesDiv (for displayError)");
        if (!deviceInfoDiv) missingElements.push("deviceInfoDiv (for device details)");
        if (!historyTableStatus) missingElements.push("historyTableStatus (for loading status)");

        const errorMessage = `DEVICE_HISTORY_DOM_ERROR: Один або декілька ключових DOM елементів не знайдено: ${missingElements.join(", ")}. Сторінка може працювати некоректно.`;
        console.error(errorMessage);
        if (errorMessagesDiv) {
            errorMessagesDiv.textContent = "Помилка ініціалізації: Не вдалося знайти важливі елементи сторінки. Будь ласка, перезавантажте.";
            errorMessagesDiv.style.display = 'block';
        } else {
            alert("Критична помилка ініціалізації сторінки історії. Деякі елементи не знайдено.");
        }
        return;
    }
    
    let currentDeviceId = null;
    let rttChartInstance = null;
    let currentHistoryDataForSort = []; 
    let historySortState = { column: 0, direction: 'desc' };
    let historyFilterState = { 
        status: 'all',
        dateFrom: null, timeFrom: null,
        dateTo: null, timeTo: null
    };
    let fetchedHistoryData = [];
    let currentSort = { column: 0, direction: 'desc' };
    let currentDeviceIsSnmpEnabled = false;
    let currentDeviceIsSshEnabled = false; // Нова змінна для стану SSH
    let snmpChartInstances = {}; // Об'єкт для зберігання екземплярів SNMP графіків

    let isTerminalLocked = false;
    let rebootCheckInterval = null;
    let shutdownCheckInterval = null;
    const MAX_REBOOT_CHECKS = 30; // 30 спроб * 5 секунд = 2.5 хвилини
    const REBOOT_CHECK_DELAY = 5000; // 5 секунд
    const MAX_SHUTDOWN_CHECKS = 12; // 12 спроб * 5 секунд = 1 хвилина
    const SHUTDOWN_CHECK_DELAY = 5000; // 5 секунд

    // Функція для додавання виводу до SSH терміналу
    function appendSshOutput(message, type = 'info', command = null) {
        if (!sshOutputDiv) return;
        const line = document.createElement('div');
        line.classList.add('ssh-output-line');
        if (type) {
            line.classList.add(`ssh-output-${type}`); // e.g., ssh-output-error, ssh-output-success, ssh-output-system
        }

        let content = '';
        if (command) {
            const promptUser = typeof currentDeviceId !== 'undefined' && currentDeviceId ? currentDeviceId : 'user';
            const promptHost = typeof deviceIdFromQuery !== 'undefined' && deviceIdFromQuery ? deviceIdFromQuery : 'device';
            content += `<span class="ssh-output-prompt">${escapeHtml(promptUser)}@${escapeHtml(promptHost)}:~$</span> <span class="ssh-output-command">${escapeHtml(command)}</span><br>`;
        }
        content += escapeHtml(message).replace(/\n/g, '<br>');
        line.innerHTML = content;
        sshOutputDiv.appendChild(line);
        sshOutputDiv.scrollTop = sshOutputDiv.scrollHeight; // Auto-scroll
    }
    
    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') {
            return String(unsafe === null || typeof unsafe === 'undefined' ? '' : unsafe);
        }
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }

    // Конфігурація для SNMP графіків, винесена для доступу з різних функцій
    const SNMP_METRICS_TO_CHART_CONFIG = {
        'laLoad1': { canvasId: 'laLoad1Chart', yLabel: 'Load Average' },
        'laLoad5': { canvasId: 'laLoad5Chart', yLabel: 'Load Average' },
        'laLoad15': { canvasId: 'laLoad15Chart', yLabel: 'Load Average' },
        'ssCpuUser': { canvasId: 'ssCpuUserChart', yLabel: 'CPU (%)' },
        'ssCpuSystem': { canvasId: 'ssCpuSystemChart', yLabel: 'CPU (%)' },
        'ssCpuIdle': { canvasId: 'ssCpuIdleChart', yLabel: 'CPU (%)' },
        'memTotalReal': { canvasId: 'memTotalRealChart', yLabel: 'RAM (KB)' },
        'memAvailReal': { canvasId: 'memAvailRealChart', yLabel: 'RAM (KB)' },
        'memBuffer': { canvasId: 'memBufferChart', yLabel: 'RAM (KB)' },
        'memCached': { canvasId: 'memCachedChart', yLabel: 'RAM (KB)' },
        'memTotalSwap': { canvasId: 'memTotalSwapChart', yLabel: 'Swap (KB)' },
        'memAvailSwap': { canvasId: 'memAvailSwapChart', yLabel: 'Swap (KB)' },
        'ifInOctets_enp0s1': { canvasId: 'ifInOctetsChart', yLabel: 'Байт' },
        'ifOutOctets_enp0s1': { canvasId: 'ifOutOctetsChart', yLabel: 'Байт' },
        'hrStorageAllocUnits_root': { canvasId: 'hrStorageAllocUnitsChart', yLabel: 'Розмір блоку (Байти)' },
        'hrStorageSize_root': { canvasId: 'hrStorageSizeChart', yLabel: 'Розмір сховища (Блоки)' },
        'hrStorageUsed_root': { canvasId: 'hrStorageUsedChart', yLabel: 'Використано (Блоки)' },
    };

    function displayError(message) {
        if (errorMessagesDiv) {
            errorMessagesDiv.textContent = message;
            errorMessagesDiv.style.display = message ? 'block' : 'none';
        } else {
            console.error("displayError: errorMessagesDiv не знайдено!");
            alert(message);
        }
    }

    if (!deviceIdFromQuery) {
        displayError('ID пристрою не вказано в URL.');
        deviceInfoDiv.textContent = "Помилка: ID пристрою не знайдено.";
        if(sshTerminalContainer) sshTerminalContainer.style.display = 'none'; // Сховати термінал
        historyTableStatus.textContent = "";
        return;
    }
    
    const tableHeaders = document.querySelectorAll('#deviceHistoryTable thead th[data-column-index]');
    tableHeaders.forEach(th => {
        th.addEventListener('click', () => {
            const columnIndex = parseInt(th.dataset.columnIndex, 10);
            sortHistoryTableByColumn(columnIndex);
        });
    });

    // Функція для рендерингу одного SNMP графіка
    function renderSnmpMetricChart(canvasId, label, dataPoints, yAxisLabel = 'Значення') {
        if (snmpChartInstances[canvasId]) {
            snmpChartInstances[canvasId].destroy();
        }
        const ctx = document.getElementById(canvasId).getContext('2d');
        if (!ctx) {
            console.error(`Елемент canvas з ID ${canvasId} не знайдено.`);
            return;
        }

        // Визначаємо, чи потрібно показувати дату в мітках
        let showDateInSnmpLabels = false;
        if (dataPoints.length > 0) {
            const firstDate = new Date(dataPoints[0].x);
            const lastDate = new Date(dataPoints[dataPoints.length - 1].x);
            if (firstDate.toDateString() !== lastDate.toDateString()) {
                showDateInSnmpLabels = true;
            }
        }

        snmpChartInstances[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dataPoints.map(p => {
                    const date = new Date(p.x);
                    if (showDateInSnmpLabels) {
                        return date.toLocaleString('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    } else {
                        return date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    }
                }),
                datasets: [{
                    label: label,
                    data: dataPoints.map(p => p.y),
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    borderWidth: 1,
                    fill: true,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: yAxisLabel
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Час'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                    }
                }
            }
        });
    }

    // Нова функція для рендерингу всіх SNMP графіків
    function renderSnmpCharts(snmpDataToRender) {
        const snmpChartsContainer = document.getElementById('snmpChartsContainer');
        const snmpSpecificChartRows = document.querySelectorAll('.snmp-charts-row-2, .snmp-charts-row-3');
        const snmpMetricRowGroupsSpecific = document.querySelectorAll('.snmp-metric-row-group:not(.snmp-group-rtt-bg)');

        if (!currentDeviceIsSnmpEnabled) {
            if (snmpChartsContainer) snmpChartsContainer.style.display = 'none';
            snmpMetricRowGroupsSpecific.forEach(group => group.style.display = 'none');
            snmpSpecificChartRows.forEach(row => row.style.display = 'none');
            Object.values(snmpChartInstances).forEach(chart => chart.destroy());
            snmpChartInstances = {};
            return;
        }

        // SNMP увімкнено, забезпечити видимість контейнерів
        if (snmpChartsContainer) snmpChartsContainer.style.display = 'block'; // Або 'grid', залежно від CSS
        snmpMetricRowGroupsSpecific.forEach(group => group.style.display = 'block'); 
        snmpSpecificChartRows.forEach(row => row.style.display = 'grid'); 

        // Очищення попередніх SNMP графіків
        Object.values(snmpChartInstances).forEach(chart => chart.destroy());
        snmpChartInstances = {};

        if (!snmpDataToRender || snmpDataToRender.length === 0) {
            console.log("Немає SNMP даних для відображення на графіках (можливо, через фільтри або їх відсутність).");
            Object.entries(SNMP_METRICS_TO_CHART_CONFIG).forEach(([metricKey, config]) => {
                const canvasEl = document.getElementById(config.canvasId);
                if (canvasEl) {
                    const ctx = canvasEl.getContext('2d');
                    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
                    ctx.font = '16px Arial';
                    ctx.fillStyle = '#888';
                    ctx.textAlign = 'center';
                    const displayName = typeof getSnmpMetricDisplayName === 'function' ? getSnmpMetricDisplayName(metricKey) : metricKey;
                    ctx.fillText(`Дані для "${displayName}" відсутні`, canvasEl.width / 2, canvasEl.height / 2);
                }
            });
            return;
        }

        console.log("Рендеринг SNMP графіків з даними:", snmpDataToRender);
        Object.entries(SNMP_METRICS_TO_CHART_CONFIG).forEach(([metricKey, config]) => {
            const dataPoints = snmpDataToRender
                .filter(entry => entry.metrics && typeof entry.metrics[metricKey] !== 'undefined' && entry.metrics[metricKey] !== null)
                .map(entry => ({
                    x: entry.timestamp_iso,
                    y: parseFloat(String(entry.metrics[metricKey]).replace(/[^0-9.]/g, ''))
                }))
                .sort((a, b) => new Date(a.x).getTime() - new Date(b.x).getTime());

            if (dataPoints.length > 0) {
                const displayName = typeof getSnmpMetricDisplayName === 'function' ? getSnmpMetricDisplayName(metricKey) : metricKey;
                renderSnmpMetricChart(config.canvasId, displayName, dataPoints, config.yLabel);
            } else {
                const canvasEl = document.getElementById(config.canvasId);
                if (canvasEl) {
                    const ctx = canvasEl.getContext('2d');
                    if (snmpChartInstances[config.canvasId]) { // Має бути вже очищено, але для безпеки
                        snmpChartInstances[config.canvasId].destroy();
                        delete snmpChartInstances[config.canvasId];
                    }
                    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
                    ctx.font = '16px Arial';
                    ctx.fillStyle = '#888';
                    ctx.textAlign = 'center';
                    const displayName = typeof getSnmpMetricDisplayName === 'function' ? getSnmpMetricDisplayName(metricKey) : metricKey;
                    ctx.fillText(`Дані для "${displayName}" відсутні`, canvasEl.width / 2, canvasEl.height / 2);
                }
                console.log(`Немає даних для SNMP метрики: ${metricKey} (можливо, після фільтрації).`);
            }
        });
    }

    // Нова функція для перевірки початкового SSH з'єднання
    async function checkInitialSshConnection(deviceId) {
        if (!currentDeviceIsSshEnabled) return; // Подвійна перевірка

        // Очистити попередній вивід, якщо потрібно, та заблокувати термінал
        if (sshOutputDiv) sshOutputDiv.innerHTML = '';
        lockTerminal("Перевірка доступності пристрою по SSH...");

        const checkCommand = 'echo INITIAL_SSH_CHECK_SUCCESSFUL';
        const result = await performCheck(deviceId, checkCommand);

        if (result.success && result.output && typeof result.output === 'string' && result.output.trim().includes('INITIAL_SSH_CHECK_SUCCESSFUL')) {
            appendSshOutput("Пристрій доступний по SSH. Термінал готовий до роботи.", 'success');
            unlockTerminal(); // Розблоковуємо, кнопка "Доступні команди" стане видимою
        } else {
            let errorMessage = "Не вдалося підтвердити SSH доступ до пристрою.";
            if (result.error) {
                errorMessage += ` Помилка: ${result.error}`;
            } else if (result.output) {
                errorMessage += ` Неочікуваний вивід: ${result.output}`;
            } else {
                errorMessage += " Пристрій не відповів або сталася помилка мережі.";
            }
            appendSshOutput(errorMessage, 'error');
            // Термінал залишається заблокованим, кнопка "Доступні команди" прихована
            // Можна додати повідомлення, що термінал не буде працювати
            appendSshOutput("SSH-термінал буде недоступний.", 'system');
        }
    }

    async function fetchDeviceDetailsAndHistory() {
        const urlParams = new URLSearchParams(window.location.search);
        const deviceId = urlParams.get('deviceId'); // Використовуємо локальну змінну deviceId

        const deviceInfoDiv = document.getElementById('deviceInfo'); // Переконайтеся, що ці змінні доступні або передані
        const historyTableBody = document.getElementById('historyTableBody'); // Або document.getElementById('deviceHistoryTable').getElementsByTagName('tbody')[0];
        const historyTableStatus = document.getElementById('historyTableStatus');
        const sshTerminalContainer = document.getElementById('sshTerminalContainer');
        const sshCommandInput = document.getElementById('sshCommandInput');
        const sshSendCommandBtn = document.getElementById('sshSendCommandBtn');
        const sshOutputDiv = document.getElementById('sshOutput');
        const showSshCommandsBtn = document.getElementById('showSshCommandsBtn');


        if (!deviceId) {
            displayError('ID пристрою не вказано в URL.');
            if (deviceInfoDiv) deviceInfoDiv.textContent = "Помилка: ID пристрою не знайдено.";
            if(sshTerminalContainer) sshTerminalContainer.style.display = 'none';
            if (historyTableStatus) historyTableStatus.textContent = "Не вдалося завантажити історію.";
            return;
        }

        try {
            if (deviceInfoDiv) deviceInfoDiv.innerHTML = '<i>Завантаження інформації про пристрій та історію...</i>';
            if (historyTableStatus) historyTableStatus.textContent = 'Завантаження даних...';

            // Завантажуємо деталі пристрою та повну історію паралельно
            const [deviceResponse, historyResult] = await Promise.all([
                fetch(`/api/devices/${deviceId}`),
                fetchHistoryForDevice(deviceId, 'all') // 'all' для БД та сесії
            ]);

            // Обробка деталей пристрою
            if (!deviceResponse.ok) {
                const errorData = await deviceResponse.json().catch(() => null);
                throw new Error(errorData?.error || `Помилка HTTP: ${deviceResponse.status} при завантаженні деталей пристрою`);
            }
            const device = await deviceResponse.json();
            console.log("Отримано деталі пристрою:", device);
            
            currentDeviceIsSnmpEnabled = device.snmp_enabled;
            currentDeviceIsSshEnabled = device.ssh_enabled;
            console.log("Стан SSH для пристрою (currentDeviceIsSshEnabled):", currentDeviceIsSshEnabled);
    
            if (deviceInfoDiv) {
                deviceInfoDiv.innerHTML = `
                    <span><strong>Назва:</strong> <code>${escapeHtml(device.name)}</code></span>
                    <span><strong>IP Адреса:</strong> <code>${escapeHtml(device.ip_address)}</code></span>
                    <span><strong>ID:</strong> <code>${escapeHtml(device.id)}</code></span>
                    <span><strong>SNMP:</strong> <code>${device.snmp_enabled ? 'Увімкнено' : 'Вимкнено'}</code></span>
                    <span><strong>SSH:</strong> <code>${device.ssh_enabled ? 'Увімкнено' : 'Вимкнено'} ${device.ssh_enabled && device.ssh_username ? `(${escapeHtml(device.ssh_username)})` : ''}</code></span>
                `;
            }
    
            // Обробка даних історії
            if (historyResult && (historyResult.ping_history || historyResult.snmp_history)) {
                let combinedRawHistory = [];
                if (historyResult.ping_history) {
                    combinedRawHistory.push(...historyResult.ping_history.map(p => ({...p, type: 'ping'})));
                }
                if (historyResult.snmp_history) {
                    combinedRawHistory.push(...historyResult.snmp_history.map(s => ({...s, type: 'snmp'})));
                }
                allHistoryData = combinedRawHistory;
            } else {
                console.warn("Дані історії не отримано або порожні.", historyResult);
                allHistoryData = [];
            }
    
            if (allHistoryData.length === 0) {
                if (historyTableStatus) historyTableStatus.textContent = "Історія для цього пристрою відсутня.";
            } else {
                if (historyTableStatus) historyTableStatus.textContent = ''; // Очистити повідомлення про завантаження
            }
    
            // Початкове налаштування видимості SNMP контейнерів
            const rttChartContainer = document.querySelector('.snmp-group-rtt-bg');
            const snmpChartsContainer = document.getElementById('snmpChartsContainer');
            const snmpMetricRowGroupsSpecific = document.querySelectorAll('.snmp-metric-row-group:not(.snmp-group-rtt-bg)');
            const snmpSpecificChartRows = document.querySelectorAll('.snmp-charts-row-2, .snmp-charts-row-3');

            if (rttChartContainer) rttChartContainer.style.display = 'block';

            if (currentDeviceIsSnmpEnabled) {
                if (snmpChartsContainer) snmpChartsContainer.style.display = 'block';
                snmpMetricRowGroupsSpecific.forEach(group => group.style.display = 'block');
                snmpSpecificChartRows.forEach(row => row.style.display = 'grid');
            } else {
                if (snmpChartsContainer) snmpChartsContainer.style.display = 'none';
                snmpMetricRowGroupsSpecific.forEach(group => group.style.display = 'none');
                snmpSpecificChartRows.forEach(row => row.style.display = 'none');
                 // Якщо SNMP вимкнено, очистимо існуючі графіки SNMP
                Object.values(snmpChartInstances).forEach(chart => chart.destroy());
                snmpChartInstances = {};
            }
            
            // Налаштування видимості SSH терміналу та початкова перевірка
            if (sshTerminalContainer) {
                console.log("Знайдено sshTerminalContainer, перевіряємо видимість...");
                if (currentDeviceIsSshEnabled) {
                    console.log("SSH увімкнено, робимо термінал видимим та запускаємо перевірку.");
                    sshTerminalContainer.style.display = 'block';
                    // showSshCommandsBtn буде керовано через lock/unlockTerminal всередині checkInitialSshConnection
                    if (sshOutputDiv) sshOutputDiv.innerHTML = ''; // Очищаємо перед перевіркою
                    await checkInitialSshConnection(deviceId); // Запускаємо перевірку
                } else {
                    console.log("SSH вимкнено або не визначено, термінал залишається прихованим.");
                    sshTerminalContainer.style.display = 'none';
                    if (showSshCommandsBtn) showSshCommandsBtn.style.display = 'none';
                    if (sshOutputDiv) sshOutputDiv.innerHTML = ''; // Очищаємо
                    appendSshOutput("SSH доступ вимкнено для цього пристрою.", 'system'); // Повідомлення якщо SSH вимкнено
                }
            } else {
                console.error("НЕ ЗНАЙДЕНО sshTerminalContainer!");
            }

            // Застосовуємо фільтри (спочатку 'all'), сортуємо та рендеримо все (таблицю, RTT, SNMP графіки)
            applyFiltersAndSortAndRender();
    
        } catch (error) {
            console.error("Помилка під час завантаження деталей пристрою або історії:", error);
            displayError(error.message || 'Невідома помилка завантаження.');
            if (deviceInfoDiv) deviceInfoDiv.innerHTML = "<p>Не вдалося завантажити інформацію про пристрій.</p>";
            if (historyTableStatus) historyTableStatus.textContent = "Помилка завантаження історії.";
            allHistoryData = []; 
            applyFiltersAndSortAndRender(); // Намагаємося відрендерити порожній стан
        }
    }

    function applyFiltersAndSortAndRender() {
        if (!historyTableBody) {
            console.error("Елемент tbody для таблиці історії не знайдено.");
            displayError("Помилка відображення: таблиця історії недоступна.");
            return;
        }
        displayError('');
        let _filteredData = [...allHistoryData];

        const startDate = filterStartDate.value;
        const startTime = filterStartTime.value;
        const endDate = filterEndDate.value;
        const endTime = filterEndTime.value;
        const statusFilter = filterStatus.value;
        const typeFilter = filterCheckType ? filterCheckType.value : 'all';

        let dateTimeFrom = null;
        if (startDate) {
            dateTimeFrom = new Date(`${startDate}T${startTime || '00:00:00'}`);
        }

        let dateTimeTo = null;
        if (endDate) {
            dateTimeTo = new Date(`${endDate}T${endTime || '23:59:59.999'}`);
        } else if (startDate && !endDate) {
            dateTimeTo = new Date(`${startDate}T23:59:59.999`);
        }

        _filteredData = _filteredData.filter(item => {
            const itemTimestamp = new Date(item.timestamp_iso).getTime();
            if (dateTimeFrom && itemTimestamp < dateTimeFrom.getTime()) return false;
            if (dateTimeTo && itemTimestamp > dateTimeTo.getTime()) return false;
            if (statusFilter !== 'all' && item.status !== statusFilter) return false;
            if (typeFilter !== 'all' && (item.check_type || 'ping') !== typeFilter) return false;
            return true;
        });

        const shouldShowCheckTypeColumn = currentDeviceIsSnmpEnabled && _filteredData.some(item => item.check_type === 'snmp');

        const typeColumnHeaderDeviceHistory = document.querySelector('#deviceHistoryTable thead th:nth-child(4)'); 
        if (typeColumnHeaderDeviceHistory) {
            typeColumnHeaderDeviceHistory.style.display = shouldShowCheckTypeColumn ? '' : 'none';
        } else {
            console.warn("Warning: Елемент заголовка колонки 'Тип' (th:nth-child(4)) не знайдено для оновлення видимості.");
        }

        let columnKeysForDeviceHistory = ['timestamp_iso', 'status', 'rtt_avg_ms', 'details'];
        if (shouldShowCheckTypeColumn) {
            columnKeysForDeviceHistory.splice(3, 0, 'check_type');
        }
        
        const sortedData = sortHistoryData(_filteredData, currentSort, columnKeysForDeviceHistory);

        const renderOptions = {
            columns: columnKeysForDeviceHistory,
            showCheckTypeColumn: shouldShowCheckTypeColumn,
            showSourceColumn: false,
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
        renderHistoryToTable(historyTableBody, sortedData, renderOptions);

        updateSortIndicators();
        renderRttChart(sortedData);

        // Готуємо дані для SNMP графіків з відфільтрованого списку
        // _filteredData містить елементи, що відповідають поточним фільтрам (дата, статус, тип)
        const filteredSnmpDataForCharts = _filteredData.filter(item => item.check_type === 'snmp' && item.metrics);
        renderSnmpCharts(filteredSnmpDataForCharts);
    }

    function renderRttChart(dataForChart) {
        const chartCanvas = document.getElementById('rttHistoryChart');
        if (!chartCanvas) return;
        const ctx = chartCanvas.getContext('2d');
        
        if (rttChartInstance) {
            rttChartInstance.destroy();
        }

        const sortedChartData = [...dataForChart].sort((a, b) => new Date(a.timestamp_iso).getTime() - new Date(b.timestamp_iso).getTime());

        // Визначаємо, чи потрібно показувати дату в мітках
        let showDateInLabels = false;
        if (sortedChartData.length > 0) {
            const firstDate = new Date(sortedChartData[0].timestamp_iso);
            const lastDate = new Date(sortedChartData[sortedChartData.length - 1].timestamp_iso);
            if (firstDate.toDateString() !== lastDate.toDateString()) {
                showDateInLabels = true;
            }
        }

        const labels = sortedChartData.map(p => {
            const date = new Date(p.timestamp_iso);
            if (showDateInLabels) {
                return date.toLocaleString('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
            } else {
                return date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            }
        });
        const rttValues = sortedChartData.map(p => (p.rtt_avg_ms !== null && typeof p.rtt_avg_ms !== 'undefined') ? parseFloat(p.rtt_avg_ms) : null);
        const pointBackgroundColors = sortedChartData.map(p => {
            const status = String(p.status).toLowerCase();
            if (status === 'online') return 'rgba(49, 162, 76, 1)';
            if (status === 'offline') return 'rgba(250, 56, 62, 1)';
            if (status === 'timeout') return 'rgba(255, 159, 67, 1)';
            if (status === 'error' || status === 'online_parsing_error' || status.startsWith('snmp_')) return 'rgba(243, 156, 18, 1)';
            return 'rgba(138, 141, 145, 1)';
        });

        if (labels.length > 0) {
            rttChartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'RTT (ms)',
                        data: rttValues,
                        borderColor: 'rgba(24, 119, 242, 1)',
                        backgroundColor: 'rgba(24, 119, 242, 0.1)',
                        tension: 0.1,
                        fill: true,
                        pointBackgroundColor: pointBackgroundColors,
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        spanGaps: true
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: true,
                    scales: {
                        y: { beginAtZero: true, title: { display: true, text: 'RTT (ms)'}},
                        x: { title: { display: true, text: 'Час' }}
                    },
                    plugins: {
                        legend: { display: true },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    let label = context.dataset.label || '';
                                    if (label) { label += ': '; }
                                    if (context.parsed.y !== null) { label += context.parsed.y.toFixed(2) + ' ms'; }
                                    const dataPoint = sortedChartData[context.dataIndex];
                                    if(dataPoint && dataPoint.status){ label += ` (Статус: ${dataPoint.status})`;}
                                    return label;
                                }
                            }
                        }
                    }
                }
            });
        } else {
             if (rttChartInstance) rttChartInstance.destroy();
             ctx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);
             ctx.font = "16px Arial";
             ctx.textAlign = "center";
             ctx.fillText("Недостатньо даних для побудови графіка RTT.", chartCanvas.width / 2, chartCanvas.height / 2);
        }
    }

    function sortHistoryTableByColumn(columnIndex) {
        if (currentSort.column === columnIndex) {
            currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            currentSort.column = columnIndex;
            currentSort.direction = 'desc';
        }
        applyFiltersAndSortAndRender();
    }
    
    function updateSortIndicators() {
        tableHeaders.forEach(th => {
            const indicator = th.querySelector('.sort-indicator');
            if (indicator) {
                const columnIndex = parseInt(th.dataset.columnIndex, 10);
                if (currentSort.column === columnIndex) {
                    indicator.textContent = currentSort.direction === 'asc' ? ' ▲' : ' ▼';
                } else {
                    indicator.textContent = '';
                }
            }
        });
    }

    function applyHistoryFiltersAndRender() {
        historyFilterState.status = document.getElementById('filterStatus').value;
        historyFilterState.dateFrom = document.getElementById('filterDateFrom').value;
        historyFilterState.timeFrom = document.getElementById('filterTimeFrom').value;
        historyFilterState.dateTo = document.getElementById('filterDateTo').value;
        historyFilterState.timeTo = document.getElementById('filterTimeTo').value;
        applyFiltersAndSortAndRender();
    }

    function resetHistoryFilterFields() {
        document.getElementById('filterStatus').value = 'all';
        document.getElementById('filterDateFrom').value = '';
        document.getElementById('filterTimeFrom').value = '';
        document.getElementById('filterDateTo').value = '';
        document.getElementById('filterTimeTo').value = '';
    }
    
    function resetHistoryFiltersAndRender() {
        filterStartDate.value = '';
        filterStartTime.value = '';
        filterEndDate.value = '';
        filterEndTime.value = '';
        filterStatus.value = 'all';
        if (filterCheckType) filterCheckType.value = 'all';
        applyFiltersAndSortAndRender();
    }

    applyFiltersButton.addEventListener('click', applyFiltersAndSortAndRender);
    resetFiltersButton.addEventListener('click', () => {
        filterStartDate.value = '';
        filterStartTime.value = '';
        filterEndDate.value = '';
        filterEndTime.value = '';
        filterStatus.value = 'all';
        filterCheckType.value = 'all';
        applyFiltersAndSortAndRender();
    });

    // Обробники для SSH терміналу
    if (sshSendCommandBtn && sshCommandInput) {
        sshSendCommandBtn.addEventListener('click', () => {
            if (!isTerminalLocked) {
                sendSshCommand();
            } else {
                appendSshOutput("Термінал тимчасово заблоковано. Зачекайте завершення попередньої операції.", 'system');
            }
        });

        sshCommandInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                if (!isTerminalLocked) {
                sendSshCommand();
                } else {
                    appendSshOutput("Термінал тимчасово заблоковано. Зачекайте завершення попередньої операції.", 'system');
                }
            }
        });
    } else {
        console.warn("SSH input або кнопка не знайдені. Термінал не працюватиме.");
        if(sshTerminalContainer) sshTerminalContainer.style.display = 'none';
    }

    function lockTerminal(message) {
        isTerminalLocked = true;
        if (sshCommandInput) sshCommandInput.disabled = true;
        if (sshSendCommandBtn) sshSendCommandBtn.disabled = true;
        if (showSshCommandsBtn) showSshCommandsBtn.style.display = 'none';
        if (message) appendSshOutput(message, 'system');
    }

    function unlockTerminal(message) {
        isTerminalLocked = false;
        if (sshCommandInput) sshCommandInput.disabled = false;
        if (sshSendCommandBtn) sshSendCommandBtn.disabled = false;
        if (showSshCommandsBtn && currentDeviceIsSshEnabled) {
            showSshCommandsBtn.style.display = 'inline-block';
        }
        if (message) appendSshOutput(message, 'system');
        if (sshCommandInput) sshCommandInput.focus();
    }

    function clearCheckIntervals() {
        if (rebootCheckInterval) {
            clearTimeout(rebootCheckInterval);
            rebootCheckInterval = null;
        }
        if (shutdownCheckInterval) {
            clearTimeout(shutdownCheckInterval);
            shutdownCheckInterval = null;
        }
    }
    
    async function performCheck(deviceId, checkCommand) {
        try {
            const response = await fetch(`/api/devices/${deviceId}/ssh/command`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ device_id: deviceId, command: checkCommand })
            });
            if (response.ok) {
                const result = await response.json();
                return { success: true, output: result.output, error: result.error };
            }
            return { success: false, error: `Помилка перевірки: ${response.status}` };
        } catch (error) {
            return { success: false, error: `Помилка мережі під час перевірки: ${error.message}` };
        }
    }

    function startRebootCheck(deviceId) {
        if (rebootCheckInterval) { // Використовуємо змінну, яка вже є для clearTimeout
            clearTimeout(rebootCheckInterval); 
            rebootCheckInterval = null;
        }
        let checksDone = 0;
        let isRebootCheckInProgress = false; 
    
        const appendAndLog = (message, type = 'system', level = 'info') => {
            appendSshOutput(message, type);
            if (level === 'error') console.error(message);
            else if (level === 'warn') console.warn(message);
            else console.log(message);
        };
    
        appendAndLog(`Пристрій перезавантажується... Очікуйте. (Перевірка кожні ${REBOOT_CHECK_DELAY / 1000} сек, макс. ${MAX_REBOOT_CHECKS} спроб)`);
    
        function scheduleNextCheck() {
            if (rebootCheckInterval) {
                clearTimeout(rebootCheckInterval);
            }
            // Зберігаємо ID таймаута в існуючу змінну rebootCheckInterval
            rebootCheckInterval = setTimeout(performSingleRebootCheck, REBOOT_CHECK_DELAY);
        }
    
        async function performSingleRebootCheck() {
            if (isRebootCheckInProgress) {
                return; 
            }
            isRebootCheckInProgress = true;
            checksDone++;
    
            appendAndLog(`Спроба перевірки #${checksDone}...`);
    
            const checkCommand = 'echo DEVICE_UP_AFTER_REBOOT_CHECK';
            const result = await performCheck(deviceId, checkCommand);
    
            console.log(`Reboot check #${checksDone} - Result from performCheck:`, JSON.stringify(result));
    
            if (result.success && result.output && typeof result.output === 'string' && result.output.trim().includes('DEVICE_UP_AFTER_REBOOT_CHECK')) {
                appendAndLog("Пристрій успішно перезавантажено та доступний. Термінал розблоковано.", 'success');
                console.log(`Reboot check #${checksDone} - SUCCESS: Device is UP.`);
                unlockTerminal(); 
                if (rebootCheckInterval) clearTimeout(rebootCheckInterval);
                rebootCheckInterval = null; // Важливо для clearCheckIntervals
                isRebootCheckInProgress = false;
            } else if (checksDone >= MAX_REBOOT_CHECKS) {
                appendAndLog("Не вдалося підтвердити перезавантаження пристрою у відведений час. Термінал розблоковано, але стан невідомий.", 'system', 'warn');
                console.warn(`Reboot check #${checksDone} - TIMEOUT: Max checks reached.`);
                unlockTerminal();
                if (rebootCheckInterval) clearTimeout(rebootCheckInterval);
                rebootCheckInterval = null; // Важливо для clearCheckIntervals
                isRebootCheckInProgress = false;
            } else {
                const failureMessage = `Перевірка #${checksDone} не вдалася. ${result.error || (result.output ? 'Неочікуваний вивід: ' + String(result.output).substring(0,100) : 'Пристрій ще не відповів.')}`;
                appendAndLog(failureMessage + ` Наступна через ${REBOOT_CHECK_DELAY / 1000} сек.`);
                console.log(`Reboot check #${checksDone} - FAILED: ${result.error || 'Device not responding as expected.'}`);
                isRebootCheckInProgress = false;
                scheduleNextCheck(); 
            }
        }
        
        // Запускаємо першу перевірку одразу або з мінімальною затримкою
        rebootCheckInterval = setTimeout(performSingleRebootCheck, 100); // Мінімальна затримка перед першою перевіркою
    }

    function startShutdownCheck(deviceId, commandBase) {
        if (shutdownCheckInterval) { // Очищаємо попередній таймаут
            clearTimeout(shutdownCheckInterval);
            shutdownCheckInterval = null;
        }
        let checksDone = 0;
        let isShutdownCheckInProgress = false;

        const appendAndLog = (message, type = 'system', level = 'info') => {
            appendSshOutput(message, type);
            if (level === 'error') console.error(message);
            else if (level === 'warn') console.warn(message);
            else console.log(message);
        };

        const isImmediateShutdown = commandBase.includes("now");
        let initialMessage = isImmediateShutdown ? "Пристрій вимикається..." : "Пристрій заплановано на вимкнення...";
        initialMessage += ` (Перевірка кожні ${SHUTDOWN_CHECK_DELAY / 1000} сек, макс. ${MAX_SHUTDOWN_CHECKS} спроб)`;
        appendAndLog(initialMessage);

        function scheduleNextShutdownCheck() {
            if (shutdownCheckInterval) {
                clearTimeout(shutdownCheckInterval);
            }
            shutdownCheckInterval = setTimeout(performSingleShutdownCheck, SHUTDOWN_CHECK_DELAY);
        }

        async function performSingleShutdownCheck() {
            if (isShutdownCheckInProgress) {
                return;
            }
            isShutdownCheckInProgress = true;
            checksDone++;

            appendAndLog(`Спроба перевірки вимкнення #${checksDone}...`);
            const checkCommand = 'echo DEVICE_STILL_UP_CHECK'; 
            const result = await performCheck(deviceId, checkCommand);

            console.log(`Shutdown check #${checksDone} - Result from performCheck:`, JSON.stringify(result));

            // Успішна відповідь означає, що пристрій все ще онлайн
            if (result.success && result.output && typeof result.output === 'string' && result.output.trim().includes('DEVICE_STILL_UP_CHECK')) {
                if (checksDone >= MAX_SHUTDOWN_CHECKS) {
                    appendAndLog("Час очікування вимкнення вичерпано, але пристрій все ще доступний. Можливо, вимкнення було скасовано або заплановано на довший термін. Термінал розблоковано.", 'system', 'warn');
                    console.warn(`Shutdown check #${checksDone} - TIMEOUT: Device still up after max checks.`);
                    unlockTerminal(); 
                    if (shutdownCheckInterval) clearTimeout(shutdownCheckInterval);
                    shutdownCheckInterval = null;
                } else {
                    appendAndLog(`Перевірка #${checksDone}: пристрій все ще онлайн. Наступна через ${SHUTDOWN_CHECK_DELAY / 1000} сек.`);
                    console.log(`Shutdown check #${checksDone} - INFO: Device still up.`);
                    scheduleNextShutdownCheck(); // Плануємо наступну перевірку
                }
            } else { 
                // Пристрій НЕ відповів очікувано (або помилка виконання команди перевірки) -> вважаємо, що він вимикається/вимкнений
                let logMessage = `Перевірка #${checksDone}: Пристрій не відповів очікувано`;
                if (result.error) {
                    logMessage += ` (Помилка: ${result.error}).`;
                } else if (result.output) {
                    logMessage += ` (Неочікуваний вивід: ${String(result.output).substring(0,100)}).`;
                } else {
                    logMessage += ` (Відповідь відсутня).`;
                }
                logMessage += " Припускаємо, що пристрій вимкнено або вимикається.";
                appendAndLog(logMessage, 'system');
                console.log(`Shutdown check #${checksDone} - DEVICE PRESUMED DOWN. Details: ${JSON.stringify(result)}`);

                appendAndLog("Пристрій, ймовірно, вимкнено. Термінал залишається заблокованим для цього сеансу.", 'success');
                // Термінал вже заблокований і залишається таким
                if (shutdownCheckInterval) clearTimeout(shutdownCheckInterval);
                shutdownCheckInterval = null;
            }
            isShutdownCheckInProgress = false;
        }
        shutdownCheckInterval = setTimeout(performSingleShutdownCheck, 100);
    }

    async function handleSpecialSshCommand(command, deviceId) {
        const commandFromInput = command; // Використовуємо передану команду напряму
        const commandBase = commandFromInput.trim().toLowerCase();
        let operationType = null;
        let isPlannedDelayedShutdown = false;

        if (commandBase.includes("/sbin/reboot")) {
            operationType = 'reboot';
        } else if (commandBase.includes("/sbin/shutdown")) {
            operationType = 'shutdown';
            // Заплановане вимкнення, якщо це команда shutdown і НЕ містить "now"
            if (!commandBase.includes("now")) {
                isPlannedDelayedShutdown = true;
            }
        }

        if (!operationType) { 
            console.error("handleSpecialSshCommand: operationType not determined for command:", commandFromInput);
            appendSshOutput(`Помилка: Не вдалося визначити тип спеціальної команди для: ${escapeHtml(commandFromInput)}`, 'error');
            unlockTerminal("Внутрішня помилка обробки команди. Термінал розблоковано.");
            return;
        }

        if (isPlannedDelayedShutdown) {
            // --- Обробка ЗАПЛАНОВАНОГО ВИМКНЕННЯ ---
            appendSshOutput('', 'command', commandFromInput); // Відобразити команду локально
            if(sshCommandInput) sshCommandInput.value = ''; // Очистити поле вводу
            if(sshErrorDiv) sshErrorDiv.textContent = '';
            
            // Тимчасово заблокувати елементи керування під час відправки
            if(sshSendCommandBtn) sshSendCommandBtn.disabled = true;
            if(sshCommandInput) sshCommandInput.disabled = true;

            try {
                const response = await fetch(`/api/devices/${deviceId}/ssh/command`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ device_id: deviceId, command: commandFromInput })
                });

                if (response.ok) {
                    const result = await response.json();
                    if (result.output) appendSshOutput(result.output, 'info'); // Показати відповідь системи, напр. "Shutdown scheduled..."
                    if (result.error) appendSshOutput(result.error, 'error');
                    appendSshOutput("Заплановане вимкнення ініційовано. Термінал залишається активним. Для скасування використовуйте 'sudo shutdown -c'.", 'system');
                } else {
                    const errorText = await response.text().catch(() => "Не вдалося отримати деталі помилки від сервера.");
                    appendSshOutput(`Помилка відправки команди запланованого вимкнення '${escapeHtml(commandFromInput)}'. Статус: ${response.status}. Відповідь сервера: ${escapeHtml(errorText)}`, 'error');
                }
            } catch (error) {
                appendSshOutput(`Помилка мережі при відправці команди '${escapeHtml(commandFromInput)}': ${error.message}`, 'error');
            } finally {
                // Повторно активувати термінал
                if(sshSendCommandBtn) sshSendCommandBtn.disabled = false;
                if(sshCommandInput) {
                    sshCommandInput.disabled = false;
                    sshCommandInput.focus();
                }
            }
        } else {
            // --- Обробка ПЕРЕЗАВАНТАЖЕННЯ або НЕГАЙНОГО ВИМКНЕННЯ ("shutdown now") ---
            lockTerminal(`Ініціюю команду: ${escapeHtml(commandFromInput)}...`);
            if(sshErrorDiv) sshErrorDiv.textContent = ''; 

            try {
                const response = await fetch(`/api/devices/${deviceId}/ssh/command`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ device_id: deviceId, command: commandFromInput })
                });

                if (response.ok) {
                    const result = await response.json();
                    if (result.output) appendSshOutput(result.output, 'info', commandFromInput); 
                    if (result.error) appendSshOutput(result.error, 'error', commandFromInput);
                } else {
                    appendSshOutput(`Команда ${escapeHtml(commandFromInput)} відправлена (або сталася помилка). Статус відповіді сервера: ${response.status}. Починаю моніторинг.`, 'system');
                }
                
                // Запуск відповідного моніторингу
                if (operationType === 'reboot') {
                    startRebootCheck(deviceId);
                } else if (operationType === 'shutdown') { // Це буде true тільки для негайного вимкнення
                    startShutdownCheck(deviceId, commandBase); // commandBase тут буде містити "now"
                }

            } catch (error) {
                const errorMessage = `Помилка при відправці спеціальної команди ${escapeHtml(commandFromInput)}: ${error.message}`;
                console.error(errorMessage, error);
                if(sshErrorDiv) sshErrorDiv.textContent = errorMessage;
                appendSshOutput(errorMessage, 'error');
                
                appendSshOutput("Спроба моніторингу стану пристрою незважаючи на помилку відправки...", 'system');
                if (operationType === 'reboot') {
                    startRebootCheck(deviceId);
                } else if (operationType === 'shutdown') {
                    startShutdownCheck(deviceId, commandBase);
                } else { 
                    unlockTerminal("Помилка виконання спеціальної команди. Термінал розблоковано.");
                }
            }
        }
    }

    async function sendSshCommand() {
        if (!currentDeviceIsSshEnabled) {
            appendSshOutput("SSH доступ вимкнено для цього пристрою.", 'error');
            return;
        }
        if (isTerminalLocked) {
            appendSshOutput("Термінал тимчасово заблоковано. Зачекайте завершення попередньої операції.", 'system');
            return;
        }

        // Отримуємо команду з поля вводу
        const commandFromInput = sshCommandInput.value.trim();
        if (!commandFromInput) { // Якщо команда порожня, нічого не робимо
            return;
        }

        const deviceId = deviceIdFromQuery;
        if (!deviceId) {
            appendSshOutput("ID пристрою не визначено.", 'error');
            return;
        }

        // Виводимо команду перед відправкою
        appendSshOutput('', 'command', commandFromInput); 
        sshCommandInput.value = ''; // Clear input after processing
        sshErrorDiv.textContent = ''; // Clear previous errors

        // Перевірка на спеціальні команди
        // Використовуємо commandFromInput, отриману з поля вводу
        const commandBase = commandFromInput.trim().toLowerCase(); 
        if (commandBase.includes("/sbin/reboot") || commandBase.includes("/sbin/shutdown")) {
            handleSpecialSshCommand(commandFromInput, deviceId); // Передаємо команду, отриману з поля вводу
            return; 
        }

        // Звичайна відправка команди
        sshSendCommandBtn.disabled = true;
        sshCommandInput.disabled = true;

        try {
            const response = await fetch(`/api/devices/${deviceId}/ssh/command`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ device_id: deviceId, command: commandFromInput }),
            });

            if (response.ok) {
                const result = await response.json();
                if (result.output) {
                    appendSshOutput(result.output, 'info');
                }
                if (result.error) {
                    appendSshOutput(result.error, 'error');
                    sshErrorDiv.textContent = `Помилка SSH: ${result.error}`;
                }
                if (!result.output && !result.error) {
                    appendSshOutput("(Команда не повернула вивід)", 'info');
                }
            } else {
                const errorText = await response.text();
                const errorMessage = `Помилка сервера: ${response.status} - ${errorText}`;
                console.error(errorMessage);
                sshErrorDiv.textContent = errorMessage;
                appendSshOutput(errorMessage, 'error');
            }
        } catch (error) {
            const errorMessage = `Помилка мережі при відправці SSH команди: ${error.message}`;
            console.error(errorMessage, error);
            sshErrorDiv.textContent = errorMessage;
            appendSshOutput(errorMessage, 'error');
        } finally {
            if (!isTerminalLocked) { // Розблоковуємо тільки якщо це не спеціальна команда, яка блокує надовго
            sshSendCommandBtn.disabled = false;
               sshCommandInput.disabled = false;
            sshCommandInput.focus();
            }
        }
    }

    function populateCommandsList(listElement, commands) {
        if (!listElement) return;
        listElement.innerHTML = ''; // Очистити попередні
        commands.forEach(command => {
            const li = document.createElement('li');
            
            const commandTextSpan = document.createElement('span');
            commandTextSpan.className = 'command-text'; // Клас для самого тексту команди
            const codeEl = document.createElement('code');
            codeEl.textContent = command.cmd;
            commandTextSpan.appendChild(codeEl);
            
            if (command.desc) {
                const descSpan = document.createElement('span');
                descSpan.className = 'command-description';
                descSpan.textContent = ` - ${command.desc}`;
                commandTextSpan.appendChild(descSpan);
            }
            
            li.appendChild(commandTextSpan);

            const copyBtn = document.createElement('button');
            copyBtn.innerHTML = '<i class="fas fa-copy"></i>'; // Іконка копіювання
            copyBtn.className = 'copy-ssh-command-btn';
            copyBtn.title = 'Копіювати команду';
            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(command.cmd).then(() => {
                    copyBtn.innerHTML = '<i class="fas fa-check"></i> Скопійовано!';
                    setTimeout(() => {
                        copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
                    }, 1500);
                }).catch(err => {
                    console.error('Помилка копіювання команди: ', err);
                    copyBtn.textContent = 'Помилка';
                     setTimeout(() => {
                        copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
                    }, 1500);
                });
            });
            li.appendChild(copyBtn);
            listElement.appendChild(li);
        });
    }

    if (showSshCommandsBtn) {
        showSshCommandsBtn.addEventListener('click', () => {
            populateCommandsList(standardSshCommandsList, standardCommands);
            populateCommandsList(sudoSshCommandsList, sudoCommands);
            if (sshCommandsModal) {
                sshCommandsModal.style.display = 'flex'; // Показати модальне вікно
                setTimeout(() => sshCommandsModal.classList.add('active'), 10); // Для анімації
            }
        });
    }

    if (closeSshCommandsModalBtn) {
        closeSshCommandsModalBtn.addEventListener('click', () => {
            if (sshCommandsModal) {
                sshCommandsModal.classList.remove('active');
                setTimeout(() => sshCommandsModal.style.display = 'none', 300); // Після завершення анімації
            }
        });
    }

    // Закриття модального вікна при кліку поза ним
    if (sshCommandsModal) {
        sshCommandsModal.addEventListener('click', (event) => {
            if (event.target === sshCommandsModal) { // Клік був саме на оверлей
                 sshCommandsModal.classList.remove('active');
                setTimeout(() => sshCommandsModal.style.display = 'none', 300);
            }
        });
    }

    fetchDeviceDetailsAndHistory();
});