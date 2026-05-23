// Глобальні змінні для DOM елементів та стану
const addDeviceForm = document.getElementById("addDeviceForm");
const deviceNameInput = document.getElementById("deviceName");
const deviceIpInput = document.getElementById("deviceIp");
const pingResultOutputDiv = document.getElementById("pingResultOutput");
const errorMessagesDiv = document.getElementById("errorMessages");
const autoRefreshInfoSpan = document.getElementById("autoRefreshInfo");
const snmpAllLastAppliedInfoSpan = document.getElementById("snmpAllLastAppliedInfo");
const saveHistoryLastAppliedInfoSpan = document.getElementById("saveHistoryLastAppliedInfo");
const addSshEnabledCheckbox = document.getElementById('addSshEnabled');
const addSshCredentialsDiv = document.querySelector('#addDeviceForm .ssh-settings .ssh-credentials');
const addSshUsernameInput = document.getElementById('addSshUsername');
const addSshPasswordInput = document.getElementById('addSshPassword');

// Глобальні змінні для модального вікна історії (використовуються в historyModal.js)
let currentDeviceForHistoryModal = null;
let currentModalHistoryData = [];
let modalHistorySortState = { column: 0, direction: 'desc' };
const historyModal = document.getElementById('historyModal');
const historyModalTitle = document.getElementById('historyModalTitle');
const modalHistoryTableBody = document.getElementById('modalHistoryTableBody');
const modalHistoryTableStatus = document.getElementById('modalHistoryTableStatus');
const modalHistoryErrorMessages = document.getElementById('historyModalErrorMessages');

// Глобальні змінні для автооновлення - тепер керуються з autoRefresh.js
// const AUTO_REFRESH_INTERVAL_SECONDS = 60; // Тепер визначається в autoRefresh.js
// let timeToNextRefresh = AUTO_REFRESH_INTERVAL_SECONDS; // Видалено
// let lastUpdateTime = null; // Видалено
// let countdownIntervalId = null; // Видалено
// window.lastManualPingTime = null; // Видалено
// window.lastManualSnmpTime = null; // Видалено

// Глобальна змінна для історії пінгів сесії (використовується в pingLogic.js, snmpLogic.js, historyModal.js, globalStats.js)
window.sessionPingHistory = {};

// Глобальна змінна для екземплярів графіків Chart.js (використовується в globalStats.js)
window.chartJsInstances = {};

// Ініціалізація при завантаженні сторінки
document.addEventListener('DOMContentLoaded', () => {
    // Перевіряємо наявність функцій перед викликом, щоб уникнути помилок,
    // якщо якийсь з модульних файлів не завантажився або функція там не визначена.

    if (typeof fetchAllDevices === 'function') {
        fetchAllDevices();
    } else {
        console.error('fetchAllDevices function is not defined. Make sure deviceManagement.js and uiUpdater.js are loaded and fetchAllDevices is exposed globally or correctly imported if using modules.');
    }

    // Ініціалізація та запуск нових незалежних таймерів автооновлення
    if (typeof window.initAutoRefreshUIElements === 'function' && 
        typeof window.startAutoRefresh === 'function') {
        
        // Ініціалізуємо UI елементи для відображення інформації таймерів
        // Використовуємо ID існуючих span елементів
        window.initAutoRefreshUIElements('autoRefreshInfo', 'snmpAllLastAppliedInfo');
        
        // Запускаємо таймери для Ping та SNMP. 
        // true - означає виконати перевірку одразу при старті.
        window.startAutoRefresh('ping', true);
        window.startAutoRefresh('snmp', true);

    } else {
        console.error('Auto-refresh initialization functions (initAutoRefreshUIElements or startAutoRefresh) are not defined. Make sure autoRefresh.js is loaded and functions are exposed globally.');
    }

    // Обробник для чекбокса SSH у формі додавання пристрою
    if (addSshEnabledCheckbox && addSshCredentialsDiv) {
        addSshEnabledCheckbox.addEventListener('change', function() {
            addSshCredentialsDiv.style.display = this.checked ? 'block' : 'none';
            if (!this.checked) {
                // Очищаємо поля, якщо SSH вимкнено
                if(addSshUsernameInput) addSshUsernameInput.value = '';
                if(addSshPasswordInput) addSshPasswordInput.value = '';
            }
        });
    }

    // Обробник відправки форми додавання пристрою
    if (addDeviceForm) {
        addDeviceForm.addEventListener('submit', async function(event) {
            event.preventDefault();
            const deviceName = deviceNameInput.value;
            const deviceIp = deviceIpInput.value;

            // SNMP Fields
            const snmpEnabled = document.getElementById('addSnmpEnabled').checked;
            const snmpVersion = document.getElementById('addSnmpVersion').value;
            const snmpCommunity = document.getElementById('addSnmpCommunity').value || 'public';
            const snmpPort = parseInt(document.getElementById('addSnmpPort').value, 10) || 161;

            // SSH Fields
            const sshEnabled = addSshEnabledCheckbox ? addSshEnabledCheckbox.checked : false;
            let sshUsername = null;
            let sshPassword = null;
            if (sshEnabled && addSshUsernameInput && addSshPasswordInput) {
                sshUsername = addSshUsernameInput.value;
                sshPassword = addSshPasswordInput.value;
            }

            const deviceData = {
                name: deviceName,
                ip_address: deviceIp,
                snmp_enabled: snmpEnabled,
                snmp_version: snmpEnabled && snmpVersion ? parseInt(snmpVersion) : null,
                snmp_community: snmpEnabled ? snmpCommunity : null,
                snmp_port: snmpEnabled ? snmpPort : null,
                ssh_enabled: sshEnabled, // Додаємо поле ssh_enabled
                ssh_username: sshEnabled && sshUsername ? sshUsername : null, // Додаємо поле ssh_username
                ssh_password: sshEnabled && sshPassword ? sshPassword : null // Додаємо поле ssh_password
            };

            console.log("Дані для надсилання (додавання пристрою):", deviceData);

            try {
                const response = await fetch('/api/devices', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(deviceData),
                });
                const result = await response.json();
                if (response.ok) {
                    displayError(''); // Clear previous errors
                    addDeviceForm.reset(); // Очистити форму
                    if (addSshCredentialsDiv) addSshCredentialsDiv.style.display = 'none'; // Сховати поля SSH
                    
                    // Оновити таблицю пристроїв, якщо функція renderDevices існує
                    if (typeof fetchAllDevices === 'function') {
                        fetchAllDevices(); // Ця функція має викликати renderDevices всередині
                    } else {
                        console.warn("fetchAllDevices function is not available to refresh device list.");
                    }
                    alert(`Пристрій ${result.name} успішно додано.`);
                } else {
                    displayError(`Помилка додавання пристрою: ${result.error || JSON.stringify(result.errors || result)}`);
                }
            } catch (error) {
                console.error('Помилка при додаванні пристрою:', error);
                displayError('Не вдалося підключитися до сервера для додавання пристрою.');
            }
        });
    }
});

console.log("main.js завантажено та ініціалізовано.");