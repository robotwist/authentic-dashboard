/**
 * scanner.js - Auto-scanning functionality for Authentic Dashboard
 * 
 * Handles automatic scanning of supported platforms.
 */

import { updateStats } from './stats.js';
import { showNotification } from './notifications.js';
import { safeApiFetch } from './utils.js';
import { sendPostsToAPI } from './api-client.js';

/**
 * Determine platform from URL
 * @param {string} url - URL to check
 * @returns {string} - Platform name or 'unknown'
 */
function getPlatformFromUrl(url) {
  if (url.includes('instagram.com')) {
    return 'instagram';
  } else if (url.includes('facebook.com')) {
    return 'facebook';
  } else if (url.includes('linkedin.com')) {
    return 'linkedin';
  }
  return 'unknown';
}

/**
 * Function to perform auto scan when navigating to supported platforms
 * @param {number} tabId - Tab ID to scan
 * @param {string} url - URL of the tab
 * @param {Object} settings - Extension settings
 */
function performAutoScan(tabId, url, settings) {
  const platform = getPlatformFromUrl(url);
  if (!platform) return;

  // Send message to content script to collect posts
  chrome.tabs.sendMessage(tabId, {
    action: 'collectPosts',
    platform: platform
  }, async response => {
    if (chrome.runtime.lastError) {
      console.error(`[Authentic] Auto-scan error: ${chrome.runtime.lastError.message}`);
      return;
    }

    if (response && response.posts && response.posts.length > 0) {
      try {
        await sendPostsToAPI(response.posts, platform, {
          showNotifications: settings.showNotifications
        });
      } catch (error) {
        console.error('[Authentic] Error in auto-scan:', error);
      }
    }
  });
}

/**
 * Schedule regular auto-scanning
 * @param {Object} settings - Extension settings
 */
function scheduleAutoScan(settings) {
  if (!settings.autoScan) {
    return;
  }
  
  const intervalMinutes = settings.autoScanInterval || 30;
  const intervalMs = intervalMinutes * 60 * 1000;
  
  console.log(`[Authentic] Scheduling auto-scan every ${intervalMinutes} minutes`);
  
  // Set up interval to scan open tabs
  setInterval(() => {
    // Only scan if auto-scan is still enabled
    chrome.storage.local.get(['settings'], function(result) {
      const currentSettings = result.settings || {};
      
      if (currentSettings.autoScan) {
        scanOpenTabs(currentSettings);
      }
    });
  }, intervalMs);
}

/**
 * Scan all open tabs for supported platforms
 * @param {Object} settings - Extension settings
 */
function scanOpenTabs(settings) {
  chrome.tabs.query({}, function(tabs) {
    const supportedPlatforms = ['instagram.com', 'facebook.com', 'linkedin.com'];
    
    tabs.forEach(tab => {
      const isSupported = supportedPlatforms.some(platform => tab.url.includes(platform));
      
      if (isSupported) {
        console.log(`[Authentic] Auto-scanning tab: ${tab.url}`);
        performAutoScan(tab.id, tab.url, settings);
      }
    });
  });
}

export {
  performAutoScan,
  getPlatformFromUrl,
  sendPostsToAPI,
  scheduleAutoScan,
  scanOpenTabs
}; 