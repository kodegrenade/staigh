import { getSettings, updateSettings, getAllLogs, saveLog } from './db.js';

/**
 * Request an OAuth token from Chrome Identity.
 * Supports both default settings and custom Client IDs via launchWebAuthFlow.
 * @param {boolean} interactive - Whether to prompt the user if unauthorized.
 */
export async function getAuthToken(interactive = false) {
  const settings = await getSettings();

  if (settings.useCustomCredentials && settings.customClientId) {
    // Return cached token if valid (expires in more than 60s)
    if (settings.customToken && settings.customTokenExpires > Date.now() + 60000) {
      return settings.customToken;
    }

    const redirectUri = chrome.identity.getRedirectURL();
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth` +
      `?client_id=${settings.customClientId}` +
      `&response_type=token` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent('https://www.googleapis.com/auth/drive.appdata')}`;

    return new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        { url: authUrl, interactive },
        async (redirectUrl) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!redirectUrl) {
            reject(new Error('OAuth flow returned empty redirect URL'));
            return;
          }

          try {
            const url = new URL(redirectUrl);
            const params = new URLSearchParams(url.hash.substring(1));
            const token = params.get('access_token');
            const expiresIn = parseInt(params.get('expires_in'), 10) || 3600;

            if (!token) {
              reject(new Error('Failed to parse access token from OAuth redirect'));
              return;
            }

            const customTokenExpires = Date.now() + expiresIn * 1000;
            await updateSettings({
              customToken: token,
              customTokenExpires
            });

            resolve(token);
          } catch (err) {
            reject(new Error(`Failed to parse auth response: ${err.message}`));
          }
        }
      );
    });
  }

  // Fallback: Default credentials managed by standard getAuthToken
  return new Promise((resolve, reject) => {
    if (typeof chrome === 'undefined' || !chrome.identity) {
      reject(new Error('Chrome Identity API is not available'));
      return;
    }
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!token) {
        reject(new Error('Failed to acquire OAuth token'));
        return;
      }
      resolve(token);
    });
  });
}

/**
 * Remove/Revoke the cached OAuth token.
 */
export async function logout() {
  const settings = await getSettings();

  if (settings.useCustomCredentials) {
    const cachedToken = settings.customToken;
    await updateSettings({
      customToken: '',
      customTokenExpires: 0
    });
    if (cachedToken) {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${cachedToken}`, { method: 'POST' }).catch(() => {});
    }
  } else {
    const token = await getAuthToken(false).catch(() => null);
    if (token) {
      await new Promise((resolve) => {
        chrome.identity.removeCachedAuthToken({ token }, resolve);
      });
      // Revoke token access from Google servers
      await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, { method: 'POST' }).catch(() => {});
    }
  }
}

/**
 * Generate a unique ID for this device if it doesn't exist.
 */
export async function getOrCreateDeviceId() {
  const settings = await getSettings();
  if (settings.deviceId) {
    return settings.deviceId;
  }
  const randomId = 'device_' + Math.random().toString(36).substring(2, 10);
  const updated = await updateSettings({ deviceId: randomId });
  return updated.deviceId;
}

/**
 * List files inside the sandboxed appDataFolder.
 */
async function listAppDataFiles(token) {
  const response = await fetch(
    'https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id,name)',
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to list files: ${response.statusText}`);
  }
  const data = await response.json();
  return data.files || [];
}

/**
 * Download a file content.
 */
async function downloadFileContent(token, fileId) {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }
  return await response.json();
}

/**
 * Upload a new file using multipart upload.
 */
async function createDriveFile(token, filename, content) {
  const metadata = {
    name: filename,
    parents: ['appDataFolder']
  };
  const boundary = '314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const body =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    JSON.stringify(content) +
    closeDelimiter;

  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: body
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to create file on Drive: ${response.statusText}`);
  }
  return await response.json();
}

/**
 * Update content of an existing file.
 */
async function updateDriveFile(token, fileId, content) {
  const response = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(content)
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to update file on Drive: ${response.statusText}`);
  }
  return await response.json();
}

/**
 * Merge two settings configurations together.
 */
export function mergeSettings(local, remote) {
  const merged = { ...local };

  // Sync state metadata shouldn't overwrite local device IDs
  merged.deviceId = local.deviceId || remote.deviceId;

  // Merge blacklists (Union)
  const localBlacklist = local.blacklist || [];
  const remoteBlacklist = remote.blacklist || [];
  merged.blacklist = Array.from(new Set([...localBlacklist, ...remoteBlacklist]));

  // Merge full URL tracking domains (Union)
  const localFullUrl = local.fullUrlTrackingDomains || [];
  const remoteFullUrl = remote.fullUrlTrackingDomains || [];
  merged.fullUrlTrackingDomains = Array.from(new Set([...localFullUrl, ...remoteFullUrl]));

  // Merge limits (Union, remote overrides local unless local is newer, for simplicity we merge keys)
  const localLimits = local.limits || {};
  const remoteLimits = remote.limits || {};
  merged.limits = { ...remoteLimits, ...localLimits };

  // Merge category overrides
  const localCat = local.categoryOverrides || {};
  const remoteCat = remote.categoryOverrides || {};
  merged.categoryOverrides = { ...remoteCat, ...localCat };

  // Merge classified domains
  const localClass = local.classifiedDomains || {};
  const remoteClass = remote.classifiedDomains || {};
  merged.classifiedDomains = { ...remoteClass, ...localClass };

  // Retain local UI preferences like theme unless not set
  merged.theme = local.theme || remote.theme || 'dark';

  return merged;
}

/**
 * Core log merging logic.
 * Combines logs from all remote device profiles and local IndexedDB.
 */
export function mergeLogs(localLogs, allRemoteLogs, localDeviceId) {
  const logsMap = {};

  const mergeMaps = (mapA, mapB) => {
    const merged = { ...mapA };
    Object.entries(mapB || {}).forEach(([devId, val]) => {
      merged[devId] = Math.max(merged[devId] || 0, val || 0);
    });
    return merged;
  };

  // Load all local logs first
  localLogs.forEach((log) => {
    const key = `${log.date}_${log.target}`;
    logsMap[key] = { ...log };

    // Ensure maps exist on local log
    if (!logsMap[key].deviceSeconds) logsMap[key].deviceSeconds = {};
    if (!logsMap[key].deviceActiveSeconds) logsMap[key].deviceActiveSeconds = {};
    if (!logsMap[key].deviceContextSwitches) logsMap[key].deviceContextSwitches = {};

    // If local log has values but no map, attribute to local device ID
    if (log.seconds > 0 && Object.keys(logsMap[key].deviceSeconds).length === 0) {
      logsMap[key].deviceSeconds[localDeviceId] = log.seconds;
    }
    if (log.activeSeconds > 0 && Object.keys(logsMap[key].deviceActiveSeconds).length === 0) {
      logsMap[key].deviceActiveSeconds[localDeviceId] = log.activeSeconds;
    }
    if (log.contextSwitches > 0 && Object.keys(logsMap[key].deviceContextSwitches).length === 0) {
      logsMap[key].deviceContextSwitches[localDeviceId] = log.contextSwitches;
    }
  });

  // Merge all remote logs
  allRemoteLogs.forEach((log) => {
    const key = `${log.date}_${log.target}`;
    const remoteSecondsMap = log.deviceSeconds || {};
    const remoteActiveMap = log.deviceActiveSeconds || {};
    const remoteSwitchesMap = log.deviceContextSwitches || {};

    if (logsMap[key]) {
      const existing = logsMap[key];

      // Merge maps
      existing.deviceSeconds = mergeMaps(existing.deviceSeconds, remoteSecondsMap);
      existing.deviceActiveSeconds = mergeMaps(existing.deviceActiveSeconds, remoteActiveMap);
      existing.deviceContextSwitches = mergeMaps(existing.deviceContextSwitches, remoteSwitchesMap);

      // Recompute totals
      existing.seconds = Object.values(existing.deviceSeconds).reduce((sum, val) => sum + val, 0);
      existing.activeSeconds = Object.values(existing.deviceActiveSeconds).reduce((sum, val) => sum + val, 0);
      existing.contextSwitches = Object.values(existing.deviceContextSwitches).reduce((sum, val) => sum + val, 0);

      existing.scrollMaxPercent = Math.max(existing.scrollMaxPercent || 0, log.scrollMaxPercent || 0);
    } else {
      logsMap[key] = {
        ...log,
        deviceSeconds: { ...remoteSecondsMap },
        deviceActiveSeconds: { ...remoteActiveMap },
        deviceContextSwitches: { ...remoteSwitchesMap }
      };
    }
  });

  return Object.values(logsMap);
}

/**
 * Main Sync & Merge orchestrator flow.
 * Downloads all remote files, performs log and settings merges, writes to local DB, and uploads updates.
 * @param {boolean} interactive - Prompt auth modal if token is missing.
 */
export async function runSyncCycle(interactive = false) {
  try {
    const token = await getAuthToken(interactive);
    const deviceId = await getOrCreateDeviceId();
    const localSettings = await getSettings();

    const driveFiles = await listAppDataFiles(token);

    // 1. Settings Synchronization
    const settingsFile = driveFiles.find(f => f.name === 'settings.json');
    let remoteSettings = null;
    let finalSettings = localSettings;

    if (settingsFile) {
      remoteSettings = await downloadFileContent(token, settingsFile.id);
      finalSettings = mergeSettings(localSettings, remoteSettings);
      await updateSettings(finalSettings);
    }

    // 2. Logs Synchronization
    const localLogsList = await getAllLogs();
    
    // Download and aggregate all remote device logs
    const deviceFiles = driveFiles.filter(f => f.name.startsWith('device_') && f.name.endsWith('.json'));
    let allRemoteLogs = [];

    for (const file of deviceFiles) {
      // Don't merge our own remote file (it will be updated at the end)
      if (file.name === `${deviceId}.json`) continue;
      
      try {
        const remoteLogs = await downloadFileContent(token, file.id);
        if (Array.isArray(remoteLogs)) {
          // Extract remote device ID from filename
          const fileDeviceId = file.name.replace('.json', '');
          const mappedLogs = remoteLogs.map((log) => {
            const mapped = { ...log };
            if (!mapped.deviceSeconds || Object.keys(mapped.deviceSeconds).length === 0) {
              mapped.deviceSeconds = { [fileDeviceId]: log.seconds || 0 };
            }
            if (!mapped.deviceActiveSeconds || Object.keys(mapped.deviceActiveSeconds).length === 0) {
              mapped.deviceActiveSeconds = { [fileDeviceId]: log.activeSeconds || 0 };
            }
            if (!mapped.deviceContextSwitches || Object.keys(mapped.deviceContextSwitches).length === 0) {
              mapped.deviceContextSwitches = { [fileDeviceId]: log.contextSwitches || 0 };
            }
            return mapped;
          });
          allRemoteLogs = allRemoteLogs.concat(mappedLogs);
        }
      } catch (err) {
        console.warn(`Failed to download remote file ${file.name}, skipping:`, err);
      }
    }

    // Perform merge passing local deviceId
    const mergedLogs = mergeLogs(localLogsList, allRemoteLogs, deviceId);

    // Save fully merged dataset to local IndexedDB
    for (const record of mergedLogs) {
      await saveLog(record);
    }

    // 3. Upload Updates
    // Upload/Update settings.json
    if (settingsFile) {
      await updateDriveFile(token, settingsFile.id, finalSettings);
    } else {
      await createDriveFile(token, 'settings.json', finalSettings);
    }

    // Upload/Update our device's logs
    const ourDeviceFile = driveFiles.find(f => f.name === `${deviceId}.json`);
    if (ourDeviceFile) {
      await updateDriveFile(token, ourDeviceFile.id, mergedLogs);
    } else {
      await createDriveFile(token, `${deviceId}.json`, mergedLogs);
    }

    // Update settings with last sync timestamp
    const lastSyncTime = new Date().toISOString();
    await updateSettings({ lastSyncTime });

    return { success: true, lastSyncTime };
  } catch (error) {
    console.error('Synchronization failed:', error);
    throw error;
  }
}
