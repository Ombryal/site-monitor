// SMART CONFIGURATION
const currentHost = window.location.hostname;
let GITHUB_USERNAME = "Ombryal"; // Fallback default

if (currentHost.includes(".github.io")) {
  GITHUB_USERNAME = currentHost.split('.')[0];
}

const DATA_SOURCE_URL = `https://raw.githubusercontent.com/${GITHUB_USERNAME}/uptime-data/main/status.json`;

let monitorData = [];

// DOM Elements
const listContainer = document.getElementById('list');
const updatedText = document.getElementById('updated');
const overlay = document.getElementById('details-overlay');
const closeBtn = document.getElementById('close-overlay');

// Close Overlay Event
closeBtn.addEventListener('click', () => {
  overlay.classList.remove('active');
});

// Fetch and Render Main Dashboard
async function loadStatus() {
  try {
    const res = await fetch(DATA_SOURCE_URL + '?t=' + new Date().getTime());
    if (!res.ok) throw new Error('Data not found');
    monitorData = await res.json();
    renderCards(monitorData);
    
    const now = new Date();
    updatedText.innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (err) {
    console.error(err);
    updatedText.innerText = "Error loading data";
  }
}

function renderCards(data) {
  listContainer.innerHTML = '';
  
  data.forEach(site => {
    const isUp = site.status === 'UP';
    const uptimePercent = site.uptime ? site.uptime.toFixed(2) : "100.00";
    const latency = site.latency ? site.latency + ' ms' : '-- ms';
    const statusClass = isUp ? 'online' : 'offline';
    const statusText = isUp ? 'Online' : 'Offline';
    
    // WordPress mshots API for screenshots
    const screenshotUrl = `https://s0.wordpress.com/mshots/v1/${encodeURIComponent(site.url)}?w=600`;
    // Google API for favicons
    const faviconUrl = `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(site.url)}`;

    const card = document.createElement('div');
    card.className = 'card';
    
    // Pass the site data to the overlay when clicked
    card.onclick = () => openDetails(site, screenshotUrl, faviconUrl);

    card.innerHTML = `
      <div class="card-image-wrapper">
        <img src="${screenshotUrl}" alt="Screenshot" loading="lazy">
      </div>
      <div class="card-content">
        <div class="card-header-row">
          <div class="site-info">
            <img src="${faviconUrl}" class="favicon" alt="logo">
            <div>
              <div class="site-title">${site.url.replace('https://', '').replace('http://', '')}</div>
              <div class="site-url">${site.url}</div>
            </div>
          </div>
          <div class="badge ${statusClass}"><span class="dot"></span> ${statusText}</div>
        </div>
        <div class="card-metrics">
          <div class="metric">
            <div class="metric-data">
              <span class="metric-value highlight-green">${uptimePercent}%</span>
              <span class="metric-label">Uptime (30d)</span>
            </div>
          </div>
          <div class="metric">
            <div class="metric-data">
              <span class="metric-value">${latency}</span>
              <span class="metric-label">Response Time</span>
            </div>
          </div>
        </div>
      </div>
    `;
    listContainer.appendChild(card);
  });
}

// ----------------------------------------------------
// OVERLAY LOGIC (The Advanced View)
// ----------------------------------------------------
function openDetails(site, screenshot, favicon) {
  const isUp = site.status === 'UP';
  const cleanUrl = site.url.replace('https://', '').replace('http://', '');
  
  // 1. Populate Text Data
  document.getElementById('detail-title').innerText = cleanUrl;
  document.getElementById('detail-url').innerText = site.url;
  document.getElementById('detail-screenshot-url').innerText = site.url;
  document.getElementById('detail-screenshot').src = screenshot;
  document.getElementById('detail-favicon').src = favicon;
  
  // Status Panels
  const statusBadge = document.getElementById('detail-status-badge');
  const largeDot = document.getElementById('detail-large-dot');
  const largeStatus = document.getElementById('detail-large-status');
  
  if (isUp) {
    statusBadge.innerText = "Online";
    statusBadge.style.color = "#3fb950";
    statusBadge.style.backgroundColor = "rgba(63, 185, 80, 0.15)";
    statusBadge.style.borderColor = "rgba(63, 185, 80, 0.4)";
    largeDot.style.backgroundColor = "#3fb950";
    largeStatus.innerText = "Online";
    document.getElementById('detail-status-text').innerText = "Everything is operating normally.";
  } else {
    statusBadge.innerText = "Offline";
    statusBadge.style.color = "#f85149";
    statusBadge.style.backgroundColor = "rgba(248, 81, 73, 0.15)";
    statusBadge.style.borderColor = "rgba(248, 81, 73, 0.4)";
    largeDot.style.backgroundColor = "#f85149";
    largeStatus.innerText = "Offline";
    document.getElementById('detail-status-text').innerText = "Site is currently unreachable.";
  }

  // Metrics
  const uptime = site.uptime ? site.uptime.toFixed(2) : "100.00";
  document.getElementById('detail-uptime-30d-large').innerText = `${uptime}%`;
  document.getElementById('spark-uptime-30').innerText = `${uptime}%`;
  document.getElementById('spark-response').innerText = site.latency || "--";
  document.getElementById('stat-avg-ms').innerText = site.latency ? site.latency + " ms" : "--";
  
  // Populate Recent Checks Table
  const tbody = document.getElementById('recent-checks-body');
  tbody.innerHTML = '';
  if (site.recentChecks && site.recentChecks.length > 0) {
    // Show newest first (reverse the array)
    [...site.recentChecks].reverse().forEach(check => {
      const rowClass = check.status === 'UP' ? 'highlight-green' : 'sub-text';
      const checkDot = check.status === 'UP' ? '#3fb950' : '#f85149';
      tbody.innerHTML += `
        <tr>
          <td style="color:${checkDot}; font-weight:600;">● ${check.status === 'UP' ? 'Online' : 'Offline'}</td>
          <td>${new Date(check.time).toLocaleString()}</td>
          <td>${check.code || 200}</td>
          <td>${check.latency} ms</td>
        </tr>
      `;
    });
  }

  // Populate Heatmap (90 days)
  const heatmap = document.getElementById('heatmap-container');
  heatmap.innerHTML = '';
  const days = site.dailyLogs || {};
  
  // Generate 90 blank boxes, override with real data if it exists
  const today = new Date();
  for (let i = 89; i >= 0; i--) {
    let targetDate = new Date(today);
    targetDate.setDate(today.getDate() - i);
    let dateString = targetDate.toISOString().split('T')[0];
    
    let box = document.createElement('div');
    if (days[dateString]) {
      let percent = (days[dateString].up / days[dateString].total) * 100;
      box.className = percent > 95 ? 'heat-block up' : 'heat-block down';
    } else {
      box.className = 'heat-block empty'; // No data yet
    }
    box.title = dateString;
    heatmap.appendChild(box);
  }

  // Draw simple sparkline chart
  if (site.recentChecks) {
    const latencies = site.recentChecks.map(c => c.latency);
    drawSparkline('main-response-chart', latencies);
  }

  // Slide it in!
  overlay.classList.add('active');
}

// Vanilla JS Sparkline Drawer
function drawSparkline(canvasId, dataArray) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !dataArray || dataArray.length === 0) return;
  
  const ctx = canvas.getContext('2d');
  // Match the canvas internal resolution to its CSS size
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = canvas.parentElement.clientHeight;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  const maxVal = Math.max(...dataArray, 200); // Minimum ceiling of 200ms
  const stepX = canvas.width / (dataArray.length - 1 || 1);
  
  ctx.beginPath();
  ctx.strokeStyle = '#3fb950';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  
  dataArray.forEach((val, i) => {
    const x = i * stepX;
    // Scale the height and invert it (0 is at top of canvas)
    const y = canvas.height - ((val / maxVal) * (canvas.height - 10)) - 5;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  
  ctx.stroke();
}

// Start app
loadStatus();
setInterval(loadStatus, 30000); // Auto-refresh every 30s
