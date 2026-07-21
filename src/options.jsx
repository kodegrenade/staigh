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
  Clock,
  Lock,
  Eye,
  AlertTriangle,
  Sun,
  Moon,
  Pencil,
  Cloud,
} from 'lucide-react';
import {
  getLogsInRange,
  getSettings,
  updateSettings,
  exportData,
  importData,
  clearAllLogs,
} from './db.js';
import { runSyncCycle, logout } from './sync.js';
import './options.css';

const CHART_COLORS = ['#a78bfa', '#818cf8', '#60a5fa', '#34d399', '#fbbf24', '#f472b6', '#2dd4bf'];

function formatLimitDuration(mins) {
  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;
  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h`;
  }
  return `${minutes}m`;
}

const CATEGORY_MAP = {
  // Productivity & Work
  'github.com': 'Productivity & Work',
  'stackoverflow.com': 'Productivity & Work',
  'notion.so': 'Productivity & Work',
  'figma.com': 'Productivity & Work',
  'slack.com': 'Productivity & Work',
  'trello.com': 'Productivity & Work',
  'asana.com': 'Productivity & Work',
  'jira.com': 'Productivity & Work',
  'zoom.us': 'Productivity & Work',
  'meet.google.com': 'Productivity & Work',
  'docs.google.com': 'Productivity & Work',
  'drive.google.com': 'Productivity & Work',
  'gitlab.com': 'Productivity & Work',
  'bitbucket.org': 'Productivity & Work',
  'npmjs.com': 'Productivity & Work',
  'npmjs.org': 'Productivity & Work',
  'canva.com': 'Productivity & Work',
  'linear.app': 'Productivity & Work',

  // Social & Communication
  'x.com': 'Social & Communication',
  'twitter.com': 'Social & Communication',
  'reddit.com': 'Social & Communication',
  'facebook.com': 'Social & Communication',
  'instagram.com': 'Social & Communication',
  'linkedin.com': 'Social & Communication',
  'tiktok.com': 'Social & Communication',
  'whatsapp.com': 'Social & Communication',
  'telegram.org': 'Social & Communication',
  'discord.com': 'Social & Communication',
  'messenger.com': 'Social & Communication',
  'pinterest.com': 'Social & Communication',

  // Entertainment & Streaming
  'youtube.com': 'Entertainment & Streaming',
  'netflix.com': 'Entertainment & Streaming',
  'spotify.com': 'Entertainment & Streaming',
  'twitch.tv': 'Entertainment & Streaming',
  'soundcloud.com': 'Entertainment & Streaming',
  'hulu.com': 'Entertainment & Streaming',
  'vimeo.com': 'Entertainment & Streaming',
  'disneyplus.com': 'Entertainment & Streaming',

  // Learning & Reference
  'wikipedia.org': 'Learning & Reference',
  'w3schools.com': 'Learning & Reference',
  'developer.mozilla.org': 'Learning & Reference',
  'dev.to': 'Learning & Reference',
  'medium.com': 'Learning & Reference',
  'substack.com': 'Learning & Reference',
  'coursera.org': 'Learning & Reference',
  'udemy.com': 'Learning & Reference',
  'stackexchange.com': 'Learning & Reference',
  'khanacademy.org': 'Learning & Reference',

  // Utility & Shopping
  'google.com': 'Utility & Shopping',
  'amazon.com': 'Utility & Shopping',
  'ebay.com': 'Utility & Shopping',
  'yahoo.com': 'Utility & Shopping',
  'bing.com': 'Utility & Shopping',
  'duckduckgo.com': 'Utility & Shopping',
  'paypal.com': 'Utility & Shopping',
  'stripe.com': 'Utility & Shopping',
};

const CATEGORY_COLORS = {
  'Productivity & Work': '#a78bfa',
  'Social & Communication': '#60a5fa',
  'Entertainment & Streaming': '#f472b6',
  'Learning & Reference': '#34d399',
  'Utility & Shopping': '#fbbf24',
  'Other': '#94a3b8',
};

const PERSONAS = {
  PRODUCTIVITY: {
    title: 'Focus Maestro',
    subtitle: 'Productivity Enthusiast',
    description: 'You are highly focused! The majority of your browsing time was spent on work, coding, and productivity tools.',
    color: '#a78bfa',
    className: 'purple-theme',
  },
  SOCIAL: {
    title: 'Social Butterfly',
    subtitle: 'Communication Centric',
    description: 'You are highly connected! A significant part of your time was dedicated to social networks and messaging platforms.',
    color: '#60a5fa',
    className: 'blue-theme',
  },
  ENTERTAINMENT: {
    title: 'Media Streamer',
    subtitle: 'Leisure Seeker',
    description: 'You love media! Video streams, music, and entertainment sites captured a large share of your browsing session.',
    color: '#f472b6',
    className: 'pink-theme',
  },
  LEARNING: {
    title: 'Knowledge Scholar',
    subtitle: 'Deep Researcher',
    description: 'Curious and inquisitive! You spent a lot of time reading reference guides, documentation, and educational materials.',
    color: '#34d399',
    className: 'green-theme',
  },
  BALANCED: {
    title: 'Balanced Navigator',
    subtitle: 'Well-Rounded Surfer',
    description: 'Everything in moderation. You maintained an excellent balance between work, learning, and leisure browsing.',
    color: '#94a3b8',
    className: 'slate-theme',
  },
};

function getDomainCategory(domain, overrides = {}, classified = {}) {
  if (!domain) return 'Other';
  const cleanDomain = domain.split('/')[0].toLowerCase();

  // Tier 3: User Overrides (check exact first, then suffix)
  if (overrides[cleanDomain]) {
    return overrides[cleanDomain];
  }
  const overrideMatch = Object.keys(overrides).find(key => 
    cleanDomain === key || cleanDomain.endsWith('.' + key)
  );
  if (overrideMatch) {
    return overrides[overrideMatch];
  }

  // Tier 1: Suffix Dictionary Lookup
  const dictMatch = Object.keys(CATEGORY_MAP).find(key => 
    cleanDomain === key || cleanDomain.endsWith('.' + key)
  );
  if (dictMatch) {
    return CATEGORY_MAP[dictMatch];
  }

  // Tier 2.1: Classified cache from metadata descriptions
  if (classified[cleanDomain]) {
    return classified[cleanDomain];
  }
  const classifiedMatch = Object.keys(classified).find(key => 
    cleanDomain === key || cleanDomain.endsWith('.' + key)
  );
  if (classifiedMatch) {
    return classified[classifiedMatch];
  }

  // Tier 2.2: Heuristic regex domain check
  if (cleanDomain.includes('git') || cleanDomain.includes('slack') || cleanDomain.includes('notion') || cleanDomain.includes('jira') || cleanDomain.includes('office') || cleanDomain.includes('workspace')) {
    return 'Productivity & Work';
  }
  if (cleanDomain.includes('social') || cleanDomain.includes('chat') || cleanDomain.includes('mail') || cleanDomain.includes('messenger') || cleanDomain.includes('talk')) {
    return 'Social & Communication';
  }
  if (cleanDomain.includes('stream') || cleanDomain.includes('music') || cleanDomain.includes('tv') || cleanDomain.includes('video') || cleanDomain.includes('game') || cleanDomain.includes('play')) {
    return 'Entertainment & Streaming';
  }
  if (cleanDomain.includes('wiki') || cleanDomain.includes('edu') || cleanDomain.includes('learn') || cleanDomain.includes('doc') || cleanDomain.includes('science') || cleanDomain.includes('research')) {
    return 'Learning & Reference';
  }
  if (cleanDomain.includes('search') || cleanDomain.includes('shop') || cleanDomain.includes('store') || cleanDomain.includes('pay') || cleanDomain.includes('cart')) {
    return 'Utility & Shopping';
  }

  return 'Other';
}

function Options() {
  const [activeTab, setActiveTab] = useState('analytics');
  const [dateRange, setDateRange] = useState('7days'); // 'today', 'yesterday', '7days', '30days', '90days', 'alltime'
  const [logs, setLogs] = useState([]);
  const [settings, setSettings] = useState({
    blacklist: [],
    limits: {},
    isPaused: false,
    fullUrlTrackingDomains: [],
    theme: 'dark',
  });

  // Settings Forms State
  const [newBlacklistDomain, setNewBlacklistDomain] = useState('');
  const [newLimitDomain, setNewLimitDomain] = useState('');
  const [newLimitHours, setNewLimitHours] = useState('');
  const [newLimitMinutes, setNewLimitMinutes] = useState('');
  const [newFullUrlDomain, setNewFullUrlDomain] = useState('');
  const [settingsSearch, setSettingsSearch] = useState('');
  
  // Analytics Table State
  const [analyticsSearch, setAnalyticsSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [selectedChartDomain, setSelectedChartDomain] = useState('all');

  // Status/Alerts State
  const [backupStatus, setBackupStatus] = useState({ type: '', message: '', card: '' });
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState({ show: false, type: '', target: '' });

  function showBackupStatus(card, type, message) {
    setBackupStatus({ card, type, message });
    setTimeout(() => {
      setBackupStatus({ card: '', type: '', message: '' });
    }, 4000);
  }

  // Load configuration and data
  useEffect(() => {
    loadSettings();
  }, []);

  // Listen for storage settings updates to sync in real-time, and visibility changes to reload data
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    const handleStorageChange = (changes, areaName) => {
      if (areaName === 'local' && changes.settings) {
        const newSettings = changes.settings.newValue;
        setSettings(newSettings);
        document.documentElement.setAttribute('data-theme', newSettings.theme || 'dark');
      }
    };
    
    const handleFocusChange = () => {
      if (document.visibilityState === 'visible') {
        loadLogs();
        loadSettings();
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    document.addEventListener('visibilitychange', handleFocusChange);
    window.addEventListener('focus', handleFocusChange);

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
      document.removeEventListener('visibilitychange', handleFocusChange);
      window.removeEventListener('focus', handleFocusChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange]);

  useEffect(() => {
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, settings]);

  async function loadSettings() {
    const s = await getSettings();
    setSettings(s);
    document.documentElement.setAttribute('data-theme', s.theme || 'dark');
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
    } else if (dateRange === '90days') {
      startDate = getLocalDateString(89);
    } else if (dateRange === 'alltime') {
      startDate = '1970-01-01';
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
    const subpathTotals = {};

    logs.forEach((log) => {
      // Check if this log entry's target or domain matches any granular tracking entry
      const isTargetTrackedGranular = settings.fullUrlTrackingDomains.some((trackItem) => {
        if (trackItem === log.domain) return true;
        return log.target === trackItem || log.target.startsWith(trackItem + '/');
      });

      if (isTargetTrackedGranular) {
        if (log.isFullUrl) {
          // If the tracking item is a root domain, track all subpaths.
          // Otherwise, match the specific configured subpath.
          const targetMatches = settings.fullUrlTrackingDomains.some((trackItem) => {
            if (trackItem === log.domain) return true;
            return log.target === trackItem || log.target.startsWith(trackItem + '/');
          });

          if (targetMatches) {
            breakdown[log.target] = (breakdown[log.target] || 0) + log.seconds;
            subpathTotals[log.domain] = (subpathTotals[log.domain] || 0) + log.seconds;
          }
        }
      } else {
        if (!log.isFullUrl) {
          breakdown[log.target] = (breakdown[log.target] || 0) + log.seconds;
        }
      }
    });

    // Subtract subpath totals from root domains to prevent double counting
    Object.keys(subpathTotals).forEach((domain) => {
      if (!settings.fullUrlTrackingDomains.includes(domain) && breakdown[domain] !== undefined) {
        breakdown[domain] = Math.max(0, breakdown[domain] - subpathTotals[domain]);
        if (breakdown[domain] === 0) {
          delete breakdown[domain];
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

  // Get top visited untracked domains as suggestions
  const blocklistSuggestions = React.useMemo(() => {
    return siteBreakdown
      .filter((site) => !site.isUrl && !settings.blacklist.includes(site.domain))
      .slice(0, 4);
  }, [siteBreakdown, settings.blacklist]);

  const limitsSuggestions = React.useMemo(() => {
    return siteBreakdown
      .filter((site) => !site.isUrl && settings.limits[site.domain] === undefined)
      .slice(0, 4);
  }, [siteBreakdown, settings.limits]);

  // Filter logs based on search input
  const filteredSites = React.useMemo(() => {
    if (!analyticsSearch.trim()) return siteBreakdown;
    const searchLower = analyticsSearch.toLowerCase();
    return siteBreakdown.filter((site) => site.target.includes(searchLower));
  }, [siteBreakdown, analyticsSearch]);

  // Paginated site breakdown slices
  const paginatedSites = React.useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredSites.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredSites, currentPage]);

  const totalPages = Math.max(1, Math.ceil(filteredSites.length / itemsPerPage));

  // Reset pagination on filter or date range change
  useEffect(() => {
    setCurrentPage(1);
  }, [analyticsSearch, dateRange]);

  // Aggregate time spent per day for the daily trend chart
  const dailyTrendData = React.useMemo(() => {
    const daysMap = {};
    let offsets = [0];

    if (dateRange === 'yesterday') {
      offsets = [1];
    } else if (dateRange === '7days') {
      offsets = Array.from({ length: 7 }, (_, i) => 6 - i);
    } else if (dateRange === '30days') {
      offsets = Array.from({ length: 30 }, (_, i) => 29 - i);
    } else if (dateRange === '90days') {
      offsets = Array.from({ length: 90 }, (_, i) => 89 - i);
    }

    if (dateRange === 'alltime') {
      const logDates = Array.from(new Set(logs.map((log) => log.date))).sort();
      logDates.forEach((dateStr) => {
        const label = new Date(dateStr).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        });
        daysMap[dateStr] = { date: dateStr, label, minutes: 0 };
      });
    } else {
      offsets.forEach((offset) => {
        const dateStr = getLocalDateString(offset);
        const label = new Date(dateStr).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        });
        daysMap[dateStr] = { date: dateStr, label, minutes: 0 };
      });
    }

    logs.forEach((log) => {
      if (!log.isFullUrl && (selectedChartDomain === 'all' || log.domain === selectedChartDomain)) {
        if (daysMap[log.date]) {
          daysMap[log.date].minutes += log.seconds / 60;
        }
      }
    });

    return Object.values(daysMap).map((day) => ({
      ...day,
      minutes: Math.round(day.minutes),
    }));
  }, [logs, dateRange, selectedChartDomain]);

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

  // Browsing Category breakdown Memo
  const categoryBreakdown = React.useMemo(() => {
    const breakdown = {
      'Productivity & Work': 0,
      'Social & Communication': 0,
      'Entertainment & Streaming': 0,
      'Learning & Reference': 0,
      'Utility & Shopping': 0,
      'Other': 0,
    };

    siteBreakdown.forEach((site) => {
      const cat = getDomainCategory(site.domain, settings.categoryOverrides, settings.classifiedDomains);
      breakdown[cat] = (breakdown[cat] || 0) + site.seconds;
    });

    const total = Object.values(breakdown).reduce((sum, val) => sum + val, 0);
    if (total === 0) return [];

    return Object.entries(breakdown)
      .map(([name, seconds]) => ({
        name,
        seconds,
        percentage: Math.round((seconds / total) * 100),
      }))
      .filter((item) => item.seconds > 0)
      .sort((a, b) => b.seconds - a.seconds);
  }, [siteBreakdown, settings.categoryOverrides, settings.classifiedDomains]);

  // Browsing Persona Memo
  const browsingPersona = React.useMemo(() => {
    let totalSecs = 0;
    const breakdown = {
      productivity: 0,
      social: 0,
      entertainment: 0,
      learning: 0,
    };

    let totalSwitches = 0;
    let learningScrollSum = 0;
    let learningCount = 0;
    let socialSeconds = 0;
    let socialScrollSum = 0;
    let socialCount = 0;

    siteBreakdown.forEach((site) => {
      const cat = getDomainCategory(site.domain, settings.categoryOverrides, settings.classifiedDomains);
      totalSecs += site.seconds;

      if (cat === 'Productivity & Work') breakdown.productivity += site.seconds;
      else if (cat === 'Social & Communication') {
        breakdown.social += site.seconds;
        socialSeconds += site.seconds;
      }
      else if (cat === 'Entertainment & Streaming') breakdown.entertainment += site.seconds;
      else if (cat === 'Learning & Reference') breakdown.learning += site.seconds;

      // Find the raw logs for this target
      const domainLogs = logs.filter(log => log.target === site.target);
      const switches = domainLogs.reduce((sum, log) => sum + (log.contextSwitches || 0), 0);
      const maxScroll = domainLogs.reduce((max, log) => Math.max(max, log.scrollMaxPercent || 0), 0);

      if (!site.isUrl) {
        totalSwitches += switches;
      }

      if (cat === 'Learning & Reference') {
        learningScrollSum += maxScroll;
        learningCount++;
      } else if (cat === 'Social & Communication') {
        socialScrollSum += maxScroll;
        socialCount++;
      }
    });

    if (totalSecs === 0) return null;

    const prodPct = (breakdown.productivity / totalSecs) * 100;
    const socialPct = (breakdown.social / totalSecs) * 100;
    const entPct = (breakdown.entertainment / totalSecs) * 100;
    const learnPct = (breakdown.learning / totalSecs) * 100;

    // Focus vs. Leisure ratio
    const focusPct = Math.round(prodPct + learnPct);
    const leisurePct = 100 - focusPct;
    const topSite = siteBreakdown[0] ? siteBreakdown[0].domain : 'None';

    let profile = PERSONAS.BALANCED;
    if (prodPct >= 45) {
      profile = PERSONAS.PRODUCTIVITY;
    } else if (socialPct >= 40) {
      profile = PERSONAS.SOCIAL;
    } else if (entPct >= 40) {
      profile = PERSONAS.ENTERTAINMENT;
    } else if (learnPct >= 30) {
      profile = PERSONAS.LEARNING;
    }

    // Compute dynamic focus flow advice
    const totalHours = totalSecs / 3600;
    const switchesPerHour = totalHours > 0 ? (totalSwitches / totalHours) : 0;
    const avgSocialScroll = socialCount > 0 ? (socialScrollSum / socialCount) : 0;
    const socialMinutes = socialSeconds / 60;
    const socialScrollSpeed = socialMinutes > 0 ? (avgSocialScroll / socialMinutes) : 0;

    let advice = '';
    let adviceClass = 'advice-info';

    if (totalSecs >= 60 && switchesPerHour > 18) {
      advice = `⚠️ High context switching detected (${Math.round(switchesPerHour)} swaps/hr). Try focusing on one tab to reduce mental fatigue.`;
      adviceClass = 'advice-warning';
    } else if (socialSeconds > 120 && socialScrollSpeed > 25 && avgSocialScroll > 60) {
      advice = `⚠️ Doom-scrolling pattern observed. Consider taking a short screen break to reset your focus.`;
      adviceClass = 'advice-warning';
    } else if (totalSecs >= 300 && switchesPerHour < 6 && focusPct >= 50) {
      advice = `✨ Deep flow state achieved! Excellent focus stability and minimal tab swapping.`;
      adviceClass = 'advice-success';
    } else if (learningCount > 0 && (learningScrollSum / learningCount) > 70) {
      advice = `📚 Attentive reading pattern detected. Great job fully absorbing learning resources today.`;
      adviceClass = 'advice-success';
    } else {
      advice = `💡 Balanced browsing rhythm. Remember to take a 5-minute break every hour.`;
      adviceClass = 'advice-info';
    }

    return {
      ...profile,
      focusPct,
      leisurePct,
      topSite,
      advice,
      adviceClass,
    };
  }, [siteBreakdown, logs, settings.categoryOverrides, settings.classifiedDomains]);


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

  function requestDelete(type, target) {
    setDeleteConfirm({ show: true, type, target });
  }

  function cancelDelete() {
    setDeleteConfirm({ show: false, type: '', target: '' });
  }

  async function confirmDelete() {
    const { type, target } = deleteConfirm;
    if (type === 'blacklist') {
      const updated = await updateSettings({
        blacklist: settings.blacklist.filter((item) => item !== target),
      });
      setSettings(updated);
    } else if (type === 'limit') {
      const updatedLimits = { ...settings.limits };
      delete updatedLimits[target];
      const updated = await updateSettings({ limits: updatedLimits });
      setSettings(updated);
    } else if (type === 'granularity') {
      const updated = await updateSettings({
        fullUrlTrackingDomains: settings.fullUrlTrackingDomains.filter((item) => item !== target),
      });
      setSettings(updated);
    }
    cancelDelete();
  }

  function getConfirmText() {
    const { type, target } = deleteConfirm;
    if (type === 'blacklist') {
      return `Are you sure you want to remove "${target}" from your blocklist? Its browsing time will be tracked again.`;
    }
    if (type === 'limit') {
      return `Are you sure you want to delete the daily limit for "${target}"? The floating countdown widget will be removed.`;
    }
    if (type === 'granularity') {
      return `Are you sure you want to disable path-level tracking for "${target}"? All stats will aggregate under the root domain only.`;
    }
    return '';
  }

  function handleEditLimit(domain, totalMinutes) {
    setNewLimitDomain(domain);
    const hrs = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    setNewLimitHours(hrs > 0 ? String(hrs) : '');
    setNewLimitMinutes(mins > 0 ? String(mins) : '');
    
    // Smooth scroll the limit configuration form into view
    const formCard = document.querySelector('.form-card');
    if (formCard) {
      formCard.scrollIntoView({ behavior: 'smooth' });
    }
  }

  async function handleAddLimit() {
    if (!newLimitDomain.trim()) return;
    const domain = newLimitDomain.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '');
    const hours = parseInt(newLimitHours, 10) || 0;
    const minutes = parseInt(newLimitMinutes, 10) || 0;
    const totalMinutes = (hours * 60) + minutes;
    
    if (totalMinutes <= 0) return;

    const updatedLimits = { ...settings.limits, [domain]: totalMinutes };
    const updated = await updateSettings({ limits: updatedLimits });
    setSettings(updated);
    setNewLimitDomain('');
    setNewLimitHours('');
    setNewLimitMinutes('');
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

  async function handleUpdateCategoryOverride(domain, nextCategory) {
    const updatedOverrides = {
      ...(settings.categoryOverrides || {}),
      [domain]: nextCategory,
    };
    const updated = await updateSettings({ categoryOverrides: updatedOverrides });
    setSettings(updated);
  }

  async function handleToggleTheme() {
    const nextTheme = settings.theme === 'light' ? 'dark' : 'light';
    const updated = await updateSettings({ theme: nextTheme });
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
      showBackupStatus('export', 'success', 'Backup exported successfully!');
    } catch (e) {
      console.error('Export failed', e);
      showBackupStatus('export', 'error', 'Export failed: Unable to read database.');
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
        showBackupStatus('import', 'success', 'Data imported successfully!');
      } catch {
        showBackupStatus('import', 'error', 'Import failed: Invalid file format.');
      }
    };
    reader.readAsText(file);
  }

  function handleClearData() {
    setShowClearConfirm(true);
  }

  async function handleConfirmClear() {
    setShowClearConfirm(false);
    await clearAllLogs();
    await loadLogs();
    showBackupStatus('reset', 'success', 'All tracking history has been successfully cleared.');
  }

  const [syncing, setSyncing] = useState(false);

  async function handleConnectSync() {
    setSyncing(true);
    try {
      const result = await runSyncCycle(true);
      if (result.success) {
        const updatedSettings = await getSettings();
        setSettings(updatedSettings);
        showBackupStatus('sync', 'success', 'Successfully connected and synced to Google Drive!');
        loadLogs();
      }
    } catch (err) {
      showBackupStatus('sync', 'error', `Connection failed: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  }

  async function handleSyncNow() {
    setSyncing(true);
    try {
      const result = await runSyncCycle(false);
      if (result.success) {
        const updatedSettings = await getSettings();
        setSettings(updatedSettings);
        showBackupStatus('sync', 'success', 'Database sync completed successfully.');
        loadLogs();
      }
    } catch (err) {
      showBackupStatus('sync', 'error', `Sync failed: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnectSync() {
    setSyncing(true);
    try {
      await logout();
      const updated = await updateSettings({ deviceId: '', lastSyncTime: '' });
      setSettings(updated);
      showBackupStatus('sync', 'success', 'Disconnected from Google Drive sync.');
    } catch (err) {
      showBackupStatus('sync', 'error', `Disconnect failed: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  }

  async function handleToggleCustomCredentials(e) {
    const checked = e.target.checked;
    const updated = await updateSettings({ useCustomCredentials: checked });
    setSettings(updated);
  }

  async function handleCustomClientIdChange(e) {
    const val = e.target.value;
    const updated = await updateSettings({ customClientId: val });
    setSettings(updated);
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

  function formatTimeValue(minutes) {
    if (minutes >= 60) {
      const hrs = Math.floor(minutes / 60);
      const mins = Math.round(minutes % 60);
      return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
    }
    return `${Math.round(minutes)} min`;
  }

  function getFaviconUrl(domain) {
    const host = domain.split('/')[0];
    return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  }

  const isLight = settings.theme === 'light';
  const axisColor = isLight ? '#71717a' : '#a1a1aa';
  const tooltipBg = isLight ? '#ffffff' : '#18181b';
  const tooltipBorder = isLight ? '#e4e4e7' : '#27272a';
  const tooltipText = isLight ? '#09090b' : '#fafafa';

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
          <button className="theme-toggle-btn" onClick={handleToggleTheme}>
            {settings.theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
            <span>{settings.theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>
          </button>
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
                <button
                  className={dateRange === '90days' ? 'active' : ''}
                  onClick={() => setDateRange('90days')}
                >
                  90 Days
                </button>
                <button
                  className={dateRange === 'alltime' ? 'active' : ''}
                  onClick={() => setDateRange('alltime')}
                >
                  All Time
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
                <div className="chart-card-header-flex">
                  <h3>Activity Trend (Minutes)</h3>
                  <select
                    className="chart-domain-select"
                    value={selectedChartDomain}
                    onChange={(e) => setSelectedChartDomain(e.target.value)}
                  >
                    <option value="all">All Sites</option>
                    {Array.from(new Set(logs.map((log) => log.domain))).map((domain) => (
                      <option key={domain} value={domain}>
                        {domain}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="chart-container">
                  {dailyTrendData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={dailyTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <XAxis dataKey="label" stroke={axisColor} fontSize={11} tickLine={false} />
                        <YAxis stroke={axisColor} fontSize={11} tickLine={false} />
                        <Tooltip
                          formatter={(value) => [formatTimeValue(value), 'Time Spent']}
                          contentStyle={{
                            backgroundColor: tooltipBg,
                            borderColor: tooltipBorder,
                            borderRadius: '6px',
                            color: tooltipText,
                          }}
                          labelStyle={{ color: isLight ? '#71717a' : '#a1a1aa', fontWeight: 600 }}
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
                          formatter={(value) => [formatTimeValue(value), 'Time Spent']}
                          contentStyle={{
                            backgroundColor: tooltipBg,
                            borderColor: tooltipBorder,
                            borderRadius: '6px',
                            color: tooltipText,
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
                  {distributionData.map((entry, i) => (
                    <div key={entry.name} className="legend-item">
                      <span className="legend-color-dot" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}></span>
                      <span className="legend-name">{entry.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Persona and Category Profile Row */}
            {browsingPersona && (
              <div className="persona-grid">
                {/* Browsing Persona Card */}
                <div className={`persona-card ${browsingPersona.className}`}>
                  <div className="persona-header">
                    <div className="persona-title-group">
                      <span className="persona-subtitle">{browsingPersona.subtitle}</span>
                      <h2>{browsingPersona.title}</h2>
                    </div>
                    <div className="persona-badge">
                      <div className="persona-badge-glow"></div>
                      <span className="persona-badge-inner">★</span>
                    </div>
                  </div>
                  <p className="persona-description">{browsingPersona.description}</p>
                  
                  <div className="persona-stats-grid">
                    <div className="p-stat">
                      <span className="p-stat-label">Focus Score</span>
                      <span className="p-stat-val">{browsingPersona.focusPct}%</span>
                    </div>
                    <div className="p-stat">
                      <span className="p-stat-label">Leisure Share</span>
                      <span className="p-stat-val">{browsingPersona.leisurePct}%</span>
                    </div>
                    <div className="p-stat">
                      <span className="p-stat-label">Top Domain</span>
                      <span className="p-stat-val text-ellipsis" title={browsingPersona.topSite}>{browsingPersona.topSite}</span>
                    </div>
                  </div>

                  {browsingPersona.advice && (
                    <div className={`persona-advice-line ${browsingPersona.adviceClass}`}>
                      {browsingPersona.advice}
                    </div>
                  )}
                </div>

                {/* Category Profile Card */}
                <div className="chart-card category-card">
                  <h3>Category Profile</h3>
                  <p className="category-subtitle">Time distribution by activity type</p>
                  <div className="category-list">
                    {categoryBreakdown.map((cat) => (
                      <div key={cat.name} className="category-item">
                        <div className="category-meta">
                          <div className="cat-name-dot">
                            <span 
                              className="cat-dot" 
                              style={{ backgroundColor: CATEGORY_COLORS[cat.name] || '#94a3b8' }}
                            ></span>
                            <span className="cat-name-text">{cat.name}</span>
                          </div>
                          <span className="category-percentage-text">{cat.percentage}%</span>
                        </div>
                        <div className="category-progress-bg">
                          <div 
                            className="category-progress-fill" 
                            style={{ 
                              width: `${cat.percentage}%`,
                              backgroundColor: CATEGORY_COLORS[cat.name] || '#94a3b8'
                            }}
                          ></div>
                        </div>
                        <div className="category-duration-text">{formatDuration(cat.seconds)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}



            {/* Sites list grid */}
            <div className="table-card">
              <div className="table-card-header">
                <h3>Detailed breakdown</h3>
                {siteBreakdown.length > 0 && (
                  <div className="search-bar table-search">
                    <Search size={14} />
                    <input
                      type="text"
                      placeholder="Search website logs..."
                      value={analyticsSearch}
                      onChange={(e) => setAnalyticsSearch(e.target.value)}
                    />
                    {analyticsSearch && (
                      <button className="search-clear-btn" onClick={() => setAnalyticsSearch('')}>×</button>
                    )}
                  </div>
                )}
              </div>

              {filteredSites.length === 0 ? (
                <div className="empty-table">
                  {siteBreakdown.length === 0 ? 'No tracking details recorded.' : 'No matching websites found.'}
                </div>
              ) : (
                <>
                  <div className="table-responsive">
                    <table className="analytics-table">
                      <thead>
                        <tr>
                          <th>Website</th>
                          <th>Category</th>
                          <th>Type</th>
                          <th className="align-right">Time Spent</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedSites.map((site) => (
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
                              <select
                                className="table-category-select"
                                value={getDomainCategory(site.domain, settings.categoryOverrides, settings.classifiedDomains)}
                                onChange={(e) => handleUpdateCategoryOverride(site.domain, e.target.value)}
                              >
                                <option value="Productivity & Work">💼 Work</option>
                                <option value="Social & Communication">💬 Social</option>
                                <option value="Entertainment & Streaming">🎥 Media</option>
                                <option value="Learning & Reference">📚 Learn</option>
                                <option value="Utility & Shopping">🛠️ Utility</option>
                                <option value="Other">🌐 Other</option>
                              </select>
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

                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div className="table-pagination">
                      <span className="pagination-info">
                        Showing {((currentPage - 1) * itemsPerPage) + 1}–{Math.min(currentPage * itemsPerPage, filteredSites.length)} of {filteredSites.length} entries
                      </span>
                      <div className="pagination-buttons">
                        <button
                          className="btn-pagination"
                          disabled={currentPage === 1}
                          onClick={() => setCurrentPage((p) => p - 1)}
                        >
                          Prev
                        </button>
                        <span className="pagination-current-page">
                          {currentPage} / {totalPages}
                        </span>
                        <button
                          className="btn-pagination"
                          disabled={currentPage === totalPages}
                          onClick={() => setCurrentPage((p) => p + 1)}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </>
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
              {blocklistSuggestions.length > 0 && (
                <div className="suggestion-strip">
                  <span className="suggestion-title">Suggestions:</span>
                  <div className="suggestion-tags">
                    {blocklistSuggestions.map((site) => (
                      <button
                        key={site.domain}
                        className="suggestion-tag"
                        onClick={() => setNewBlacklistDomain(site.domain)}
                      >
                        {site.domain} ({formatDuration(site.seconds)})
                      </button>
                    ))}
                  </div>
                </div>
              )}
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
                        <button className="btn-delete" onClick={() => requestDelete('blacklist', domain)}>
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
                  style={{ flexGrow: 3 }}
                />
                <input
                  type="number"
                  min="0"
                  max="23"
                  placeholder="Hours"
                  value={newLimitHours}
                  onChange={(e) => setNewLimitHours(e.target.value)}
                  style={{ flexGrow: 1, maxWidth: '100px' }}
                />
                <input
                  type="number"
                  min="0"
                  max="59"
                  placeholder="Mins"
                  value={newLimitMinutes}
                  onChange={(e) => setNewLimitMinutes(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddLimit()}
                  style={{ flexGrow: 1, maxWidth: '100px' }}
                />
                {newLimitDomain.trim() && (
                  <button
                    type="button"
                    className="btn-clear-form"
                    onClick={() => {
                      setNewLimitDomain('');
                      setNewLimitHours('');
                      setNewLimitMinutes('');
                    }}
                  >
                    Clear
                  </button>
                )}
                <button className="btn-add" onClick={handleAddLimit}>
                  <Plus size={16} />
                  <span>
                    {settings.limits[newLimitDomain.trim().toLowerCase()] !== undefined
                      ? 'Update Limit'
                      : 'Set Limit'}
                  </span>
                </button>
              </div>
              {limitsSuggestions.length > 0 && (
                <div className="suggestion-strip">
                  <span className="suggestion-title">Suggestions:</span>
                  <div className="suggestion-tags">
                    {limitsSuggestions.map((site) => (
                      <button
                        key={site.domain}
                        className="suggestion-tag"
                        onClick={() => {
                          setNewLimitDomain(site.domain);
                          setNewLimitHours('');
                          setNewLimitMinutes('');
                        }}
                      >
                        {site.domain} ({formatDuration(site.seconds)})
                      </button>
                    ))}
                  </div>
                </div>
              )}
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
                        <span className="limit-value">{formatLimitDuration(minutes)} / day</span>
                        <div className="actions-wrapper" style={{ display: 'flex', gap: '8px' }}>
                          <button
                            className="btn-edit-item"
                            onClick={() => handleEditLimit(domain, minutes)}
                            title="Edit Limit"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            className="btn-delete"
                            onClick={() => requestDelete('limit', domain)}
                            title="Delete Limit"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
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
                      <button className="btn-delete" onClick={() => requestDelete('granularity', domain)}>
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
                <h3>Local File Backup</h3>
                <p>Export your settings and time logs to a local JSON backup file, or restore data from an existing backup.</p>
                <div className="local-backup-actions">
                  <button className="btn-backup-action" onClick={handleExport}>
                    <span>Export Backup</span>
                  </button>
                  <div className="import-wrapper">
                    <label htmlFor="import-file" className="btn-backup-action import-lbl">
                      <span>Import Backup</span>
                    </label>
                    <input
                      id="import-file"
                      type="file"
                      accept=".json"
                      onChange={handleImport}
                      style={{ display: 'none' }}
                    />
                  </div>
                </div>
                {backupStatus.card === 'export' && backupStatus.message && (
                  <div className={`import-alert ${backupStatus.type}`} style={{ marginTop: '12px' }}>
                    {backupStatus.message}
                  </div>
                )}
                {backupStatus.card === 'import' && backupStatus.message && (
                  <div className={`import-alert ${backupStatus.type}`} style={{ marginTop: '12px' }}>
                    {backupStatus.message}
                  </div>
                )}
              </div>

              <div className="backup-card">
                <div className="backup-icon-wrapper green">
                  <Cloud size={24} />
                </div>
                <h3>Google Drive Cloud Sync</h3>
                <p>Sync settings, limits, and browsing history across multiple desktops using your personal Google Drive.</p>
                
                {settings.lastSyncTime ? (
                  <div className="sync-status-info">
                    <p className="sync-text-status">
                      Authenticated: <strong>{settings.deviceId || 'Primary Device'}</strong>
                    </p>
                    <p className="sync-text-time">
                      Last Synced: <strong>{new Date(settings.lastSyncTime).toLocaleString()}</strong>
                    </p>
                    <div className="sync-actions-group">
                      <button className="btn-backup-action" onClick={handleSyncNow} disabled={syncing}>
                        <span>{syncing ? 'Syncing...' : 'Sync Now'}</span>
                      </button>
                      <button className="btn-backup-action danger" onClick={handleDisconnectSync}>
                        <span>Disconnect</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button className="btn-backup-action" onClick={handleConnectSync} disabled={syncing}>
                      <span>{syncing ? 'Connecting...' : 'Connect Google Drive'}</span>
                    </button>
                    
                    <div className="custom-sync-settings">
                      <label className="custom-sync-checkbox-label">
                        <input
                          type="checkbox"
                          checked={settings.useCustomCredentials || false}
                          onChange={handleToggleCustomCredentials}
                        />
                        <span>Use Custom Credentials</span>
                      </label>
                      
                      {settings.useCustomCredentials && (
                        <div className="custom-sync-input-group">
                          <input
                            type="text"
                            placeholder="OAuth Client ID"
                            value={settings.customClientId || ''}
                            onChange={handleCustomClientIdChange}
                            className="custom-sync-input"
                          />
                          <p className="custom-sync-help">
                            Create an OAuth credential of type <strong>Chrome App/Extension</strong> in Google Cloud Console. Enable Google Drive API, set scope to <code>drive.appdata</code>, and register this Extension ID: <code>{chrome.runtime.id}</code>.
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {backupStatus.card === 'sync' && backupStatus.message && (
                  <div className={`import-alert ${backupStatus.type}`} style={{ marginTop: '12px' }}>
                    {backupStatus.message}
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
                {backupStatus.card === 'reset' && backupStatus.message && (
                  <div className={`import-alert ${backupStatus.type}`} style={{ marginTop: '12px' }}>
                    {backupStatus.message}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Custom Confirmation Modal */}
      {showClearConfirm && (
        <div className="modal-overlay" onClick={() => setShowClearConfirm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon-wrapper">
              <AlertTriangle size={24} className="modal-warning-icon" />
            </div>
            <h2>Delete Tracking History?</h2>
            <p>This action is permanent and cannot be undone. All website time logs will be deleted forever.</p>
            <div className="modal-actions">
              <button className="btn-modal-cancel" onClick={() => setShowClearConfirm(false)}>
                Cancel
              </button>
              <button className="btn-modal-confirm" onClick={handleConfirmClear}>
                Reset Everything
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Delete Confirmation Modal */}
      {deleteConfirm.show && (
        <div className="modal-overlay" onClick={cancelDelete}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon-wrapper">
              <AlertTriangle size={24} className="modal-warning-icon" />
            </div>
            <h2>Confirm Removal</h2>
            <p>{getConfirmText()}</p>
            <div className="modal-actions">
              <button className="btn-modal-cancel" onClick={cancelDelete}>
                Cancel
              </button>
              <button className="btn-modal-confirm" onClick={confirmDelete}>
                Confirm Removal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Render Options dashboard into options root element
const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(<Options />);
}
