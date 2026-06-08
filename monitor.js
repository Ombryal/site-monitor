const fs = require('fs');

// Load configurations
const SITES_FILE = 'sites.json';
const STATUS_FILE = './data-store/status.json'; 

let sites = [];
let statuses = [];

if (fs.existsSync(SITES_FILE)) {
    sites = JSON.parse(fs.readFileSync(SITES_FILE, 'utf-8'));
}

// Defensive loading
if (fs.existsSync(STATUS_FILE)) {
    try {
        const parsedData = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf-8'));
        if (Array.isArray(parsedData)) {
            statuses = parsedData;
        } else {
            statuses = [];
        }
    } catch (err) {
        statuses = [];
    }
}

// Upgraded Engine: Native Fetch with Browser Headers
async function pingSite(url) {
    const startTime = Date.now();
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                // Mimics a real Windows/Chrome browser to bypass Cloudflare/WAFs
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            // Automatically cancels if it takes longer than 8 seconds
            signal: AbortSignal.timeout(8000)
        });

        const latency = Date.now() - startTime;
        
        return { 
            // response.ok automatically handles 200-299 ranges and successful redirects
            up: response.ok, 
            code: response.status, 
            latency: latency 
        };
    } catch (error) {
        // Distinguish between a timeout and a complete server crash
        const isTimeout = error.name === 'TimeoutError' || error.name === 'AbortError';
        return { 
            up: false, 
            code: isTimeout ? 408 : 500, 
            latency: isTimeout ? 8000 : 0 
        };
    }
}

// Main execution block
async function runChecks() {
    const today = new Date().toISOString().split('T')[0];
    const timestamp = new Date().toISOString();
    
    for (const url of sites) {
        console.log(`Checking ${url}...`);
        const result = await pingSite(url);
        
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

        // 3. Update Recent Checks Array
        siteData.recentChecks.push({
            time: timestamp,
            status: siteData.status,
            code: result.code,
            latency: result.latency
        });
        
        if (siteData.recentChecks.length > 20) {
            siteData.recentChecks.shift();
        }
    }

    fs.writeFileSync(STATUS_FILE, JSON.stringify(statuses, null, 2));
    console.log('Metrics successfully updated.');
}

runChecks();
