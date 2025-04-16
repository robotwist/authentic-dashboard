/**
 * options.js - Handles the extension settings page logic
 */

import authDashboardAPI from './api_client.js';

// Default settings
const DEFAULT_SETTINGS = {
  apiKey: '',
  apiUrl: '',
  autoCollect: false,
  autoCollectInterval: 30,
  collectSponsored: true,
  maxPosts: 25,
  enableFacebook: true,
  enableInstagram: true,
  enableLinkedin: true,
  collectEngagement: true,
  collectUserInfo: true,
  collectImages: true,
  enableDebug: false,
  showNotifications: true
};

// DOM elements
const apiKeyInput = document.getElementById('api-key');
const apiUrlInput = document.getElementById('api-url');
const saveApiKeyBtn = document.getElementById('save-api-key');
const autoCollectCheckbox = document.getElementById('auto-collect');
const autoCollectIntervalInput = document.getElementById('auto-collect-interval');
const autoCollectIntervalGroup = document.getElementById('auto-collect-interval-group');
const collectSponsoredCheckbox = document.getElementById('collect-sponsored');
const maxPostsInput = document.getElementById('max-posts');
const enableFacebookCheckbox = document.getElementById('enable-facebook');
const enableInstagramCheckbox = document.getElementById('enable-instagram');
const enableLinkedinCheckbox = document.getElementById('enable-linkedin');
const collectEngagementCheckbox = document.getElementById('collect-engagement');
const collectUserInfoCheckbox = document.getElementById('collect-user-info');
const collectImagesCheckbox = document.getElementById('collect-images');
const enableDebugCheckbox = document.getElementById('enable-debug');
const showNotificationsCheckbox = document.getElementById('show-notifications');
const clearDataBtn = document.getElementById('clear-data');
const exportDataBtn = document.getElementById('export-data');
const importDataBtn = document.getElementById('import-data');
const saveAllBtn = document.getElementById('save-all');
const viewDashboardLink = document.getElementById('view-dashboard');
const statusMessage = document.getElementById('status-message');
const statusBar = document.querySelector('.status-bar');

// Initialize the options page
document.addEventListener('DOMContentLoaded', () => {
  // Load saved settings
  loadSettings();
  
  // Set up event listeners
  setupEventListeners();
});

/**
 * Load saved settings from storage
 */
function loadSettings() {
  chrome.storage.sync.get(['settings'], (result) => {
    const settings = result.settings || DEFAULT_SETTINGS;
    
    // Apply settings to form
    apiKeyInput.value = settings.apiKey || '';
    apiUrlInput.value = settings.apiUrl || '';
    autoCollectCheckbox.checked = settings.autoCollect || false;
    autoCollectIntervalInput.value = settings.autoCollectInterval || 30;
    collectSponsoredCheckbox.checked = settings.collectSponsored !== false;
    maxPostsInput.value = settings.maxPosts || 25;
    enableFacebookCheckbox.checked = settings.enableFacebook !== false;
    enableInstagramCheckbox.checked = settings.enableInstagram !== false;
    enableLinkedinCheckbox.checked = settings.enableLinkedin !== false;
    collectEngagementCheckbox.checked = settings.collectEngagement !== false;
    collectUserInfoCheckbox.checked = settings.collectUserInfo !== false;
    collectImagesCheckbox.checked = settings.collectImages !== false;
    enableDebugCheckbox.checked = settings.enableDebug || false;
    showNotificationsCheckbox.checked = settings.showNotifications !== false;
    
    // Show/hide dependent settings
    toggleDependentSettings();
  });
}

/**
 * Set up event listeners for form elements
 */
function setupEventListeners() {
  // Save API key
  saveApiKeyBtn.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    if (apiKey) {
      saveApiKey(apiKey);
    } else {
      showStatus('API key cannot be empty', 'error');
    }
  });
  
  // Toggle dependent settings when auto-collect changes
  autoCollectCheckbox.addEventListener('change', toggleDependentSettings);
  
  // Save all settings
  saveAllBtn.addEventListener('click', saveAllSettings);
  
  // Clear data button
  clearDataBtn.addEventListener('click', clearCollectedData);
  
  // Export settings
  exportDataBtn.addEventListener('click', exportSettings);
  
  // Import settings
  importDataBtn.addEventListener('click', importSettings);
  
  // View dashboard
  viewDashboardLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: authDashboardAPI.getDashboardUrl() });
  });
}

/**
 * Save the API key
 * @param {string} apiKey - The API key to save
 */
function saveApiKey(apiKey) {
  chrome.storage.sync.get(['settings'], (result) => {
    const settings = result.settings || DEFAULT_SETTINGS;
    settings.apiKey = apiKey;
    
    chrome.storage.sync.set({ settings }, () => {
      // Test the API connection
      authDashboardAPI.setApiKey(apiKey);
      authDashboardAPI.checkAvailability()
        .then(isConnected => {
          if (isConnected) {
            showStatus('API key saved and connection verified');
          } else {
            showStatus('API key saved but connection failed', 'error');
          }
        })
        .catch(error => {
          showStatus(`API connection error: ${error.message}`, 'error');
        });
    });
  });
}

/**
 * Save all settings
 */
function saveAllSettings() {
  const settings = {
    apiKey: apiKeyInput.value.trim(),
    apiUrl: apiUrlInput.value.trim(),
    autoCollect: autoCollectCheckbox.checked,
    autoCollectInterval: parseInt(autoCollectIntervalInput.value, 10) || 30,
    collectSponsored: collectSponsoredCheckbox.checked,
    maxPosts: parseInt(maxPostsInput.value, 10) || 25,
    enableFacebook: enableFacebookCheckbox.checked,
    enableInstagram: enableInstagramCheckbox.checked,
    enableLinkedin: enableLinkedinCheckbox.checked,
    collectEngagement: collectEngagementCheckbox.checked,
    collectUserInfo: collectUserInfoCheckbox.checked,
    collectImages: collectImagesCheckbox.checked,
    enableDebug: enableDebugCheckbox.checked,
    showNotifications: showNotificationsCheckbox.checked
  };
  
  // Validate settings
  if (settings.autoCollect && (settings.autoCollectInterval < 5 || settings.autoCollectInterval > 60)) {
    showStatus('Collection interval must be between 5 and 60 minutes', 'error');
    return;
  }
  
  if (settings.maxPosts < 10 || settings.maxPosts > 100) {
    showStatus('Max posts must be between 10 and 100', 'error');
    return;
  }
  
  // Save settings
  chrome.storage.sync.set({ settings }, () => {
    showStatus('All settings saved successfully');
    
    // Update API client if API settings changed
    if (settings.apiKey) {
      authDashboardAPI.setApiKey(settings.apiKey);
    }
    if (settings.apiUrl) {
      authDashboardAPI.setApiUrl(settings.apiUrl);
    }
    
    // Notify background script of settings change
    chrome.runtime.sendMessage({ action: 'settingsUpdated', settings });
  });
}

/**
 * Clear all collected data
 */
function clearCollectedData() {
  if (confirm('Are you sure you want to clear all collected data? This cannot be undone.')) {
    chrome.storage.local.remove(['collectionStats', 'processedPosts'], () => {
      showStatus('All collected data has been cleared');
    });
  }
}

/**
 * Export settings to a JSON file
 */
function exportSettings() {
  chrome.storage.sync.get(['settings'], (result) => {
    const settings = result.settings || DEFAULT_SETTINGS;
    const dataStr = JSON.stringify(settings, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    
    const exportFileDefaultName = 'authentic_dashboard_settings.json';
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  });
}

/**
 * Import settings from a JSON file
 */
function importSettings() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  
  input.addEventListener('change', (event) => {
    const file = event.target.files[0];
    
    if (file) {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const settings = JSON.parse(e.target.result);
          
          // Validate the settings object
          if (!settings || typeof settings !== 'object') {
            throw new Error('Invalid settings file');
          }
          
          // Apply the settings
          chrome.storage.sync.set({ settings }, () => {
            showStatus('Settings imported successfully');
            loadSettings(); // Reload the form
          });
        } catch (error) {
          showStatus(`Import error: ${error.message}`, 'error');
        }
      };
      
      reader.readAsText(file);
    }
  });
  
  input.click();
}

/**
 * Toggle visibility of dependent settings
 */
function toggleDependentSettings() {
  if (autoCollectCheckbox.checked) {
    autoCollectIntervalGroup.style.display = 'block';
  } else {
    autoCollectIntervalGroup.style.display = 'none';
  }
}

/**
 * Show status message
 * @param {string} message - Message to display
 * @param {string} type - Message type ('success' or 'error')
 */
function showStatus(message, type = 'success') {
  statusMessage.textContent = message;
  statusBar.className = 'status-bar visible';
  
  if (type === 'error') {
    statusBar.classList.add('error');
  } else {
    statusBar.classList.remove('error');
  }
  
  // Hide after 5 seconds
  setTimeout(() => {
    statusBar.classList.remove('visible');
  }, 5000);
} 