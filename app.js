let monitorData = [];
let activeFilter = 'all';
let searchString = '';

async function loadStatus() {
  try {
    const res = await fetch("status.json?cache=" + Date.now());
    if (!res.ok) throw new Error("Network file read error");
    
    const data = await res.json();

    const dateObj = new Date(data.updatedAt);
    document.getElementById("updated").innerText = 
      "Last updated: " + dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    monitorData = data.results || [];
    renderDashboard();
  } catch (err) {
    document.getElementById("list").innerHTML =
      "<div class='no-results'>Failed to fetch metrics. Please check data source.</div>";
  }
}

// Utility to clean up domain names for the title (e.g. "https://github.com" -> "Github")
function getDomainName(url) {
  try {
    const hostname = new URL(url).hostname;
    const parts = hostname.replace('www.', '').split('.');
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  } catch (e) {
    return url;
  }
}

function renderDashboard() {
  const list = document.getElementById("list");
  list.innerHTML = "";

  const filteredData = monitorData.filter(item => {
    const cleanUrl = item.url.toLowerCase();
    const matchesSearch = cleanUrl.includes(searchString.toLowerCase());
    
    let matchesFilter = true;
    if (activeFilter === 'online') matchesFilter = (item.status === 'online');
    if (activeFilter === 'issues') matchesFilter = (item.status === 'offline' || item.status === 'error');

    return matchesSearch && matchesFilter;
  });

  if (filteredData.length === 0) {
    list.innerHTML = `<div class="no-results">No monitored systems match your criteria.</div>`;
    return;
  }

  filteredData.forEach(item => {
    const card = document.createElement("div");
    card.className = "card";
    
    const statusClass = item.status || "error";
    const statusLabel = statusClass.charAt(0).toUpperCase() + statusClass.slice(1);
    
    const domainTitle = getDomainName(item.url);
    const rawHostname = new URL(item.url).hostname;

    // Public APIs for visual assets
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${rawHostname}&sz=128`;
    // WordPress mshots reliably generates website thumbnails for free
    const thumbnailUrl = `https://s0.wordpress.com/mshots/v1/${encodeURIComponent(item.url)}?w=600&h=350`;

    // SVG Icons
    const arrowSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="16 6 23 6 23 13"></polyline></svg>`;
    const clockSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;
    const alertSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;

    card.innerHTML = `
      <div class="card-image-wrapper">
        <img src="${thumbnailUrl}" alt="${domainTitle} screenshot" loading="lazy" onerror="this.style.display='none'">
      </div>

      <div class="card-content">
        <div class="card-header-row">
          <div class="site-info">
            <img class="favicon" src="${faviconUrl}" alt="logo" loading="lazy">
            <div>
              <div class="site-title">${domainTitle}</div>
              <div class="site-url">${item.url}</div>
            </div>
          </div>
          <div class="badge ${statusClass}">
            <span class="dot"></span> ${statusLabel}
          </div>
        </div>

        <div class="card-metrics">
          <div class="metric">
            ${statusClass === 'online' ? arrowSvg : alertSvg}
            <div class="metric-data">
              <span class="metric-value">100.00% uptime</span>
            </div>
          </div>
          
          <div class="metric">
            ${clockSvg}
            <div class="metric-data">
              <span class="metric-value">${item.latency ? item.latency + ' ms' : 'N/A'}</span>
              <span class="metric-label">Response time</span>
            </div>
          </div>
        </div>
      </div>
    `;

    list.appendChild(card);
  });
}

// User Action Bindings
document.getElementById('search').addEventListener('input', (e) => {
  searchString = e.target.value;
  renderDashboard();
});

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    activeFilter = e.target.dataset.filter;
    renderDashboard();
  });
});

// Init
loadStatus();
setInterval(loadStatus, 30000); 
