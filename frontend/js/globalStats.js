// Змінні для зберігання останніх завантажених/оброблених даних
let lastDbHistory = {}; // { deviceId: [historyEntries] }
let lastSessionHistory = {}; // { deviceId: [historyEntries] }

// Межі для розподілу RTT
const RTT_LOW_THRESHOLD = 50; // мс
const RTT_MEDIUM_THRESHOLD = 150; // мс

// Додаємо нову допоміжну функцію на початку файлу або в межах видимості calculatePingStats та renderGlobalStats
function formatSparklineLabel(date, allTimestampsIso) {
    if (!allTimestampsIso || allTimestampsIso.length === 0) return '';

    const firstTs = new Date(allTimestampsIso[0]).getTime();
    const lastTs = new Date(allTimestampsIso[allTimestampsIso.length - 1]).getTime();
    const spanMillis = lastTs - firstTs;
    const oneDayMillis = 24 * 60 * 60 * 1000;

    const options = { hour: '2-digit', minute: '2-digit', second: '2-digit' };

    if (spanMillis > oneDayMillis) { // Більше одного дня
        options.day = '2-digit';
        options.month = '2-digit';
        // options.year = '2-digit'; // Можна додати, якщо потрібно
    } else if (spanMillis >= 0) { // Для однієї точки (spanMillis == 0) АБО для діапазону до одного дня (spanMillis > 0)
        options.day = '2-digit';
        options.month = '2-digit';
    }
    // Немає потреби в else, оскільки spanMillis не може бути < 0, 
    // а випадок allTimestampsIso.length === 0 обробляється на початку.

    return date.toLocaleString('uk-UA', options);
}

// --- Функції для отримання даних ---

// Функція для завантаження всієї історії з БД (можливо, вже існує схожа)
async function fetchAllHistoryFromDB() {
    if (!window.allDevicesData || window.allDevicesData.length === 0) {
        await fetchAllDevices(); 
    }
    
    const historyByDevice = {}; // Тепер це буде { deviceId: { ping_history: [], snmp_history: [] } }
    if (window.allDevicesData) { 
        for (const device of window.allDevicesData) {
            // fetchHistoryForDevice з sourceType = 'db' має повертати об'єкт { ping_history: [...], snmp_history: [...] }
            // де ping_history містить тільки пінги з БД, а snmp_history - тільки SNMP з БД.
            // Потрібно переконатися, що fetchHistoryForDevice в historyLogic.js це робить.
            // Поточна реалізація fetchHistoryForDevice (змінена для модалки) повертає об'єкт:
            // { ping_history: [...], snmp_history: [...] } де кожен масив може містити дані з БД.
            // Це нормально, якщо sourceType='db' гарантує, що там тільки дані з БД.
            const deviceHistory = await fetchHistoryForDevice(device.id, 'db'); 
            if (deviceHistory) {
                historyByDevice[device.id] = {
                    ping_history: (deviceHistory.ping_history || []).filter(h => h.check_type === 'ping'),
                    snmp_history: (deviceHistory.snmp_history || []).filter(h => h.check_type === 'snmp')
                    // Якщо fetchHistoryForDevice вже фільтрує за check_type при sourceType='db', то ці filter тут зайві.
                    // Але для безпеки залишимо.
                };
            } else {
                historyByDevice[device.id] = { ping_history: [], snmp_history: [] };
            }
        }
    }
    lastDbHistory = historyByDevice; // Зберігаємо в такому ж форматі
    // console.log("[GlobalStats] fetchAllHistoryFromDB result (lastDbHistory):", JSON.parse(JSON.stringify(lastDbHistory)));
    return historyByDevice;
}

async function fetchAllHistoryAggregated(sourceType) {
    const aggregatedHistory = { ping_history: {}, snmp_history: {} };
    if (!window.allDevicesData || window.allDevicesData.length === 0) {
        console.warn("fetchAllHistoryAggregated: window.allDevicesData is empty or not loaded.");
        // Спробуємо завантажити, якщо їх немає
        if (typeof fetchAllDevices === 'function') await fetchAllDevices();
        if (!window.allDevicesData || window.allDevicesData.length === 0) return aggregatedHistory; 
    }

    for (const device of window.allDevicesData) {
        const deviceHistory = await fetchHistoryForDevice(device.id, sourceType);
        if (deviceHistory) {
            if (deviceHistory.ping_history && deviceHistory.ping_history.length > 0) {
                aggregatedHistory.ping_history[device.id] = deviceHistory.ping_history;
            }
            if (deviceHistory.snmp_history && deviceHistory.snmp_history.length > 0) {
                aggregatedHistory.snmp_history[device.id] = deviceHistory.snmp_history;
            }
        }
    }
    return aggregatedHistory;
}

// --- Функції для обчислення статистики ---

function calculatePingStats(historyData, allDevices, sourceLabel = "") {
    let totalDevices = allDevices.length;
    let onlineDevices = 0;
    let offlineDevices = 0;
    
    let allPingsForStats = [];
    // Визначаємо, який формат у historyData
    if (Array.isArray(historyData)) { // Старий формат: масив об'єктів ping/snmp
        allPingsForStats = historyData.filter(p => p.check_type === 'ping');
    } else if (typeof historyData === 'object' && historyData !== null && !Array.isArray(historyData)) { 
        // Новий формат: об'єкт pingsByTimestamp {ts: [{deviceId, rtt, deviceName}]}
        // Або старий формат historyByDevice {deviceId: [historyEntries]} - треба розрізнити
        // Простий евристичний спосіб: перевірити, чи ключі є датами (для pingsByTimestamp)
        const keys = Object.keys(historyData);
        const isPingsByTimestampFormat = keys.length > 0 && !isNaN(new Date(keys[0]).getTime());

        if (isPingsByTimestampFormat) {
            // Це вже pingsByTimestamp, який використовується для sparkline.
            // Для загальних stats (online/offline, latest pings) нам все одно потрібен плоский масив всіх пінгів.
            // Або переписати логіку нижче, щоб вона працювала з pingsByTimestamp.
            // Поки що, для менших змін, сконвертуємо pingsByTimestamp назад в allPingsForStats
            // Це не дуже ефективно, але дозволить зберегти решту логіки.
            Object.values(historyData).forEach(pingsAtTs => {
                pingsAtTs.forEach(pingDetail => {
                    // Нам потрібен формат, схожий на оригінальні записи історії
                    allPingsForStats.push({
                        device_id: pingDetail.deviceId,
                        timestamp_iso: Object.keys(historyData).find(key => historyData[key] === pingsAtTs), // Знайти ключ (ts)
                        status: 'online', // Припускаємо 'online', оскільки pingsByTimestamp містить тільки успішні
                        rtt_avg_ms: pingDetail.rtt,
                        check_type: 'ping'
                        // deviceName не потрібен у allPingsForStats для цієї функції, але є в pingDetail
                    });
                });
            });
        } else { // Старий формат historyByDevice {deviceId: [historyEntries]}
             Object.values(historyData).forEach(deviceHistoryArray => {
                if (Array.isArray(deviceHistoryArray)) {
                    allPingsForStats.push(...deviceHistoryArray.filter(p => p.check_type === 'ping'));
                }
            });
        }
    }

    const latestPingsByDevice = {};
    allDevices.forEach(device => {
        const devicePings = allPingsForStats.filter(p => p.device_id.toString() === device.id.toString())
                                         .sort((a, b) => new Date(b.timestamp_iso).getTime() - new Date(a.timestamp_iso).getTime());
        if (devicePings.length > 0) {
            latestPingsByDevice[device.id.toString()] = devicePings[0];
        }
    });

    onlineDevices = 0; 
    offlineDevices = 0; 
    allDevices.forEach(device => {
        const latestPing = latestPingsByDevice[device.id.toString()];
        if (latestPing && (latestPing.status === 'online' || latestPing.status === 'snmp_ok')) {
            onlineDevices++;
        } else {
            offlineDevices++;
        }
    });

    let rttDistributionCounts = { low: 0, medium: 0, high: 0, unknown: 0 };
    let sumRttForAverage = 0;
    let countForAverageRtt = 0;
    Object.values(latestPingsByDevice).forEach(latestPing => {
        if (latestPing.status === 'online' && latestPing.rtt_avg_ms !== null && typeof latestPing.rtt_avg_ms !== 'undefined') {
            const rtt = parseFloat(latestPing.rtt_avg_ms);
            if (!isNaN(rtt)) {
                sumRttForAverage += rtt;
                countForAverageRtt++; 
                if (rtt < RTT_LOW_THRESHOLD) rttDistributionCounts.low++; 
                else if (rtt <= RTT_MEDIUM_THRESHOLD) rttDistributionCounts.medium++;
                else rttDistributionCounts.high++; // Якщо не low і не medium, то high
            }
        }
    });

    const averageRtt = countForAverageRtt > 0 ? sumRttForAverage / countForAverageRtt : null;
    const devicesWithRttCount = rttDistributionCounts.low + rttDistributionCounts.medium + rttDistributionCounts.high;
    const availabilityPercentage = totalDevices > 0 ? (onlineDevices / totalDevices) * 100 : 0;
    const offlineOrProblemPercentage = totalDevices > 0 ? (offlineDevices / totalDevices) * 100 : 0;
    
    const onlinePingsWithRtt = allPingsForStats.filter(
        p => p.status === 'online' && p.rtt_avg_ms !== null && typeof p.rtt_avg_ms !== 'undefined'
    );

    const pingsByTimestamp = {};
    onlinePingsWithRtt.forEach(ping => {
        const ts = ping.timestamp_iso;
        if (!pingsByTimestamp[ts]) {
            pingsByTimestamp[ts] = [];
        }
        // pingsByTimestamp[ts].push(parseFloat(ping.rtt_avg_ms)); // Старий варіант
        // Тепер передаємо об'єкт з деталями, якщо calculatePingStats викликається з об'єктом pingsByTimestamp
        if (typeof ping.rtt === 'number') { // Перевірка, чи це вже новий формат
             pingsByTimestamp[ts].push({ 
                deviceId: ping.deviceId, 
                rtt: ping.rtt, 
                deviceName: ping.deviceName 
            });
        } else { // Якщо старий формат (масив чисел), конвертуємо для сумісності, хоча це не ідеально
            pingsByTimestamp[ts].push({ 
                deviceId: ping.device_id, // Потрібен allDevices тут, щоб знайти ім'я
                rtt: parseFloat(ping.rtt_avg_ms), 
                deviceName: (allDevices.find(d => d.id.toString() === ping.device_id.toString()) || {name: `ID: ${ping.device_id}`}).name
            });
        }
    });

    const sparklineTimestamps = Object.keys(pingsByTimestamp)
        .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    const sparklineAverageRtts = [];
    const sparklinePointColors = [];
    const sparklineDetailedData = []; // <--- Новий масив для детальної інформації

    sparklineTimestamps.forEach(ts => {
        const pingsDetailsAtTs = pingsByTimestamp[ts]; // Тепер це масив об'єктів {deviceId, rtt, deviceName}
        
        let sumRttAtTs = 0;
        let minRtt = Infinity;
        let maxRtt = -Infinity;
        const contributingPings = [];

        pingsDetailsAtTs.forEach(pingDetail => {
            sumRttAtTs += pingDetail.rtt;
            minRtt = Math.min(minRtt, pingDetail.rtt);
            maxRtt = Math.max(maxRtt, pingDetail.rtt);
            contributingPings.push({ deviceName: pingDetail.deviceName, rtt: pingDetail.rtt });
        });

        const avgRtt = pingsDetailsAtTs.length > 0 ? sumRttAtTs / pingsDetailsAtTs.length : 0;
        sparklineAverageRtts.push(avgRtt);

        sparklineDetailedData.push({
            averageRtt: avgRtt,
            minRtt: pingsDetailsAtTs.length > 0 ? minRtt : null,
            maxRtt: pingsDetailsAtTs.length > 0 ? maxRtt : null,
            pingCount: pingsDetailsAtTs.length,
            contributingPings: contributingPings
        });

        if (avgRtt < RTT_LOW_THRESHOLD) {
            sparklinePointColors.push('rgba(75, 192, 192, 1)'); // Green
        } else if (avgRtt <= RTT_MEDIUM_THRESHOLD) {
            sparklinePointColors.push('rgba(255, 206, 86, 1)'); // Yellow
        } else {
            sparklinePointColors.push('rgba(255, 99, 132, 1)'); // Red
        }
    });

    return {
        totalDevices,
        onlineDevices,
        offlineDevices,
        availabilityPercentage,
        offlineOrProblemPercentage,
        averageRtt,
        rttDistribution: rttDistributionCounts,
        devicesWithRttCount,
        rttSparklineData: {
            labels: sparklineTimestamps, 
            datasets: [{
                label: 'Середнє RTT', 
                data: sparklineAverageRtts, 
                borderColor: 'rgba(0, 123, 255, 0.8)',
                backgroundColor: 'rgba(0, 123, 255, 0.1)',
                pointBackgroundColor: sparklinePointColors
            }],
            detailedPingInfo: sparklineDetailedData // <--- Додаємо детальну інформацію сюди
        },
        sourceLabel: sourceLabel,
        onlinePercentage: availabilityPercentage.toFixed(1),
        offlinePercentage: offlineOrProblemPercentage.toFixed(1)
    };
}

// Нова функція для обчислення SNMP статистики
function calculateSnmpStats(historyByDevice, allDevices, sourceLabel = "") {
    const snmpEnabledDevices = allDevices.filter(device => device.snmp_enabled);
    
    let aggregatedStats = {
        totalSnmpDevices: snmpEnabledDevices.length,
        snmpOnlineDevices: 0,
        snmpOfflineOrProblemDevices: 0,
        snmpAvailabilityPercentage: 0,
        noDataForSnmpSource: false,
        avgLaLoad1: { sum: 0, count: 0, value: null, history: [], timestamps: [], detailedInfo: [] },
        avgSsCpuUser: { sum: 0, count: 0, value: null, history: [], timestamps: [], detailedInfo: [] },
        avgRamUsagePercent: { sum: 0, count: 0, value: null, history: [], timestamps: [], detailedInfo: [] },
        avgDiskUsagePercentRoot: { sum: 0, count: 0, value: null, history: [], timestamps: [], detailedInfo: [] },
        // Нові метрики
        avgIfInOctets: { sum: 0, count: 0, value: null, history: [], timestamps: [], detailedInfo: [] },
        avgIfOutOctets: { sum: 0, count: 0, value: null, history: [], timestamps: [], detailedInfo: [] },
        avgSsCpuIdle: { sum: 0, count: 0, value: null, history: [], timestamps: [], detailedInfo: [] },
        // Ще нові метрики
        avgLaLoad5: { sum: 0, count: 0, value: null, history: [], timestamps: [], detailedInfo: [] },
        avgLaLoad15: { sum: 0, count: 0, value: null, history: [], timestamps: [], detailedInfo: [] },
        avgSsCpuSystem: { sum: 0, count: 0, value: null, history: [], timestamps: [], detailedInfo: [] },
        avgSwapUsagePercent: { sum: 0, count: 0, value: null, history: [], timestamps: [], detailedInfo: [] },
        // Акумулятори для агрегованих метрик (залишаємо для текстового звіту, якщо потрібно)
        _avgLaLoad1: { sum: 0, count: 0, value: null },
        _avgSsCpuUser: { sum: 0, count: 0, value: null },
        _avgSsCpuSystem: { sum: 0, count: 0, value: null },
        _avgSsCpuIdle: { sum: 0, count: 0, value: null },
        _totalMemRealKB: { sum: 0, count: 0, value: null },
        _totalMemAvailKB: { sum: 0, count: 0, value: null },
        _avgMemUtilizationPercent: { value: null }
    };

    if (snmpEnabledDevices.length === 0) {
        aggregatedStats.noDataForSnmpSource = sourceLabel === "session";
        return aggregatedStats;
    }

    let snmpDevicesWithMetricsForAggregation = 0;

    // Обробка даних для спарклайнів
    const metricsByTimestamp = {}; // { timestamp_iso: { deviceId: { metrics_object } } }

    snmpEnabledDevices.forEach(device => {
        const deviceIdStr = device.id.toString();
        const deviceHistory = historyByDevice[deviceIdStr] || [];
        const snmpChecks = deviceHistory.filter(h => h.check_type === 'snmp' && h.status === 'snmp_ok' && h.metrics);
        
        snmpChecks.forEach(check => {
            const ts = check.timestamp_iso;
            if (!metricsByTimestamp[ts]) {
                metricsByTimestamp[ts] = {};
            }
            metricsByTimestamp[ts][deviceIdStr] = {
                metrics: check.metrics,
                deviceName: device.name
            };
        });
    });
    
    const sortedTimestamps = Object.keys(metricsByTimestamp).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    // DEBUG LOG
    console.log(`[calculateSnmpStats - ${sourceLabel}] metricsByTimestamp before processing:`, JSON.parse(JSON.stringify(metricsByTimestamp)), "Sorted timestamps:", sortedTimestamps);

    sortedTimestamps.forEach(ts => {
        const devicesAtTs = metricsByTimestamp[ts];
        let laLoad1Sum = 0, cpuUserSum = 0, ramUsageSum = 0, diskUsageSum = 0;
        let laLoad1Count = 0, cpuUserCount = 0, ramUsageCount = 0, diskUsageCount = 0;
        let ifInOctetsSum = 0, ifOutOctetsSum = 0, ssCpuIdleSum = 0;
        let ifInOctetsCount = 0, ifOutOctetsCount = 0, ssCpuIdleCount = 0;
        // Акумулятори для ще нових метрик
        let laLoad5Sum = 0, laLoad15Sum = 0, ssCpuSystemSum = 0, swapUsageSum = 0;
        let laLoad5Count = 0, laLoad15Count = 0, ssCpuSystemCount = 0, swapUsageCount = 0;

        // Min/Max для кожної метрики на поточній часовій позначці
        let minLaLoad1 = Infinity, maxLaLoad1 = -Infinity;
        let minCpuUser = Infinity, maxCpuUser = -Infinity;
        let minRamUsage = Infinity, maxRamUsage = -Infinity;
        let minDiskUsage = Infinity, maxDiskUsage = -Infinity;
        let minIfInOctets = Infinity, maxIfInOctets = -Infinity;
        let minIfOutOctets = Infinity, maxIfOutOctets = -Infinity;
        let minSsCpuIdle = Infinity, maxSsCpuIdle = -Infinity;
        let minLaLoad5 = Infinity, maxLaLoad5 = -Infinity;
        let minLaLoad15 = Infinity, maxLaLoad15 = -Infinity;
        let minSsCpuSystem = Infinity, maxSsCpuSystem = -Infinity;
        let minSwapUsage = Infinity, maxSwapUsage = -Infinity;

        const detailedLaLoad1 = [];
        const detailedCpuUser = [];
        const detailedRamUsage = [];
        const detailedDiskUsage = [];
        const detailedIfInOctets = [];
        const detailedIfOutOctets = [];
        const detailedSsCpuIdle = [];
        // Детальні масиви для ще нових метрик
        const detailedLaLoad5 = [];
        const detailedLaLoad15 = [];
        const detailedSsCpuSystem = [];
        const detailedSwapUsage = [];

        Object.entries(devicesAtTs).forEach(([deviceId, data]) => {
            const metrics = data.metrics;
            const deviceName = data.deviceName;

            if (metrics.laLoad1 !== undefined) {
                const val = parseFloat(metrics.laLoad1);
                if (!isNaN(val)) { 
                    laLoad1Sum += val; laLoad1Count++; detailedLaLoad1.push({deviceName, value: val});
                    minLaLoad1 = Math.min(minLaLoad1, val); maxLaLoad1 = Math.max(maxLaLoad1, val);
                }
            }
            if (metrics.ssCpuUser !== undefined) {
                const val = parseFloat(metrics.ssCpuUser);
                if (!isNaN(val)) { 
                    cpuUserSum += val; cpuUserCount++; detailedCpuUser.push({deviceName, value: val});
                    minCpuUser = Math.min(minCpuUser, val); maxCpuUser = Math.max(maxCpuUser, val);
                }
            }
            
            const memTotal = parseFloat(metrics.memTotalReal);
            const memAvail = parseFloat(metrics.memAvailReal);
            if (!isNaN(memTotal) && !isNaN(memAvail) && memTotal > 0) {
                const usage = ((memTotal - memAvail) / memTotal) * 100;
                ramUsageSum += usage; ramUsageCount++; detailedRamUsage.push({deviceName, value: usage});
                minRamUsage = Math.min(minRamUsage, usage); maxRamUsage = Math.max(maxRamUsage, usage);
            }

            const diskTotal = parseFloat(metrics.hrStorageSize_root); // blocks
            const diskUsed = parseFloat(metrics.hrStorageUsed_root); // blocks
            if (!isNaN(diskTotal) && !isNaN(diskUsed) && diskTotal > 0) {
                const usage = (diskUsed / diskTotal) * 100;
                diskUsageSum += usage; diskUsageCount++; detailedDiskUsage.push({deviceName, value: usage});
                minDiskUsage = Math.min(minDiskUsage, usage); maxDiskUsage = Math.max(maxDiskUsage, usage);
            }

            if (metrics.ifInOctets_enp0s1 !== undefined) {
                const val = parseFloat(metrics.ifInOctets_enp0s1);
                if (!isNaN(val)) { 
                    ifInOctetsSum += val; ifInOctetsCount++; detailedIfInOctets.push({deviceName, value: val});
                    minIfInOctets = Math.min(minIfInOctets, val); maxIfInOctets = Math.max(maxIfInOctets, val);
                }
            }
            if (metrics.ifOutOctets_enp0s1 !== undefined) {
                const val = parseFloat(metrics.ifOutOctets_enp0s1);
                if (!isNaN(val)) { 
                    ifOutOctetsSum += val; ifOutOctetsCount++; detailedIfOutOctets.push({deviceName, value: val});
                    minIfOutOctets = Math.min(minIfOutOctets, val); maxIfOutOctets = Math.max(maxIfOutOctets, val);
                }
            }
            if (metrics.ssCpuIdle !== undefined) {
                const val = parseFloat(metrics.ssCpuIdle);
                if (!isNaN(val)) { 
                    ssCpuIdleSum += val; ssCpuIdleCount++; detailedSsCpuIdle.push({deviceName, value: val});
                    minSsCpuIdle = Math.min(minSsCpuIdle, val); maxSsCpuIdle = Math.max(maxSsCpuIdle, val);
                }
            }

            // Обробка ще нових метрик
            if (metrics.laLoad5 !== undefined) {
                const val = parseFloat(metrics.laLoad5);
                if (!isNaN(val)) { 
                    laLoad5Sum += val; laLoad5Count++; detailedLaLoad5.push({deviceName, value: val});
                    minLaLoad5 = Math.min(minLaLoad5, val); maxLaLoad5 = Math.max(maxLaLoad5, val);
                }
            }
            if (metrics.laLoad15 !== undefined) {
                const val = parseFloat(metrics.laLoad15);
                if (!isNaN(val)) { 
                    laLoad15Sum += val; laLoad15Count++; detailedLaLoad15.push({deviceName, value: val});
                    minLaLoad15 = Math.min(minLaLoad15, val); maxLaLoad15 = Math.max(maxLaLoad15, val);
                }
            }
            if (metrics.ssCpuSystem !== undefined) {
                const val = parseFloat(metrics.ssCpuSystem);
                if (!isNaN(val)) { 
                    ssCpuSystemSum += val; ssCpuSystemCount++; detailedSsCpuSystem.push({deviceName, value: val});
                    minSsCpuSystem = Math.min(minSsCpuSystem, val); maxSsCpuSystem = Math.max(maxSsCpuSystem, val);
                }
            }
            const swapTotal = parseFloat(metrics.memTotalSwap);
            const swapAvail = parseFloat(metrics.memAvailSwap);
            if (!isNaN(swapTotal) && !isNaN(swapAvail) && swapTotal > 0) {
                const usage = ((swapTotal - swapAvail) / swapTotal) * 100;
                swapUsageSum += usage; swapUsageCount++; detailedSwapUsage.push({deviceName, value: usage});
                minSwapUsage = Math.min(minSwapUsage, usage); maxSwapUsage = Math.max(maxSwapUsage, usage);
            } else if (!isNaN(swapTotal) && swapTotal === 0) { // Якщо swap є, але 0, то використання 0%
                swapUsageSum += 0; swapUsageCount++; detailedSwapUsage.push({deviceName, value: 0});
                minSwapUsage = Math.min(minSwapUsage, 0); maxSwapUsage = Math.max(maxSwapUsage, 0);
            }
        });

        if (laLoad1Count > 0) {
            const avg = laLoad1Sum / laLoad1Count;
            aggregatedStats.avgLaLoad1.history.push(avg);
            aggregatedStats.avgLaLoad1.timestamps.push(ts);
            aggregatedStats.avgLaLoad1.detailedInfo.push({average: avg, min: minLaLoad1, max: maxLaLoad1, count: laLoad1Count, contributingDevices: detailedLaLoad1});
        }
        if (cpuUserCount > 0) {
            const avg = cpuUserSum / cpuUserCount;
            aggregatedStats.avgSsCpuUser.history.push(avg);
            aggregatedStats.avgSsCpuUser.timestamps.push(ts);
            aggregatedStats.avgSsCpuUser.detailedInfo.push({average: avg, min: minCpuUser, max: maxCpuUser, count: cpuUserCount, contributingDevices: detailedCpuUser});
        }
        if (ramUsageCount > 0) {
            const avg = ramUsageSum / ramUsageCount;
            aggregatedStats.avgRamUsagePercent.history.push(avg);
            aggregatedStats.avgRamUsagePercent.timestamps.push(ts);
            aggregatedStats.avgRamUsagePercent.detailedInfo.push({average: avg, min: minRamUsage, max: maxRamUsage, count: ramUsageCount, contributingDevices: detailedRamUsage});
        }
        if (diskUsageCount > 0) {
            const avg = diskUsageSum / diskUsageCount;
            aggregatedStats.avgDiskUsagePercentRoot.history.push(avg);
            aggregatedStats.avgDiskUsagePercentRoot.timestamps.push(ts);
            aggregatedStats.avgDiskUsagePercentRoot.detailedInfo.push({average: avg, min: minDiskUsage, max: maxDiskUsage, count: diskUsageCount, contributingDevices: detailedDiskUsage});
        }
        if (ifInOctetsCount > 0) {
            const avg = ifInOctetsSum / ifInOctetsCount;
            aggregatedStats.avgIfInOctets.history.push(avg);
            aggregatedStats.avgIfInOctets.timestamps.push(ts);
            aggregatedStats.avgIfInOctets.detailedInfo.push({average: avg, min: minIfInOctets, max: maxIfInOctets, count: ifInOctetsCount, contributingDevices: detailedIfInOctets});
        }
        if (ifOutOctetsCount > 0) {
            const avg = ifOutOctetsSum / ifOutOctetsCount;
            aggregatedStats.avgIfOutOctets.history.push(avg);
            aggregatedStats.avgIfOutOctets.timestamps.push(ts);
            aggregatedStats.avgIfOutOctets.detailedInfo.push({average: avg, min: minIfOutOctets, max: maxIfOutOctets, count: ifOutOctetsCount, contributingDevices: detailedIfOutOctets});
        }
        if (ssCpuIdleCount > 0) {
            const avg = ssCpuIdleSum / ssCpuIdleCount;
            aggregatedStats.avgSsCpuIdle.history.push(avg);
            aggregatedStats.avgSsCpuIdle.timestamps.push(ts);
            aggregatedStats.avgSsCpuIdle.detailedInfo.push({average: avg, min: minSsCpuIdle, max: maxSsCpuIdle, count: ssCpuIdleCount, contributingDevices: detailedSsCpuIdle});
        }

        // Збереження агрегованих ще нових метрик
        if (laLoad5Count > 0) {
            const avg = laLoad5Sum / laLoad5Count;
            aggregatedStats.avgLaLoad5.history.push(avg);
            aggregatedStats.avgLaLoad5.timestamps.push(ts);
            aggregatedStats.avgLaLoad5.detailedInfo.push({average: avg, min: minLaLoad5, max: maxLaLoad5, count: laLoad5Count, contributingDevices: detailedLaLoad5});
        }
        if (laLoad15Count > 0) {
            const avg = laLoad15Sum / laLoad15Count;
            aggregatedStats.avgLaLoad15.history.push(avg);
            aggregatedStats.avgLaLoad15.timestamps.push(ts);
            aggregatedStats.avgLaLoad15.detailedInfo.push({average: avg, min: minLaLoad15, max: maxLaLoad15, count: laLoad15Count, contributingDevices: detailedLaLoad15});
        }
        if (ssCpuSystemCount > 0) {
            const avg = ssCpuSystemSum / ssCpuSystemCount;
            aggregatedStats.avgSsCpuSystem.history.push(avg);
            aggregatedStats.avgSsCpuSystem.timestamps.push(ts);
            aggregatedStats.avgSsCpuSystem.detailedInfo.push({average: avg, min: minSsCpuSystem, max: maxSsCpuSystem, count: ssCpuSystemCount, contributingDevices: detailedSsCpuSystem});
        }
        if (swapUsageCount > 0) {
            const avg = swapUsageSum / swapUsageCount;
            aggregatedStats.avgSwapUsagePercent.history.push(avg);
            aggregatedStats.avgSwapUsagePercent.timestamps.push(ts);
            aggregatedStats.avgSwapUsagePercent.detailedInfo.push({average: avg, min: minSwapUsage, max: maxSwapUsage, count: swapUsageCount, contributingDevices: detailedSwapUsage});
        }
    });


    // Розрахунок загальної доступності та агрегованих текстових метрик (як було раніше)
    snmpEnabledDevices.forEach(device => {
        const deviceId = device.id.toString();
        const snmpChecks_initial = (historyByDevice[deviceId] || []);
        let snmpChecks = snmpChecks_initial.filter(h => h.check_type === 'snmp');
        snmpChecks.sort((a, b) => new Date(b.timestamp_iso).getTime() - new Date(a.timestamp_iso).getTime());
        const latestSnmpCheck = snmpChecks.length > 0 ? snmpChecks[0] : null;

        if (latestSnmpCheck && latestSnmpCheck.status === 'snmp_ok') {
            aggregatedStats.snmpOnlineDevices++;
            let deviceContributedToAggregation = false;
            const metrics = latestSnmpCheck.metrics;

            if (metrics) {
                if (metrics.laLoad1 !== undefined) {
                    const load1 = parseFloat(metrics.laLoad1);
                    if (!isNaN(load1)) { aggregatedStats._avgLaLoad1.sum += load1; aggregatedStats._avgLaLoad1.count++; deviceContributedToAggregation = true; }
                }
                if (metrics.ssCpuUser !== undefined) {
                    const cpuUser = parseFloat(metrics.ssCpuUser);
                    if (!isNaN(cpuUser)) { aggregatedStats._avgSsCpuUser.sum += cpuUser; aggregatedStats._avgSsCpuUser.count++; deviceContributedToAggregation = true; }
                }
                if (metrics.ssCpuSystem !== undefined) { /* ... */ }
                if (metrics.ssCpuIdle !== undefined) { /* ... */ }
                
                const memTotalKB = parseFloat(metrics.memTotalReal);
                const memAvailKB = parseFloat(metrics.memAvailReal);
                if (!isNaN(memTotalKB)) { aggregatedStats._totalMemRealKB.sum += memTotalKB; aggregatedStats._totalMemRealKB.count++; deviceContributedToAggregation = true; }
                if (!isNaN(memAvailKB)) { aggregatedStats._totalMemAvailKB.sum += memAvailKB; /* aggregatedStats._totalMemAvailKB.count++; */ deviceContributedToAggregation = true; }
            }
            if (deviceContributedToAggregation) {
                snmpDevicesWithMetricsForAggregation++;
            }
        } else if (latestSnmpCheck) { 
            aggregatedStats.snmpOfflineOrProblemDevices++;
        } else {
            if (sourceLabel !== "session") {
                aggregatedStats.snmpOfflineOrProblemDevices++;
            }
        }
    });

    aggregatedStats.snmpAvailabilityPercentage = snmpEnabledDevices.length > 0 ? parseFloat(((aggregatedStats.snmpOnlineDevices / snmpEnabledDevices.length) * 100).toFixed(1)) : 0;

    if (aggregatedStats._avgLaLoad1.count > 0) aggregatedStats._avgLaLoad1.value = parseFloat((aggregatedStats._avgLaLoad1.sum / aggregatedStats._avgLaLoad1.count).toFixed(2));
    if (aggregatedStats._avgSsCpuUser.count > 0) aggregatedStats._avgSsCpuUser.value = parseFloat((aggregatedStats._avgSsCpuUser.sum / aggregatedStats._avgSsCpuUser.count).toFixed(1));
    
    if (aggregatedStats._totalMemRealKB.sum > 0) {
        aggregatedStats._totalMemRealKB.value = aggregatedStats._totalMemRealKB.sum;
        aggregatedStats._totalMemAvailKB.value = aggregatedStats._totalMemAvailKB.sum;
        const usedMemKB = aggregatedStats._totalMemRealKB.sum - aggregatedStats._totalMemAvailKB.sum;
        if (aggregatedStats._totalMemRealKB.sum > 0) {
            const utilization = (usedMemKB / aggregatedStats._totalMemRealKB.sum) * 100;
            aggregatedStats._avgMemUtilizationPercent.value = parseFloat(utilization.toFixed(1));
        }
    }
    
    aggregatedStats.noDataForSnmpSource = sourceLabel === "session" && 
                                      snmpEnabledDevices.length > 0 && 
                                      Object.keys(historyByDevice).every(key => (historyByDevice[key] || []).filter(h => h.check_type === 'snmp').length === 0);
    aggregatedStats.snmpDevicesWithMetricsForAggregation = snmpDevicesWithMetricsForAggregation;
    return aggregatedStats;
}


// --- Функції для відображення статистики ---

function renderGlobalStats(stats, textContainerId, chartCanvasId, sparklineCanvasId) {
    const textContainer = document.getElementById(textContainerId);

    if (textContainer) {
        textContainer.innerHTML = '';
        textContainer.style.display = 'none'; // Приховуємо контейнер для текстової статистики
    } else {
        console.warn(`[GlobalStats] Text container with ID '${textContainerId}' not found.`);
    }

    const chartCanvas = document.getElementById(chartCanvasId); 
    if (window.chartJsInstances[chartCanvasId]) {
        window.chartJsInstances[chartCanvasId].destroy();
        delete window.chartJsInstances[chartCanvasId];
    }

    if (chartCanvas) {
        const chartContainer = chartCanvas.parentElement;
        if (chartContainer) {
            chartContainer.innerHTML = ''; 
            chartContainer.style.display = 'none'; // Приховуємо контейнер для кругової діаграми
        }
    } else {
        // Спробуємо знайти контейнер за конвенцією ID, якщо сам canvas не знайдено (на випадок, якщо він уже видалений)
        const chartContainerId = chartCanvasId + 'Container'; 
        const chartContainer = document.getElementById(chartContainerId);
        if (chartContainer) {
            chartContainer.innerHTML = '';
            chartContainer.style.display = 'none'; // Приховуємо контейнер для кругової діаграми
        }
    }

    const sparklineContainerId = sparklineCanvasId.replace('Sparkline', 'SparklineContainer');
    const sparklineContainer = document.getElementById(sparklineContainerId);

    if (window.chartJsInstances[sparklineCanvasId]) {
        window.chartJsInstances[sparklineCanvasId].destroy();
        delete window.chartJsInstances[sparklineCanvasId];
    }

    if (sparklineContainer) {
        sparklineContainer.innerHTML = ''; // Очищуємо попередній вміст

        const rttHistoryPoints = stats.rttSparklineData && stats.rttSparklineData.datasets && stats.rttSparklineData.datasets.length > 0 ? stats.rttSparklineData.datasets[0].data : [];
        const rawLabelsPing = stats.rttSparklineData && stats.rttSparklineData.labels ? stats.rttSparklineData.labels : [];
        // Видаляємо логування
        // if (sparklineCanvasId.endsWith('Db')) { 
        //     console.log(`[renderGlobalStats - ${sourceLabelFromId(textContainerId)}] Raw Ping Labels (Timestamps) for DB:`, JSON.parse(JSON.stringify(rawLabelsPing)));
        // }
        const labels = rawLabelsPing.map(ts => formatSparklineLabel(new Date(ts), rawLabelsPing));

        const detailedPingInfo = stats.rttSparklineData && stats.rttSparklineData.detailedPingInfo ? stats.rttSparklineData.detailedPingInfo : [];
        
        if (labels.length > 0 && rttHistoryPoints.length > 0) {
            const canvas = document.createElement('canvas');
            canvas.id = sparklineCanvasId; 
            sparklineContainer.appendChild(canvas); // Додаємо canvas ПІСЛЯ опису
            
            const ctxSparkline = canvas.getContext('2d');
            window.chartJsInstances[sparklineCanvasId] = new Chart(ctxSparkline, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                        label: 'Середнє RTT',
                        data: rttHistoryPoints, 
                        borderColor: 'rgba(0, 123, 255, 0.8)',
                    backgroundColor: 'rgba(0, 123, 255, 0.1)',
                    borderWidth: 1.5,
                    fill: true,
                        tension: 0.3, 
                        pointRadius: 2, 
                        pointHoverRadius: 4,
                        pointBackgroundColor: stats.rttSparklineData.datasets[0].pointBackgroundColor
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                    animation: {
                        duration: 250
                    },
                scales: {
                    x: {
                            display: true,
                            ticks: {
                                display: true,
                                autoSkip: true,
                                maxTicksLimit: 6,
                                font: { size: 10 }
                            },
                            grid: {
                                display: false
                            }
                    },
                    y: {
                            display: true,
                            beginAtZero: true,
                            ticks: {
                                display: true,
                                autoSkip: true,
                                maxTicksLimit: 5,
                                font: { size: 10 },
                                callback: function(value) {
                                    return value + ' мс';
                                }
                            },
                            grid: {
                                display: true,
                                drawBorder: false,
                                color: 'rgba(0, 0, 0, 0.05)'
                            }
                    }
                },
                plugins: {
                        legend: {
                            display: false
                        },
                    tooltip: {
                            enabled: true,
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            title: function(tooltipItems) {
                                    // tooltipItems[0] може бути undefined, якщо графік порожній або щось пішло не так
                                    if (!tooltipItems || tooltipItems.length === 0) return '';
                                    return tooltipItems[0].label; // Це вже відформатований час
                            },
                            label: function(context) {
                                // context.datasetIndex, context.dataIndex
                                const pointDetails = detailedPingInfo[context.dataIndex];
                                if (!pointDetails) return 'Деталі відсутні';

                                let labelLines = [];
                                labelLines.push(`Середнє RTT: ${pointDetails.averageRtt.toFixed(1)} мс`);
                                labelLines.push(`Кількість пінгів: ${pointDetails.pingCount}`);
                                if (pointDetails.pingCount > 0) {
                                    labelLines.push(`Min/Max RTT: ${pointDetails.minRtt.toFixed(1)} / ${pointDetails.maxRtt.toFixed(1)} мс`);
                                }
                                
                                if (pointDetails.contributingPings && pointDetails.contributingPings.length > 0) {
                                    labelLines.push('Пристрої в цій точці:');
                                    pointDetails.contributingPings.forEach(ping => {
                                        labelLines.push(`  - ${ping.deviceName}: ${ping.rtt.toFixed(1)} мс`);
                                    });
                                }
                                return labelLines;
                            }
                        },
                        titleFont: { size: 13 },
                        bodyFont: { size: 11 },
                        padding: 6
                    }
                    },
                    elements: {
                        line: {
                            borderJoinStyle: 'round'
                        }
                }
            }
        });
    } else {
            // Якщо немає даних, додаємо повідомлення ПІСЛЯ опису
            const noDataMessage = document.createElement('p');
            noDataMessage.style.textAlign = 'center';
            noDataMessage.style.color = 'var(--warning-color)';
            noDataMessage.style.paddingTop = '10px'; // Невеликий відступ зверху
            noDataMessage.textContent = 'Немає даних RTT для відображення історії.';
            sparklineContainer.appendChild(noDataMessage);
        }
    } else { 
        console.warn(`[GlobalStats] Sparkline container with ID '${sparklineContainerId}' (derived from ${sparklineCanvasId}) not found.`);
        const textContainerElementOnError = document.getElementById(textContainerId); // textContainerId тут - це ID для основного текстового блоку, який ми приховали
        if (textContainerElementOnError && textContainerElementOnError.parentElement) { // Перевіряємо батьківський елемент
            // Можливо, додати повідомлення про помилку в інше місце, якщо textContainer прихований
            // Наприклад, в сам sparklineContainer, якщо він знайдений, але не вдалося створити графік.
            // Але якщо sparklineContainer не знайдено, то це попередження в консолі є основним.
        }
    }
}

// Нова функція для відображення SNMP статистики (текст + графіки)
function renderGlobalSnmpStats(stats, sourcePrefix) { // sourcePrefix: 'Db', 'Session', 'Combined'
    const textContainerId = `textSnmpStats${sourcePrefix}`;
    const textStatsContainer = document.getElementById(textContainerId);

    if (!textStatsContainer) {
        console.error(`[GlobalStats-SNMP] Critical element .text-stats-container not found with ID ${textContainerId}.`);
        return;
    }
    
    // Текстова статистика (як і раніше, але використовуємо _ prefixed агрегати)
    // Закоментуємо цю частину, щоб прибрати текстову статистику з колонок
    /*
    let html = '<p>';
    let onlineStatusClass = 'status-unknown';
    if (stats.snmpOnlineDevices > 0) {
        if (stats.snmpAvailabilityPercentage >= 90) onlineStatusClass = 'status-snmp-ok';
        else if (stats.snmpAvailabilityPercentage >= 70) onlineStatusClass = 'status-warning';
        else onlineStatusClass = 'status-snmp-error';
    } else if (stats.totalSnmpDevices > 0) {
        onlineStatusClass = 'status-snmp-error';
    }

    html += `<strong>Загальна кількість SNMP пристроїв:</strong> ${stats.totalSnmpDevices}</p>`;
    html += `<p class="${onlineStatusClass}"><strong>SNMP Онлайн:</strong> ${stats.snmpOnlineDevices} (${stats.snmpAvailabilityPercentage}%)</p>`;
    html += `<p class="${stats.snmpOfflineOrProblemDevices > 0 ? 'status-snmp-error' : ''}"><strong>SNMP Офлайн/Проблеми:</strong> ${stats.snmpOfflineOrProblemDevices}</p>`;

    if (stats.snmpOnlineDevices > 0 && stats.snmpDevicesWithMetricsForAggregation > 0) {
        html += `<hr><p style="font-size: 0.9em;"><em>Агреговані метрики (на основі ${stats.snmpDevicesWithMetricsForAggregation} пристроїв, що надали дані):</em></p>`;
        if (stats._avgLaLoad1 && stats._avgLaLoad1.value !== null) html += `<p>Ø Load (1 хв): ${stats._avgLaLoad1.value}</p>`;
        if (stats._avgSsCpuUser && stats._avgSsCpuUser.value !== null) html += `<p>Ø CPU User: ${stats._avgSsCpuUser.value}%</p>`;
        if (stats._avgMemUtilizationPercent && stats._avgMemUtilizationPercent.value !== null) {
             const totalMemGB = (stats._totalMemRealKB.value / (1024 * 1024)).toFixed(2);
             html += `<p>Загальна RAM: ${totalMemGB} GB (Ø Використання: ${stats._avgMemUtilizationPercent.value}%)</p>`;
        }
    } else if (stats.snmpOnlineDevices > 0 && stats.snmpDevicesWithMetricsForAggregation === 0 && !stats.noDataForSnmpSource) {
        html += `<p><small>Не вдалося агрегувати детальні метрики (відсутні дані від онлайн SNMP пристроїв).</small></p>`;
    }
    textStatsContainer.innerHTML = html;
    */
   textStatsContainer.innerHTML = ''; // Просто очищуємо контейнер текстової статистики

    // Функція для рендерингу одного спарклайн-графіка SNMP
    const renderSnmpSparkline = (metricData, canvasId, metricLabel, unit = '') => {
        const sparklineContainerId = canvasId.replace('Sparkline', 'SparklineContainer');
        const sparklineContainer = document.getElementById(sparklineContainerId);

        if (window.chartJsInstances && window.chartJsInstances[canvasId]) {
            window.chartJsInstances[canvasId].destroy();
            delete window.chartJsInstances[canvasId];
        }

        if (sparklineContainer) {
            sparklineContainer.innerHTML = ''; // Очищення
            const rawLabelsSnmp = metricData.timestamps;
            // Видаляємо логування
            // if (canvasId.includes('Db')) { 
            //      console.log(`[renderSnmpSparkline - ${sourcePrefix}] Raw SNMP Labels for ${metricLabel} (DB):`, JSON.parse(JSON.stringify(rawLabelsSnmp)));
            // }
            const labels = rawLabelsSnmp.map(ts => formatSparklineLabel(new Date(ts), rawLabelsSnmp));
            
            if (labels.length > 0 && metricData.history.length > 0) {
                const canvas = document.createElement('canvas');
                canvas.id = canvasId;
                sparklineContainer.appendChild(canvas);
                
                const ctxSparkline = canvas.getContext('2d');
                window.chartJsInstances[canvasId] = new Chart(ctxSparkline, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: metricLabel,
                            data: metricData.history,
                            borderColor: 'rgba(108, 92, 231, 0.8)', // Пурпурний для SNMP
                            backgroundColor: 'rgba(108, 92, 231, 0.1)',
                            borderWidth: 1.5, fill: true, tension: 0.3, pointRadius: 1, pointHoverRadius: 3
                        }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
                        scales: {
                            x: { display: true, ticks: { autoSkip: true, maxTicksLimit: 4, font: { size: 9 } }, grid: {display: false} },
                            y: { display: true, beginAtZero: true, ticks: { autoSkip: true, maxTicksLimit: 4, font: { size: 9 }, callback: value => value.toFixed(1) + unit }, grid: {display: true, drawBorder: false, color: 'rgba(0,0,0,0.05)'} }
                        },
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                enabled: true, mode: 'index', intersect: false,
                                callbacks: {
                                    title: (tooltipItems) => tooltipItems[0]?.label || '',
                                    label: (context) => {
                                        const pointDetails = metricData.detailedInfo[context.dataIndex];
                                        if (!pointDetails) return 'Деталі відсутні';
                                        let labelLines = [];
                                        labelLines.push(`Середнє ${metricLabel}: ${pointDetails.average.toFixed(1)}${unit}`);
                                        if (typeof pointDetails.min !== 'undefined' && typeof pointDetails.max !== 'undefined' && pointDetails.count > 0) {
                                            labelLines.push(`Min/Max: ${pointDetails.min.toFixed(1)}${unit} / ${pointDetails.max.toFixed(1)}${unit}`);
                                        }
                                        labelLines.push(`К-сть пристроїв: ${pointDetails.count}`);
                                        if (pointDetails.contributingDevices && pointDetails.contributingDevices.length > 0) {
                                            labelLines.push('Пристрої в точці:');
                                            pointDetails.contributingDevices.slice(0, 5).forEach(dev => { // Обмеження до 5 для читабельності
                                                labelLines.push(`  - ${dev.deviceName}: ${dev.value.toFixed(1)}${unit}`);
                                            });
                                            if (pointDetails.contributingDevices.length > 5) labelLines.push('  ...та інші.');
            }
                                        return labelLines;
        }
                                }
                            }
                        }
                    }
                });
            } else {
                const noDataMessage = document.createElement('p');
                noDataMessage.style.textAlign = 'center'; noDataMessage.style.color = 'var(--warning-color)'; noDataMessage.style.paddingTop = '5px';  noDataMessage.style.fontSize = '0.9em';
                noDataMessage.textContent = `Немає даних ${metricLabel} для історії.`;
                sparklineContainer.appendChild(noDataMessage);
            }
        } else {
            console.warn(`[GlobalStats-SNMP] Sparkline container '${sparklineContainerId}' not found.`);
        }
    };

    // Рендеринг спарклайнів для кожної метрики
    // Група 1: Навантаження
    renderSnmpSparkline(stats.avgLaLoad1, `snmpLaLoad1Sparkline${sourcePrefix}`, 'Навантаження (1хв)');
    renderSnmpSparkline(stats.avgLaLoad5, `snmpLaLoad5Sparkline${sourcePrefix}`, 'Навантаження (5хв)');
    renderSnmpSparkline(stats.avgLaLoad15, `snmpLaLoad15Sparkline${sourcePrefix}`, 'Навантаження (15хв)');

    // Група 2: CPU
    renderSnmpSparkline(stats.avgSsCpuUser, `snmpCpuUserSparkline${sourcePrefix}`, 'CPU Користувач', '%');
    renderSnmpSparkline(stats.avgSsCpuSystem, `snmpSsCpuSystemSparkline${sourcePrefix}`, 'CPU Система', '%');
    renderSnmpSparkline(stats.avgSsCpuIdle, `snmpCpuIdleSparkline${sourcePrefix}`, 'CPU Простій', '%');

    // Група 3: RAM
    renderSnmpSparkline(stats.avgRamUsagePercent, `snmpRamUsageSparkline${sourcePrefix}`, 'RAM Використання', '%');

    // Група 4: Swap
    renderSnmpSparkline(stats.avgSwapUsagePercent, `snmpSwapUsageSparkline${sourcePrefix}`, 'Swap Використання', '%');

    // Група 5: Мережа
    renderSnmpSparkline(stats.avgIfInOctets, `snmpIfInOctetsSparkline${sourcePrefix}`, 'Вхідний трафік', 'байт');
    renderSnmpSparkline(stats.avgIfOutOctets, `snmpIfOutOctetsSparkline${sourcePrefix}`, 'Вихідний трафік', 'байт');

    // Група 6: Диск
    renderSnmpSparkline(stats.avgDiskUsagePercentRoot, `snmpDiskUsageSparkline${sourcePrefix}`, 'Диск / Використання', '%');
    // Рендеринг нових спарклайнів // Цей коментар тут вже не актуальний, видаляю
    // renderSnmpSparkline(stats.avgIfInOctets, `snmpIfInOctetsSparkline${sourcePrefix}`, 'Вхідний трафік', 'байт');
    // renderSnmpSparkline(stats.avgIfOutOctets, `snmpIfOutOctetsSparkline${sourcePrefix}`, 'Вихідний трафік', 'байт');
    // renderSnmpSparkline(stats.avgSsCpuIdle, `snmpCpuIdleSparkline${sourcePrefix}`, 'CPU Простій', '%');
    // Рендеринг ще нових спарклайнів // Цей коментар тут вже не актуальний, видаляю
    // renderSnmpSparkline(stats.avgLaLoad5, `snmpLaLoad5Sparkline${sourcePrefix}`, 'Навантаження (5хв)');
    // renderSnmpSparkline(stats.avgLaLoad15, `snmpLaLoad15Sparkline${sourcePrefix}`, 'Навантаження (15хв)');
    // renderSnmpSparkline(stats.avgSsCpuSystem, `snmpSsCpuSystemSparkline${sourcePrefix}`, 'CPU Система', '%');
    // renderSnmpSparkline(stats.avgSwapUsagePercent, `snmpSwapUsageSparkline${sourcePrefix}`, 'Swap Використання', '%');
}


// --- Головна функція для оновлення всієї статистики ---
async function updateAllGlobalStats() {
    console.log("G_STATS_UPDATE: Початок оновлення глобальної статистики Ping та SNMP.", window.allDevicesData ? window.allDevicesData.length : "(no devices yet)");
    let initialDeviceLoadAttempted = false;

    if (!window.allDevicesData || window.allDevicesData.length === 0) {
        initialDeviceLoadAttempted = true;
        console.log("G_STATS_UPDATE: window.allDevicesData is empty. Fetching all devices first.");
        try {
            await fetchAllDevices(); 
            if (!window.allDevicesData || window.allDevicesData.length === 0) {
                console.error("G_STATS_UPDATE: Failed to load allDevicesData after explicit fetch. Global stats might be incomplete.");
                // displayError("Не вдалося завантажити список пристроїв. Глобальна статистика може бути неповною.");
                return; // <--- Розкоментовано
            } else {
                 console.log("G_STATS_UPDATE: Successfully loaded allDevicesData. Count:", window.allDevicesData.length);
            }
        } catch (error) {
            console.error("G_STATS_UPDATE: Error fetching allDevicesData:", error);
            // displayError("Помилка завантаження списку пристроїв. Глобальна статистика може бути неповною.");
            return; // <--- Розкоментовано
        }
    }
    const allDevicesData = window.allDevicesData || []; // Гарантуємо, що це масив

    // Оновлення для Ping статистики
    const dbHistoryPing = await fetchAllHistoryAggregated('db'); 
    const sessionHistoryPing = await fetchAllHistoryAggregated('session');
    const combinedHistoryPing = await fetchAllHistoryAggregated('all');

    console.log("G_STATS_UPDATE: Fetched Ping histories. DB:", Object.keys(dbHistoryPing.ping_history || {}).length, 
                "Session:", Object.keys(sessionHistoryPing.ping_history || {}).length, 
                "Combined:", Object.keys(combinedHistoryPing.ping_history || {}).length, "devices.");

    // Помічник для отримання імені пристрою
    const getDeviceNameById = (deviceId, devices) => {
        const device = devices.find(d => d.id.toString() === deviceId.toString());
        return device ? device.name : `ID: ${deviceId}`;
    };

    // Модифікація pingsByTimestamp для включення деталей
    const processHistoryForDetailedPings = (history, allDevs) => {
        const pingsByTs = {};
        Object.values(history || {}).forEach(deviceHistoryArray => {
            if (Array.isArray(deviceHistoryArray)) {
                deviceHistoryArray.forEach(ping => {
                    if (ping.check_type === 'ping' && ping.status === 'online' && ping.rtt_avg_ms !== null && typeof ping.rtt_avg_ms !== 'undefined') {
                        const ts = ping.timestamp_iso;
                        if (!pingsByTs[ts]) {
                            pingsByTs[ts] = [];
                        }
                        pingsByTs[ts].push({
                            deviceId: ping.device_id,
                            rtt: parseFloat(ping.rtt_avg_ms),
                            deviceName: getDeviceNameById(ping.device_id, allDevs)
                        });
                    }
                });
            }
        });
        return pingsByTs;
    };
    
    const dbPingsByTimestamp = processHistoryForDetailedPings(dbHistoryPing.ping_history, allDevicesData);
    const sessionPingsByTimestamp = processHistoryForDetailedPings(sessionHistoryPing.ping_history, allDevicesData);
    const combinedPingsByTimestamp = processHistoryForDetailedPings(combinedHistoryPing.ping_history, allDevicesData);

    const dbStatsPing = calculatePingStats(dbPingsByTimestamp, allDevicesData, "З Бази Даних");
    const sessionStatsPing = calculatePingStats(sessionPingsByTimestamp, allDevicesData, "З Поточної Сесії");
    const combinedStatsPing = calculatePingStats(combinedPingsByTimestamp, allDevicesData, "Комбіновано (БД + Сесія)");

    renderGlobalStats(dbStatsPing, 'textStatsDb', 'rttChartDb', 'rttSparklineDb');
    renderGlobalStats(sessionStatsPing, 'textStatsSession', 'rttChartSession', 'rttSparklineSession');
    renderGlobalStats(combinedStatsPing, 'textStatsCombined', 'rttChartCombined', 'rttSparklineCombined');

    // Обробка та відображення загальної часової шкали станів пристроїв
    const allPingHistoryForTimeline = []; 
    console.log("[UpdateGStats] combinedHistoryPing for Timeline processing:", JSON.parse(JSON.stringify(combinedHistoryPing))); 

    if (combinedHistoryPing && combinedHistoryPing.ping_history) { 
        // Тепер ітеруємо по значеннях об'єкта ping_history
        Object.values(combinedHistoryPing.ping_history).forEach(devicePingHistoryArray => {
            // devicePingHistoryArray - це масив [...] записів пінгу для одного пристрою
            if (Array.isArray(devicePingHistoryArray)) {
                allPingHistoryForTimeline.push(...devicePingHistoryArray);
            } else {
                console.warn("[UpdateGStats] devicePingHistoryArray is not an array for timeline: ", devicePingHistoryArray);
            }
        });
    } else {
        console.warn("[UpdateGStats] combinedHistoryPing.ping_history is not available for timeline processing:", combinedHistoryPing);
    }

    console.log(`[UpdateGStats] Prepared allPingHistoryForTimeline with ${allPingHistoryForTimeline.length} records for GlobalDeviceStatusTimeline.`);
    if (allPingHistoryForTimeline.length > 0) {
        console.log("[UpdateGStats] First 3 records of allPingHistoryForTimeline:", allPingHistoryForTimeline.slice(0,3));
    }

    const timelineData = calculateGlobalDeviceStatusTimeline(allPingHistoryForTimeline, window.allDevicesData || []);
    renderGlobalDeviceStatusTimeline(timelineData, 'deviceStatusSparklineChart', 'deviceStatusTimelineText');

    const combinedPingStatsSection = document.getElementById('globalStatsCombined');
    if (combinedPingStatsSection) {
        // Оновлена логіка: блок стає сірим, якщо сесія не має онлайн пінгів з RTT
        const sessionHasOnlineRttPings = Object.values(sessionHistoryPing.ping_history || {})
            .some(devicePings => 
                devicePings.some(p => p.check_type === 'ping' && p.status === 'online' && typeof p.rtt_avg_ms === 'number' && !isNaN(p.rtt_avg_ms))
            );

        if (!sessionHasOnlineRttPings) {
            combinedPingStatsSection.classList.add('combined-inactive');
        } else {
            combinedPingStatsSection.classList.remove('combined-inactive');
        }
    }

    // Оновлення для SNMP статистики
    const dbHistorySnmp = await fetchAllHistoryAggregated('db'); 
    const sessionHistorySnmp = await fetchAllHistoryAggregated('session');
    const combinedHistorySnmp = await fetchAllHistoryAggregated('all');

    const dbStatsSnmp = calculateSnmpStats(dbHistorySnmp.snmp_history, allDevicesData, "(БД)");
    renderGlobalSnmpStats(dbStatsSnmp, 'Db');

    const sessionStatsSnmp = calculateSnmpStats(sessionHistorySnmp.snmp_history, allDevicesData, "(Сесія)");
    renderGlobalSnmpStats(sessionStatsSnmp, 'Session');

    const combinedStatsSnmp = calculateSnmpStats(combinedHistorySnmp.snmp_history, allDevicesData, "(Комбіновано)");
    renderGlobalSnmpStats(combinedStatsSnmp, 'Combined');

    const combinedSnmpStatsSection = document.getElementById('globalSnmpStatsCombined');
    if (combinedSnmpStatsSection) {
        // Визначаємо, чи є хоча б один запис SNMP в сесійній історії
        const hasSessionSnmpHistory = Object.values(sessionHistorySnmp.snmp_history || {}).some(deviceHistoryArray => 
            Array.isArray(deviceHistoryArray) && deviceHistoryArray.length > 0
        );

        if (!hasSessionSnmpHistory) {
            combinedSnmpStatsSection.classList.add('combined-inactive');
        } else {
            combinedSnmpStatsSection.classList.remove('combined-inactive');
        }
    }

    console.log("G_STATS_UPDATE: Оновлення глобальної статистики завершено.");
}

// Ініціалізація глобальних оновлень статистики (якщо потрібно при першому завантаженні)
// document.addEventListener('DOMContentLoaded', updateAllGlobalStats);
// Або викликається з main.js після fetchAllDevices

// Функція для тригера оновлення, яку можна викликати з інших модулів
window.triggerGlobalStatsUpdate = updateAllGlobalStats;

// Допоміжна функція для визначення джерела за ID текстового контейнера (для умови вище)
function sourceLabelFromId(textContainerId) {
    if (textContainerId.toLowerCase().includes('db')) return 'db';
    if (textContainerId.toLowerCase().includes('session')) return 'session';
    if (textContainerId.toLowerCase().includes('combined')) return 'combined';
    return 'unknown';
}

// Ініціалізація Chart.js глобальних інстансів (якщо ще не існує)
window.globalChartInstances = window.globalChartInstances || {}; 
window.globalChartInstances = window.globalChartInstances || {}; 

/**
 * Обчислює часову шкалу загального стану пристроїв (онлайн, офлайн, проблеми).
 * @param {Array<Object>} allCombinedPingHistory - Масив УСІХ записів ping історії (БД+сесія) для ВСІХ пристроїв.
 *                                                Кожен запис має device_id, timestamp_iso, status.
 * @param {Array<Object>} allDevices - Масив усіх пристроїв (для отримання загальної кількості).
 * @returns {Array<Object>} Масив точок для графіка: { timestamp_iso, onlineCount, offlineCount, problemCount, otherCount, totalDevicesAtTimestamp }
 */
function calculateGlobalDeviceStatusTimeline(allCombinedPingHistory, allDevices) {
    if (!allCombinedPingHistory || allCombinedPingHistory.length === 0 || !allDevices || allDevices.length === 0) {
        console.warn("[TimelineCalc] Вхідні дані для calculateGlobalDeviceStatusTimeline порожні або неповні. allCombinedPingHistory length:", allCombinedPingHistory?.length, "allDevices length:", allDevices?.length);
        return [];
    }

    const allDeviceIds = allDevices.map(d => d.id.toString());
    const deviceLastStatus = {}; // { deviceId: 'status' } - зберігає поточний останній статус кожного пристрою
    const deviceNames = {}; // { deviceId: 'deviceName' }
    allDevices.forEach(d => deviceNames[d.id.toString()] = d.name);

    // Припускаємо початковий стан як 'offline' для всіх пристроїв,
    // поки не отримаємо перший запис для них.
    allDeviceIds.forEach(id => deviceLastStatus[id] = 'offline');

    // Використовуємо Map для збереження порядку вставки ключів (часових позначок)
    const timelinePointsMap = new Map(); 

    // Сортуємо історію за часом, щоб обробляти записи в хронологічному порядку
    const sortedHistory = [...allCombinedPingHistory].sort((a, b) => new Date(a.timestamp_iso) - new Date(b.timestamp_iso));

    if (sortedHistory.length === 0) {
        console.warn("[TimelineCalc] sortedHistory порожній після фільтрації/сортування allCombinedPingHistory.");
        return [];
    }

    sortedHistory.forEach(record => {
        const ts = record.timestamp_iso;
        const deviceId = record.device_id.toString();
        
        // Оновлюємо статус конкретного пристрою, якщо він є у списку allDeviceIds
        if (allDeviceIds.includes(deviceId)) {
            deviceLastStatus[deviceId] = record.status;
        }

        // Перераховуємо загальну кількість для КОЖНОГО пристрою на основі їх ОСТАННЬОГО відомого стану
        const currentCounts = { onlineCount: 0, offlineCount: 0, problemCount: 0, otherCount: 0 };
        const onlineDevicesList = [];
        const offlineDevicesList = [];
        const problemDevicesList = [];
        const otherDevicesList = [];

        allDeviceIds.forEach(id => {
            const status = deviceLastStatus[id]; // Беремо останній відомий статус
            const deviceName = deviceNames[id] || `ID: ${id}`;

            if (status === 'online' || status === 'snmp_ok') {
                currentCounts.onlineCount++;
                onlineDevicesList.push(deviceName);
            } else if (status === 'offline' || status === 'timeout' || status === 'host_down' || status === 'snmp_host_down' || !status /* undefined treated as offline */) {
                currentCounts.offlineCount++;
                offlineDevicesList.push(deviceName);
            } else if (status && (status.includes('error') || status === 'snmp_no_access' || status === 'snmp_timeout' || status === 'snmp_no_response')) {
                currentCounts.problemCount++;
                problemDevicesList.push(deviceName);
            } else if (status) { // Будь-який інший непустий статус
                currentCounts.otherCount++;
                otherDevicesList.push(deviceName);
            } else { // Якщо статус все ще не визначено (не мало б бути через ініціалізацію 'offline')
                currentCounts.offlineCount++; // За замовчуванням вважаємо офлайн
                offlineDevicesList.push(deviceName);
            }
        });
        
        // Зберігаємо знімок стану всіх пристроїв для поточної часової позначки ts
        // Якщо для одного ts є кілька записів (для різних пристроїв), це оновить точку для цього ts кілька разів,
        // що є правильним, оскільки кожен запис може змінити загальну картину.
        timelinePointsMap.set(ts, {
            onlineCount: currentCounts.onlineCount,
            offlineCount: currentCounts.offlineCount,
            problemCount: currentCounts.problemCount,
            otherCount: currentCounts.otherCount,
            onlineDevices: onlineDevicesList,
            offlineDevices: offlineDevicesList,
            problemDevices: problemDevicesList,
            otherDevices: otherDevicesList,
            totalDevicesAtTimestamp: allDeviceIds.length // Загальна кількість відстежуваних пристроїв
        });
    });

    // Конвертуємо Map в масив точок
    const timelineArray = [];
    for (const [timestamp_iso, counts] of timelinePointsMap) {
        timelineArray.push({ timestamp_iso, ...counts });
    }
    // Map зберігає порядок вставки для рядкових ключів, а sortedHistory гарантує хронологічний порядок.
    // Тому додаткове сортування timelineArray зазвичай не потрібне.

    console.log(`[TimelineCalc] Завершено calculateGlobalDeviceStatusTimeline. Вхідних записів: ${allCombinedPingHistory.length}, Унікальних часових точок на графіку: ${timelineArray.length}`);
    if (timelineArray.length > 0) {
        console.log("[TimelineCalc] Перша точка:", timelineArray[0]);
        console.log("[TimelineCalc] Остання точка:", timelineArray[timelineArray.length - 1]);
    }
    return timelineArray;
}

/**
 * Відображає часову шкалу загального стану пристроїв на лінійному графіку.
 * @param {Array<Object>} timelineData - Масив даних, повернутий `calculateGlobalDeviceStatusTimeline`.
 * @param {string} canvasId - ID елемента canvas для графіка.
 * @param {string} textContainerId - ID елемента для відображення текстового статусу (напр. "Завантаження...").
 */
function renderGlobalDeviceStatusTimeline(timelineData, canvasId, textContainerId) {
    const canvas = document.getElementById(canvasId);
    const textContainer = document.getElementById(textContainerId);

    if (!canvas) {
        console.error(`[RenderTimeline] Canvas with ID '${canvasId}' not found.`);
        if (textContainer) textContainer.textContent = "Помилка: Canvas для графіка не знайдено.";
        return;
    }
    if (!textContainer) {
        console.warn(`[RenderTimeline] Text container with ID '${textContainerId}' not found.`);
    }

    if (window.globalChartInstances && window.globalChartInstances[canvasId]) {
        window.globalChartInstances[canvasId].destroy();
        delete window.globalChartInstances[canvasId];
    }

    if (!timelineData || timelineData.length === 0) {
        if (textContainer) textContainer.textContent = "Немає даних для відображення історії стану пристроїв.";
        canvas.style.display = 'none'; // Ховаємо canvas, якщо даних немає
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }

    canvas.style.display = 'block';
    if (textContainer) textContainer.textContent = ''; // Очищаємо текст "Завантаження..."

    // Збираємо всі timestamp_iso для передачі в formatSparklineLabel
    const allTimestampsIso = timelineData.map(d => d.timestamp_iso);
    const labels = timelineData.map(d => formatSparklineLabel(new Date(d.timestamp_iso), allTimestampsIso));

    const onlineData = timelineData.map(d => d.onlineCount);
    const offlineData = timelineData.map(d => d.offlineCount);
    const problemData = timelineData.map(d => d.problemCount);
    // const otherData = timelineData.map(d => d.otherCount); // Якщо потрібно буде показувати

    const ctx = canvas.getContext('2d');
    window.globalChartInstances[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Онлайн',
                    data: onlineData,
                    borderColor: 'rgba(75, 192, 192, 1)', // Зелений
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    borderWidth: 2,
                    pointRadius: 1.5,
                    pointHoverRadius: 3,
                    fill: true,
                    tension: 0.1
                },
                {
                    label: 'Офлайн',
                    data: offlineData,
                    borderColor: 'rgba(255, 99, 132, 1)', // Червоний
                    backgroundColor: 'rgba(255, 99, 132, 0.1)',
                    borderWidth: 2,
                    pointRadius: 1.5,
                    pointHoverRadius: 3,
                    fill: true,
                    tension: 0.1
                },
                {
                    label: 'Проблеми',
                    data: problemData,
                    borderColor: 'rgba(255, 206, 86, 1)', // Жовтий
                    backgroundColor: 'rgba(255, 206, 86, 0.1)',
                    borderWidth: 2,
                    pointRadius: 1.5,
                    pointHoverRadius: 3,
                    fill: true,
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    display: true,
                    ticks: { autoSkip: true, maxTicksLimit: 15, font: { size: 9 } }
                },
                y: {
                    display: true,
                    beginAtZero: true,
                    stacked: false, // false, щоб лінії не накладались одна на одну як області
                    title: { display: true, text: 'Кількість пристроїв', font: { size: 10 } },
                    ticks: {
                        stepSize: 1, // Крок 1, якщо максимальне значення невелике
                        callback: function(value) { if (Number.isInteger(value)) { return value; } } // Показувати тільки цілі числа
                    }
                }
            },
            plugins: {
                legend: { position: 'top', labels: { font: {size: 10} } },
                title: { display: false, text: 'Історія стану пристроїв (Ping)' }, // Заголовок вже є в HTML
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        title: function(tooltipItems) {
                            if (!tooltipItems.length) return '';
                            const item = tooltipItems[0];
                            // const ts = item.parsed.x; // Це індекс мітки, але мітки можуть бути форматовані
                            // Краще брати мітку напряму з tooltipItem, якщо вона там є, або з даних графіка
                            const chartLabels = item.chart.data.labels; // Отримуємо мітки з графіка
                            const originalLabel = chartLabels[item.dataIndex]; // item.dataIndex - це правильний індекс точки даних

                            // Якщо originalLabel вже дата, або ми можемо її отримати з timelineData, що передавався
                            // Поточна логіка формування labels для графіка timeline така:
                            // const labels = timelineData.map(d => formatSparklineLabel(new Date(d.timestamp_iso), allTimestampsIso));
                            // Отже, ми не можемо просто new Date(originalLabel) зробити, якщо formatSparklineLabel повертає рядок.
                            // Нам потрібен оригінальний timestamp_iso для цієї точки.
                            // timelineData передається в renderGlobalDeviceStatusTimeline, треба мати до нього доступ.
                            // Можна спробувати знайти відповідний елемент в timelineData за індексом
                            if (item.dataIndex < timelineData.length) {
                                const originalDataPoint = timelineData[item.dataIndex];
                                const date = new Date(originalDataPoint.timestamp_iso);

                                const allIsoTimestamps = timelineData.map(d => d.timestamp_iso); // Масив ISO рядків
                                const firstTs = allIsoTimestamps.length > 0 ? new Date(allIsoTimestamps[0]).getTime() : 0;
                                const lastTs = allIsoTimestamps.length > 0 ? new Date(allIsoTimestamps[allIsoTimestamps.length - 1]).getTime() : 0;
                                const spanMillis = lastTs - firstTs;
                                const oneDayMillis = 24 * 60 * 60 * 1000;

                                let titleOptions;
                                if (spanMillis <= oneDayMillis && spanMillis > 0) { // Менше або дорівнює дню - показуємо час
                                    titleOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit' };
                                } else { // Більше дня, або якщо spanMillis 0 (одна точка)
                                    titleOptions = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' };
                                }
                                return date.toLocaleString('uk-UA', titleOptions);
                            }
                            return ''; // Якщо щось пішло не так
                        },
                        label: function(context) {
                            // context.datasetIndex - індекс датасету (Онлайн, Офлайн, Проблеми)
                            // context.dataIndex - індекс точки даних на осі X
                            const datasetLabel = context.dataset.label || '';
                            const value = context.parsed.y;
                            if (value === null || typeof value === 'undefined') return '';

                            let mainLabel = `${datasetLabel}: ${value}`;

                            // Додаткова інформація про пристрої для цієї точки часу
                            // timelineData - це вихідний масив об'єктів, який передавався в renderGlobalDeviceStatusTimeline
                            if (context.dataIndex < timelineData.length) {
                                const pointInTimeData = timelineData[context.dataIndex];
                                let deviceList = [];

                                if (datasetLabel === 'Онлайн' && pointInTimeData.onlineDevices.length > 0) {
                                    deviceList = pointInTimeData.onlineDevices.map(dev => `  - ${dev}`);
                                } else if (datasetLabel === 'Офлайн' && pointInTimeData.offlineDevices.length > 0) {
                                    deviceList = pointInTimeData.offlineDevices.map(dev => `  - ${dev}`);
                                } else if (datasetLabel === 'Проблеми' && pointInTimeData.problemDevices.length > 0) {
                                    deviceList = pointInTimeData.problemDevices.map(dev => `  - ${dev}`);
                                }
                                
                                if (deviceList.length > 0) {
                                    // Повертаємо масив рядків: перший - основний, решта - список пристроїв
                                    return [mainLabel].concat(deviceList);
                                }
                            }
                            return mainLabel; // Тільки основний, якщо немає списку пристроїв
                        },
                        // Можна додати afterLabel для додаткової інформації, якщо потрібно
                    },
                    bodyFont: {
                        size: 11 // Змінено з 12 на 11
                    },
                    titleFont: {
                        size: 13, // Змінено з 14 на 13
                        weight: 'bold'
                    },
                    padding: 6,
                    displayColors: false, // Не показувати кольорові квадратики
                    backgroundColor: 'rgba(0,0,0,0.8)', // Темний фон підказки
                    titleColor: '#fff', // Білий колір заголовка
                    bodyColor: '#fff', // Білий колір тексту
                    // Додано для потенційного покращення видимості, якщо потрібно
                    xAlign: 'center',
                    yAlign: 'top',
                    cornerRadius: 4,
                    caretPadding: 10,
                    caretSize: 5
                }
            }
        }
    });
}