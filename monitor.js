const fs = require("fs");

const sites = JSON.parse(fs.readFileSync("sites.json", "utf-8"));

async function checkSite(url) {
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal
    });

    clearTimeout(timeout);

    const latency = Date.now() - start;

    return {
      url,
      status: res.ok ? "online" : "error",
      statusCode: res.status,
      latency
    };

  } catch (err) {
    return {
      url,
      status: "offline",
      statusCode: null,
      latency: null
    };
  }
}

async function run() {
  const results = [];

  for (const site of sites) {
    const result = await checkSite(site);
    results.push(result);
  }

  const output = {
    updatedAt: new Date().toISOString(),
    results
  };

  fs.writeFileSync("status.json", JSON.stringify(output, null, 2));
}

run();
