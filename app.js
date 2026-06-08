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
  overlay.setAttribute('aria-hidden', 'true');
});

async function loadStatus() {
  try {
    const res = await fetch(DATA_SOURCE_URL + '?t=' + new Date().getTime());
    if (!res.ok) throw new Error('Network metadata response missing');
    const monitorData = await res.json();
    renderCards(monitorData);
    
    const now = new Date();
    updatedText.innerText = 'Updated: ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch (err) {
    console.error(err);
    updatedText.innerText = "Sync Connection Failed";
  }
}

function renderCards(data) {
  listContainer.innerHTML = '';
  
  data.forEach(site => {
    const isUp = site.status === 'UP';
    const uptimePercent = (typeof site.uptime === 'number') ? site.uptime.toFixed(2) : "100.00";
    const latency = site.latency ? site.latency + ' ms' : '-- ms';
    const statusClass = isUp ? 'online' : 'offline';
    const statusText = isUp ? 'Online' : 'Offline';
    
    const screenshotUrl = `https://s0.wordpress.com/mshots/v1/${encodeURIComponent(site.url)}?w=600`;
    const faviconUrl = `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(site.url)}`;

    const card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('role', 'button');
    card.onclick = () => openDetails(site, screenshotUrl, faviconUrl);

    card.innerHTML = `
      <div class="card-image-wrapper">
        <img src="${screenshotUrl}" alt="" loading="lazy">
      </div>
      <div class="card-content">
        <div class="card-header-row">
          <div class="site-info">
            <img src="${faviconUrl}" class="favicon" alt="">
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
              <span class="metric-label">Uptime</span>
            </div>
          </div>
          <div class="metric">
            <div class="metric-data">
              <span class="metric-value">${latency}</span>
              <span class="metric-label">Latency</span>
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
  const protocolType = site.url.startsWith('https') ? 'HTTPS Secured' : 'HTTP Standard';
  
  document.getElementById('detail-title').innerText = cleanUrl;
  document.getElementById('detail-screenshot-url').innerText = site.url;
  document.getElementById('detail-screenshot').src = screenshot;
  document.getElementById('detail-favicon').src = favicon;
  document.getElementById('meta-protocol').innerText = protocolType;

  if (site.description) {
    document.getElementById('detail-description').innerText = site.description;
  } else {
    document.getElementById('detail-description').innerText = `Automated telemetry tracking for ${cleanUrl}. Production assertions test global delivery latency and edge health profiles via secure routing channels every 300 seconds.`;
  }
  
  const statusBadge = document.getElementById('detail-status-badge');
  const largeDot = document.getElementById('detail-large-dot');
  const largeStatus = document.getElementById('detail-large-status');
  
  if (isUp) {
    statusBadge.innerText = "Operational";
    statusBadge.className = "status-badge online";
    largeDot.className = "status-dot dot-online";
    largeStatus.innerText = "Active Systems Functional";
    document.getElementById('detail-status-text').innerText = "Edge responses fall within target thresholds. No packet degradation discovered.";
  } else {
    statusBadge.innerText = "Service Outage";
    statusBadge.className = "status-badge offline";
    largeDot.className = "status-dot dot-offline";
    largeStatus.innerText = "Target Host Failure";
    document.getElementById('detail-status-text').innerText = "The monitoring node failed to establish a handshake connection with the primary asset routing stack.";
  }

  const uptime = (typeof site.uptime === 'number') ? site.uptime.toFixed(2) : "100.00";
  document.getElementById('detail-uptime-30d-large').innerText = `${uptime}%`;
  document.getElementById('spark-response').innerText = site.latency || "--";
  
  if (site.recentChecks && site.recentChecks.length > 0) {
    const sum = site.recentChecks.reduce((acc, check) => acc + (check.latency || 0), 0);
    const avg = Math.round(sum / site.recentChecks.length);
    document.getElementById('stat-avg-ms').innerText = avg;
  } else {
    document.getElementById('stat-avg-ms').innerText = "--";
  }
  
  const tbody = document.getElementById('recent-checks-body');
  tbody.innerHTML = '';
  if (site.recentChecks && site.recentChecks.length > 0) {
    [...site.recentChecks].reverse().forEach(check => {
      const isCheckUp = check.status === 'UP';
      const colorAssert = isCheckUp ? 'var(--accent-green)' : 'var(--accent-red)';
      tbody.innerHTML += `
        <tr>
          <td style="color:${colorAssert}; font-weight:700; letter-spacing:0.3px;">● ${isCheckUp ? 'PASS' : 'FAIL'}</td>
          <td>${new Date(check.time).toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit'})}</td>
          <td><code>${check.code || 200}</code></td>
          <td>${check.latency} ms</td>
        </tr>
      `;
    });
  }

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
    box.title = `${dateString}: ${days[dateString] ? Math.round((days[dateString].up/days[dateString].total)*100)+'%' : 'No logs'}`;
    heatmap.appendChild(box);
  }

  overlay.classList.add('active');
  overlay.setAttribute('aria-hidden', 'false');

  setTimeout(() => {
    if (site.recentChecks) {
      const latencies = site.recentChecks.map(c => c.latency);
      drawHighDPISparkline('main-response-chart', latencies);
    }
  }, 120);
}

function drawHighDPISparkline(canvasId, dataArray) {
  const canvas = document.getElementById(canvasId);
  const wrapper = canvas.parentElement;
  
  const dpr = window.devicePixelRatio || 1;
  const rect = wrapper.getBoundingClientRect();
  
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);
  
  if (!dataArray || dataArray.length === 0) return;

  const maxVal = Math.max(...dataArray, 180);
  const stepX = rect.width / (dataArray.length - 1 || 1);
  
  const gradient = ctx.createLinearGradient(0, 0, 0, rect.height);
  gradient.addColorStop(0, 'rgba(16, 185, 129, 0.15)');
  gradient.addColorStop(1, 'rgba(16, 185, 129, 0)');
  
  ctx.beginPath();
  ctx.moveTo(0, rect.height);
  dataArray.forEach((val, i) => {
    const x = i * stepX;
    const y = rect.height - ((val / maxVal) * (rect.height - 30)) - 15;
    ctx.lineTo(x, y);
  });
  ctx.lineTo(rect.width, rect.height);
  ctx.fillStyle = gradient;
  ctx.fill();
  
  ctx.beginPath();
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  
  dataArray.forEach((val, i) => {
    const x = i * stepX;
    const y = rect.height - ((val / maxVal) * (rect.height - 30)) - 15;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

loadStatus();
setInterval(loadStatus, 30000);
