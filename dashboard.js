/**
 * Advanced Telemetry Dashboard Engine
 * Implements high-res rendering loops, search configurations, overlay panels,
 * auto-fallback content states, and encapsulated native inline SVG charting workflows.
 */
class TelemetryDashboard {
    constructor(config = {}) {
        this.statusFileUrl = config.statusFileUrl || './data-store/status.json';
        this.state = { data: [], selectedSiteId: null };
        this.domMap = {
            cardContainer: document.getElementById('monitors-grid'),
            overlay: document.getElementById('details-overlay'),
            searchField: document.getElementById('search'),
            filterButtons: document.querySelectorAll('.filter-btn'),
            refreshButton: document.querySelector('.refresh-btn'),
            globalStatusLabel: document.getElementById('global-status-text'),
            globalStatusDot: document.getElementById('global-status-dot'),
            lastUpdatedLabel: document.getElementById('last-updated-text')
        };
    }

    async init() {
        this.bindEvents();
        await this.refreshTelemetry();
        // Periodically refresh tracking every 60 seconds
        setInterval(() => this.refreshTelemetry(), 60000);
    }

    bindEvents() {
        if (this.domMap.searchField) {
            this.domMap.searchField.addEventListener('input', () => this.renderGrid());
        }
        this.domMap.filterButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.domMap.filterButtons.forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.renderGrid();
            });
        });
        if (this.domMap.refreshButton) {
            this.domMap.refreshButton.addEventListener('click', () => this.refreshTelemetry());
        }
    }

    async refreshTelemetry() {
        if (this.domMap.refreshButton) this.domMap.refreshButton.style.opacity = '0.5';
        try {
            const response = await fetch(`${this.statusFileUrl}?cache_bypass=${Date.now()}`);
            if (!response.ok) throw new Error(`Telemetry store disconnected status: ${response.status}`);
            const payload = await response.json();
            this.state.data = Array.isArray(payload) ? payload : [];
            this.updateGlobalHeaderSummary();
            this.renderGrid();
            if (this.state.selectedSiteId) {
                this.syncOverlayDetails(this.state.selectedSiteId);
            }
        } catch (err) {
            console.error(`Telemetry Store Hydration Failure: ${err.message}`);
            this.renderErrorState();
        } finally {
            if (this.domMap.refreshButton) this.domMap.refreshButton.style.opacity = '1';
        }
    }

    updateGlobalHeaderSummary() {
        if (this.domMap.lastUpdatedLabel) {
            this.domMap.lastUpdatedLabel.textContent = new Date().toLocaleTimeString();
        }
        if (this.state.data.length === 0) return;

        const totalCount = this.state.data.length;
        const criticalCount = this.state.data.filter(s => s.status === 'DOWN').length;

        if (this.domMap.globalStatusLabel && this.domMap.globalStatusDot) {
            if (criticalCount === 0) {
                this.domMap.globalStatusLabel.textContent = "All Platforms Fully Operational";
                this.domMap.globalStatusLabel.style.color = "var(--accent-green)";
                this.domMap.globalStatusDot.className = "pulse-dot";
                this.domMap.globalStatusDot.style.backgroundColor = "var(--accent-green)";
                this.domMap.globalStatusDot.style.boxShadow = "0 0 8px var(--accent-green)";
            } else if (criticalCount < totalCount) {
                this.domMap.globalStatusLabel.textContent = `${criticalCount} Cluster Nodes Alerting`;
                this.domMap.globalStatusLabel.style.color = "#dbab09";
                this.domMap.globalStatusDot.className = "pulse-dot";
                this.domMap.globalStatusDot.style.backgroundColor = "#dbab09";
                this.domMap.globalStatusDot.style.boxShadow = "0 0 8px #dbab09";
            } else {
                this.domMap.globalStatusLabel.textContent = "Complete Cluster System Outage";
                this.domMap.globalStatusLabel.style.color = "var(--accent-red)";
                this.domMap.globalStatusDot.className = "pulse-dot";
                this.domMap.globalStatusDot.style.backgroundColor = "var(--accent-red)";
                this.domMap.globalStatusDot.style.boxShadow = "0 0 8px var(--accent-red)";
            }
        }
    }

    getActiveFilter() {
        const activeBtn = document.querySelector('.filter-btn.active');
        return activeBtn ? activeBtn.getAttribute('data-filter') || 'all' : 'all';
    }

    getFilteredData() {
        let items = [...this.state.data];
        const searchVal = this.domMap.searchField ? this.domMap.searchField.value.toLowerCase().trim() : '';
        const filter = this.getActiveFilter();

        if (searchVal) {
            items = items.filter(s => (s.url || '').toLowerCase().includes(searchVal) || (s.id || '').toLowerCase().includes(searchVal));
        }
        if (filter !== 'all') {
            items = items.filter(s => (s.status || '').toLowerCase() === filter.toLowerCase());
        }
        return items;
    }

    renderGrid() {
        if (!this.domMap.cardContainer) return;
        const targets = this.getFilteredData();

        if (targets.length === 0) {
            this.domMap.cardContainer.innerHTML = `<div class="no-results">No targets align with active verification filter states.</div>`;
            return;
        }

        this.domMap.cardContainer.innerHTML = targets.map(site => {
            const statusStr = (site.status || 'UNKNOWN').toUpperCase();
            const badgeModifier = statusStr === 'UP' ? 'online' : 'offline';
            const uptimePct = typeof site.uptime === 'number' ? site.uptime.toFixed(2) : '100.00';
            const delayValue = site.latency ? `${Math.round(site.latency)}ms` : '0ms';
            
            const hostname = this.extractDomain(site.url);
            const screenshotUrl = `./data-store/screenshots/${site.id}.png`;
            const faviconUrl = `https://www.google.com/s2/favicons?sz=64&domain=${hostname}`;

            return `
                <div class="card" onclick="dashboardApp.openSiteDetails('${site.id}')">
                    <div class="card-image-wrapper">
                        <img src="${screenshotUrl}" alt="Viewport State Capture" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                        <div class="placeholder-svg-thumb" style="display:none;">
                            <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        </div>
                    </div>
                    <div class="card-content">
                        <div class="card-header-row">
                            <div class="site-info">
                                <div class="favicon">
                                    <img src="${faviconUrl}" alt="" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'16\' height=\'16\' fill=\'%239ca3af\' viewBox=\'0 0 16 16\'><path d=\'M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm0 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1z\'/></svg>'">
                                </div>
                                <div>
                                    <div class="site-title">${hostname}</div>
                                    <div class="site-url">${site.url}</div>
                                </div>
                            </div>
                            <span class="badge ${badgeModifier}"><span class="dot"></span>${statusStr}</span>
                        </div>
                        <div class="card-metrics">
                            <div class="metric">
                                <div class="metric-data">
                                    <span class="metric-value ${site.uptime > 99 ? 'highlight-green' : ''}">${uptimePct}%</span>
                                    <span class="metric-label">Uptime Allocation</span>
                                </div>
                            </div>
                            <div class="metric">
                                <div class="metric-data">
                                    <span class="metric-value">${delayValue}</span>
                                    <span class="metric-label">Response Latency</span>
                                </div>
                            </div>
                            <div class="metric">
                                <div class="metric-data">
                                    <span class="metric-value" style="color: ${site.incidentState === 'CRITICAL' ? 'var(--accent-red)' : 'var(--text-main)'}">${site.incidentState || 'OPERATIONAL'}</span>
                                    <span class="metric-label">Condition State</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    openSiteDetails(siteId) {
        this.state.selectedSiteId = siteId;
        this.syncOverlayDetails(siteId);
        if (this.domMap.overlay) {
            this.domMap.overlay.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    closeSiteDetails() {
        this.state.selectedSiteId = null;
        if (this.domMap.overlay) {
            this.domMap.overlay.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    syncOverlayDetails(siteId) {
        const site = this.state.data.find(s => s.id === siteId);
        const container = document.getElementById('overlay-dynamic-content');
        if (!site || !container) return;

        const checkHistory = Array.isArray(site.recentChecks) ? site.recentChecks : [];
        const averageLatency = checkHistory.length > 0 ? Math.round(checkHistory.reduce((acc, check) => acc + (check.latency || 0), 0) / checkHistory.length) : 0;
        const currentUptime = typeof site.uptime === 'number' ? site.uptime.toFixed(4) : '100.0000';
        
        const hostname = this.extractDomain(site.url);
        const screenshotUrl = `./data-store/screenshots/${site.id}.png`;
        const faviconUrl = `https://www.google.com/s2/favicons?sz=64&domain=${hostname}`;
        
        const generatedVectorChart = this.buildVectorWaveform(checkHistory);

        container.innerHTML = `
            <div class="top-hero-grid">
                <div class="screenshot-container hero-card">
                    <img class="detail-img" src="${screenshotUrl}" alt="Node Frame Viewport Capture" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                    <div class="placeholder-svg-thumb" style="display:none; height:175px;">
                        <svg width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </div>
                    <div class="screenshot-url-bar">${site.url}</div>
                </div>

                <div class="site-identity hero-card">
                    <div class="identity-header">
                        <div class="detail-logo">
                            <img src="${faviconUrl}" style="width:32px; height:32px;" alt="" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'16\' height=\'16\' fill=\'%239ca3af\' viewBox=\'0 0 16 16\'><path d=\'M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm0 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1z\'/></svg>'">
                        </div>
                        <div class="identity-title">
                            <h1>${hostname}</h1>
                            <div class="site-url">${site.url}</div>
                        </div>
                    </div>
                    <div class="site-description">
                        This endpoint node undergoes telemetry health analysis routing from automated monitoring pipelines via high-performance isolated workers.
                    </div>
                    <div class="meta-grid">
                        <div class="meta-item"><span class="meta-label">SHA1 Node Hash</span><span class="meta-value">${site.id.substring(0, 10)}</span></div>
                        <div class="meta-item"><span class="meta-label">Engine Stack</span><span class="meta-value">${site.metadata?.lastEngineSignature || 'Network Core'}</span></div>
                        <div class="meta-item"><span class="meta-label">Payload Type</span><span class="meta-value">${/^tcp:\/\//i.test(site.url) ? 'Layer-4 TCP' : 'Layer-7 HTTPS'}</span></div>
                    </div>
                </div>
            </div>

            <div class="current-status-panel">
                <div class="status-large">
                    <span class="status-dot ${site.status === 'UP' ? 'dot-online' : 'dot-offline'}"></span>
                    <h2>Target Host is ${site.status === 'UP' ? 'Operational' : 'Offline'}</h2>
                </div>
                <div class="uptime-highlight-box">
                    <div class="sub-text">Calculated System Availability</div>
                    <h2 class="${site.uptime > 99 ? 'highlight-green' : ''}">${currentUptime}%</h2>
                </div>
            </div>

            <div class="metrics-row">
                <div class="metric-card"><h3>Real-Time Delay</h3><div class="metric-value">${site.latency ? Math.round(site.latency) : 0}<span class="unit">ms</span></div></div>
                <div class="metric-card"><h3>Moving Average</h3><div class="metric-value">${averageLatency}<span class="unit">ms</span></div></div>
                <div class="metric-card"><h3>Signal Smoothing (EMA)</h3><div class="metric-value">${site.emaLatency ? Math.round(site.emaLatency) : 0}<span class="unit">ms</span></div></div>
                <div class="metric-card"><h3>Verification Probes</h3><div class="metric-value">${site.totalChecks || 0}<span class="unit">cycles</span></div></div>
            </div>

            <div class="chart-card">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <h3 style="font-size:14px; text-transform:uppercase; letter-spacing:0.3px; color:var(--text-muted);">Real-Time Microsecond Waveform</h3>
                    <span class="sub-text">Past ${checkHistory.length} Inbound Dispatches</span>
                </div>
                <div class="chart-wrapper">
                    ${generatedVectorChart}
                </div>
            </div>

            <div class="bottom-grid">
                <div class="hero-card">
                    <h3 style="font-size:14px; text-transform:uppercase; letter-spacing:0.3px; color:var(--text-muted);">90-Day Structural Distribution Tracking</h3>
                    <div class="heatmap-grid">${this.compileHeatmapMatrix(site.dailyLogs || {})}</div>
                    <div class="heatmap-legend">
                        <div><span class="legend-dot up"></span>Cleared Cycle</div>
                        <div><span class="legend-dot down"></span>Degraded State</div>
                        <div><span class="legend-dot empty"></span>No Entry Frame</div>
                    </div>
                </div>

                <div class="hero-card">
                    <h3 style="font-size:14px; text-transform:uppercase; letter-spacing:0.3px; color:var(--text-muted); margin-bottom:12px;">Chronological Handshake Assertions</h3>
                    <div class="table-container">
                        <table class="data-table">
                            <thead>
                                <tr><th>Execution Window</th><th>Status Assert</th><th>Network Code</th><th>Transport Response Delay</th></tr>
                            </thead>
                            <tbody>
                                ${checkHistory.slice().reverse().map(log => `
                                    <tr>
                                        <td>${new Date(log.time).toLocaleString()}</td>
                                        <td><span style="color:${log.status === 'UP' ? 'var(--accent-green)' : 'var(--accent-red)'}; font-weight:700;">${log.status}</span></td>
                                        <td><code>${log.code || '---'}</code></td>
                                        <td>${log.latency}ms</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }

    buildVectorWaveform(historyArray) {
        if (!Array.isArray(historyArray) || historyArray.length < 2) {
            return `<div style="padding:40px; text-align:center; color:var(--text-muted); width:100%;">Telemetry tracking matrix contains insufficient context paths for chart calculation.</div>`;
        }

        const viewBoxWidth = 1000;
        const viewBoxHeight = 180;
        const paddingOffset = 15;

        const rawLatencies = historyArray.map(c => c.latency || 0);
        const absoluteMin = Math.min(...rawLatencies);
        let absoluteMax = Math.max(...rawLatencies);
        if (absoluteMax === absoluteMin) absoluteMax += 20;

        const mappingCoordinates = historyArray.map((check, idx) => {
            const xCoord = paddingOffset + (idx / (historyArray.length - 1)) * (viewBoxWidth - paddingOffset * 2);
            const yRange = (viewBoxHeight - paddingOffset) - ((check.latency - absoluteMin) / (absoluteMax - absoluteMin)) * (viewBoxHeight - paddingOffset * 2);
            return { x: xCoord, y: yRange, status: check.status, latencyValue: check.latency };
        });

        let linePathStr = `M ${mappingCoordinates[0].x} ${mappingCoordinates[0].y}`;
        for (let i = 1; i < mappingCoordinates.length; i++) {
            linePathStr += ` L ${mappingCoordinates[i].x} ${mappingCoordinates[i].y}`;
        }

        let areaFillPathStr = `${linePathStr} L ${mappingCoordinates[mappingCoordinates.length - 1].x} ${viewBoxHeight} L ${mappingCoordinates[0].x} ${viewBoxHeight} Z`;

        const vectorNodePoints = mappingCoordinates.map(p => `
            <circle cx="${p.x}" cy="${p.y}" r="4" fill="${p.status === 'UP' ? 'var(--accent-green)' : 'var(--accent-red)'}" stroke="var(--bg-card)" stroke-width="1.5">
                <title>Delay: ${p.latencyValue}ms</title>
            </circle>
        `).join('');

        return `
            <svg viewBox="0 0 ${viewBoxWidth} ${viewBoxHeight}" preserveAspectRatio="none">
                <defs>
                    <linearGradient id="svgAreaFade" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="var(--accent-green)" stop-opacity="0.15"/>
                        <stop offset="100%" stop-color="var(--accent-green)" stop-opacity="0.0"/>
                    </linearGradient>
                </defs>
                <path d="${areaFillPathStr}" fill="url(#svgAreaFade)"/>
                <path d="${linePathStr}" fill="none" stroke="var(--accent-green)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                ${vectorNodePoints}
            </svg>
        `;
    }

    compileHeatmapMatrix(dailyLogsMap) {
        const structuralMatrixBlocks = [];
        const runningDateInstance = new Date();

        for (let idx = 89; idx >= 0; idx--) {
            const lookbackTargetDate = new Date(runningDateInstance);
            lookbackTargetDate.setDate(lookbackTargetDate.getDate() - idx);
            const calendarKeyString = lookbackTargetDate.toISOString().split('T')[0];
            const logEntry = dailyLogsMap[calendarKeyString];

            if (!logEntry || logEntry.total === 0) {
                structuralMatrixBlocks.push(`<div class="heat-block empty" title="${calendarKeyString}: No metrics mapped inside this window frame."></div>`);
            } else if (logEntry.up === logEntry.total) {
                structuralMatrixBlocks.push(`<div class="heat-block up" title="${calendarKeyString}: 100% Operational (${logEntry.up}/${logEntry.total} handshakes verified)"></div>`);
            } else if (logEntry.up > 0) {
                structuralMatrixBlocks.push(`<div class="heat-block down" style="background-color: #dbab09;" title="${calendarKeyString}: Degradation logged (${logEntry.up}/${logEntry.total} dispatches passed)"></div>`);
            } else {
                structuralMatrixBlocks.push(`<div class="heat-block down" title="${calendarKeyString}: Host Down Interruption Fault logged."></div>`);
            }
        }
        return structuralMatrixBlocks.join('');
    }

    extractDomain(urlString) {
        try {
            if (!urlString) return 'unknown.host';
            let formattedStr = urlString.trim();
            if (/^tcp:\/\//i.test(formattedStr)) {
                return formattedStr.replace(/^tcp:\/\//i, '').split(':')[0];
            }
            const instanceUrl = new URL(formattedStr);
            return instanceUrl.hostname;
        } catch (e) {
            return urlString;
        }
    }

    renderErrorState() {
        if (this.domMap.cardContainer) {
            this.domMap.cardContainer.innerHTML = `
                <div class="no-results" style="border-color: var(--accent-red); color: var(--accent-red);">
                    Fatal Exception Error: The telemetry engine failed to process the performance records layer.
                </div>
            `;
        }
    }
}

// Global engine attachment instantiator
const dashboardApp = new TelemetryDashboard();
document.addEventListener('DOMContentLoaded', () => dashboardApp.init());
