const fs = require("fs");
const path = require("path");

const DATA_STORE_PATH = path.join(__dirname, "data-store", "status.json");

// Load targets safely
let sites = [];
try {
  sites = JSON.parse(fs.readFileSync("sites.json", "utf-8"));
} catch (err) {
  console.error("Critical Error: Could not read sites.json");
  process.exit(1);
}

// Load historical data if it exists in the cloned data repo
let historicalMetrics = {};
if (fs.existsSync(DATA_STORE_PATH)) {
  try {
    const rawData = fs.readFileSync(DATA_STORE_PATH, "utf-8");
    const parsedData = JSON.parse(rawData);
    if (parsedData.results && Array.isArray(parsedData.results)) {
      parsedData.results.forEach(site => {
        historicalMetrics[site.url] = {
          totalChecks: site.totalChecks || 0,
          totalFailures: site.totalFailures || 0
        };
      });
    }
  } catch (err) {
    console.log("No valid historical metrics found. Starting a fresh tracking history.");
  }
}

async function checkSite(url) {
  const start = Date.now();
  if (!url || typeof url !== "string" || !url.startsWith("http")) {
    return { url: String(url), status: "offline", statusCode: null, latency: null };
  }

  let isUp = false;
  let statusCode = null;
  let latency = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      headers: { 'User-Agent': 'StatusBot/1.0 Uptime Checker', 'Cache-Control': 'no-cache' }
    });

    clearTimeout(timeout);
    latency = Date.now() - start;
    statusCode = res.status;
    isUp = res.ok || res.status === 405;

  } catch (err) {
    // Backup GET retry if HEAD is blocked entirely
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const retryStart = Date.now();
      const retryRes = await fetch(url, { method: "GET", signal: controller.signal });
      clearTimeout(timeout);
      
      latency = Date.now() - retryStart;
      statusCode = retryRes.status;
      isUp = retryRes.ok;
    } catch (retryErr) {
      isUp = false;
    }
  }

  // Calculate persistent historical metrics math
  const previous = historicalMetrics[url] || { totalChecks: 0, totalFailures: 0 };
  const currentTotalChecks = previous.totalChecks + 1;
  const currentTotalFailures = previous.totalFailures + (isUp ? 0 : 1);
  const calculatedUptime = ((currentTotalChecks - currentTotalFailures) / currentTotalChecks) * 100;

  return {
    url,
    status: isUp ? "online" : "offline",
    statusCode,
    latency,
    totalChecks: currentTotalChecks,
    totalFailures: currentTotalFailures,
    uptimePercentage: calculatedUptime.toFixed(2)
  };
}

async function run() {
  console.log(`Analyzing ${sites.length} systems targets...`);
  const results = await Promise.all(sites.map(site => checkSite(site)));
  
  const output = {
    updatedAt: new Date().toISOString(),
    results
  };

  try {
    fs.writeFileSync(DATA_STORE_PATH, JSON.stringify(output, null, 2));
    console.log("Historical state saved to data storage layer successfully.");
  } catch (writeErr) {
    console.error("Critical Write Error:", writeErr);
    process.exit(1);
  }
}

run();
