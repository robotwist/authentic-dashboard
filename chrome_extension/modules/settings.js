/**
 * settings.js - Settings management for Authentic Dashboard
 * 
 * Handles default settings, storage, and configuration management.
 */

// Default settings
const DEFAULT_SETTINGS = {
  apiKey: '',
  apiEndpoint: 'http://localhost:8000',
  theme: 'light',
  advancedML: true,
  collectSponsored: true,
  showNotifications: true,
  autoScan: false,
  autoScanInterval: 30 // minutes
};

/**
 * Initialize settings with defaults if not already set
 * @returns {Promise} - Resolves when settings are initialized
 */
function initializeSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['settings'], function(result) {
      if (!result.settings) {
        chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
        console.log("Default settings initialized");
        resolve(DEFAULT_SETTINGS);
      } else {
        resolve(result.settings);
      }
    });
  });
}

/**
 * Get all settings from storage
 * @returns {Promise} - Resolves with settings object
 */
function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['settings'], function(result) {
      const settings = result.settings || DEFAULT_SETTINGS;
      resolve(settings);
    });
  });
}

/**
 * Update specific settings
 * @param {Object} updatedSettings - Object with settings to update
 * @returns {Promise} - Resolves with complete updated settings
 */
function updateSettings(updatedSettings) {
  return new Promise((resolve) => {
    getSettings().then(currentSettings => {
      const newSettings = { ...currentSettings, ...updatedSettings };
      
      chrome.storage.local.set({ settings: newSettings }, function() {
        console.log("Settings updated:", updatedSettings);
        resolve(newSettings);
      });
    });
  });
}

/**
 * Reset settings to defaults
 * @returns {Promise} - Resolves when settings are reset
 */
function resetSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.set({ settings: DEFAULT_SETTINGS }, function() {
      console.log("Settings reset to defaults");
      resolve(DEFAULT_SETTINGS);
    });
  });
}

export {
  DEFAULT_SETTINGS,
  initializeSettings,
  getSettings,
  updateSettings,
  resetSettings
}; 