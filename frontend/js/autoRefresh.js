// Logic for auto-refreshing device statuses

// Глобальні налаштування (можуть бути встановлені з main.js)
let AUTO_REFRESH_INTERVAL_SECONDS = 60;

// Об'єкт для зберігання стану таймерів
const autoRefreshTimers = {
    ping: {
        intervalId: null,
        timeToNext: AUTO_REFRESH_INTERVAL_SECONDS,
        lastRunTime: null, // Час останнього успішного запуску (автоматичного або ручного)
        isRunning: false,
        infoElement: null // DOM елемент для виводу інформації про Ping таймер
    },
    snmp: {
        intervalId: null,
        timeToNext: AUTO_REFRESH_INTERVAL_SECONDS,
        lastRunTime: null, // Час останнього успішного запуску (автоматичного або ручного)
        isRunning: false,
        infoElement: null // DOM елемент для виводу інформації про SNMP таймер
    }
};

// Функція для ініціалізації DOM елементів для виводу інформації
// Викликатиметься з main.js після завантаження DOM
function initAutoRefreshUIElements(pingInfoElementId, snmpInfoElementId) {
    autoRefreshTimers.ping.infoElement = document.getElementById(pingInfoElementId);
    autoRefreshTimers.snmp.infoElement = document.getElementById(snmpInfoElementId);

    if (!autoRefreshTimers.ping.infoElement) {
        console.warn(`[AutoRefresh] Ping info element with ID \'${pingInfoElementId}\' not found.`);
    }
    if (!autoRefreshTimers.snmp.infoElement) {
        console.warn(`[AutoRefresh] SNMP info element with ID \'${snmpInfoElementId}\' not found.`);
    }
    // Початкове оновлення тексту
    updateAutoRefreshInfoText('ping');
    updateAutoRefreshInfoText('snmp');
}

function updateAutoRefreshInfoText(type) {
    const timer = autoRefreshTimers[type];
    if (!timer || !timer.infoElement) {
        // console.warn(`[AutoRefresh] Timer type \'${type}\' not configured or info element missing.`);
        return;
    }

    let infoText = '';
    const typeDisplay = type === 'ping' ? 'Пінг' : 'SNMP';

    if (timer.isRunning) {
        infoText = `Авто-${typeDisplay} через: ${timer.timeToNext} сек. `;
    } else {
        infoText = `Авто-${typeDisplay}: вимкнено. `;
    }

    if (timer.lastRunTime) {
        infoText += `(Ост: ${timer.lastRunTime.toLocaleTimeString('uk-UA')})`;
    } else {
        infoText += "(Ост: ще не було)";
    }
    timer.infoElement.textContent = infoText;
}

function countdown(type) {
    const timer = autoRefreshTimers[type];
    if (!timer || !timer.isRunning) return;

    timer.timeToNext--;
    if (timer.timeToNext < 0) {
        timer.timeToNext = AUTO_REFRESH_INTERVAL_SECONDS; // Скидання для наступного циклу
        console.log(`[AutoRefresh] Автоматичний запуск для ${type}`);
        
        // Асинхронний виклик відповідної функції перевірки
        (async () => {
            try {
                if (type === 'ping' && typeof performPingAll === 'function') {
                    await performPingAll(true); // true означає, що це автоматичний виклик
                } else if (type === 'snmp' && typeof performSnmpAll === 'function') {
                    await performSnmpAll(true); // true означає, що це автоматичний виклик
                }
                timer.lastRunTime = new Date(); // Оновлюємо час тільки після успішного виконання
            } catch (error) {
                console.error(`[AutoRefresh] Помилка під час автоматичного запуску ${type}:`, error);
                // Не оновлюємо lastRunTime у випадку помилки, щоб було видно останній успішний запуск
            } finally {
                updateAutoRefreshInfoText(type); // Оновлюємо UI в будь-якому випадку
                // Оновлюємо глобальну статистику після авто-оновлення
                if (typeof window.triggerGlobalStatsUpdate === 'function') {
                    window.triggerGlobalStatsUpdate();
                }
            }
        })();
    } else {
        updateAutoRefreshInfoText(type);
    }
}

async function startAutoRefresh(type, runImmediately = false) {
    const timer = autoRefreshTimers[type];
    if (!timer) {
        console.error(`[AutoRefresh] Невідомий тип таймера: ${type}`);
        return;
    }

    stopAutoRefresh(type); // Зупиняємо попередній, якщо був

    timer.isRunning = true;
    timer.timeToNext = AUTO_REFRESH_INTERVAL_SECONDS;
    
    console.log(`[AutoRefresh] Таймер для \'${type}\' запущено.`);

    if (runImmediately) {
        console.log(`[AutoRefresh] Негайний запуск для ${type} при старті таймера.`);
        try {
            if (type === 'ping' && typeof performPingAll === 'function') {
                await performPingAll(true);
            } else if (type === 'snmp' && typeof performSnmpAll === 'function') {
                await performSnmpAll(true);
            }
            timer.lastRunTime = new Date();
        } catch (error) {
            console.error(`[AutoRefresh] Помилка під час негайного запуску ${type}:`, error);
        }
    }
    
    updateAutoRefreshInfoText(type);
    timer.intervalId = setInterval(() => countdown(type), 1000);
    
    // Оновлення глобальної статистики, якщо був негайний запуск
    if (runImmediately && typeof window.triggerGlobalStatsUpdate === 'function') {
        window.triggerGlobalStatsUpdate();
    }
}

function stopAutoRefresh(type) {
    const timer = autoRefreshTimers[type];
    if (!timer) {
        console.error(`[AutoRefresh] Невідомий тип таймера для зупинки: ${type}`);
        return;
    }

    if (timer.intervalId) {
        clearInterval(timer.intervalId);
        timer.intervalId = null;
    }
    timer.isRunning = false;
    // timer.timeToNext = AUTO_REFRESH_INTERVAL_SECONDS; // Можна скинути, або залишити поточне значення
    updateAutoRefreshInfoText(type);
    console.log(`[AutoRefresh] Таймер для \'${type}\' зупинено.`);
}

function resetAutoRefreshTimer(type, calledFromManualButton = false) {
    const timer = autoRefreshTimers[type];
    if (!timer) {
        console.error(`[AutoRefresh] Невідомий тип таймера для скидання: ${type}`);
        return;
    }

    if (timer.isRunning) { // Скидаємо, тільки якщо таймер активний
        if (timer.intervalId) {
            clearInterval(timer.intervalId);
        }
        timer.timeToNext = AUTO_REFRESH_INTERVAL_SECONDS;
        if (calledFromManualButton) { // Якщо викликано ручною кнопкою
             timer.lastRunTime = new Date(); // Оновлюємо час останнього запуску
        }
        updateAutoRefreshInfoText(type);
        timer.intervalId = setInterval(() => countdown(type), 1000);
        console.log(`[AutoRefresh] Таймер для \'${type}\' скинуто. Наступний автоматичний запуск через ${timer.timeToNext} сек.`);
    } else {
        // Якщо таймер не запущено, але кнопка натиснута, просто оновимо час останнього запуску
        if (calledFromManualButton) {
            timer.lastRunTime = new Date();
            updateAutoRefreshInfoText(type); // Оновити текст, щоб показати новий "Ост:"
        }
        console.log(`[AutoRefresh] Таймер для \'${type}\' не запущено, скидання не потрібне (крім оновлення lastRunTime, якщо це ручний виклик).`);
    }
}

// Зробимо функції доступними глобально, якщо вони потрібні з інших модулів
window.startAutoRefresh = startAutoRefresh;
window.stopAutoRefresh = stopAutoRefresh;
window.resetAutoRefreshTimer = resetAutoRefreshTimer;
window.initAutoRefreshUIElements = initAutoRefreshUIElements; // Для ініціалізації з main.js
window.AUTO_REFRESH_INTERVAL_SECONDS = AUTO_REFRESH_INTERVAL_SECONDS; // Робимо доступним для зміни з main.js

// Приклад того, як це може викликатися з main.js:
/*
document.addEventListener('DOMContentLoaded', () => {
    // ... ваш інший код ...

    // Ініціалізація елементів для відображення статусу автооновлення
    // Переконайтеся, що елементи з ID 'pingAutoRefreshInfo' та 'snmpAutoRefreshInfo' існують у вашому HTML
    initAutoRefreshUIElements('pingAutoRefreshInfo', 'snmpAutoRefreshInfo');
    
    // Запуск автоматичного оновлення для Ping та SNMP при завантаженні сторінки
    // true - означає виконати перевірку одразу
    startAutoRefresh('ping', true); 
    startAutoRefresh('snmp', true);

    // ... ваш інший код ...
});
*/

// Старі функції (закоментовані або видалені, оскільки логіка змінилася)
/*
function updateAutoRefreshInfoText() { ... старий код ... }
function countdown() { ... старий код ... }
async function startAutoRefreshCycle() { ... старий код ... }
function stopAutoRefreshCycle(){ ... старий код ... } 
*/