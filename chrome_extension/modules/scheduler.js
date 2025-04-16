/**
 * scheduler.js - Sets up scheduled tasks for the extension
 */

import { recordError } from './error_handling.js';

// Constants for scheduler
const ALARM_KEYS = {
  CLEANUP: 'cache-cleanup',
  API_CHECK: 'api-check',
  COLLECT: 'auto-collect'
};

/**
 * Set up scheduled tasks for the extension
 */
export function setupScheduledTasks() {
  try {
    console.log("Setting up scheduled tasks...");
    
    // Clear any existing alarms
    chrome.alarms.clearAll();
    
    // Set up cache cleanup alarm (every 24 hours)
    chrome.alarms.create(ALARM_KEYS.CLEANUP, {
      periodInMinutes: 24 * 60 // 24 hours
    });
    
    // Set up API check alarm (every 30 minutes)
    chrome.alarms.create(ALARM_KEYS.API_CHECK, {
      periodInMinutes: 30
    });
    
    // Set up listener for alarms
    chrome.alarms.onAlarm.addListener(handleAlarm);
    
    // Set up auto-collection based on settings
    setupAutoCollection();
    
    console.log("Scheduled tasks initialized");
  } catch (error) {
    console.error("Error setting up scheduled tasks:", error);
    recordError('extension', error, { component: 'scheduler_setup' });
  }
}

/**
 * Set up auto collection based on user settings
 */
function setupAutoCollection() {
  chrome.storage.sync.get(['settings'], (result) => {
    const settings = result.settings || {};
    
    if (settings.autoCollect) {
      const interval = settings.autoCollectInterval || 30;
      
      // Create alarm for auto collection
      chrome.alarms.create(ALARM_KEYS.COLLECT, {
        periodInMinutes: interval
      });
      
      console.log(`Auto-collection scheduled every ${interval} minutes`);
    } else {
      // Make sure no auto-collect alarm exists if disabled
      chrome.alarms.clear(ALARM_KEYS.COLLECT);
      console.log("Auto-collection disabled");
    }
  });
}

/**
 * Handle alarm events
 * @param {Object} alarm - Alarm object
 */
function handleAlarm(alarm) {
  console.log(`Alarm triggered: ${alarm.name}`);
  
  try {
    switch (alarm.name) {
      case ALARM_KEYS.CLEANUP:
        cleanupCache();
        break;
      case ALARM_KEYS.API_CHECK:
        checkApiStatus();
        break;
      case ALARM_KEYS.COLLECT:
        triggerAutoCollection();
        break;
      default:
        console.warn(`Unknown alarm: ${alarm.name}`);
    }
  } catch (error) {
    console.error(`Error handling alarm ${alarm.name}:`, error);
    recordError('extension', error, { component: 'scheduler_alarm' });
  }
}

/**
 * Clean up old cache data
 */
function cleanupCache() {
  console.log("Performing cache cleanup...");
  
  // Clean up old error reports (older than 30 days)
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  
  chrome.storage.local.get(['pendingErrorReports'], (result) => {
    const reports = result.pendingErrorReports || [];
    const filteredReports = reports.filter(report => report.timestamp >= thirtyDaysAgo);
    
    if (reports.length !== filteredReports.length) {
      chrome.storage.local.set({ pendingErrorReports: filteredReports });
      console.log(`Removed ${reports.length - filteredReports.length} old error reports`);
    }
  });
  
  // Reset daily stats if day has changed
  const today = new Date().toDateString();
  
  chrome.storage.local.get(['lastStatsReset', 'collectionStats'], (result) => {
    const lastReset = result.lastStatsReset;
    const stats = result.collectionStats || {};
    
    if (lastReset !== today) {
      // Reset today's stats for all platforms
      Object.keys(stats).forEach(platform => {
        if (stats[platform]) {
          stats[platform].today = 0;
        }
      });
      
      chrome.storage.local.set({
        collectionStats: stats,
        lastStatsReset: today
      });
      
      console.log("Daily stats have been reset");
    }
  });
}

/**
 * Check API status
 */
function checkApiStatus() {
  console.log("Checking API status...");
  
  // Import dynamically to avoid circular dependencies
  import('./api-client.js').then(module => {
    module.checkApiAvailability()
      .then(available => {
        console.log(`API status check complete. Available: ${available}`);
      })
      .catch(error => {
        console.error("Error checking API status:", error);
      });
  }).catch(error => {
    console.error("Error importing API client module:", error);
  });
}

/**
 * Trigger auto collection on supported sites
 */
function triggerAutoCollection() {
  console.log("Auto-collection triggered");
  
  // Check if we're on a supported site
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs[0]) return;
    
    const currentUrl = tabs[0].url;
    const supportedPlatforms = [
      { name: 'facebook', pattern: /facebook\.com/ },
      { name: 'instagram', pattern: /instagram\.com/ },
      { name: 'linkedin', pattern: /linkedin\.com/ }
    ];
    
    const matchedPlatform = supportedPlatforms.find(p => p.pattern.test(currentUrl));
    
    if (matchedPlatform) {
      console.log(`Auto-collecting from ${matchedPlatform.name}...`);
      
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'autoCollect',
        platform: matchedPlatform.name
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.log("Content script not ready:", chrome.runtime.lastError);
          return;
        }
        
        console.log("Auto-collection response:", response);
      });
    }
  });
} 