const currentHost = window.location.hostname;
let GITHUB_USERNAME = "Ombryal";

if (currentHost.includes(".github.io")) {
  GITHUB_USERNAME = currentHost.split('.')[0];
}

const DATA_SOURCE_URL = `https://raw.githubusercontent.com/${GITHUB_USERNAME}/uptime-data/main/status.json`;

const listContainer = document.getElementById('list');
const updatedText = document.getElementById('updated');
const overlay = document.getElementById('details-overlay');
const closeBtn = document.getElementById('close-overlay');

closeBtn.addEventListener('click', () => {
  overlay.classList.remove('active');
});

async function loadStatus() {
  try {
    const res = await fetch(DATA_SOURCE_URL + '?t=' + new Date().getTime());
    if (!res.ok) throw new Error('Data not found');
    const monitorData = await res.json();
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
    // Strict number check handles 0.00% properly
    const uptimePercent = (typeof site.uptime === 'number') ? site.uptime.toFixed(2) : "100.00";
    const latency = site.latency ? site.latency + ' ms' : '-- ms';
    const statusClass = isUp ? 'online' : 'offline';
    const statusText = isUp ? 'Online' : 'Offline';
    
    const screenshotUrl = `https://s0.wordpress.com/mshots/v1/${encodeURIComponent(site.url)}?w=600`;
    const faviconUrl = `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(site.url)}`;

    const card = document.createElement('div');
    card.className = 'card';
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

function openDetails(site, screenshot, favicon) {
  const isUp = site.status === 'UP';
  const cleanUrl = site.url.replace('https://', '').replace('http://', '');
  
  document.getElementById('detail-title').innerText = cleanUrl;
  document.getElementById('detail-url').innerText = site.url;
  document.getElementById('detail-screenshot-url').innerText = site.url;
  document.getElementById('detail-screenshot').src = screenshot;
  document.getElementById('detail-favicon').src = favicon;
  
  const statusBadge = document.getElementById('detail-status-badge');
  const largeDot = document.getElementById('detail-large-dot');
  const largeStatus = document.getElementById('detail-large-status');
  
  if (isUp) {
    statusBadge.innerText = "Online";
    statusBadge.className = "status-badge online";
    largeDot.className = "status-dot dot-online";
    largeStatus.innerText = "Online";
    document.getElementById('detail-status-text').innerText = "Everything is operating normally.";
  } else {
    statusBadge.innerText = "Offline";
    statusBadge.className = "status-badge offline";
    largeDot.className = "status-dot dot-offline";
    largeStatus.innerText = "Offline";
    document.getElementById('detail-status-text').innerText = "Site is currently experiencing issues.";
  }

  const uptime = (typeof site.uptime === 'number') ? site.uptime.toFixed(2) : "100.00";
  document.getElementById('detail-uptime-30d-large').innerText = `${uptime}%`;
  document.getElementById('spark-response').innerText = site.latency || "--";
  
  // Calculate Avg Latency safely
  if (site.recentChecks && site.recentChecks.length > 0) {
    const sum = site.recentChecks.reduce((a, b) => a + (b.latency || 0), 0);
    const avg = Math.round(sum / site.recentChecks.length);
    document.getElementById('stat-avg-ms').innerText = avg + " ms";
  } else {
    document.getElementById('stat-avg-ms').innerText = "-- ms";
  }
  
  // Build Check History Table
  const tbody = document.getElementById('recent-checks-body');
  tbody.innerHTML = '';
  if (site.recentChecks && site.recentChecks.length > 0) {
    [...site.recentChecks].reverse().forEach(check => {
      const isCheckUp = check.status === 'UP';
      const indicatorColor = isCheckUp ? '#10b981' : '#ef4444';
      tbody.innerHTML += `
        <tr>
          <td style="color:${indicatorColor}; font-weight:600;">● ${isCheckUp ? 'Online' : 'Offline'}</td>
          <td>${new Date(check.time).toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'})}</td>
          <td>${check.code || '--'}</td>
          <td>${check.latency} ms</td>
        </tr>
      `;
    });
  }

  // Draw 90 Day Heatmap Grid
  const heatmap = document.getElementById('heatmap-container');
  heatmap.innerHTML = '';
  const days = site.dailyLogs || {};
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
      box.className = 'heat-block empty';
    }
    box.title = dateString;
    heatmap.appendChild(box);
  }

  // Activate Overlay first so canvas can detect dimensions properly
  overlay.classList.add('active');

  // Draw Line Chart after short delay so UI finishes expanding
  setTimeout(() => {
    if (site.recentChecks) {
      const latencies = site.recentChecks.map(c => c.latency);
      drawSparkline('main-response-chart', latencies);
    }
  }, 100);
}

function drawSparkline(canvasId, dataArray) {
  const canvas = document.getElementById(canvasId);
  const wrapper = canvas.parentElement;
  
  // Set real pixel dimensions to avoid blurring
  canvas.width = wrapper.clientWidth;
  canvas.height = wrapper.clientHeight;
  
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  if (!dataArray || dataArray.length === 0) return;

  const maxVal = Math.max(...dataArray, 200);
  const stepX = canvas.width / (dataArray.length - 1 || 1);
  
  ctx.beginPath();
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  
  // Create gradient fill under line
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, 'rgba(16, 185, 129, 0.2)');
  gradient.addColorStop(1, 'rgba(16, 185, 129, 0)');
  
  ctx.moveTo(0, canvas.height);
  
  dataArray.forEach((val, i) => {
    const x = i * stepX;
    const y = canvas.height - ((val / maxVal) * (canvas.height - 20)) - 10;
    ctx.lineTo(x, y);
  });
  
  // Fill gradient
  ctx.lineTo(canvas.width, canvas.height);
  ctx.fillStyle = gradient;
  ctx.fill();
  
  // Stroke line
  ctx.beginPath();
  dataArray.forEach((val, i) => {
    const x = i * stepX;
    const y = canvas.height - ((val / maxVal) * (canvas.height - 20)) - 10;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

loadStatus();
setInterval(loadStatus, 30000);
