const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');
const tls = require('tls');
const http = require('http');
const https = require('https');

const CONFIG = {
    sitesFile: 'sites.json',
    statusFile: './data-store/status.json',
    backupDir: './data-store/backups',
    maxRecentChecks: 100,
    maxDailyLogsRetentionDays: 120,
    concurrencyLimit: 8,
    globalTimeoutMs: 15000,
    maxResponseReadBytes: 65536,
    emaAlpha: 0.15,
    retryAttempts: 2,
    retryDelayMs: 2000,
    uaPool: [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1'
    ]
};

function ensureDirectoryExistence(filePath) {
    const dirname = path.dirname(filePath);
    if (fs.existsSync(dirname)) return true;
    ensureDirectoryExistence(dirname);
    fs.mkdirSync(dirname);
}

function safeNormalizeUrl(inputUrl) {
    if (!inputUrl || typeof inputUrl !== 'string') return null;
    let trimmed = inputUrl.trim();
    if (/^tcp:\/\//i.test(trimmed)) return trimmed;
    if (!/^https?:\/\//i.test(trimmed)) {
        trimmed = 'https://' + trimmed;
    }
    try {
        const parsed = new URL(trimmed);
        return parsed.href;
    } catch (e) {
        return null;
    }
}

function generateDeterministicId(url) {
    return crypto.createHash('sha1').update(url.toLowerCase().trim()).digest('hex');
}

function createBackup(sourcePath, destDir) {
    try {
        if (!fs.existsSync(sourcePath)) return;
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `status-backup-${timestamp}.json`;
        fs.copyFileSync(sourcePath, path.join(destDir, filename));
        
        const backups = fs.readdirSync(destDir)
            .map(file => ({ name: file, time: fs.statSync(path.join(destDir, file)).mtime.getTime() }))
            .sort((a, b) => b.time - a.time);
            
        if (backups.length > 15) {
            for (let i = 15; i < backups.length; i++) {
                fs.unlinkSync(path.join(destDir, backups[i].name));
            }
        }
    } catch (err) {
        console.error(`Backup Failure: ${err.message}`);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function parseTcpTarget(tcpUrl) {
    try {
        const clean = tcpUrl.replace(/^tcp:\/\//i, '');
        const parts = clean.split(':');
        if (parts.length !== 2) return null;
        const host = parts[0];
        const port = parseInt(parts[1], 10);
        if (isNaN(port)) return null;
        return { host, port };
    } catch (e) {
        return null;
    }
}

function executeTcpProbe(host, port, timeoutMs) {
    return new Promise((resolve) => {
        const startTime = process.hrtime.bigint();
        const socket = new net.Socket();
        let hasResolved = false;

        const timer = setTimeout(() => {
            if (hasResolved) return;
            hasResolved = true;
            socket.destroy();
            const latency = Number(process.hrtime.bigint() - startTime) / 1000000;
            resolve({
                up: false,
                code: 408,
                latency: Math.round(latency),
                message: 'TCP Connection Timeout',
                engine: 'Layer4 Port Scanner',
                timings: { dns: 0, tcp: Math.round(latency), tls: 0, ttfb: 0, transfer: 0 },
                ssl: null
            });
        }, timeoutMs);

        socket.connect(port, host, () => {
            if (hasResolved) return;
            hasResolved = true;
            clearTimeout(timer);
            socket.end();
            const latency = Number(process.hrtime.bigint() - startTime) / 1000000;
            resolve({
                up: true,
                code: 200,
                latency: Math.round(latency),
                message: 'TCP Port Open',
                engine: 'Layer4 Port Scanner',
                timings: { dns: 0, tcp: Math.round(latency), tls: 0, ttfb: 0, transfer: 0 },
                ssl: null
            });
        });

        socket.on('error', (err) => {
            if (hasResolved) return;
            hasResolved = true;
            clearTimeout(timer);
            socket.destroy();
            const latency = Number(process.hrtime.bigint() - startTime) / 1000000;
            resolve({
                up: false,
                code: err.code === 'ECONNREFUSED' ? 521 : 500,
                latency: Math.round(latency),
                message: `TCP Layer Exception: ${err.message}`,
                engine: 'Layer4 Port Scanner',
                timings: { dns: 0, tcp: Math.round(latency), tls: 0, ttfb: 0, transfer: 0 },
                ssl: null
            });
        });
    });
}

function executeHttpProfileProbe(targetUrl, timeoutMs, attempt = 1) {
    return new Promise((resolve) => {
        const parsedUrl = new URL(targetUrl);
        const isHttps = parsedUrl.protocol === 'https:';
        const httpEngine = isHttps ? https : http;
        const randomUserAgent = CONFIG.uaPool[Math.floor(Math.random() * CONFIG.uaPool.length)];
        
        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (isHttps ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            headers: {
                'User-Agent': randomUserAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Connection': 'close',
                'Cache-Control': 'no-cache'
            },
            timeout: timeoutMs,
            rejectUnauthorized: false
        };

        const metrics = {
            start: process.hrtime.bigint(),
            dnsLookup: null,
            tcpConnect: null,
            tlsHandshake: null,
            firstByte: null,
            end: null
        };

        let sslInfo = null;
        let hasResolved = false;

        const req = httpEngine.request(options, (res) => {
            metrics.firstByte = process.hrtime.bigint();
            
            const serverHeader = (res.headers['server'] || '').toLowerCase();
            const cfRay = res.headers['cf-ray'];
            const cfCache = res.headers['cf-cache-status'];
            const isCloudflare = serverHeader.includes('cloudflare') || !!cfRay || !!cfCache;
            
            let bodyBuffer = [];
            let bytesRead = 0;

            res.on('data', (chunk) => {
                bytesRead += chunk.length;
                if (bytesRead <= CONFIG.maxResponseReadBytes) {
                    bodyBuffer.push(chunk);
                } else {
                    req.destroy();
                }
            });

            res.on('end', async () => {
                if (hasResolved) return;
                hasResolved = true;
                metrics.end = process.hrtime.bigint();

                const concatenatedBody = Buffer.concat(bodyBuffer).toString('utf-8');
                const contentHash = crypto.createHash('sha256').update(concatenatedBody).digest('hex');
                
                const calculatedTimings = computeHighResTimings(metrics, isHttps);
                const overallLatency = calculatedTimings.total;

                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({
                        up: true,
                        code: res.statusCode,
                        latency: overallLatency,
                        message: 'HTTP Status Success Asset Active',
                        engine: isCloudflare ? 'Cloudflare CDN Pipeline' : 'Direct Core Stack',
                        timings: calculatedTimings,
                        ssl: sslInfo,
                        hash: contentHash
                    });
                    return;
                }

                if (isCloudflare && [403, 429, 503, 401].includes(res.statusCode)) {
                    resolve({
                        up: true,
                        code: res.statusCode,
                        latency: overallLatency,
                        message: 'Cloudflare Security Firewall Verification Proof-of-Life',
                        engine: 'Cloudflare Perimeter Protection',
                        timings: calculatedTimings,
                        ssl: sslInfo,
                        hash: contentHash
                    });
                    return;
                }

                if (res.statusCode >= 500 && res.statusCode <= 599 && attempt < CONFIG.retryAttempts) {
                    await sleep(CONFIG.retryDelayMs * attempt);
                    resolve(await executeHttpProfileProbe(targetUrl, timeoutMs, attempt + 1));
                    return;
                }

                resolve({
                    up: false,
                    code: res.statusCode,
                    latency: overallLatency,
                    message: `Target Server Assert Error Response`,
                    engine: isCloudflare ? 'Cloudflare Origin Defect' : 'Direct Core Stack',
                    timings: calculatedTimings,
                    ssl: sslInfo,
                    hash: contentHash
                });
            });
        });

        req.on('socket', (socket) => {
            socket.on('lookup', () => {
                metrics.dnsLookup = process.hrtime.bigint();
            });
            socket.on('connect', () => {
                metrics.tcpConnect = process.hrtime.bigint();
            });
            if (isHttps) {
                socket.on('secureConnect', () => {
                    metrics.tlsHandshake = process.hrtime.bigint();
                    try {
                        const rawCert = socket.getPeerCertificate(true);
                        if (rawCert && Object.keys(rawCert).length > 0) {
                            const validTo = new Date(rawCert.valid_to);
                            const remainingMs = validTo.getTime() - Date.now();
                            sslInfo = {
                                valid: !socket.authorized ? false : (remainingMs > 0),
                                reason: socket.authorizationError || (remainingMs <= 0 ? 'CERT_HAS_EXPIRED' : 'OK'),
                                daysRemaining: Math.max(0, Math.floor(remainingMs / (1000 * 60 * 60 * 24))),
                                expiryDate: validTo.toISOString(),
                                issuer: rawCert.issuer?.O || rawCert.issuer?.CN || 'Unknown Authority',
                                subject: rawCert.subject?.CN || 'Unknown Subject',
                                protocol: socket.getProtocol(),
                                cipher: socket.getCipher()?.name
                            };
                        }
                    } catch (certErr) {
                        sslInfo = { valid: false, reason: `Parsing Cryptographic Structural Defect: ${certErr.message}` };
                    }
                });
            }
        });

        req.on('error', async (err) => {
            if (hasResolved) return;
            hasResolved = true;
            metrics.end = process.hrtime.bigint();

            const calculatedTimings = computeHighResTimings(metrics, isHttps);
            const overallLatency = calculatedTimings.total;
            const msg = err.message || '';

            if ((msg.includes('ECONNRESET') || msg.includes('ETIMEDOUT')) && attempt < CONFIG.retryAttempts) {
                await sleep(CONFIG.retryDelayMs * attempt);
                resolve(await executeHttpProfileProbe(targetUrl, timeoutMs, attempt + 1));
                return;
            }

            let computedCode = 500;
            if (msg.includes('ENOTFOUND') || msg.includes('EAI_AGAIN')) computedCode = 404;
            else if (msg.includes('ECONNREFUSED')) computedCode = 521;
            else if (msg.includes('ECONNRESET')) computedCode = 520;
            else if (msg.includes('EPROTO') || msg.includes('TLS') || msg.includes('ssl')) computedCode = 525;
            else if (err.name === 'TimeoutError' || msg.includes('timeout')) computedCode = 408;

            resolve({
                up: false,
                code: computedCode,
                latency: overallLatency,
                message: `Network Transport Connectivity Exception: ${msg}`,
                engine: 'System Core Protocol Layer',
                timings: calculatedTimings,
                ssl: sslInfo,
                hash: null
            });
        });

        req.on('timeout', () => {
            req.destroy(new Error('Gateway Transaction Process Timeout Exception'));
        });

        req.end();
    });
}

function computeHighResTimings(m, isHttps) {
    const convert = (start, end) => {
        if (!start || !end) return 0;
        return Math.round(Number(end - start) / 1000000);
    };

    const total = convert(m.start, m.end || process.hrtime.bigint());
    const dnsTime = m.dnsLookup ? convert(m.start, m.dnsLookup) : 0;
    const tcpTime = m.tcpConnect ? convert(m.dnsLookup || m.start, m.tcpConnect) : 0;
    const tlsTime = (isHttps && m.tlsHandshake) ? convert(m.tcpConnect || m.start, m.tlsHandshake) : 0;
    const fallbackBase = m.tlsHandshake || m.tcpConnect || m.dnsLookup || m.start;
    const ttfbTime = m.firstByte ? convert(fallbackBase, m.firstByte) : 0;
    const dataTransfer = m.end ? convert(m.firstByte || fallbackBase, m.end) : 0;

    return {
        dns: Math.max(0, dnsTime),
        tcp: Math.max(0, tcpTime),
        tls: Math.max(0, tlsTime),
        ttfb: Math.max(0, ttfbTime),
        transfer: Math.max(0, dataTransfer),
        total: Math.max(0, total)
    };
}

function compileHistoricalAggregations(siteData, retentionDays) {
    const cleanedDailyLogs = {};
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const ISOBoundaryString = cutoffDate.toISOString().split('T')[0];

    if (siteData.dailyLogs && typeof siteData.dailyLogs === 'object') {
        Object.keys(siteData.dailyLogs).sort().forEach(dateStr => {
            if (dateStr >= ISOBoundaryString) {
                cleanedDailyLogs[dateStr] = {
                    total: parseInt(siteData.dailyLogs[dateStr].total, 10) || 0,
                    up: parseInt(siteData.dailyLogs[dateStr].up, 10) || 0
                };
            }
        });
    }
    return cleanedDailyLogs;
}

async function runWorkerPool(tasks, concurrencyLimit, workerFunction) {
    const results = [];
    const executing = new Set();
    
    for (const task of tasks) {
        const p = Promise.resolve().then(() => workerFunction(task));
        results.push(p);
        executing.add(p);
        
        const clean = () => executing.delete(p);
        p.then(clean, clean);
        
        if (executing.size >= concurrencyLimit) {
            await Promise.race(executing);
        }
    }
    return Promise.all(results);
}

function computeEma(previousEma, currentLatency) {
    if (previousEma === undefined || previousEma === null || previousEma === 0) {
        return currentLatency;
    }
    return parseFloat(((CONFIG.emaAlpha * currentLatency) + ((1 - CONFIG.emaAlpha) * previousEma)).toFixed(2));
}

async function orchestrateTelemetrySystem() {
    ensureDirectoryExistence(CONFIG.statusFile);
    createBackup(CONFIG.statusFile, CONFIG.backupDir);
    
    let rawSites = [];
    if (fs.existsSync(CONFIG.sitesFile)) {
        try {
            const parsed = JSON.parse(fs.readFileSync(CONFIG.sitesFile, 'utf-8'));
            if (Array.isArray(parsed)) rawSites = parsed;
        } catch (e) {
            console.error(`Config File Read Intercept Exception: ${e.message}`);
        }
    }

    const configuredSites = [...new Set(rawSites.map(url => safeNormalizeUrl(url)).filter(Boolean))];
    
    let existingStateArray = [];
    if (fs.existsSync(CONFIG.statusFile)) {
        try {
            const parsed = JSON.parse(fs.readFileSync(CONFIG.statusFile, 'utf-8'));
            if (Array.isArray(parsed)) existingStateArray = parsed;
        } catch (e) {
            createBackup(CONFIG.statusFile, CONFIG.backupDir);
        }
    }

    if (configuredSites.length === 0) return;

    const todayDateStr = new Date().toISOString().split('T')[0];
    const systemTimestampStr = new Date().toISOString();
    const finalizedStateOutput = [];

    const telemetryTasks = configuredSites.map(url => ({
        url,
        siteId: generateDeterministicId(url),
        historicalContext: existingStateArray.find(s => s.url === url || s.id === generateDeterministicId(url))
    }));

    const telemetryExecutionResults = await runWorkerPool(
        telemetryTasks, 
        CONFIG.concurrencyLimit, 
        async (task) => {
            let probeResponse;
            if (/^tcp:\/\//i.test(task.url)) {
                const connectionDetails = parseTcpTarget(task.url);
                if (!connectionDetails) {
                    probeResponse = {
                        up: false, code: 400, latency: 0,
                        message: 'Malformed Target Network Configuration URI Engine Definition Failure',
                        engine: 'Layer4 Structure Engine', timings: { dns: 0, tcp: 0, tls: 0, ttfb: 0, transfer: 0 }, ssl: null
                    };
                } else {
                    probeResponse = await executeTcpProbe(connectionDetails.host, connectionDetails.port, CONFIG.globalTimeoutMs);
                }
            } else {
                probeResponse = await executeHttpProfileProbe(task.url, CONFIG.globalTimeoutMs);
            }
            return { task, result: probeResponse };
        }
    );

    for (const executionPayload of telemetryExecutionResults) {
        const { task, result } = executionPayload;
        let activeRecord = task.historicalContext;

        if (!activeRecord) {
            activeRecord = {
                id: task.siteId,
                url: task.url,
                totalChecks: 0,
                failedChecks: 0,
                consecutiveFailures: 0,
                consecutiveSuccesses: 0,
                status: 'UNKNOWN',
                previousStatus: 'UNKNOWN',
                incidentState: 'OPERATIONAL',
                latency: 0,
                emaLatency: 0,
                uptime: 100.00,
                recentChecks: [],
                dailyLogs: {},
                ssl: null,
                metadata: { initializedAt: systemTimestampStr }
            };
        }

        activeRecord.id = task.siteId;
        activeRecord.totalChecks = (parseInt(activeRecord.totalChecks, 10) || 0) + 1;
        
        const previousStatusCalculated = activeRecord.status || 'UNKNOWN';
        activeRecord.previousStatus = previousStatusCalculated;

        if (result.up) {
            activeRecord.consecutiveSuccesses = (parseInt(activeRecord.consecutiveSuccesses, 10) || 0) + 1;
            activeRecord.consecutiveFailures = 0;
            activeRecord.status = 'UP';
        } else {
            activeRecord.failedChecks = (parseInt(activeRecord.failedChecks, 10) || 0) + 1;
            activeRecord.consecutiveFailures = (parseInt(activeRecord.consecutiveFailures, 10) || 0) + 1;
            activeRecord.consecutiveSuccesses = 0;
            activeRecord.status = 'DOWN';
        }

        if (activeRecord.consecutiveFailures >= 3) {
            activeRecord.incidentState = 'CRITICAL';
        } else if (activeRecord.consecutiveFailures > 0) {
            activeRecord.incidentState = 'DEGRADED';
        } else {
            activeRecord.incidentState = 'OPERATIONAL';
        }

        activeRecord.latency = result.latency;
        activeRecord.emaLatency = computeEma(activeRecord.emaLatency, result.latency);
        activeRecord.uptime = parseFloat((((activeRecord.totalChecks - activeRecord.failedChecks) / activeRecord.totalChecks) * 100).toFixed(4));
        activeRecord.ssl = result.ssl;

        if (!activeRecord.metadata) activeRecord.metadata = {};
        activeRecord.metadata.lastCheckTimestamp = systemTimestampStr;
        activeRecord.metadata.lastEngineSignature = result.engine;
        activeRecord.metadata.lastMessageAssertion = result.message;
        if (result.hash) activeRecord.metadata.payloadSignatureSHA256 = result.hash;

        if (!activeRecord.dailyLogs) activeRecord.dailyLogs = {};
        if (!activeRecord.dailyLogs[todayDateStr]) {
            activeRecord.dailyLogs[todayDateStr] = { total: 0, up: 0 };
        }
        activeRecord.dailyLogs[todayDateStr].total = (parseInt(activeRecord.dailyLogs[todayDateStr].total, 10) || 0) + 1;
        if (result.up) {
            activeRecord.dailyLogs[todayDateStr].up = (parseInt(activeRecord.dailyLogs[todayDateStr].up, 10) || 0) + 1;
        }

        activeRecord.dailyLogs = compileHistoricalAggregations(activeRecord, CONFIG.maxDailyLogsRetentionDays);

        if (!Array.isArray(activeRecord.recentChecks)) activeRecord.recentChecks = [];
        activeRecord.recentChecks.push({
            time: systemTimestampStr,
            status: activeRecord.status,
            code: result.code,
            latency: result.latency,
            msg: result.message,
            timings: result.timings
        });

        if (activeRecord.recentChecks.length > CONFIG.maxRecentChecks) {
            activeRecord.recentChecks = activeRecord.recentChecks.slice(-CONFIG.maxRecentChecks);
        }

        finalizedStateOutput.push(activeRecord);
    }

    try {
        fs.writeFileSync(CONFIG.statusFile, JSON.stringify(finalizedStateOutput, null, 2), 'utf-8');
    } catch (writeError) {
        console.error(`I/O Engine Crash State Pipeline Persistence Exception: ${writeError.message}`);
    }
}

orchestrateTelemetrySystem().catch((globalError) => {
    console.error(`Unhandled Execution Pipeline Loop Exception: ${globalError.message}`);
    process.exit(1);
});
