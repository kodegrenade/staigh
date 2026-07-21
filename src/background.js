import { incrementTime, getDailyLogs, getSettings, updateSettings } from './db.js';
import { runSyncCycle } from './sync.js';

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
let todayActiveSeconds = {}; // Cache of today's active input seconds per target
let todayScrollPercent = {}; // Cache of today's max scroll percent per target
let todaySwitches = {}; // Cache of today's context switches per target
let currentTrackingDate = getLocalDateString();
let notifiedLimits = {}; // Key: YYYY-MM-DD_domain, Value: true
let dailySnoozes = {}; // Key: domain, Value: count

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

  // Clean prefix from URL for matching
  const cleanUrl = urlStr.replace(/^https?:\/\/(www\.)?/, '').toLowerCase();

  const isFullUrlTracked = settings.fullUrlTrackingDomains.some((trackItem) => {
    // Exact domain match (e.g. trackItem is "github.com" and domain is "github.com")
    if (trackItem === domain) return true;
    // Subpath match: cleanUrl matches exactly or matches directory boundary
    return cleanUrl === trackItem || cleanUrl.startsWith(trackItem + '/');
  });

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

async function loadDailySnoozes() {
  const today = getLocalDateString();
  return new Promise((resolve) => {
    chrome.storage.local.get(['snoozes'], (result) => {
      const snoozes = result.snoozes || {};
      if (snoozes.date === today) {
        dailySnoozes = snoozes.counts || {};
      } else {
        dailySnoozes = {};
        chrome.storage.local.set({ snoozes: { date: today, counts: {} } });
      }
      resolve();
    });
  });
}

// --- Initialization ---

async function initialize() {
  // Load settings
  const loadedSettings = await getSettings();
  settings = loadedSettings;

  // Load daily snoozes
  await loadDailySnoozes();

  // Load today's stats into cache
  await loadTodayStats();

  // Set up alarm for periodic time flushing (every 10 seconds to keep stats accurate and responsive)
  chrome.alarms.create('flush_time_alarm', { periodInMinutes: 0.166 }); // ~10 seconds
  
  // Set up alarm for periodic background sync (every 30 minutes)
  chrome.alarms.create('sync_data_alarm', { periodInMinutes: 30 });

  // Initialize tracking for the current active tab
  const activeTab = await getActiveTab();
  if (activeTab) {
    await startTrackingTab(activeTab);
  }
}

async function loadTodayStats() {
  const today = getLocalDateString();
  currentTrackingDate = today;
  try {
    const logs = await getDailyLogs(today);
    todayTimes = {};
    todayActiveSeconds = {};
    todayScrollPercent = {};
    todaySwitches = {};
    logs.forEach((log) => {
      todayTimes[log.target] = log.seconds;
      todayActiveSeconds[log.target] = log.activeSeconds || 0;
      todayScrollPercent[log.target] = log.scrollMaxPercent || 0;
      todaySwitches[log.target] = log.contextSwitches || 0;
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

async function startTrackingTab(tab) {
  const domain = getCleanDomain(tab.url);
  if (!domain || tab.incognito || isBlacklisted(domain)) {
    stopTracking();
    return;
  }

  const target = getCleanTarget(tab.url, domain);
  const isFullUrl = target !== domain;
  const today = getLocalDateString();

  // Switch context if target has changed
  if (target !== activeTarget) {
    todaySwitches[target] = (todaySwitches[target] || 0) + 1;
    await incrementTime(today, target, domain, 0, isFullUrl, 0, 0, 1);

    if (isFullUrl) {
      todaySwitches[domain] = (todaySwitches[domain] || 0) + 1;
      await incrementTime(today, domain, domain, 0, false, 0, 0, 1);
    }
  }

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

  const snoozeCount = dailySnoozes[domain] || 0;
  const effectiveLimitMinutes = limitMinutes + (snoozeCount * 10);

  const today = getLocalDateString();
  const limitKey = `${today}_${domain}_snooze_${snoozeCount}`;

  if (notifiedLimits[limitKey]) return; // Already alerted today

  if ((totalSeconds / 60) >= effectiveLimitMinutes) {
    notifiedLimits[limitKey] = true;
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon128.png',
      title: 'Daily Site Limit Reached',
      message: `You have spent ${effectiveLimitMinutes} minute(s) on ${domain} today.`,
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
    await startTrackingTab(tab);
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
      await startTrackingTab(activeTab);
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
      await startTrackingTab(tab);
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

// Listen for periodic alarms to flush time logs and trigger syncs
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'flush_time_alarm') {
    await flushCurrentTime();
  } else if (alarm.name === 'sync_data_alarm') {
    try {
      await runSyncCycle(false);
    } catch (err) {
      console.warn('Periodic auto-sync cycle failed:', err);
    }
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
        await startTrackingTab(activeTab);
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
      chrome.storage.local.get(['snoozes'], (result) => {
        const today = getLocalDateString();
        const snoozes = result.snoozes || {};
        let snoozeCount = 0;
        if (snoozes.date === today && snoozes.counts) {
          snoozeCount = snoozes.counts[domain] || 0;
          dailySnoozes = snoozes.counts; // Sync cache
        }
        const secondsToday = todayTimes[domain] || 0;
        sendResponse({
          hasLimit: true,
          limitMinutes: limitMinutes + (snoozeCount * 10),
          secondsToday,
          isPaused: settings.isPaused,
          theme: settings.theme || 'dark',
          snoozeCount,
        });
      });
    } else {
      sendResponse({ hasLimit: false });
    }
  } else if (request.action === 'snoozeDomain') {
    const { domain } = request;
    const today = getLocalDateString();
    
    chrome.storage.local.get(['snoozes'], (result) => {
      const snoozes = result.snoozes || {};
      let counts = {};
      if (snoozes.date === today && snoozes.counts) {
        counts = snoozes.counts;
      }
      
      const currentCount = counts[domain] || 0;
      if (currentCount < 3) {
        const nextCount = currentCount + 1;
        counts[domain] = nextCount;
        dailySnoozes = counts; // Sync cache
        
        chrome.storage.local.set({
          snoozes: {
            date: today,
            counts: counts
          }
        }, () => {
          const baseLimit = settings.limits[domain] || 0;
          const newLimitMinutes = baseLimit + (nextCount * 10);
          
          chrome.tabs.query({}, (tabs) => {
            tabs.forEach((tab) => {
              try {
                const tabDomain = getCleanDomain(tab.url);
                if (tabDomain === domain) {
                  chrome.tabs.sendMessage(tab.id, {
                    action: 'snoozeApplied',
                    snoozeCount: nextCount,
                    limitMinutes: newLimitMinutes,
                  });
                }
              } catch {
                // Ignored
              }
            });
          });
          
          sendResponse({ success: true, snoozeCount: nextCount, limitMinutes: newLimitMinutes });
        });
      } else {
        sendResponse({ success: false, error: 'Max snoozes reached' });
      }
    });
  } else if (request.action === 'reportMetadata') {
    const { domain, title, description } = request;
    handleReportMetadata(domain, title, description).then(() => {
      sendResponse({ success: true });
    }).catch((err) => {
      console.error('Metadata report error', err);
      sendResponse({ success: false, error: err.message });
    });
    return true; // Keeps messaging port open for async response
  } else if (request.action === 'syncMetrics') {
    const { domain, activeSeconds, scrollMaxPercent } = request;
    handleSyncMetrics(domain, activeSeconds, scrollMaxPercent).then(() => {
      sendResponse({ success: true });
    }).catch((err) => {
      console.error('Metrics sync error', err);
      sendResponse({ success: false, error: err.message });
    });
    return true; // Keeps messaging port open for async response
  }
  return true; // Keeps messaging port open for async response
});

// Initialize on background service startup
initialize();

// --- Categorisation Helpers ---

const CATEGORY_KEYWORDS = {
  'Productivity & Work': ['work', 'code', 'develop', 'design', 'manage', 'task', 'project', 'team', 'doc', 'workspace', 'collab', 'sheet', 'board', 'sprint', 'git', 'repo', 'bug', 'issue'],
  'Social & Communication': ['social', 'chat', 'message', 'friend', 'connect', 'feed', 'share', 'follow', 'network', 'tweet', 'post', 'status', 'community', 'forum'],
  'Entertainment & Streaming': ['stream', 'video', 'watch', 'music', 'play', 'movie', 'show', 'game', 'song', 'listen', 'audio', 'player', 'tv', 'media', 'entertainment'],
  'Learning & Reference': ['learn', 'wiki', 'study', 'education', 'research', 'reference', 'course', 'tutorial', 'documentation', 'encyclopedia', 'guide', 'science', 'math', 'academic'],
  'Utility & Shopping': ['shop', 'store', 'buy', 'price', 'cart', 'deal', 'pay', 'search', 'tool', 'convert', 'format', 'calculator', 'utility']
};

function classifyByMetadata(description, title) {
  const text = `${title || ''} ${description || ''}`.toLowerCase();
  let bestCategory = 'Other';
  let maxScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    keywords.forEach(keyword => {
      if (text.includes(keyword)) {
        score++;
      }
    });

    if (score > maxScore) {
      maxScore = score;
      bestCategory = category;
    }
  }

  return maxScore >= 1 ? bestCategory : 'Other';
}

async function handleReportMetadata(domain, title, description) {
  if (!domain) return;
  const cleanDomain = domain.toLowerCase();

  const currentSettings = await getSettings();
  const classifiedDomains = currentSettings.classifiedDomains || {};
  const categoryOverrides = currentSettings.categoryOverrides || {};

  // If already classified or overridden, skip to save storage operations
  if (categoryOverrides[cleanDomain] || classifiedDomains[cleanDomain]) {
    return;
  }

  const category = classifyByMetadata(description, title);
  if (category && category !== 'Other') {
    classifiedDomains[cleanDomain] = category;
    await updateSettings({ classifiedDomains });
  }
}

async function handleSyncMetrics(domain, activeSeconds, scrollMaxPercent) {
  if (!domain) return;
  
  // Attribute to subpath target only if activeTarget is a subpath of this domain
  const target = (activeTarget && (activeTarget === domain || activeTarget.startsWith(domain + '/')))
    ? activeTarget
    : domain;
  const today = getLocalDateString();
  const isFullUrl = target !== domain;

  // Update in-memory caches
  todayActiveSeconds[target] = (todayActiveSeconds[target] || 0) + activeSeconds;
  todayScrollPercent[target] = Math.max((todayScrollPercent[target] || 0), scrollMaxPercent);

  // Increment in database
  await incrementTime(today, target, domain, 0, isFullUrl, activeSeconds, scrollMaxPercent, 0);

  // If subpath target, also aggregate to parent root domain
  if (isFullUrl) {
    todayActiveSeconds[domain] = (todayActiveSeconds[domain] || 0) + activeSeconds;
    todayScrollPercent[domain] = Math.max((todayScrollPercent[domain] || 0), scrollMaxPercent);
    await incrementTime(today, domain, domain, 0, false, activeSeconds, scrollMaxPercent, 0);
  }
}
