// Database and Storage Layer for Staigh

// --- IndexedDB Configuration ---
const DB_NAME = 'staigh_db';
const DB_VERSION = 1;
const STORE_NAME = 'time_logs';

function getDB() {
  return new Promise((resolve, reject) => {
    // Check if indexedDB is available (it might not be in some test contexts, but is in Chrome Extension)
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: ['date', 'target'] });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

// --- Time Logging Interface ---

/**
 * Increment the tracked time for a given target (domain or full URL) on a specific date.
 * @param {string} date - Format YYYY-MM-DD
 * @param {string} target - The domain or full URL
 * @param {string} domain - The root domain (for aggregation)
 * @param {number} additionalSeconds - Seconds to add
 * @param {boolean} isFullUrl - Whether target is a full URL or root domain
 */
export async function incrementTime(date, target, domain, additionalSeconds, isFullUrl, activeSeconds = 0, scrollMaxPercent = 0, contextSwitches = 0) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const getRequest = store.get([date, target]);

    getRequest.onsuccess = () => {
      const record = getRequest.result || {
        date,
        target,
        domain,
        seconds: 0,
        isFullUrl,
        activeSeconds: 0,
        scrollMaxPercent: 0,
        contextSwitches: 0,
      };
      record.seconds += additionalSeconds;

      // Backward compatibility for existing records
      if (record.activeSeconds === undefined) record.activeSeconds = 0;
      if (record.scrollMaxPercent === undefined) record.scrollMaxPercent = 0;
      if (record.contextSwitches === undefined) record.contextSwitches = 0;

      record.activeSeconds += activeSeconds;
      record.scrollMaxPercent = Math.max(record.scrollMaxPercent, scrollMaxPercent);
      record.contextSwitches += contextSwitches;
      
      const putRequest = store.put(record);
      putRequest.onsuccess = () => resolve(record);
      putRequest.onerror = () => reject(putRequest.error);
    };

    getRequest.onerror = () => reject(getRequest.error);
  });
}

/**
 * Fetch all logs for a specific date.
 * @param {string} date - Format YYYY-MM-DD
 */
export async function getDailyLogs(date) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const logs = [];

    // Open cursor to scan all entries for this date
    // Note: We can filter by date range or key range if needed,
    // but cursor scanning is robust and fast for daily logs.
    const request = store.openCursor();
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        if (cursor.value.date === date) {
          logs.push(cursor.value);
        }
        cursor.continue();
      } else {
        resolve(logs);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Fetch all logs between startDate and endDate (inclusive).
 * @param {string} startDate - Format YYYY-MM-DD
 * @param {string} endDate - Format YYYY-MM-DD
 */
export async function getLogsInRange(startDate, endDate) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const logs = [];

    const request = store.openCursor();
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        const record = cursor.value;
        if (record.date >= startDate && record.date <= endDate) {
          logs.push(record);
        }
        cursor.continue();
      } else {
        resolve(logs);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear all historical logs from IndexedDB.
 */
export async function clearAllLogs() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}


// --- Extension Settings Storage (chrome.storage.local) ---

const DEFAULT_SETTINGS = {
  blacklist: [], // Array of domains to ignore
  limits: {}, // Object mapping domains to daily limit in minutes, e.g. { "youtube.com": 60 }
  isPaused: false, // Global pause state
  fullUrlTrackingDomains: [], // Array of domains where we track full URLs instead of root domains
  theme: 'dark', // Default visual theme
  classifiedDomains: {}, // Auto-classified domain maps
  categoryOverrides: {}, // User-configured custom category mapping overrides
};

/**
 * Retrieve current settings from chrome.storage.local.
 */
export function getSettings() {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      resolve(DEFAULT_SETTINGS);
      return;
    }
    chrome.storage.local.get(['settings'], (result) => {
      resolve({ ...DEFAULT_SETTINGS, ...result.settings });
    });
  });
}

/**
 * Update and persist settings in chrome.storage.local.
 * @param {Object} newSettings - Object containing updated fields
 */
export function updateSettings(newSettings) {
  return new Promise((resolve) => {
    getSettings().then((currentSettings) => {
      const settings = { ...currentSettings, ...newSettings };
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set({ settings }, () => {
          resolve(settings);
        });
      } else {
        resolve(settings);
      }
    });
  });
}

// --- Import / Export Backup Data ---

/**
 * Exports all settings and IndexedDB time logs into a single JSON object.
 */
export async function exportData() {
  const settings = await getSettings();
  const db = await getDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    const request = store.getAll();
    request.onsuccess = () => {
      resolve({
        settings,
        logs: request.result,
        exportedAt: new Date().toISOString(),
      });
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Imports settings and logs, restoring them to storage.
 * @param {Object} data - Exported JSON data
 */
export async function importData(data) {
  if (!data || !data.settings || !Array.isArray(data.logs)) {
    throw new Error('Invalid backup data format');
  }

  // Restore settings
  await updateSettings(data.settings);

  // Restore database
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    // Clear existing logs first
    const clearRequest = store.clear();
    clearRequest.onsuccess = () => {
      let count = 0;
      if (data.logs.length === 0) {
        resolve();
        return;
      }
      
      data.logs.forEach((log) => {
        const putRequest = store.put(log);
        putRequest.onsuccess = () => {
          count++;
          if (count === data.logs.length) {
            resolve();
          }
        };
        putRequest.onerror = () => reject(putRequest.error);
      });
    };
    clearRequest.onerror = () => reject(clearRequest.error);
  });
}
