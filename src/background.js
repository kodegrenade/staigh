import { incrementTime, getDailyLogs, getSettings } from './db.js';

// --- State Variables ---
let activeTarget = null; // Either root domain or full URL
let activeDomain = null; // Always root domain
let lastCheckpoint = null; // Timestamp (ms)
let isUserIdle = false;
let isChromeFocused = true;

let settings = {
  blacklist: [],
  limits: {},
  isPaused: false,
  fullUrlTrackingDomains: [],
};

let todayTimes = {}; // In-memory cache of today's time (seconds) per target
let currentTrackingDate = getLocalDateString();
let notifiedLimits = {}; // Key: YYYY-MM-DD_domain, Value: true

// --- Helper Functions ---

function getLocalDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCleanDomain(urlStr) {
  try {
    const url = new URL(urlStr);
    if (!url.protocol.startsWith('http')) return null;
    return url.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function getCleanTarget(urlStr, domain) {
  if (!urlStr || !domain) return null;
  const isFullUrlTracked = settings.fullUrlTrackingDomains.includes(domain);
  if (isFullUrlTracked) {
    try {
      const url = new URL(urlStr);
      // Remove query parameters and hashes for privacy and grouping consistency
      return `${url.origin}${url.pathname}`.replace(/^https?:\/\/(www\.)?/, '').toLowerCase();
    } catch {
      return domain;
    }
  }
  return domain;
}

function isBlacklisted(domain) {
  if (!settings.blacklist || !domain) return false;
  const cleanDomain = domain.toLowerCase();
  return settings.blacklist.some((blocked) => {
    const cleanBlocked = blocked.trim().toLowerCase();
    return cleanDomain === cleanBlocked || cleanDomain.endsWith('.' + cleanBlocked);
  });
}

// --- Initialization ---

async function initialize() {
  // Load settings
  const loadedSettings = await getSettings();
  settings = loadedSettings;

  // Load today's stats into cache
  await loadTodayStats();

  // Set up alarm for periodic time flushing (every 10 seconds to keep stats accurate and responsive)
  chrome.alarms.create('flush_time_alarm', { periodInMinutes: 0.166 }); // ~10 seconds

  // Initialize tracking for the current active tab
  const activeTab = await getActiveTab();
  if (activeTab) {
    startTrackingTab(activeTab);
  }
}

async function loadTodayStats() {
  const today = getLocalDateString();
  currentTrackingDate = today;
  try {
    const logs = await getDailyLogs(today);
    todayTimes = {};
    logs.forEach((log) => {
      todayTimes[log.target] = log.seconds;
    });
  } catch (e) {
    console.error('Failed to load today times', e);
  }
}

async function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      if (tabs && tabs.length > 0) {
        resolve(tabs[0]);
      } else {
        resolve(null);
      }
    });
  });
}

// --- Tracking Controllers ---

function startTrackingTab(tab) {
  const domain = getCleanDomain(tab.url);
  if (!domain || tab.incognito || isBlacklisted(domain)) {
    stopTracking();
    return;
  }

  const target = getCleanTarget(tab.url, domain);
  activeTarget = target;
  activeDomain = domain;
  lastCheckpoint = Date.now();
}

function stopTracking() {
  activeTarget = null;
  activeDomain = null;
  lastCheckpoint = null;
}

function broadcastTimeSync(domain, totalSeconds) {
  if (typeof chrome === 'undefined' || !chrome.tabs) return;
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      try {
        const tabDomain = getCleanDomain(tab.url);
        if (tabDomain === domain) {
          chrome.tabs.sendMessage(tab.id, {
            action: 'syncTime',
            secondsToday: totalSeconds,
          });
        }
      } catch {
        // Ignored for settings/extension pages
      }
    });
  });
}

async function flushCurrentTime() {
  if (!activeTarget || !lastCheckpoint) return;

  const now = Date.now();
  const elapsedSeconds = (now - lastCheckpoint) / 1000;
  lastCheckpoint = now;

  if (elapsedSeconds <= 0) return;

  // Reload settings cache to verify live configuration
  settings = await getSettings();

  if (settings.isPaused || isUserIdle || !isChromeFocused) {
    return;
  }

  const today = getLocalDateString();
  if (today !== currentTrackingDate) {
    todayTimes = {};
    currentTrackingDate = today;
  }

  const isFullUrl = activeTarget !== activeDomain;

  // Save active target stats
  todayTimes[activeTarget] = (todayTimes[activeTarget] || 0) + elapsedSeconds;
  await incrementTime(today, activeTarget, activeDomain, elapsedSeconds, isFullUrl);

  // If tracking a full URL, also aggregate to root domain
  let totalDomainSeconds = todayTimes[activeDomain] || 0;
  if (isFullUrl) {
    todayTimes[activeDomain] = (todayTimes[activeDomain] || 0) + elapsedSeconds;
    await incrementTime(today, activeDomain, activeDomain, elapsedSeconds, false);
    totalDomainSeconds = todayTimes[activeDomain];
  } else {
    totalDomainSeconds = todayTimes[activeTarget];
  }

  // Broadcast sync updates to open tabs on this domain
  broadcastTimeSync(activeDomain, totalDomainSeconds);

  // Check limit threshold
  checkDailyLimit(activeDomain, totalDomainSeconds);
}

function checkDailyLimit(domain, totalSeconds) {
  const limitMinutes = settings.limits?.[domain];
  if (!limitMinutes) return;

  const today = getLocalDateString();
  const limitKey = `${today}_${domain}`;

  if (notifiedLimits[limitKey]) return; // Already alerted today

  if ((totalSeconds / 60) >= limitMinutes) {
    notifiedLimits[limitKey] = true;
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon128.png',
      title: 'Daily Site Limit Reached',
      message: `You have spent ${limitMinutes} minute(s) on ${domain} today.`,
      priority: 2,
    });
  }
}

// --- Event Listeners ---

// Listen for tab switching
chrome.tabs.onActivated.addListener(async () => {
  await flushCurrentTime();
  const tab = await getActiveTab();
  if (tab) {
    startTrackingTab(tab);
  } else {
    stopTracking();
  }
});

// Listen for tab URL updates
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.url) {
    // Only handle if the updated tab is the active tab
    const activeTab = await getActiveTab();
    if (activeTab && activeTab.id === tabId) {
      await flushCurrentTime();
      startTrackingTab(activeTab);
    }
  }
});

// Listen for window focus changes
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  await flushCurrentTime();
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    isChromeFocused = false;
    stopTracking();
  } else {
    isChromeFocused = true;
    const tab = await getActiveTab();
    if (tab) {
      startTrackingTab(tab);
    }
  }
});

// Listen for idle state changes (stops tracking if inactive for 60 seconds)
chrome.idle.setDetectionInterval(60);
chrome.idle.onStateChanged.addListener(async (newState) => {
  await flushCurrentTime();
  isUserIdle = newState !== 'active';
  if (!isUserIdle) {
    lastCheckpoint = Date.now();
  }
});

// Listen for periodic alarms to flush time logs
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'flush_time_alarm') {
    await flushCurrentTime();
  }
});

// Listen for changes to settings (e.g. from popup or dashboard options)
chrome.storage.onChanged.addListener(async (changes, namespace) => {
  if (namespace === 'local' && changes.settings) {
    settings = changes.settings.newValue;
    
    // Broadcast setting changes to all tabs to update floating countdown widgets
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        try {
          chrome.tabs.sendMessage(tab.id, {
            action: 'settingsChanged',
            settings,
          });
        } catch {
          // Ignored
        }
      });
    });

    // If settings changed, check if the current active tab is now blacklisted
    const activeTab = await getActiveTab();
    if (activeTab) {
      const domain = getCleanDomain(activeTab.url);
      if (domain && isBlacklisted(domain)) {
        stopTracking();
      } else if (!activeTarget && activeTab) {
        startTrackingTab(activeTab);
      }
    }
  }
});

// Listen for messaging connections from Content Scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkLimit') {
    const { domain } = request;
    const limitMinutes = settings.limits?.[domain];
    if (limitMinutes) {
      const secondsToday = todayTimes[domain] || 0;
      sendResponse({
        hasLimit: true,
        limitMinutes,
        secondsToday,
        isPaused: settings.isPaused,
        theme: settings.theme || 'dark',
      });
    } else {
      sendResponse({ hasLimit: false });
    }
  }
  return true; // Keeps messaging port open for async response
});

// Initialize on background service startup
initialize();
