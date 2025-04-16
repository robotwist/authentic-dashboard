/**
 * installation.js - Installation and update handling for Authentic Dashboard
 * 
 * Handles extension installation, updates, and initialization.
 */

import { DEFAULT_SETTINGS } from './settings.js';
import { showNotification } from './notifications.js';
import { scheduledCacheCleanup } from './stats.js';

/**
 * Handle extension installation
 */
function handleInstallation() {
  // Set default settings
  chrome.storage.local.get(['settings'], function(result) {
    if (!result.settings) {
      chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
      console.log("Default settings initialized");
    }
  });
  
  // Show welcome notification
  showNotification(
    'Welcome to Authentic Dashboard',
    'Thanks for installing! Click to open the onboarding page.'
  );
}

/**
 * Handle extension update
 * @param {string} previousVersion - Previous extension version
 * @param {string} currentVersion - Current extension version
 */
function handleUpdate(previousVersion, currentVersion) {
  console.log(`Extension updated from ${previousVersion} to ${currentVersion}`);
  
  // Check if API endpoint exists, if not add it
  chrome.storage.local.get(['settings'], function(result) {
    if (result.settings && !result.settings.apiEndpoint) {
      result.settings.apiEndpoint = DEFAULT_SETTINGS.apiEndpoint;
      chrome.storage.local.set({ settings: result.settings });
      console.log("Added API endpoint to settings");
    }
  });
  
  // Show update notification
  showNotification(
    'Authentic Dashboard Updated',
    `Version ${currentVersion} has been installed with new features and improvements.`
  );
}

/**
 * Reset API availability status
 */
function resetApiAvailabilityStatus() {
  console.log("Resetting API availability status");
  chrome.storage.local.set({
    apiAvailable: undefined,
    apiLastCheck: 0
  }, function() {
    console.log("API availability status has been reset");
  });
}

/**
 * Setup extension installation and update handlers
 */
function setupInstallationHandlers() {
  // Listen for installation and update events
  chrome.runtime.onInstalled.addListener(function(details) {
    if (details.reason === 'install') {
      handleInstallation();
    } else if (details.reason === 'update') {
      const previousVersion = details.previousVersion;
      const currentVersion = chrome.runtime.getManifest().version;
      handleUpdate(previousVersion, currentVersion);
    }
    
    // Always reset API availability status on install or update
    resetApiAvailabilityStatus();
    
    // Only clean on update, not first install (nothing to clean on first install)
    if (details.reason === 'update') {
      console.log("Extension updated - performing cache cleanup");
      setTimeout(scheduledCacheCleanup, 5000);
    }
  });
  
  // Also reset API status on browser startup
  chrome.runtime.onStartup.addListener(function() {
    console.log("Extension starting up - resetting API availability status");
    resetApiAvailabilityStatus();
    
    // Perform cache cleanup on startup
    console.log("Extension starting up - performing cache cleanup");
    setTimeout(scheduledCacheCleanup, 5000);
  });
  
  // Handle authentication redirects more efficiently
  chrome.webNavigation.onBeforeNavigate.addListener(
    function(details) {
      // Check if this is a navigation to accounts/login/
      if (details.url.includes('/accounts/login/')) {
        // Create the correct login URL
        const correctLoginUrl = details.url.replace('/accounts/login/', '/login/');
        console.log('Fixing login URL redirect:', correctLoginUrl);
        
        // Update the tab to the correct URL
        chrome.tabs.update(details.tabId, {url: correctLoginUrl});
      }
    },
    {url: [{urlContains: 'localhost:8000/accounts/login'}]}
  );
}

export {
  setupInstallationHandlers,
  resetApiAvailabilityStatus
}; 