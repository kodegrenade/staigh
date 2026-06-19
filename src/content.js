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
  let { limitMinutes, secondsToday, isPaused, theme } = initialConfig;
  let intervalId = null;

  // 1. Create root element in host DOM
  const rootDiv = document.createElement('div');
  rootDiv.id = 'staigh-countdown-widget-root';
  rootDiv.style.position = 'fixed';
  rootDiv.style.zIndex = '2147483647';
  
  // Starting defaults
  let top = 20;
  let left = window.innerWidth - 160;

  // Retrieve last saved coordinates for this domain
  chrome.storage.local.get(['widgetPos'], (result) => {
    if (result.widgetPos && result.widgetPos[domain]) {
      const savedPos = result.widgetPos[domain];
      // Bound check saved coordinates in case screen resized
      top = Math.max(0, Math.min(savedPos.top, window.innerHeight - 50));
      left = Math.max(0, Math.min(savedPos.left, window.innerWidth - 150));
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

  // Drag Handle dots
  const dragHandle = document.createElement('div');
  dragHandle.className = 'staigh-widget-drag-handle';
  for (let i = 0; i < 6; i++) {
    const dot = document.createElement('div');
    dot.className = 'staigh-widget-dot';
    dragHandle.appendChild(dot);
  }
  widget.appendChild(dragHandle);

  // Timer Display area
  const display = document.createElement('div');
  display.className = 'staigh-widget-display';

  const label = document.createElement('div');
  label.className = 'staigh-widget-label';
  label.innerText = 'Limit';
  display.appendChild(label);

  const timer = document.createElement('div');
  timer.className = 'staigh-widget-timer';
  timer.innerText = '--:--';
  display.appendChild(timer);

  widget.appendChild(display);

  // Minimize/Hide button
  const closeBtn = document.createElement('div');
  closeBtn.className = 'staigh-widget-close';
  closeBtn.innerText = '×';
  closeBtn.title = 'Dismiss Countdown';
  closeBtn.onclick = () => {
    rootDiv.style.display = 'none';
    if (intervalId) clearInterval(intervalId);
  };
  widget.appendChild(closeBtn);

  shadow.appendChild(widget);

  // 3. Draggable Functionality
  let isDragging = false;
  let startX = 0, startY = 0;
  let startLeft = 0, startTop = 0;

  dragHandle.addEventListener('mousedown', (e) => {
    isDragging = true;
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
    const width = rootDiv.offsetWidth || 120;
    const height = rootDiv.offsetHeight || 38;

    newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - width));
    newTop = Math.max(0, Math.min(newTop, window.innerHeight - height));

    rootDiv.style.left = newLeft + 'px';
    rootDiv.style.top = newTop + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;

      // Save position to storage
      const rect = rootDiv.getBoundingClientRect();
      chrome.storage.local.get(['widgetPos'], (result) => {
        const widgetPos = result.widgetPos || {};
        widgetPos[domain] = { top: rect.top, left: rect.left };
        chrome.storage.local.set({ widgetPos });
      });
    }
  });

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
    if (remaining <= 0) {
      widget.classList.remove('warning-time');
      widget.classList.add('expired-time');
    } else if (remaining < 300) { // < 5 minutes left
      widget.classList.add('warning-time');
      widget.classList.remove('expired-time');
    } else {
      widget.classList.remove('warning-time');
      widget.classList.remove('expired-time');
    }
  }

  // Initial layout draw
  updateWidgetUI();

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
    } else if (message.action === 'settingsChanged') {
      const nextLimit = message.settings.limits?.[domain];
      if (nextLimit === undefined) {
        // Limit was removed for this domain -> destroy widget
        rootDiv.style.display = 'none';
        if (intervalId) clearInterval(intervalId);
      } else {
        // Limits or config properties updated
        limitMinutes = nextLimit;
        isPaused = message.settings.isPaused;
        theme = message.settings.theme || 'dark';

        // Reapply container theme class
        widget.className = `staigh-widget-container ${theme}-theme`;
        updateWidgetUI();
      }
    }
  });
}
