# Staigh

Pronounced like "stay".

Staigh is a local-first Chrome extension designed to make you conscious of where your digital time goes. Instead of relying on abstract cloud services or blocking your favorite websites outright, Staigh focuses on passive awareness, custom daily boundaries, and local-first data integrity. 

By tracking only active browser engagement and displaying a real-time countdown widget on pages with active limits, Staigh gives you the friction you need to build better browsing habits without breaking your workflow.

## The Core Features

### Active Engagement Tracking
Most time trackers count hours simply because a tab is open in the background. Staigh uses window-focus state listeners and idle detection thresholds. If you walk away from your desk for more than sixty seconds, or switch to a different application, the timer pauses automatically. It only counts the time you actually spend looking at and interacting with a page.

### Real-Time Injected Countdown Widget with Snooze
When you set a daily limit for a domain, Staigh injects a sleek, draggable countdown clock directly onto the page.
- It ticks down in real-time, updating every second.
- It remains completely isolated inside a Shadow DOM, meaning the website's CSS cannot distort its styling or layout.
- The widget can be dragged anywhere on the screen, and it automatically remembers its position across page reloads.
- The border turns yellow when you have under five minutes remaining, and pulses red with a "Time's Up!" notification once the limit expires.
- **Snooze Option**: When the timer reaches the warning phase (under 5 minutes) or is fully expired, a **Snooze** button appears on the widget. Clicking it adds 10 minutes to your daily allowance (maximum 3 times per day) and resumes ticking.
- **Bento Collapsible Pill**: To keep your workspace clean, you can collapse the countdown card into a sleek, wide branded horizontal pill showing the drag handle, brand text, limit label, and live digital timer.

### Granular Subpath URL Tracking
You are not restricted to tracking entire root domains. With Staigh, you can track specific subpath URLs (e.g., `github.com/pulls` or `youtube.com/watch`) to monitor time spent on exact parts of a website. The analytics engine automatically groups subpaths independently and adjusts parent root domain logs to prevent double-counting.

### Popup Quick-Controls
Manage your tracking configurations instantly without opening the dashboard. Click the extension toolbar icon to open the popup:
- View today's total active tracking time and your top 4 most-visited sites.
- **Ignore Site**: Quick-block the active site by adding it to the blocklist.
- **Set/Edit Limit**: Configure or adjust the active website's daily time limit directly via an inline popup modal form.
- **Unblock Site**: Instantly remove the active site from the blocklist if it's currently excluded.

### Interactive Dashboard Suggestions
To make configuration faster and easier, suggestion strips are rendered below the forms on the **Blocklist** and **Daily Limits** tabs. These strips show the top 3-4 most-visited, untracked/unlimited domains for today. Clicking a suggestion tag instantly pre-populates the input fields.

### Analytics Chart Drill-Down
The analytical dashboard provides a visual breakdown of your daily activity:
- Daily trend graphs (Recharts Bar chart) and distribution breakdown (Recharts Pie chart) styled with theme-adaptive Carbon-Bento color tokens.
- **Domain Filter**: A dropdown next to the Activity Trend chart allows you to filter historical bar graphs by specific domains, letting you drill down into individual site history.
- **Dynamic Tooltip Formatting**: Hover tooltips on both charts format spent durations in a clean, human-readable `Xh Ym` format once usage exceeds 60 minutes.

### Browsing Personas & Behavioral Insights
Discover your digital personality and gain a deeper awareness of your browsing habits with interactive, gamified profile insights:
- **Your Browsing Persona**: Staigh automatically analyzes your time distribution over any selected duration to assign you one of 5 custom browsing personalities (such as *Focus Maestro*, *Social Butterfly*, *Media Streamer*, *Knowledge Scholar*, or *Balanced Navigator*). Your profile is presented in a sleek, glassmorphic card showcasing your Focus Score, Leisure Ratio, and top visited domain.
- **Visual Category Profile**: See exactly where your hours go with a clean, color-coded dashboard breakdown showing time spent across work, social media, entertainment, learning, and utilities.
- **Smart Offline Categorization**: Websites are classified automatically and privately on your computer (with no network requests) by analyzing page titles and meta descriptions.
- **Customizable Overrides**: You have complete control. If you use a site like YouTube for educational research rather than leisure, you can reassign its category using a simple dropdown next to the domain name. All dashboard metrics and persona charts update reactively in real-time.

### User-Centric Limit Controls
- Setting hours and minutes is separated into clean input fields, compiling the total daily limit on the fly.
- When configuring a domain that already has a limit, the action copy changes automatically to **Update Limit** instead of "Set Limit".
- Custom confirmation modal overlays protect against accidental deletions of blocklist items or limits, avoiding unstyled browser alerts.

### Dynamic Theme Synchronization
The interface comes with responsive Light and Dark themes. Toggling the theme from the popup or the dashboard instantly updates all active interfaces, including any currently visible countdown widgets on webpage tabs.

### Completely Local Data
Staigh does not send your browsing history to external servers. Configuration settings are stored in local extension storage, while high-volume time logs are saved in IndexedDB. You can export a JSON backup of your records or wipe the database clean at any time. The Data & Backup page handles messaging smartly with auto-clearing, contextual success and error message boxes.

## Getting Started

### Local Installation
Since Staigh is currently in development, you can load it as an unpacked extension in Google Chrome.

#### Option 1: Load a Pre-packaged Release (Recommended)
1. Download the latest `staigh-extension.zip` file from the Releases page on GitHub.
2. Extract the zip archive to a local folder on your computer.
3. Open Google Chrome and navigate to `chrome://extensions/`.
4. Enable "Developer mode" using the toggle in the top-right corner.
5. Click "Load unpacked" in the top-left corner and select the extracted folder.

#### Option 2: Build From Source
If you want to compile the project yourself:
1. Clone or download this repository.
2. Install dependencies and compile the code from the root directory:
   ```bash
   npm install
   npm run build
   ```
3. Open Google Chrome and navigate to `chrome://extensions/`.
4. Enable "Developer mode" using the toggle in the top-right corner.
5. Click "Load unpacked" in the top-left corner and select the compiled `dist` folder.


## How to Use Staigh

### Tracking Control
Click the Staigh icon in your toolbar to view the quick popup. From here, you can see your total active time for the day, review your top four most-visited sites, temporarily pause or resume tracking globally, and perform quick block/limit adjustments on the active page.

### Setting Daily Limits
1. Open the dashboard by clicking "View Dashboard" in the popup footer, or by right-clicking the extension icon and selecting "Options".
2. Navigate to the "Daily Limits" tab.
3. Select a domain from the **Suggestions** strip, or enter the domain name and specify the maximum allowance in hours and minutes.
4. Click **Set Limit** (or **Update Limit** if it already exists). The injected countdown widget will appear on that website during your next visit.

### Exclude Specific Sites
If you do not want to record time spent on local development environments or search engines, go to the "Blocklist" tab in the dashboard, click a tag from the **Suggestions** list, or enter the domain name manually, and click **Exclude Domain**. Staigh will ignore them completely.

### Manage Data & Cloud Sync
Under the "Data & Backup" tab, you can manage your database records and synchronize them across multiple devices:
- **Local File Backup**: Export your entire tracking history and settings to a JSON file, or restore configurations by importing an existing backup. Restoring is safe and retains your active device's identity and sync settings.
- **Google Drive Cloud Sync**: Sync settings, daily limits, blocklists, tracking granularity, and historical logs across all your computers using a sandboxed `appDataFolder` on your personal Google Drive.
- **Factory Reset**: Permanently delete all configuration, blocklists, limits, and historical records with a confirmation modal prompt.

#### Privacy-First Google Cloud Sync Setup
To preserve user privacy and complete data sovereignty, Staigh operates with zero central servers or developer credentials. Users set up their own personal Google OAuth Client ID in under 2 minutes:
1. Open [Google Cloud Console](https://console.cloud.google.com/), create a project, and enable the **Google Drive API**.
2. Configure your OAuth consent screen (*User Type: External*, add scope `drive.appdata`, and add your Google email address as a *Test User*).
3. Create Credentials -> OAuth Client ID -> Select Application type **Web application**.
4. Click **ADD URI** under *Authorized redirect URIs* and paste your extension's Redirect URI (copied directly from the Staigh dashboard):
   `https://<extension-id>.chromiumapp.org/provider_cb`
5. Click **SAVE** at the bottom of the page, paste your generated Client ID into Staigh, and click **Connect Google Drive**.

## Contributing

We welcome contributions to Staigh. Please read our [Contributing Guide](https://github.com/kodegrenade/staigh/blob/main/CONTRIBUTING.md) to understand the codebase architecture, setup instructions, and coding standards.

## License

Staigh is open-source software licensed under the MIT License. See the [LICENSE](https://github.com/kodegrenade/staigh/blob/main/LICENSE) file for the full license text.
