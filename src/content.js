// Content Script for Staigh Floating Countdown Widget

const domain = window.location.hostname.replace(/^www\./, '').toLowerCase();

// Query background script on startup to check if a daily limit is configured for this site
if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.sendMessage({ action: 'checkLimit', domain }, (response) => {
    if (response && response.hasLimit) {
      initWidget(response);
    }
  });
}

function initWidget(initialConfig) {
  let { limitMinutes, secondsToday, isPaused, theme, snoozeCount } = initialConfig;
  snoozeCount = Number(snoozeCount) || 0;
  limitMinutes = Number(limitMinutes) || 0;
  secondsToday = Number(secondsToday) || 0;
  let intervalId = null;

  // 1. Create root element in host DOM
  const rootDiv = document.createElement('div');
  rootDiv.id = 'staigh-countdown-widget-root';
  rootDiv.style.position = 'fixed';
  rootDiv.style.zIndex = '2147483647';
  
  // Starting defaults
  let top = 20;
  let left = window.innerWidth - 180;

  // Retrieve last saved coordinates for this domain
  chrome.storage.local.get(['widgetPos'], (result) => {
    if (result.widgetPos && result.widgetPos[domain]) {
      const savedPos = result.widgetPos[domain];
      // Bound check saved coordinates in case screen resized
      top = Math.max(0, Math.min(savedPos.top, window.innerHeight - 80));
      left = Math.max(0, Math.min(savedPos.left, window.innerWidth - 180));
    }
    rootDiv.style.top = top + 'px';
    rootDiv.style.left = left + 'px';
  });

  document.body.appendChild(rootDiv);

  // 2. Create isolated Shadow DOM
  const shadow = rootDiv.attachShadow({ mode: 'open' });

  // Link stylesheet from extension bundle
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = chrome.runtime.getURL('content.css');
  shadow.appendChild(stylesheet);

  // Widget Container
  const widget = document.createElement('div');
  widget.className = `staigh-widget-container ${theme}-theme`;

  // Create static sub-elements
  // Drag Handle dots
  const dragHandle = document.createElement('div');
  dragHandle.className = 'staigh-widget-drag-handle';
  for (let i = 0; i < 6; i++) {
    const dot = document.createElement('div');
    dot.className = 'staigh-widget-dot';
    dragHandle.appendChild(dot);
  }

  // Brand title
  const brand = document.createElement('span');
  brand.className = 'staigh-widget-brand';
  brand.innerText = 'staigh';

  // Brand label
  const label = document.createElement('span');
  label.className = 'staigh-widget-label';
  label.innerText = 'Limit';

  // Timer Display
  const timer = document.createElement('div');
  timer.className = 'staigh-widget-timer';
  timer.innerText = '--:--';

  // Progress Bar
  const progressBarBg = document.createElement('div');
  progressBarBg.className = 'staigh-widget-progress-bg';
  const progressBarFill = document.createElement('div');
  progressBarFill.className = 'staigh-widget-progress-fill';
  progressBarBg.appendChild(progressBarFill);

  // Detail text
  const detailText = document.createElement('span');
  detailText.className = 'staigh-widget-detail-text';

  // Snooze Button
  const snoozeBtn = document.createElement('button');
  snoozeBtn.className = 'staigh-widget-snooze';
  snoozeBtn.innerText = 'Snooze';
  snoozeBtn.title = 'Snooze +10m (Max 3/day)';
  snoozeBtn.onclick = () => {
    chrome.runtime.sendMessage({ action: 'snoozeDomain', domain }, (res) => {
      if (res && res.success) {
        snoozeCount = Number(res.snoozeCount) || 0;
        limitMinutes = Number(res.limitMinutes) || 0;
        updateWidgetUI();
      }
    });
  };

  // Close Button
  const closeBtn = document.createElement('button');
  closeBtn.className = 'staigh-widget-close';
  closeBtn.innerText = '×';
  closeBtn.title = 'Dismiss Countdown';
  closeBtn.onclick = () => {
    rootDiv.style.display = 'none';
    if (intervalId) clearInterval(intervalId);
  };

  // Collapse / Expand Button
  const collapseBtn = document.createElement('button');
  collapseBtn.className = 'staigh-widget-collapse-btn';
  collapseBtn.title = 'Toggle Expand/Collapse';

  // SVG icons
  const chevronLeftSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`;
  const chevronRightSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`;

  let isCollapsed = false;

  // Retrieve collapse preference
  chrome.storage.local.get(['widgetCollapse'], (result) => {
    if (result.widgetCollapse && result.widgetCollapse[domain]) {
      isCollapsed = true;
    }
    updateLayout();
  });

  function toggleCollapse() {
    isCollapsed = !isCollapsed;
    chrome.storage.local.get(['widgetCollapse'], (result) => {
      const widgetCollapse = result.widgetCollapse || {};
      if (isCollapsed) {
        widgetCollapse[domain] = true;
      } else {
        delete widgetCollapse[domain];
      }
      chrome.storage.local.set({ widgetCollapse });
    });
    updateLayout();
  }

  collapseBtn.onclick = toggleCollapse;

  function updateLayout() {
    // Clear widget contents and rebuild
    widget.innerHTML = '';

    if (isCollapsed) {
      widget.className = `staigh-widget-container ${theme}-theme is-collapsed`;
      
      // Brand group with brand and label
      const brandGroup = document.createElement('div');
      brandGroup.className = 'staigh-widget-brand-group';
      brandGroup.appendChild(brand);
      brandGroup.appendChild(label);

      // Compact layout: dragHandle, brandGroup, timer, collapseBtn
      widget.appendChild(dragHandle);
      widget.appendChild(brandGroup);
      widget.appendChild(timer);
      
      collapseBtn.innerHTML = chevronLeftSVG;
      widget.appendChild(collapseBtn);
    } else {
      widget.className = `staigh-widget-container ${theme}-theme`;

      // Top bar
      const topBar = document.createElement('div');
      topBar.className = 'staigh-widget-top-bar';
      topBar.appendChild(dragHandle);
      topBar.appendChild(brand);

      const actionArea = document.createElement('div');
      actionArea.className = 'staigh-widget-action-area';
      collapseBtn.innerHTML = chevronRightSVG;
      actionArea.appendChild(collapseBtn);
      actionArea.appendChild(closeBtn);
      topBar.appendChild(actionArea);

      widget.appendChild(topBar);

      // Timer
      widget.appendChild(timer);

      // Progress bar
      widget.appendChild(progressBarBg);

      // Bottom bar
      const bottomBar = document.createElement('div');
      bottomBar.className = 'staigh-widget-bottom-bar';
      bottomBar.appendChild(detailText);
      bottomBar.appendChild(snoozeBtn);

      widget.appendChild(bottomBar);
    }
    updateWidgetUI();
  }

  shadow.appendChild(widget);

  // 3. Draggable Functionality
  let isDragging = false;
  let startX = 0, startY = 0;
  let startLeft = 0, startTop = 0;

  dragHandle.addEventListener('mousedown', (e) => {
    isDragging = true;
    widget.classList.add('staigh-is-dragging');
    startX = e.clientX;
    startY = e.clientY;

    const rect = rootDiv.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;

    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    let newLeft = startLeft + dx;
    let newTop = startTop + dy;

    // Viewport boundaries constrain
    const width = rootDiv.offsetWidth || (isCollapsed ? 180 : 160);
    const height = rootDiv.offsetHeight || (isCollapsed ? 38 : 76);

    newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - width));
    newTop = Math.max(0, Math.min(newTop, window.innerHeight - height));

    rootDiv.style.left = newLeft + 'px';
    rootDiv.style.top = newTop + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      widget.classList.remove('staigh-is-dragging');

      // Save position to storage
      const rect = rootDiv.getBoundingClientRect();
      chrome.storage.local.get(['widgetPos'], (result) => {
        const widgetPos = result.widgetPos || {};
        widgetPos[domain] = { top: rect.top, left: rect.left };
        chrome.storage.local.set({ widgetPos });
      });
    }
  });

  // Ghost Mode hover listeners removed (disabled based on feedback)

  // 4. Timer Rendering and Ticking
  function formatWidgetTime(secsRemaining) {
    if (secsRemaining <= 0) return "Time's Up!";

    const hours = Math.floor(secsRemaining / 3600);
    const mins = Math.floor((secsRemaining % 3600) / 60);
    const secs = Math.floor(secsRemaining % 60);

    if (hours > 0) {
      return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function formatSpentText(spentSecs, limitSecs) {
    const spentMins = Math.round(spentSecs / 60);
    const limitMins = Math.round(limitSecs / 60);
    return `${spentMins}m / ${limitMins}m`;
  }

  function updateWidgetUI() {
    if (isPaused) {
      widget.classList.add('paused-state');
      timer.innerText = 'Paused';
      return;
    }
    widget.classList.remove('paused-state');

    const limitSeconds = limitMinutes * 60;
    const remaining = Math.max(0, limitSeconds - secondsToday);

    timer.innerText = formatWidgetTime(remaining);

    // Apply color warning thresholds
    widget.classList.remove('warning-time', 'expired-time');
    progressBarFill.classList.remove('warning-fill', 'expired-fill');

    if (remaining <= 0) {
      widget.classList.add('expired-time');
      progressBarFill.classList.add('expired-fill');
    } else if (remaining < 300) { // < 5 minutes left
      widget.classList.add('warning-time');
      progressBarFill.classList.add('warning-fill');
    }

    // Toggle snooze button visibility
    if (snoozeCount < 3 && remaining <= 300) {
      snoozeBtn.style.display = '';
      snoozeBtn.innerText = `Snooze (${3 - snoozeCount})`;
    } else {
      snoozeBtn.style.display = 'none';
    }

    // Update progress bar fill width and details text (only in expanded mode)
    if (!isCollapsed) {
      const percentage = limitSeconds > 0 ? Math.min(100, (secondsToday / limitSeconds) * 100) : 0;
      progressBarFill.style.width = `${percentage}%`;
      detailText.innerText = formatSpentText(secondsToday, limitSeconds);
    }
  }

  // Initial layout draw (triggered inside updateLayout after preference load)

  // Run local 1-second ticker for smooth ticking
  intervalId = setInterval(() => {
    if (!isPaused) {
      secondsToday += 1;
      updateWidgetUI();
    }
  }, 1000);

  // 5. Message Listeners for background sync and setting changes
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'syncTime') {
      // Sync local ticker with official background database state
      secondsToday = message.secondsToday;
      updateWidgetUI();
    } else if (message.action === 'snoozeApplied') {
      snoozeCount = Number(message.snoozeCount) || 0;
      limitMinutes = Number(message.limitMinutes) || 0;
      updateWidgetUI();
    } else if (message.action === 'settingsChanged') {
      const nextLimit = message.settings.limits?.[domain];
      if (nextLimit === undefined) {
        // Limit was removed for this domain -> destroy widget
        rootDiv.style.display = 'none';
        if (intervalId) clearInterval(intervalId);
      } else {
        // Limits or config properties updated
        snoozeCount = Number(snoozeCount) || 0;
        limitMinutes = Number(nextLimit) + (snoozeCount * 10);
        isPaused = message.settings.isPaused;
        theme = message.settings.theme || 'dark';

        // Reapply container theme class
        widget.className = `staigh-widget-container ${theme}-theme${isCollapsed ? ' is-collapsed' : ''}`;
        updateWidgetUI();
      }
    }
  });
}
