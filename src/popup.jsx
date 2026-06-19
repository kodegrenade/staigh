import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Power, ExternalLink, Clock, AlertTriangle, Shield, Sun, Moon } from 'lucide-react';
import { getDailyLogs, getSettings, updateSettings } from './db.js';
import './popup.css';

function Popup() {
  const [logs, setLogs] = useState([]);
  const [settings, setSettings] = useState({
    blacklist: [],
    limits: {},
    isPaused: false,
    fullUrlTrackingDomains: [],
    theme: 'dark',
  });
  const [activeTabInfo, setActiveTabInfo] = useState(null);
  const [totalSeconds, setTotalSeconds] = useState(0);

  // Load initial settings and logs
  useEffect(() => {
    async function loadData() {
      const s = await getSettings();
      setSettings(s);
      document.documentElement.setAttribute('data-theme', s.theme || 'dark');
      
      const today = getLocalDateString();
      const dailyLogs = await getDailyLogs(today);
      processLogs(dailyLogs);
    }
    loadData();
    determineActiveTab();
  }, []);

  // Listen for storage settings updates to sync in real-time
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    const handleStorageChange = (changes, areaName) => {
      if (areaName === 'local' && changes.settings) {
        const newSettings = changes.settings.newValue;
        setSettings(newSettings);
        document.documentElement.setAttribute('data-theme', newSettings.theme || 'dark');
      }
    };
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  // Poll logs and active tab state every 1 second for live-updating timer
  useEffect(() => {
    const interval = setInterval(async () => {
      const today = getLocalDateString();
      const dailyLogs = await getDailyLogs(today);
      processLogs(dailyLogs);

      // Re-evaluate active tab details
      determineActiveTab();
    }, 1000);

    return () => clearInterval(interval);
  }, [settings, activeTabInfo]);

  function getLocalDateString() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function processLogs(dailyLogs) {
    // Only show root domains in the popup for clean stats (aggregate full URLs if any)
    const aggregated = {};
    let total = 0;

    dailyLogs.forEach((log) => {
      // If we track full URL and root domain, avoid double-counting.
      // The background script logs both, but only root domain has isFullUrl = false.
      if (!log.isFullUrl) {
        aggregated[log.domain] = (aggregated[log.domain] || 0) + log.seconds;
        total += log.seconds;
      }
    });

    // Also factor in local ticking if we have an active tab that isn't saved yet
    if (activeTabInfo && !settings.isPaused) {
      const { domain } = activeTabInfo;
      // Increment local counters by 1 second for a smooth live experience
      if (aggregated[domain] !== undefined) {
        aggregated[domain] += 1;
        total += 1;
      } else {
        aggregated[domain] = 1;
        total += 1;
      }
    }

    const sorted = Object.entries(aggregated)
      .map(([domain, seconds]) => ({ domain, seconds }))
      .sort((a, b) => b.seconds - a.seconds);

    setLogs(sorted);
    setTotalSeconds(total);
  }

  async function determineActiveTab() {
    if (typeof chrome === 'undefined' || !chrome.tabs) return;

    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      if (tabs && tabs.length > 0) {
        const tab = tabs[0];
        try {
          const url = new URL(tab.url);
          if (url.protocol.startsWith('http')) {
            const domain = url.hostname.replace(/^www\./, '').toLowerCase();
            const isBlocked = settings.blacklist.some(
              (blocked) => domain === blocked || domain.endsWith('.' + blocked)
            );
            setActiveTabInfo({
              domain,
              incognito: tab.incognito,
              isBlocked,
            });
          } else {
            setActiveTabInfo(null);
          }
        } catch (e) {
          setActiveTabInfo(null);
        }
      } else {
        setActiveTabInfo(null);
      }
    });
  }

  async function handleTogglePause() {
    const updated = await updateSettings({ isPaused: !settings.isPaused });
    setSettings(updated);
  }

  async function handleToggleTheme() {
    const nextTheme = settings.theme === 'light' ? 'dark' : 'light';
    const updated = await updateSettings({ theme: nextTheme });
    setSettings(updated);
  }

  function formatTime(totalSecs) {
    const hours = Math.floor(totalSecs / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const seconds = Math.floor(totalSecs % 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  }

  function getFaviconUrl(domain) {
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  }

  function openDashboard() {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open('options.html', '_blank');
    }
  }

  // Calculate if any active site is close to its limit
  const activeLimitWarnings = logs
    .filter((log) => settings.limits[log.domain])
    .map((log) => {
      const limitSecs = settings.limits[log.domain] * 60;
      const ratio = log.seconds / limitSecs;
      return {
        domain: log.domain,
        ratio,
        minutesLeft: Math.max(0, Math.round((limitSecs - log.seconds) / 60)),
      };
    })
    .filter((warn) => warn.ratio >= 0.8);

  return (
    <div className="popup-container">
      {/* Header */}
      <header className="popup-header">
        <div className="logo-section">
          <span className="logo-text">staigh</span>
          <span className="logo-dot"></span>
        </div>
        <div className="header-controls">
          <button
            className="theme-toggle-btn"
            onClick={handleToggleTheme}
            title={settings.theme === 'light' ? 'Dark Mode' : 'Light Mode'}
          >
            {settings.theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
          </button>
          <button
            className={`power-btn ${settings.isPaused ? 'paused' : 'active'}`}
            onClick={handleTogglePause}
            title={settings.isPaused ? 'Resume Tracking' : 'Pause Tracking'}
          >
            <Power size={15} />
          </button>
        </div>
      </header>

      {/* Hero Stats */}
      <section className="hero-section">
        <span className="hero-time-label">Active Today</span>
        <h1 className="hero-time-value">{formatTime(totalSeconds)}</h1>
      </section>

      {/* Limits Alert Banner */}
      {activeLimitWarnings.length > 0 && (
        <div className="alert-banner">
          <AlertTriangle size={14} className="alert-icon" />
          <span>
            {activeLimitWarnings[0].minutesLeft === 0
              ? `Limit reached for ${activeLimitWarnings[0].domain}!`
              : `${activeLimitWarnings[0].domain} limit in ${activeLimitWarnings[0].minutesLeft}m`}
          </span>
        </div>
      )}

      {/* Active Tab Status bar */}
      {activeTabInfo && (
        <div className="active-status-bar">
          <span className="status-indicator-dot pulsing"></span>
          <span className="status-text">
            {activeTabInfo.incognito
              ? 'Incognito (Tracking Excluded)'
              : activeTabInfo.isBlocked
              ? 'Site Blocklisted'
              : settings.isPaused
              ? 'Tracking Paused'
              : `Tracking: ${activeTabInfo.domain}`}
          </span>
        </div>
      )}

      {/* Top Websites List */}
      <section className="list-section">
        <h3>Top Sites</h3>
        {logs.length === 0 ? (
          <div className="empty-state">
            <Clock size={24} />
            <p>No activity tracked today yet.</p>
          </div>
        ) : (
          <div className="sites-list">
            {logs.slice(0, 4).map((site, index) => {
              const percentage = totalSeconds > 0 ? (site.seconds / totalSeconds) * 100 : 0;
              const limitMinutes = settings.limits[site.domain];
              const limitSecs = limitMinutes ? limitMinutes * 60 : 0;
              const isOverLimit = limitSecs > 0 && site.seconds >= limitSecs;

              return (
                <div key={site.domain} className="site-item">
                  <div className="site-meta">
                    <img
                      src={getFaviconUrl(site.domain)}
                      onError={(e) => {
                        e.target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="gray" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>';
                      }}
                      alt=""
                      className="site-icon"
                    />
                    <span className="site-domain" title={site.domain}>
                      {site.domain}
                    </span>
                    <span className={`site-time ${isOverLimit ? 'over-limit' : ''}`}>
                      {formatTime(site.seconds)}
                    </span>
                  </div>
                  <div className="progress-bar-bg">
                    <div
                      className={`progress-bar-fill ${isOverLimit ? 'limit-exceeded' : ''}`}
                      style={{ width: `${percentage}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Footer Navigation */}
      <footer className="popup-footer">
        <button className="dashboard-btn" onClick={openDashboard}>
          <span>View Dashboard</span>
          <ExternalLink size={14} />
        </button>
      </footer>
    </div>
  );
}

// Render component into root
const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(<Popup />);
}
