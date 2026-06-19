# Contributing to Staigh

Thank you for your interest in contributing to Staigh. As a local-first browser extension, maintaining codebase reliability, speed, and privacy is our primary goal. We welcome contributions that fix bugs, improve performance, or refine the user interface.

## Codebase Architecture

Before writing code, it is helpful to understand how Staigh is structured:

- public/
  - manifest.json: Declares the extension capabilities, permissions, entry scripts, and resources.
  - content.css: Stylesheet loaded within the Shadow DOM context for webpage widgets.
  - icon*.png: Multi-resolution extension logo assets.
- src/
  - db.js: Database abstraction layer wrapping chrome.storage.local (for configuration) and IndexedDB (for high-volume time logs).
  - background.js: Background service worker managing active tabs, tracking focus status, handling idle thresholds, and triggering alarms.
  - content.js: Injected script evaluating limits, mounting the Shadow DOM, and running the draggable floating countdown widget.
  - popup.jsx & popup.css: Dropdown utility toolbar view displaying current metrics and quick controls.
  - options.jsx & options.css: Detailed settings panel and analytical dashboard containing historical charts and export features.
- index.html & options.html: HTML entry points for the React popup and options dashboard.
- vite.config.js: Compiles React components, styles, background scripts, and content scripts into static assets at the dist/ root.

## Local Setup

To set up a local development environment:

1. Fork the repository and clone your fork locally.
2. Install the project dependencies:
   ```bash
   npm install
   ```
3. Run the compiler in build mode to package the files:
   ```bash
   npm run build
   ```
4. Open Google Chrome and navigate to `chrome://extensions/`.
5. Enable "Developer mode" in the top-right corner.
6. Click "Load unpacked" in the top-left and select the compiled `dist/` folder.

To review changes in real-time, you can rebuild the bundle after editing files. The loaded extension will refresh automatically or can be reloaded manually from the Chrome extensions manager.

## Coding Style and Guidelines

### Keep it Local-First
All data must remain on the user's local machine. Do not introduce dependencies that perform network requests to external servers for data processing, analytics tracking, or font loading.

### React Component Styling
We use standard CSS variables for theme management. Ensure any new components:
- Rely on defined theme variables located in the CSS files (e.g., `--bg-card`, `--border-color`, `--purple-accent`).
- Support both Light and Dark modes.
- Avoid introducing inline styling or ad-hoc style helpers.

### Isolation of Injected Code
The content script (`src/content.js`) runs inside the context of general websites. To avoid style pollution or collision with the host page:
- Always wrap injected interface elements in an isolated Shadow DOM.
- Keep the styles defined inside `public/content.css` and load it directly inside the Shadow root.

### Asynchronous APIs
Most Chrome extension APIs and database operations are asynchronous. Wrap database operations inside Promises and handle potential failures gracefully, especially when querying settings or writing logs.

### Linting
Before submitting your changes, run the linter to verify formatting rules are met:
   ```bash
   npm run lint
   ```

## Submitting Pull Requests

1. Create a feature branch off the main branch.
2. Verify that the project builds cleanly using `npm run build` without any compiler warnings or errors.
3. Commit your changes with clear, descriptive commit messages.
4. Push your branch to GitHub and open a Pull Request. Provide a concise summary of what changes were made, why they are needed, and how they were tested.
