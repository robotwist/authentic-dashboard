/**
 * scanner.js - Auto-scanning functionality for Authentic Dashboard
 * 
 * Handles automatic scanning of supported platforms.
 */

import { updateStats } from './stats.js';
import { showNotification } from './notifications.js';
import { safeApiFetch } from './utils.js';

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
  // Determine platform from URL
  const platform = getPlatformFromUrl(url);
  
  if (platform === 'unknown') {
    return;
  }
  
  // Execute content script to collect posts
  chrome.tabs.sendMessage(tabId, {
    action: 'collectPosts',
    platform: platform,
    settings: {
      advancedML: settings.advancedML,
      collectSponsored: settings.collectSponsored
    }
  }, function(response) {
    // Handle connection errors
    if (chrome.runtime.lastError) {
      console.error('Auto-scan error:', chrome.runtime.lastError);
      // Don't proceed with sending data if there was an error
      return;
    }
    
    if (!response || !response.posts) {
      console.error('Invalid response from content script');
      return;
    }
    
    const posts = response.posts;
    
    // Send posts to backend API
    sendPostsToAPI(posts, platform, settings);
  });
}

/**
 * Function to send posts to backend API
 * @param {Array} posts - Posts to send
 * @param {string} platform - Platform name
 * @param {Object} settings - Extension settings
 */
function sendPostsToAPI(posts, platform, settings) {
  if (!posts || posts.length === 0) {
    return;
  }
  
  // Get API settings
  chrome.storage.local.get(['apiKey', 'apiEndpoint'], function(result) {
    const apiKey = result.apiKey;
    const apiEndpoint = result.apiEndpoint || 'http://127.0.0.1:8000';
    
    // Send the posts to the API
    safeApiFetch(`${apiEndpoint}/api/collect-posts/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
      },
      body: JSON.stringify({
        platform: platform,
        posts: posts
      })
    })
    .then(result => {
      if (result.success) {
        // Update stats
        updateStats(platform, posts.length);
        
        // Show notification if enabled
        if (settings.showNotifications) {
          showNotification(
            'Authentic Dashboard', 
            `Auto-scan: Collected ${posts.length} posts from ${platform}.`
          );
        }
      } else {
        console.error('Failed to send posts:', result.message);
      }
    })
    .catch(error => {
      console.error('Error sending posts:', error);
      
      if (settings.showNotifications) {
        showNotification(
          'Error', 
          `Failed to send posts: ${error.message}`,
          'error'
        );
      }
    });
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
  
  console.log(`Scheduling auto-scan every ${intervalMinutes} minutes`);
  
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
        console.log(`Auto-scanning tab: ${tab.url}`);
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