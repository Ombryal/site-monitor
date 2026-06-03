const fs = require('fs');
const https = require('https');
const http = require('http');

// Load configurations
const SITES_FILE = 'sites.json';
const STATUS_FILE = './data-store/status.json'; 

let sites = [];
let statuses = [];

if (fs.existsSync(SITES_FILE)) {
    sites = JSON.parse(fs.readFileSync(SITES_FILE, 'utf-8'));
}

if (fs.existsSync(STATUS_FILE)) {
    statuses = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf-8'));
}

// Helper: Measure latency and fetch status code
function pingSite(url) {
    return new Promise((resolve) => {
        const protocol = url.startsWith('https') ? https : http;
        const startTime = Date.now();

        const req = protocol.get(url, { timeout: 8000 }, (res) => {
            const latency = Date.now() - startTime;
            resolve({ up: res.statusCode >= 200 && res.statusCode < 400, code: res.statusCode, latency });
        });

        req.on('error', () => {
            resolve({ up: false, code: 500, latency: 0 });
        });
        
        req.on('timeout', () => {
            req.destroy();
            resolve({ up: false, code: 408, latency: 8000 });
        });
    });
}

// Main execution block
async function runChecks() {
    const today = new Date().toISOString().split('T')[0];
    const timestamp = new Date().toISOString();
    
    for (const url of sites) {
        console.log(`Checking ${url}...`);
        const result = await pingSite(url);
        
        // Find existing data for this site, or create a blank slate
        let siteData = statuses.find(s => s.url === url);
        if (!siteData) {
            siteData = { 
                url: url, 
                totalChecks: 0, 
                failedChecks: 0,
                recentChecks: [],
                dailyLogs: {}
            };
            statuses.push(siteData);
        }

        // 1. Update Lifetime Stats
        siteData.totalChecks++;
        if (!result.up) siteData.failedChecks++;
        
        siteData.status = result.up ? 'UP' : 'DOWN';
        siteData.latency = result.latency;
        siteData.uptime = ((siteData.totalChecks - siteData.failedChecks) / siteData.totalChecks) * 100;

        // 2. Update Daily Heatmap Log
        if (!siteData.dailyLogs[today]) {
            siteData.dailyLogs[today] = { total: 0, up: 0 };
        }
        siteData.dailyLogs[today].total++;
        if (result.up) siteData.dailyLogs[today].up++;

        // 3. Update Recent Checks Array (Keep last 20 for charts/tables)
        siteData.recentChecks.push({
            time: timestamp,
            status: siteData.status,
            code: result.code,
            latency: result.latency
        });
        
        // Trim array to prevent massive file bloat
        if (siteData.recentChecks.length > 20) {
            siteData.recentChecks.shift();
        }
    }

    // Save enriched data back to the locker
    fs.writeFileSync(STATUS_FILE, JSON.stringify(statuses, null, 2));
    console.log('Metrics successfully updated.');
}

runChecks();
