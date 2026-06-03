const fs = require("fs");

// Load targets safely
let sites = [];
try {
  sites = JSON.parse(fs.readFileSync("sites.json", "utf-8"));
} catch (err) {
  console.error("Critical Error: Could not read or parse sites.json");
  process.exit(1);
}

async function checkSite(url) {
  const start = Date.now();
  
  // Basic validation to prevent runtime syntax crashes
  if (!url || typeof url !== "string" || !url.startsWith("http")) {
    return { url: String(url), status: "offline", statusCode: null, latency: null };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8-second network timeout

    const res = await fetch(url, {
      method: "HEAD", // Fast & lightweight for multiple sites
      signal: controller.signal,
      headers: { 
        'User-Agent': 'StatusBot/1.0 Uptime Checker',
        'Cache-Control': 'no-cache'
      }
    });

    clearTimeout(timeout);
    const latency = Date.now() - start;

    // A 405 Method Not Allowed means the server is UP, it just rejected the HEAD method.
    const isUp = res.ok || res.status === 405;

    return {
      url,
      status: isUp ? "online" : "error",
      statusCode: res.status,
      latency
    };

  } catch (err) {
    // If HEAD fails or gets blocked entirely, fallback to a fast GET request as a backup check
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      
      const retryStart = Date.now();
      const retryRes = await fetch(url, { method: "GET", signal: controller.signal });
      clearTimeout(timeout);

      return {
        url,
        status: retryRes.ok ? "online" : "error",
        statusCode: retryRes.status,
        latency: Date.now() - retryStart
      };
    } catch (retryErr) {
      return {
        url,
        status: "offline",
        statusCode: null,
        latency: null
      };
    }
  }
}

async function run() {
  console.log(`Starting execution path for ${sites.length} target endpoints...`);
  
  // High-performance concurrency block: running all requests in parallel safely
  const results = await Promise.all(sites.map(site => checkSite(site)));
  
  const output = {
    updatedAt: new Date().toISOString(),
    results
  };

  try {
    fs.writeFileSync("status.json", JSON.stringify(output, null, 2));
    console.log("State metrics refreshed and saved to disk.");
  } catch (writeErr) {
    console.error("Failed to write output to status.json:", writeErr);
    process.exit(1);
  }
}

run();
