import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  Trash2,
  Plus,
  Search,
  Settings,
  BarChart2,
  Download,
  Upload,
  Clock,
  Lock,
  Eye,
  RefreshCw,
  Sliders,
  AlertTriangle,
} from 'lucide-react';
import {
  getLogsInRange,
  getSettings,
  updateSettings,
  exportData,
  importData,
  clearAllLogs,
} from './db.js';
import './options.css';

const CHART_COLORS = ['#a78bfa', '#818cf8', '#60a5fa', '#34d399', '#fbbf24', '#f472b6', '#2dd4bf'];

function Options() {
  const [activeTab, setActiveTab] = useState('analytics');
  const [dateRange, setDateRange] = useState('7days'); // 'today', 'yesterday', '7days', '30days'
  const [logs, setLogs] = useState([]);
  const [settings, setSettings] = useState({
    blacklist: [],
    limits: {},
    isPaused: false,
    fullUrlTrackingDomains: [],
  });

  // Settings Forms State
  const [newBlacklistDomain, setNewBlacklistDomain] = useState('');
  const [newLimitDomain, setNewLimitDomain] = useState('');
  const [newLimitMinutes, setNewLimitMinutes] = useState('');
  const [newFullUrlDomain, setNewFullUrlDomain] = useState('');
  const [settingsSearch, setSettingsSearch] = useState('');

  // Status/Alerts State
  const [importStatus, setImportStatus] = useState({ type: '', message: '' });

  // Load configuration and data
  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    loadLogs();
  }, [dateRange, settings]);

  async function loadSettings() {
    const s = await getSettings();
    setSettings(s);
  }

  function getLocalDateString(offsetDays = 0) {
    const d = new Date();
    if (offsetDays !== 0) {
      d.setDate(d.getDate() - offsetDays);
    }
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  async function loadLogs() {
    const today = getLocalDateString();
    let startDate = today;
    let endDate = today;

    if (dateRange === 'yesterday') {
      startDate = getLocalDateString(1);
      endDate = getLocalDateString(1);
    } else if (dateRange === '7days') {
      startDate = getLocalDateString(6);
    } else if (dateRange === '30days') {
      startDate = getLocalDateString(29);
    }

    try {
      const fetchedLogs = await getLogsInRange(startDate, endDate);
      setLogs(fetchedLogs);
    } catch (e) {
      console.error('Failed to load logs', e);
    }
  }

  // --- Aggregate Analytics Calculations ---

  // Get total active seconds
  const totalSeconds = logs
    .filter((log) => !log.isFullUrl) // Use only root domains to avoid double counting
    .reduce((sum, log) => sum + log.seconds, 0);

  // Group by site and sort by seconds spent
  const siteBreakdown = React.useMemo(() => {
    const breakdown = {};
    logs.forEach((log) => {
      // Background script writes both full URL logs and root domain logs.
      // We filter based on whether the user has full URL tracking active.
      // If full URL tracking is active for the domain, we want to show the full URL details,
      // otherwise we just show the root domain.
      const isDomainFullUrlTracked = settings.fullUrlTrackingDomains.includes(log.domain);
      
      if (isDomainFullUrlTracked) {
        // Show detailed full URLs (exclude root domain summaries to avoid double counting)
        if (log.isFullUrl) {
          breakdown[log.target] = (breakdown[log.target] || 0) + log.seconds;
        }
      } else {
        // Show root domains only
        if (!log.isFullUrl) {
          breakdown[log.target] = (breakdown[log.target] || 0) + log.seconds;
        }
      }
    });

    return Object.entries(breakdown)
      .map(([target, seconds]) => {
        const isUrl = target.includes('/');
        const rootDomain = isUrl ? target.split('/')[0] : target;
        return {
          target,
          domain: rootDomain,
          seconds,
          isUrl,
        };
      })
      .sort((a, b) => b.seconds - a.seconds);
  }, [logs, settings.fullUrlTrackingDomains]);

  // Aggregate time spent per day for the daily trend chart
  const dailyTrendData = React.useMemo(() => {
    const daysMap = {};
    let rangeDays = 1;

    if (dateRange === '7days') rangeDays = 7;
    else if (dateRange === '30days') rangeDays = 30;

    // Pre-populate range days with 0 to fill any gaps
    for (let i = rangeDays - 1; i >= 0; i--) {
      const dateStr = getLocalDateString(i);
      const label = new Date(dateStr).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });
      daysMap[dateStr] = { date: dateStr, label, minutes: 0 };
    }

    logs.forEach((log) => {
      if (!log.isFullUrl && daysMap[log.date]) {
        daysMap[log.date].minutes += log.seconds / 60;
      }
    });

    return Object.values(daysMap).map((day) => ({
      ...day,
      minutes: Math.round(day.minutes),
    }));
  }, [logs, dateRange]);

  // Distribution chart data (Top 5 + "Other")
  const distributionData = React.useMemo(() => {
    if (siteBreakdown.length === 0) return [];
    const topSites = siteBreakdown.slice(0, 5);
    const otherTime = siteBreakdown.slice(5).reduce((sum, item) => sum + item.seconds, 0);

    const chartData = topSites.map((site) => ({
      name: site.target,
      value: Math.round(site.seconds / 60),
    }));

    if (otherTime > 0) {
      chartData.push({
        name: 'Other Sites',
        value: Math.round(otherTime / 60),
      });
    }

    return chartData;
  }, [siteBreakdown]);

  // --- Setting Handlers ---

  async function handleAddBlacklist() {
    if (!newBlacklistDomain.trim()) return;
    const domain = newBlacklistDomain.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '');
    if (settings.blacklist.includes(domain)) return;

    const updated = await updateSettings({
      blacklist: [...settings.blacklist, domain],
    });
    setSettings(updated);
    setNewBlacklistDomain('');
  }

  async function handleRemoveBlacklist(domain) {
    const updated = await updateSettings({
      blacklist: settings.blacklist.filter((item) => item !== domain),
    });
    setSettings(updated);
  }

  async function handleAddLimit() {
    if (!newLimitDomain.trim() || !newLimitMinutes) return;
    const domain = newLimitDomain.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '');
    const minutes = parseInt(newLimitMinutes, 10);
    if (isNaN(minutes) || minutes <= 0) return;

    const updatedLimits = { ...settings.limits, [domain]: minutes };
    const updated = await updateSettings({ limits: updatedLimits });
    setSettings(updated);
    setNewLimitDomain('');
    setNewLimitMinutes('');
  }

  async function handleRemoveLimit(domain) {
    const updatedLimits = { ...settings.limits };
    delete updatedLimits[domain];
    const updated = await updateSettings({ limits: updatedLimits });
    setSettings(updated);
  }

  async function handleAddFullUrl() {
    if (!newFullUrlDomain.trim()) return;
    const domain = newFullUrlDomain.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '');
    if (settings.fullUrlTrackingDomains.includes(domain)) return;

    const updated = await updateSettings({
      fullUrlTrackingDomains: [...settings.fullUrlTrackingDomains, domain],
    });
    setSettings(updated);
    setNewFullUrlDomain('');
  }

  async function handleRemoveFullUrl(domain) {
    const updated = await updateSettings({
      fullUrlTrackingDomains: settings.fullUrlTrackingDomains.filter((item) => item !== domain),
    });
    setSettings(updated);
  }

  // --- Import / Export Handlers ---

  async function handleExport() {
    try {
      const data = await exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `staigh-backup-${getLocalDateString()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export failed', e);
    }
  }

  async function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target.result);
        await importData(data);
        await loadSettings();
        await loadLogs();
        setImportStatus({ type: 'success', message: 'Data imported successfully!' });
      } catch (err) {
        setImportStatus({ type: 'error', message: 'Import failed: Invalid file format.' });
      }
    };
    reader.readAsText(file);
  }

  async function handleClearData() {
    if (window.confirm('WARNING: This will permanently delete all tracking history. Are you sure?')) {
      await clearAllLogs();
      await loadLogs();
      alert('Tracking history cleared.');
    }
  }

  // --- UI Format Helpers ---

  function formatDuration(totalSecs) {
    const hours = Math.floor(totalSecs / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const seconds = Math.floor(totalSecs % 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  }

  function getFaviconUrl(domain) {
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  }

  return (
    <div className="dashboard-container">

      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="logo-brand">
          <span className="logo-title">staigh</span>
          <span className="logo-accent-dot"></span>
        </div>

        <nav className="nav-menu">
          <button
            className={`nav-item ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            <BarChart2 size={18} />
            <span>Analytics</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'blacklist' ? 'active' : ''}`}
            onClick={() => setActiveTab('blacklist')}
          >
            <Lock size={18} />
            <span>Blocklist</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'limits' ? 'active' : ''}`}
            onClick={() => setActiveTab('limits')}
          >
            <Clock size={18} />
            <span>Daily Limits</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'tracking' ? 'active' : ''}`}
            onClick={() => setActiveTab('tracking')}
          >
            <Eye size={18} />
            <span>Tracking Granularity</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'backup' ? 'active' : ''}`}
            onClick={() => setActiveTab('backup')}
          >
            <Settings size={18} />
            <span>Data & Backup</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="status-label">
            <span className={`status-dot ${settings.isPaused ? 'paused' : 'active'}`}></span>
            <span>{settings.isPaused ? 'System Paused' : 'System Tracking'}</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {/* Analytics Tab */}
        {activeTab === 'analytics' && (
          <div className="tab-pane">
            <header className="tab-header">
              <div>
                <h1>Analytics Dashboard</h1>
                <p className="subtitle">Visual representation of your browsing habits</p>
              </div>
              <div className="range-selector">
                <button
                  className={dateRange === 'today' ? 'active' : ''}
                  onClick={() => setDateRange('today')}
                >
                  Today
                </button>
                <button
                  className={dateRange === 'yesterday' ? 'active' : ''}
                  onClick={() => setDateRange('yesterday')}
                >
                  Yesterday
                </button>
                <button
                  className={dateRange === '7days' ? 'active' : ''}
                  onClick={() => setDateRange('7days')}
                >
                  7 Days
                </button>
                <button
                  className={dateRange === '30days' ? 'active' : ''}
                  onClick={() => setDateRange('30days')}
                >
                  30 Days
                </button>
              </div>
            </header>

            {/* Overview Stats Cards */}
            <div className="stats-row">
              <div className="stat-card">
                <h3>Total Tracked Time</h3>
                <h2>{formatDuration(totalSeconds)}</h2>
                <div className="card-decoration purple"></div>
              </div>
              <div className="stat-card">
                <h3>Unique Sites Visited</h3>
                <h2>{siteBreakdown.length}</h2>
                <div className="card-decoration indigo"></div>
              </div>
              <div className="stat-card">
                <h3>Most Visited Site</h3>
                <h2>{siteBreakdown[0]?.domain || 'None'}</h2>
                <p className="card-sub">{siteBreakdown[0] ? formatDuration(siteBreakdown[0].seconds) : ''}</p>
                <div className="card-decoration green"></div>
              </div>
            </div>

            {/* Charts Row */}
            <div className="charts-grid">
              <div className="chart-card large">
                <h3>Activity Trend (Minutes)</h3>
                <div className="chart-container">
                  {dailyTrendData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={dailyTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <XAxis dataKey="label" stroke="#9aa0b9" fontSize={11} tickLine={false} />
                        <YAxis stroke="#9aa0b9" fontSize={11} tickLine={false} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#18181b',
                            borderColor: '#27272a',
                            borderRadius: '6px',
                            color: '#fafafa',
                          }}
                          labelStyle={{ color: '#a1a1aa', fontWeight: 600 }}
                        />
                        <Bar dataKey="minutes" fill="#a78bfa" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="empty-chart-state">No trend data available for this range.</div>
                  )}
                </div>
              </div>

              <div className="chart-card">
                <h3>Time Distribution</h3>
                <div className="chart-container pie">
                  {distributionData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={distributionData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {distributionData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value) => [`${value} min`, 'Time Spent']}
                          contentStyle={{
                            backgroundColor: '#18181b',
                            borderColor: '#27272a',
                            borderRadius: '6px',
                            color: '#fafafa',
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="empty-chart-state">No distribution data.</div>
                  )}
                </div>
                {/* Custom Legend */}
                <div className="pie-legend">
                  {distributionData.slice(0, 4).map((entry, i) => (
                    <div key={entry.name} className="legend-item">
                      <span className="legend-color-dot" style={{ backgroundColor: CHART_COLORS[i] }}></span>
                      <span className="legend-name">{entry.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Sites list grid */}
            <div className="table-card">
              <h3>Detailed breakdown</h3>
              {siteBreakdown.length === 0 ? (
                <div className="empty-table">No tracking details recorded.</div>
              ) : (
                <div className="table-responsive">
                  <table className="analytics-table">
                    <thead>
                      <tr>
                        <th>Website</th>
                        <th>Type</th>
                        <th className="align-right">Time Spent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {siteBreakdown.map((site) => (
                        <tr key={site.target}>
                          <td>
                            <div className="table-site-name">
                              <img
                                src={getFaviconUrl(site.domain)}
                                onError={(e) => {
                                  e.target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="gray" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>';
                                }}
                                alt=""
                                className="table-favicon"
                              />
                              <span className="domain-txt" title={site.target}>
                                {site.target}
                              </span>
                            </div>
                          </td>
                          <td>
                            <span className={`badge ${site.isUrl ? 'purple' : 'gray'}`}>
                              {site.isUrl ? 'Path Detail' : 'Domain aggregate'}
                            </span>
                          </td>
                          <td className="align-right font-bold">{formatDuration(site.seconds)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Blocklist Tab */}
        {activeTab === 'blacklist' && (
          <div className="tab-pane">
            <header className="tab-header">
              <div>
                <h1>Blocklist / Exclusions</h1>
                <p className="subtitle">Domains listed here will never be tracked</p>
              </div>
            </header>

            <div className="form-card">
              <div className="input-group">
                <input
                  type="text"
                  placeholder="e.g. facebook.com or localhost"
                  value={newBlacklistDomain}
                  onChange={(e) => setNewBlacklistDomain(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddBlacklist()}
                />
                <button className="btn-add" onClick={handleAddBlacklist}>
                  <Plus size={16} />
                  <span>Exclude Domain</span>
                </button>
              </div>
            </div>

            <div className="list-card">
              <div className="list-header">
                <h3>Currently Excluded Domains ({settings.blacklist.length})</h3>
                <div className="search-bar">
                  <Search size={14} />
                  <input
                    type="text"
                    placeholder="Search blocklist..."
                    value={settingsSearch}
                    onChange={(e) => setSettingsSearch(e.target.value)}
                  />
                </div>
              </div>

              {settings.blacklist.length === 0 ? (
                <div className="empty-settings-list">No excluded domains. All websites are tracked.</div>
              ) : (
                <div className="settings-items-list">
                  {settings.blacklist
                    .filter((d) => d.includes(settingsSearch.toLowerCase()))
                    .map((domain) => (
                      <div key={domain} className="settings-item">
                        <div className="item-meta">
                          <img src={getFaviconUrl(domain)} alt="" className="favicon-small" />
                          <span>{domain}</span>
                        </div>
                        <button className="btn-delete" onClick={() => handleRemoveBlacklist(domain)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Limits Tab */}
        {activeTab === 'limits' && (
          <div className="tab-pane">
            <header className="tab-header">
              <div>
                <h1>Daily Website Limits</h1>
                <p className="subtitle">Receive browser alerts when you spend too much time on these domains</p>
              </div>
            </header>

            <div className="form-card">
              <div className="input-group multi">
                <input
                  type="text"
                  placeholder="Domain (e.g. youtube.com)"
                  value={newLimitDomain}
                  onChange={(e) => setNewLimitDomain(e.target.value)}
                />
                <input
                  type="number"
                  placeholder="Limit (minutes)"
                  value={newLimitMinutes}
                  onChange={(e) => setNewLimitMinutes(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddLimit()}
                />
                <button className="btn-add" onClick={handleAddLimit}>
                  <Plus size={16} />
                  <span>Set Limit</span>
                </button>
              </div>
            </div>

            <div className="list-card">
              <h3>Configured Limits</h3>
              {Object.keys(settings.limits).length === 0 ? (
                <div className="empty-settings-list">No website limits set. Stay focused!</div>
              ) : (
                <div className="settings-items-list">
                  {Object.entries(settings.limits).map(([domain, minutes]) => (
                    <div key={domain} className="settings-item">
                      <div className="item-meta">
                        <img src={getFaviconUrl(domain)} alt="" className="favicon-small" />
                        <span>{domain}</span>
                      </div>
                      <div className="limit-meta">
                        <span className="limit-value">{minutes} mins / day</span>
                        <button className="btn-delete" onClick={() => handleRemoveLimit(domain)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tracking Granularity Tab */}
        {activeTab === 'tracking' && (
          <div className="tab-pane">
            <header className="tab-header">
              <div>
                <h1>Tracking Granularity</h1>
                <p className="subtitle">Configure whether to track root domains or record full URL paths for specific sites</p>
              </div>
            </header>

            <div className="info-banner">
              <AlertTriangle size={16} className="info-icon" />
              <p>
                By default, Staigh aggregates your time spent under the root domain (e.g. <code>github.com</code>). 
                If you add a domain below, we will track detailed full paths (e.g. <code>github.com/user/project</code>).
              </p>
            </div>

            <div className="form-card">
              <div className="input-group">
                <input
                  type="text"
                  placeholder="e.g. github.com or notion.so"
                  value={newFullUrlDomain}
                  onChange={(e) => setNewFullUrlDomain(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddFullUrl()}
                />
                <button className="btn-add" onClick={handleAddFullUrl}>
                  <Plus size={16} />
                  <span>Enable Path Details</span>
                </button>
              </div>
            </div>

            <div className="list-card">
              <h3>Domains with Detailed URL Tracking</h3>
              {settings.fullUrlTrackingDomains.length === 0 ? (
                <div className="empty-settings-list">All domains are tracked at the root level only.</div>
              ) : (
                <div className="settings-items-list">
                  {settings.fullUrlTrackingDomains.map((domain) => (
                    <div key={domain} className="settings-item">
                      <div className="item-meta">
                        <img src={getFaviconUrl(domain)} alt="" className="favicon-small" />
                        <span>{domain}</span>
                      </div>
                      <button className="btn-delete" onClick={() => handleRemoveFullUrl(domain)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Backup and Restore Tab */}
        {activeTab === 'backup' && (
          <div className="tab-pane">
            <header className="tab-header">
              <div>
                <h1>Data Management & Backup</h1>
                <p className="subtitle">Export tracking configuration, backup history, or clear all database records</p>
              </div>
            </header>

            <div className="backup-grid">
              <div className="backup-card">
                <div className="backup-icon-wrapper purple">
                  <Download size={24} />
                </div>
                <h3>Export Database Backup</h3>
                <p>Save all website limits, settings, and historical browsing logs into a local JSON backup file.</p>
                <button className="btn-backup-action" onClick={handleExport}>
                  <span>Export Backup</span>
                </button>
              </div>

              <div className="backup-card">
                <div className="backup-icon-wrapper indigo">
                  <Upload size={24} />
                </div>
                <h3>Import Database Backup</h3>
                <p>Restore settings and time logs from an existing JSON backup file. This replaces current logs.</p>
                <div className="import-wrapper">
                  <label htmlFor="import-file" className="btn-backup-action import-lbl">
                    <span>Choose Backup File</span>
                  </label>
                  <input
                    id="import-file"
                    type="file"
                    accept=".json"
                    onChange={handleImport}
                    style={{ display: 'none' }}
                  />
                </div>
                {importStatus.message && (
                  <div className={`import-alert ${importStatus.type}`}>
                    {importStatus.message}
                  </div>
                )}
              </div>

              <div className="backup-card danger">
                <div className="backup-icon-wrapper red">
                  <Trash2 size={24} />
                </div>
                <h3>Factory Reset Database</h3>
                <p>Permanently delete all configuration, blocklists, limits, and historical records. This cannot be undone.</p>
                <button className="btn-backup-action danger" onClick={handleClearData}>
                  <span>Clear All History</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// Render Options dashboard into options root element
const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(<Options />);
}
