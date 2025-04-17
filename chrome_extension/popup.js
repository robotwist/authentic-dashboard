/**
 * popup.js - Handles the extension popup UI interactions
 */

// Instead of import statements, we'll define these as global variables
let authDashboardAPI = null;
let recordError = function(context, error) {
  console.error(`Error (${context}):`, error);
};

// DOM elements
let statusIndicator, statusText, facebookCount, instagramCount, linkedinCount;
let collectButtons, settingsBtn, dashboardBtn, notification, notificationMessage, notificationClose;
let insightsTabBtn, settingsTabBtn, transparencyTabBtn;
let serverConnected = false;
let connectionErrorMessage = '';

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Popup initialized');
  
  // Load API client through a script tag (should be already loaded via popup.html)
  try {
    // Try to get the API client from the global scope or initialize a simple one
    if (window.authDashboardAPI) {
      authDashboardAPI = window.authDashboardAPI;
      console.log('Using authDashboardAPI from global scope');
    } else {
      console.warn('authDashboardAPI not found in global scope, creating a simple one');
      authDashboardAPI = {
        checkAvailability: async function(force = false) {
          try {
            // Simple implementation that tries to ping the server
            const response = await fetch('http://localhost:8000/health-check/', {
              method: 'GET',
              headers: {
                'Accept': 'application/json',
                'Cache-Control': 'no-cache'
              }
            });
            return response.ok;
          } catch (error) {
            console.error('Error checking API availability:', error);
            return false;
          }
        },
        getDashboardUrl: function() {
          return 'http://localhost:8000/dashboard/';
        },
        setApiKey: function(apiKey) {
          console.log('Setting API key:', apiKey);
          this.apiKey = apiKey;
        }
      };
    }
    
    // Try to get recordError from global scope
    if (window.recordError) {
      recordError = window.recordError;
    }
  } catch (error) {
    console.error('Error initializing API client:', error);
  }
  
  // Initialize DOM elements
  initializeElements();
  
  // Check API connection right away
  checkAPIConnection();
  
  // Load post counts
  updatePostCounts();
  
  // Set up event listeners for all buttons
  setupEventListeners();
  
  // Make sure tab buttons work
  setupTabButtons();
  
  // Debug element presence
  console.log('Settings button found:', settingsBtn !== null);
  console.log('Dashboard button found:', dashboardBtn !== null);
  
  // Load icons safely
  loadIconsSafely();
});

/**
 * Initialize DOM element references
 */
function initializeElements() {
  console.log('Initializing DOM elements');
  
  // Find all the required elements
  statusIndicator = document.getElementById('status-indicator');
  statusText = document.getElementById('status-text');
  facebookCount = document.getElementById('facebook-count');
  instagramCount = document.getElementById('instagram-count');
  linkedinCount = document.getElementById('linkedin-count');
  collectButtons = document.querySelectorAll('.collect-btn');
  settingsBtn = document.getElementById('settings-btn');
  dashboardBtn = document.getElementById('dashboard-btn');
  notification = document.getElementById('notification');
  notificationMessage = document.getElementById('notification-message');
  notificationClose = document.getElementById('notification-close');
  insightsTabBtn = document.getElementById('insightsTabBtn');
  settingsTabBtn = document.getElementById('settingsTabBtn');
  transparencyTabBtn = document.getElementById('transparencyTabBtn');
  
  // Log missing elements for debugging
  if (!statusIndicator) console.warn('Missing element: status-indicator');
  if (!statusText) console.warn('Missing element: status-text');
  if (!facebookCount) console.warn('Missing element: facebook-count');
  if (!instagramCount) console.warn('Missing element: instagram-count');
  if (!linkedinCount) console.warn('Missing element: linkedin-count');
  if (!settingsBtn) console.warn('Missing element: settings-btn');
  if (!dashboardBtn) console.warn('Missing element: dashboard-btn');
  if (!notification) console.warn('Missing element: notification');
  if (!notificationMessage) console.warn('Missing element: notification-message');
  if (!notificationClose) console.warn('Missing element: notification-close');
  
  if (!collectButtons || collectButtons.length === 0) {
    console.warn('No collect buttons found');
  }
}

/**
 * Unified function to update status in the UI
 * @param {string} status - Status text to display
 * @param {string} type - Status type: 'success', 'error', 'warning', 'checking', etc.
 * @param {Object} options - Additional options
 * @param {string} options.detail - Additional detail text to display
 * @param {boolean} options.showNotification - Whether to show a notification
 * @param {boolean} options.showTroubleshooting - Whether to show troubleshooting tips
 * @param {Error} options.error - Error object if there was an error
 */
function updateStatus(status, type = 'default', options = {}) {
  console.log(`Status update: ${status} (${type})`, options);
  
  // Default options
  const defaults = {
    detail: '',
    showNotification: false,
    showTroubleshooting: false,
    error: null
  };
  
  // Merge options with defaults
  options = { ...defaults, ...options };
  
  // Update status indicator if it exists
  if (statusIndicator) {
    statusIndicator.className = 'status-indicator';
    
    // Add appropriate class based on type
    switch (type) {
      case 'success':
        statusIndicator.classList.add('connected');
        break;
      case 'error':
        statusIndicator.classList.add('disconnected');
        break;
      case 'warning':
        statusIndicator.classList.add('warning');
        break;
      case 'checking':
        statusIndicator.classList.add('checking');
        break;
      default:
        // Default styling
        break;
    }
  }
  
  // Update status text if it exists
  if (statusText) {
    if (options.detail) {
      statusText.innerHTML = `${status}<br><span class="error-details">${options.detail}</span>`;
    } else {
      statusText.textContent = status;
    }
  }
  
  // Update generic status element if it exists
  const statusElement = document.getElementById('status');
  if (statusElement) {
    statusElement.textContent = status;
    statusElement.className = 'status';
    statusElement.classList.add(type);
  }
  
  // Show notification if requested
  if (options.showNotification && notification && notificationMessage) {
    notificationMessage.textContent = status;
    notification.className = 'notification show';
    
    if (type) {
      notification.classList.add(type);
    }
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
      notification.classList.remove('show');
    }, 5000);
  }
  
  // Show troubleshooting tips if requested
  if (options.showTroubleshooting && type === 'error') {
    showServerTroubleshootingTips();
  }
  
  // Store connection status globally if this was a connection check
  if (status.includes('Connected') || status.includes('connection')) {
    serverConnected = type === 'success';
    if (options.error) {
      connectionErrorMessage = options.error.message || 'Unknown error';
    }
  }
  
  // Store error information in local storage if there was an error
  if (options.error) {
    chrome.storage.local.set({
      connectionError: options.error.message || 'Unknown error',
      lastErrorTimestamp: Date.now()
    });
  }
}

/**
 * Check API connection status - improved and simplified
 */
async function checkAPIConnection() {
  try {
    // Update UI to show we're checking
    updateStatus('Checking connection...', 'checking');
    
    console.log('Checking API connection...');
    
    // Remove existing retry button if any
    const existingRetryBtn = document.querySelector('.retry-btn');
    if (existingRetryBtn) {
      existingRetryBtn.remove();
    }
    
    // Set a timeout for the API check to prevent UI from hanging
    // Add a safety check for authDashboardAPI
    if (!authDashboardAPI) {
      console.error('API client not properly initialized');
      updateStatus('Connection error', 'error', {
        detail: 'API client not properly initialized. Try reloading the extension.',
        showNotification: true,
        showTroubleshooting: true,
        error: new Error('API client not initialized')
      });
      return;
    }
    
    // Set a timeout for the connection check
    let isTimedOut = false;
    const timeout = setTimeout(() => {
      isTimedOut = true;
      updateStatus('Connection timed out', 'error', {
        detail: 'Server did not respond within 15 seconds',
        showNotification: true,
        showTroubleshooting: true,
        error: new Error('Connection check timed out after 15 seconds')
      });
      
      // Add retry button
      addRetryButton();
      
      // Check if server is running
      checkIfServerRunning();
    }, 15000);
    
    // Try to check API availability
    let isConnected = false;
    try {
      if (typeof authDashboardAPI.checkAvailability === 'function') {
        // The proper way
        isConnected = await authDashboardAPI.checkAvailability(true);
      } else {
        // Fallback method
        isConnected = await fetch('http://localhost:8000/health-check/', {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          }
        }).then(response => response.ok).catch(() => false);
      }
    } catch (connectionError) {
      console.error('Error during connection check:', connectionError);
      if (!isTimedOut) {
        clearTimeout(timeout);
        updateStatus('Connection error', 'error', {
          detail: connectionError.message || 'Error checking API connection',
          showNotification: true,
          showTroubleshooting: true,
          error: connectionError
        });
        addRetryButton();
        checkIfServerRunning();
      }
      return;
    }
    
    // Clear the timeout if we got a response
    clearTimeout(timeout);
    
    // If we're already timed out, don't update UI again
    if (isTimedOut) return;
    
    console.log('Connection check result:', isConnected);
    
    if (isConnected) {
      // Success - update status and enable UI
      updateStatus('Connected', 'success', {
        showNotification: true,
        showTroubleshooting: false
      });
      
      // Remove any troubleshooting tips
      const troubleshootingTips = document.getElementById('troubleshooting-tips');
      if (troubleshootingTips) {
        troubleshootingTips.remove();
      }
      
      // Make sure buttons are enabled
      enableAllButtons();
    } else {
      // Failed - show error and troubleshooting
      chrome.storage.local.get(['connectionError'], (result) => {
        const errorMsg = result.connectionError || 'Unable to connect to server';
        
        updateStatus('Not connected', 'error', {
          detail: errorMsg,
          showNotification: true,
          showTroubleshooting: true,
          error: new Error(errorMsg)
        });
        
        // Check if Django server is actually running
        checkIfServerRunning();
        
        // Add a retry button
        addRetryButton();
      });
    }
  } catch (error) {
    console.error('Unexpected error checking API connection:', error);
    
    updateStatus('Connection error', 'error', {
      detail: error.message || 'Unexpected error checking connection',
      showNotification: true,
      showTroubleshooting: true,
      error: error
    });
    
    // Check server status
    checkIfServerRunning();
    
    // Add a retry button
    addRetryButton();
  }
}

/**
 * Add a retry button to the status container
 */
function addRetryButton() {
  // Only add the button if it doesn't already exist
  if (!document.querySelector('.retry-btn')) {
    const retryButton = document.createElement('button');
    retryButton.textContent = 'Retry';
    retryButton.className = 'retry-btn';
    retryButton.addEventListener('click', () => {
      updateStatus('Retrying connection...', 'warning', {showNotification: true});
      checkAPIConnection();
    });
    
    const statusContainer = document.querySelector('.status-container');
    if (statusContainer) {
      statusContainer.appendChild(retryButton);
    }
  }
}

/**
 * Try to check if the Django server is actually running
 */
function checkIfServerRunning() {
  try {
    // Try to fetch the Django server root page directly (no extension API)
    fetch('http://localhost:8000/', {
      method: 'GET',
      mode: 'no-cors', // This allows us to at least detect if the server is responding
      cache: 'no-cache',
      signal: AbortSignal.timeout(5000)
    })
    .then(response => {
      console.log('Server ping response:', response);
      
      // If we got any response, show a notification
      updateStatus('Django server appears to be running, but API connection failed', 'warning', {
        detail: 'The server is responding but the API endpoint may be misconfigured',
        showNotification: true
      });
    })
    .catch(error => {
      console.error('Server ping failed:', error);
      updateStatus('Django server may not be running', 'error', {
        detail: 'Make sure your Django server is running on http://localhost:8000',
        showNotification: true
      });
    });
  } catch (error) {
    console.error('Error checking server:', error);
  }
}

/**
 * Enable all buttons in the UI
 */
function enableAllButtons() {
  // Enable collect buttons
  collectButtons.forEach(button => {
    button.disabled = false;
    button.classList.remove('disabled');
  });
  
  // Enable footer buttons
  if (settingsBtn) {
    settingsBtn.disabled = false;
    settingsBtn.classList.remove('disabled');
  }
  
  if (dashboardBtn) {
    dashboardBtn.disabled = false;
    dashboardBtn.classList.remove('disabled');
  }
  
  // Enable tab buttons
  if (insightsTabBtn) insightsTabBtn.disabled = false;
  if (settingsTabBtn) settingsTabBtn.disabled = false;
  if (transparencyTabBtn) transparencyTabBtn.disabled = false;
  
  // Remove any disabled classes
  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.classList.remove('disabled');
    btn.disabled = false;
  });
}

/**
 * Set up tab buttons functionality
 */
function setupTabButtons() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      // Remove active class from all buttons
      tabButtons.forEach(btn => btn.classList.remove('active'));
      
      // Add active class to clicked button
      button.classList.add('active');
      
      // Hide all tab contents
      tabContents.forEach(content => content.classList.remove('active'));
      
      // Show content for active tab
      const tabId = button.id.replace('Btn', '');
      document.getElementById(tabId).classList.add('active');
    });
  });
}

/**
 * Display server troubleshooting tips in the UI
 */
function showServerTroubleshootingTips() {
  // Create or get the troubleshooting container
  let troubleshootingContainer = document.getElementById('troubleshooting-tips');
  
  if (!troubleshootingContainer) {
    troubleshootingContainer = document.createElement('div');
    troubleshootingContainer.id = 'troubleshooting-tips';
    troubleshootingContainer.className = 'troubleshooting-container';
    
    // Create the content
    troubleshootingContainer.innerHTML = `
      <h3>Connection Troubleshooting</h3>
      <div class="troubleshooting-steps">
        <div class="step">
          <div class="step-number">1</div>
          <div class="step-content">
            <h4>Check Server Status</h4>
            <p>Make sure the Django server is running:</p>
            <code>python manage.py runserver</code>
          </div>
        </div>
        <div class="step">
          <div class="step-number">2</div>
          <div class="step-content">
            <h4>Verify API URL</h4>
            <p>Current URL: <span id="current-api-url">Loading...</span></p>
            <button id="edit-api-url" class="btn btn-sm">Edit URL</button>
          </div>
        </div>
        <div class="step">
          <div class="step-number">3</div>
          <div class="step-content">
            <h4>Check Health Endpoint</h4>
            <p>Your server must have a working health-check endpoint.</p>
            <button id="check-server-btn" class="btn btn-secondary">Open Server in Browser</button>
          </div>
        </div>
        <div class="step">
          <div class="step-number">4</div>
          <div class="step-content">
            <h4>Advanced Troubleshooting</h4>
            <a href="#" id="open-test-connection">Open Connection Test Tool</a>
          </div>
        </div>
      </div>
    `;
    
    // Add it to the DOM
    const contentArea = document.querySelector('.content-area');
    if (contentArea) {
      contentArea.prepend(troubleshootingContainer);
      
      // Show the current API URL
      chrome.storage.sync.get(['settings'], (result) => {
        const settings = result.settings || {};
        const apiUrl = settings.apiUrl || 'http://localhost:8000';
        document.getElementById('current-api-url').textContent = apiUrl;
      });
      
      // Add event listener to the check server button
      document.getElementById('check-server-btn').addEventListener('click', () => {
        // Open a new tab to the server base URL to manually check
        chrome.storage.sync.get(['settings'], (result) => {
          const settings = result.settings || {};
          const apiUrl = settings.apiUrl || 'http://localhost:8000';
          chrome.tabs.create({ url: apiUrl });
        });
      });
      
      // Add event listener to edit URL button
      document.getElementById('edit-api-url').addEventListener('click', () => {
        openApiUrlEditor();
      });
      
      // Add event listener to connection test tool link
      document.getElementById('open-test-connection').addEventListener('click', (event) => {
        event.preventDefault();
        chrome.tabs.create({ url: chrome.runtime.getURL('test_connection.html') });
      });
    }
  }
}

/**
 * Open a modal to edit the API URL
 */
function openApiUrlEditor() {
  // Create modal for editing API URL
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <h3>Edit API URL</h3>
      <div class="form-group">
        <label for="api-url-input">API URL:</label>
        <input type="text" id="api-url-input" placeholder="http://localhost:8000">
      </div>
      <div class="button-group">
        <button id="save-api-url" class="btn btn-primary">Save</button>
        <button id="cancel-api-url" class="btn btn-secondary">Cancel</button>
      </div>
    </div>
  `;
  
  // Add modal to the DOM
  document.body.appendChild(modal);
  
  // Get the current API URL
  chrome.storage.sync.get(['settings'], (result) => {
    const settings = result.settings || {};
    const apiUrl = settings.apiUrl || 'http://localhost:8000';
    document.getElementById('api-url-input').value = apiUrl;
  });
  
  // Add event listeners
  document.getElementById('save-api-url').addEventListener('click', () => {
    const newUrl = document.getElementById('api-url-input').value.trim();
    if (newUrl) {
      // Save to storage
      chrome.storage.sync.get(['settings'], (result) => {
        const settings = result.settings || {};
        settings.apiUrl = newUrl;
        
        chrome.storage.sync.set({ settings }, () => {
          // Update API client
          if (authDashboardAPI) {
            authDashboardAPI.setApiUrl(newUrl);
          }
          
          // Update UI
          document.getElementById('current-api-url').textContent = newUrl;
          
          // Close modal
          modal.remove();
          
          // Check connection with new URL
          checkAPIConnection();
        });
      });
    }
  });
  
  document.getElementById('cancel-api-url').addEventListener('click', () => {
    modal.remove();
  });
}

/**
 * Update post counts for all platforms in the UI
 */
async function updatePostCounts() {
  try {
    console.log('Updating post counts from storage and API');
    
    // Show loading state in the UI
    if (facebookCount) facebookCount.innerHTML = '<small>Loading...</small>';
    if (instagramCount) instagramCount.innerHTML = '<small>Loading...</small>';
    if (linkedinCount) linkedinCount.innerHTML = '<small>Loading...</small>';
    
    // First try to get data from the API for most up-to-date counts
    if (authDashboardAPI.isAvailable) {
      try {
        const response = await authDashboardAPI.callApi('dashboard-api/collection-stats/');
        if (response && response.platforms) {
          // Update local storage with fresh data from API
          const stats = {
            facebook: { total: response.platforms.facebook?.total || 0 },
            instagram: { total: response.platforms.instagram?.total || 0 },
            linkedin: { total: response.platforms.linkedin?.total || 0 }
          };
          
          chrome.storage.local.set({ collectionStats: stats });
          
          // Update UI
          if (facebookCount) facebookCount.textContent = stats.facebook.total;
          if (instagramCount) instagramCount.textContent = stats.instagram.total;
          if (linkedinCount) linkedinCount.textContent = stats.linkedin.total;
          
          console.log('Post counts updated from API:', stats);
          return;
        }
      } catch (apiError) {
        console.warn('Could not fetch post counts from API:', apiError);
        // Continue to use local storage as fallback
      }
    }
    
    // Fallback to local storage if API request failed
    chrome.storage.local.get(['collectionStats'], (result) => {
      const stats = result.collectionStats || {
        facebook: { total: 0 },
        instagram: { total: 0 },
        linkedin: { total: 0 }
      };
      
      // Update UI with local storage data
      if (facebookCount) facebookCount.textContent = stats.facebook.total || 0;
      if (instagramCount) instagramCount.textContent = stats.instagram.total || 0;
      if (linkedinCount) linkedinCount.textContent = stats.linkedin.total || 0;
      
      console.log('Post counts updated from local storage:', stats);
    });
  } catch (error) {
    console.error('Error updating post counts:', error);
    
    // Reset UI to show error state
    if (facebookCount) facebookCount.textContent = '?';
    if (instagramCount) instagramCount.textContent = '?';
    if (linkedinCount) linkedinCount.textContent = '?'; 
    
    showNotification('Error loading statistics', 'error');
  }
}

/**
 * Set up event listeners for buttons and UI elements
 */
function setupEventListeners() {
  console.log('Setting up event listeners');
  
  // Setup collect buttons
  collectButtons.forEach(button => {
    button.addEventListener('click', async (event) => {
      const platform = event.target.dataset.platform;
      console.log(`Collect button clicked for ${platform}`);
      
      // Visual feedback for button click
      button.classList.add('collecting');
      button.textContent = 'Collecting...';
      
      try {
        // Call the collection function
        await collectPosts(platform);
        showNotification(`Successfully collected ${platform} posts!`, 'success');
      } catch (error) {
        console.error(`Error collecting ${platform} posts:`, error);
        showNotification(`Failed to collect ${platform} posts: ${error.message}`, 'error');
      } finally {
        // Reset button state
        resetButton(button, platform);
      }
    });
  });
  
  // Settings button
  if (settingsBtn) {
    settingsBtn.addEventListener('click', (event) => {
      console.log('Settings button clicked');
      try {
        openSettingsPage(event);
      } catch (error) {
        console.error('Error opening settings:', error);
        showNotification('Failed to open settings page', 'error');
      }
    });
  }
  
  // Dashboard button
  if (dashboardBtn) {
    dashboardBtn.addEventListener('click', (event) => {
      console.log('Dashboard button clicked');
      try {
        openDashboard(event);
      } catch (error) {
        console.error('Error opening dashboard:', error);
        showNotification('Failed to open dashboard', 'error');
      }
    });
  }
  
  // Notification close button
  if (notificationClose) {
    notificationClose.addEventListener('click', hideNotification);
  }
  
  // Set up tab navigation
  setupTabButtons();
  
  console.log('Event listeners setup complete');
}

/**
 * Handle opening the settings/options page with fallbacks
 * @param {Event} event - The click event
 */
function openSettingsPage(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  
  console.log('Settings button clicked, opening options page');
  showNotification('Opening settings page...');
  
  // Try primary method
  try {
    chrome.runtime.openOptionsPage(function() {
      if (chrome.runtime.lastError) {
        console.error('Error opening options page:', chrome.runtime.lastError);
        fallbackToOptionsUrl();
      } else {
        console.log('Options page opened successfully');
      }
    });
  } catch (error) {
    console.error('Error opening options page:', error);
    fallbackToOptionsUrl();
  }
  
  // Fallback method 1: Open options.html directly
  function fallbackToOptionsUrl() {
    try {
      const optionsUrl = chrome.runtime.getURL('options.html');
      console.log('Trying fallback: Opening options page via URL:', optionsUrl);
      
      chrome.tabs.create({ url: optionsUrl }, function(tab) {
        if (chrome.runtime.lastError) {
          console.error('Fallback failed:', chrome.runtime.lastError);
          fallbackToManualSettings();
        } else {
          console.log('Options page opened via fallback URL');
        }
      });
    } catch (fallbackError) {
      console.error('URL fallback also failed:', fallbackError);
      fallbackToManualSettings();
    }
  }
  
  // Fallback method 2: Show manual settings form
  function fallbackToManualSettings() {
    console.log('All options page methods failed, showing manual settings form');
    showSettingsFailureOptions();
  }
}

/**
 * Handle opening the dashboard
 * @param {Event} event - The click event
 */
function openDashboard(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  
  console.log('Dashboard button clicked');
  
  // Get dashboard URL from storage or use default
  chrome.storage.sync.get(['settings'], (result) => {
    try {
      const settings = result.settings || {};
      let dashboardUrl = settings.apiUrl || 'http://localhost:8000';
      
      // Ensure trailing slash
      if (!dashboardUrl.endsWith('/')) {
        dashboardUrl += '/';
      }
      
      dashboardUrl += 'dashboard/';
      console.log('Opening dashboard URL:', dashboardUrl);
      
      // Open in new tab
      chrome.tabs.create({ url: dashboardUrl }, function(tab) {
        if (chrome.runtime.lastError) {
          console.error('Error opening dashboard:', chrome.runtime.lastError);
          updateStatus('Error opening dashboard: ' + chrome.runtime.lastError.message, 'error', {
            showNotification: true
          });
        } else {
          updateStatus('Opening dashboard...', 'success', {
            showNotification: true
          });
        }
      });
    } catch (error) {
      console.error('Error opening dashboard:', error);
      updateStatus('Error opening dashboard: ' + error.message, 'error', {
        showNotification: true
      });
    }
  });
}

/**
 * Show fallback options for settings
 */
function showSettingsFailureOptions() {
  try {
    // Create a modal with options
    const modal = document.createElement('div');
    modal.className = 'settings-modal';
    modal.style.position = 'fixed';
    modal.style.top = '50%';
    modal.style.left = '50%';
    modal.style.transform = 'translate(-50%, -50%)';
    modal.style.backgroundColor = 'white';
    modal.style.padding = '20px';
    modal.style.borderRadius = '8px';
    modal.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    modal.style.zIndex = '1000';
    modal.style.maxWidth = '80%';
    
    modal.innerHTML = `
      <h3 style="margin-top:0">Settings Options</h3>
      <p>Unable to open settings page automatically. Try one of these options:</p>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:15px">
        <button id="retry-settings-btn" style="padding:8px;cursor:pointer">Retry Opening Settings</button>
        <button id="manual-settings-btn" style="padding:8px;cursor:pointer">Enter Settings Manually</button>
        <button id="close-modal-btn" style="padding:8px;cursor:pointer;margin-top:5px">Close</button>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add event listeners
    document.getElementById('retry-settings-btn').addEventListener('click', () => {
      try {
        chrome.runtime.openOptionsPage();
        modal.remove();
      } catch (error) {
        console.error('Retry failed:', error);
      }
    });
    
    document.getElementById('manual-settings-btn').addEventListener('click', () => {
      // Show manual settings form
      showManualSettingsForm();
      modal.remove();
    });
    
    document.getElementById('close-modal-btn').addEventListener('click', () => {
      modal.remove();
    });
  } catch (error) {
    console.error('Error showing settings failure options:', error);
  }
}

/**
 * Show manual settings form
 */
function showManualSettingsForm() {
  // Get current settings
  chrome.storage.sync.get(['settings'], (result) => {
    const settings = result.settings || {};
    
    // Create form
    const form = document.createElement('div');
    form.className = 'settings-form';
    form.style.position = 'fixed';
    form.style.top = '50%';
    form.style.left = '50%';
    form.style.transform = 'translate(-50%, -50%)';
    form.style.backgroundColor = 'white';
    form.style.padding = '20px';
    form.style.borderRadius = '8px';
    form.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    form.style.zIndex = '1000';
    form.style.width = '300px';
    
    form.innerHTML = `
      <h3 style="margin-top:0">Manual Settings</h3>
      <div style="display:flex;flex-direction:column;gap:15px;margin-top:15px">
        <div>
          <label for="api-url" style="display:block;margin-bottom:5px">API URL:</label>
          <input id="api-url" type="text" value="${settings.apiUrl || 'http://localhost:8000'}" style="width:100%;padding:8px">
        </div>
        <div>
          <label for="api-key" style="display:block;margin-bottom:5px">API Key:</label>
          <input id="api-key" type="text" value="${settings.apiKey || ''}" style="width:100%;padding:8px">
        </div>
        <div>
          <label style="display:flex;align-items:center;gap:5px">
            <input id="auto-scan" type="checkbox" ${settings.autoScan ? 'checked' : ''}>
            Auto Scan
          </label>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:10px">
          <button id="save-settings-btn" style="padding:8px;cursor:pointer">Save</button>
          <button id="close-form-btn" style="padding:8px;cursor:pointer">Cancel</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(form);
    
    // Add event listeners
    document.getElementById('save-settings-btn').addEventListener('click', () => {
      const apiUrl = document.getElementById('api-url').value;
      const apiKey = document.getElementById('api-key').value;
      const autoScan = document.getElementById('auto-scan').checked;
      
      // Save settings
      chrome.storage.sync.set({
        settings: {
          ...settings,
          apiUrl,
          apiKey,
          autoScan
        }
      }, () => {
        showNotification('Settings saved successfully');
        form.remove();
        
        // Immediately check connection with new settings
        setTimeout(checkAPIConnection, 500);
      });
    });
    
    document.getElementById('close-form-btn').addEventListener('click', () => {
      form.remove();
    });
  });
}

/**
 * Collect posts from a social media platform
 * @param {string} platform - The platform to collect from (facebook, instagram, linkedin)
 */
async function collectPosts(platform) {
  try {
    // Get the active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];
    
    // Platform URL validation map
    const platformDomains = {
      'facebook': ['facebook.com', 'fb.com'],
      'instagram': ['instagram.com'],
      'linkedin': ['linkedin.com']
    };
    
    // Check if we're on the right platform
    const isCorrectPlatform = platformDomains[platform] && 
      platformDomains[platform].some(domain => activeTab.url.includes(domain));
    
    if (!isCorrectPlatform) {
      showNotification(`Please navigate to ${platform}.com first`, 'warning');
      return;
    }
    
    // Update button state
    const button = document.querySelector(`.collect-btn[data-platform="${platform}"]`);
    if (!button) {
      console.error(`Button for platform ${platform} not found`);
      return;
    }
    
    button.textContent = 'Collecting...';
    button.disabled = true;
    
    // Generate a unique batch ID
    const batchId = `${platform}-${Date.now()}`;
    
    // Send message to content script
    chrome.tabs.sendMessage(activeTab.id, {
      action: 'scrollAndCollect',
      platform: platform,
      batchId: batchId,
      maxScrollTime: 30000 // 30 seconds of scrolling
    }, async (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error sending message:', chrome.runtime.lastError);
        showNotification(`Error: ${chrome.runtime.lastError.message}`, 'error');
        resetButton(button, platform);
        return;
      }
      
      if (response && response.success) {
        showNotification(`Found ${response.postCount} posts on ${platform}`);
        
        // If posts were found, send them to the API
        if (response.posts && response.posts.length > 0) {
          try {
            await authDashboardAPI.sendPosts(response.posts, platform, batchId);
            showNotification(`Successfully uploaded ${response.posts.length} posts from ${platform}`);
          } catch (apiError) {
            console.error('API error:', apiError);
            showNotification(`Collection succeeded but upload failed: ${apiError.message}`, 'warning');
          }
        }
        
        // Update the post counts in the UI
        updatePostCounts();
      } else {
        showNotification(`Error collecting posts: ${response?.error || 'Unknown error'}`, 'error');
      }
      
      resetButton(button, platform);
    });
  } catch (error) {
    console.error(`Error collecting ${platform} posts:`, error);
    showNotification(`Error: ${error.message}`, 'error');
    
    // Reset button state
    const button = document.querySelector(`.collect-btn[data-platform="${platform}"]`);
    if (button) {
      resetButton(button, platform);
    }
  }
}

/**
 * Reset collection button state
 * @param {Element} button - The button element
 * @param {string} platform - The platform name
 */
function resetButton(button, platform) {
  // Reset button state after a short delay
  setTimeout(() => {
    button.textContent = 'Collect Now';
    button.disabled = false;
  }, 1000);
}

/**
 * Show a notification message
 * @param {string} message - The message to display
 * @param {string} type - The notification type (success, error, warning)
 */
function showNotification(message, type = 'success') {
  // Use updateStatus with showNotification option
  updateStatus(message, type, { showNotification: true });
}

/**
 * Hide the notification
 */
function hideNotification() {
  if (notification) {
    notification.classList.remove('show');
  }
}

// Store extension settings in chrome.storage
const DEFAULT_SETTINGS = {
    autoScan: true,
    advancedML: true,
    collectSponsored: true,
    showNotifications: true,
    apiKey: '42ad72779a934c2d8005992bbecb6772', // Default API key for testing
    scanHistory: [],
    stats: {
        totalPosts: 0,
        todayPosts: 0,
        mlProcessed: 0,
        lastScanDate: null
    }
};

// Store extension data collection preferences with default all enabled
const DEFAULT_DATA_PREFERENCES = {
    collectContent: true,
    collectEngagement: true,
    collectUsers: true,
    collectHashtags: true,
    collectLocalML: true
};

// Load settings when popup opens
document.addEventListener('DOMContentLoaded', function() {
    // First check server connection
    checkAPIConnection();
    
    // Load saved settings or use defaults
    chrome.storage.local.get(['settings', 'dataPreferences'], function(result) {
        const settings = result.settings || DEFAULT_SETTINGS;
        const dataPreferences = result.dataPreferences || DEFAULT_DATA_PREFERENCES;
        
        // Set toggle states based on saved settings
        document.getElementById('autoScan').checked = settings.autoScan;
        document.getElementById('advancedML').checked = settings.advancedML;
        document.getElementById('collectSponsored').checked = settings.collectSponsored;
        document.getElementById('showNotifications').checked = settings.showNotifications;
        
        // Set data collection preferences
        document.getElementById('collectContent').checked = dataPreferences.collectContent;
        document.getElementById('collectEngagement').checked = dataPreferences.collectEngagement;
        document.getElementById('collectUsers').checked = dataPreferences.collectUsers;
        document.getElementById('collectHashtags').checked = dataPreferences.collectHashtags;
        document.getElementById('collectLocalML').checked = dataPreferences.collectLocalML;
        
        // Set API key
        document.getElementById('apiKey').value = settings.apiKey || '';
        
        // Update stats display
        updateStatsDisplay(settings.stats);
        
        // Update recent scans
        updateRecentScansDisplay(settings.scanHistory);
    });
    
    // Setup tab navigation
    document.getElementById('settingsTabBtn').addEventListener('click', function() {
        showTab('settingsTab');
    });
    
    document.getElementById('transparencyTabBtn').addEventListener('click', function() {
        showTab('transparencyTab');
    });
    
    document.getElementById('insightsTabBtn').addEventListener('click', function() {
        showTab('insightsTab');
    });
    
    // Add event listener for the scan button
    document.getElementById('scanButton').addEventListener('click', performScan);
    
    // Add event listeners for toggle switches
    document.getElementById('autoScan').addEventListener('change', updateSettings);
    document.getElementById('advancedML').addEventListener('change', updateSettings);
    document.getElementById('collectSponsored').addEventListener('change', updateSettings);
    document.getElementById('showNotifications').addEventListener('change', updateSettings);

    // Add event listeners for saving API key
    document.getElementById('saveApiKey').addEventListener('click', function() {
        updateAPIKey();
    });

    // Add event listeners for dashboard links
    document.getElementById('dashboardLink').addEventListener('click', function(e) {
        e.preventDefault();
        openDashboard();
    });
    
    document.getElementById('mlDashboardLink').addEventListener('click', function(e) {
        e.preventDefault();
        openMLDashboard();
    });
    
    // Add event listener for troubleshoot link
    document.getElementById('troubleshootLink').addEventListener('click', function(e) {
        e.preventDefault();
        troubleshootDashboardAccess();
    });
    
    // Add event listener for saving data preferences
    document.getElementById('saveDataPreferences').addEventListener('click', function() {
        saveDataPreferences();
    });

    // Add retry connection button
    if (document.getElementById('retryConnectionBtn')) {
        document.getElementById('retryConnectionBtn').addEventListener('click', function() {
            checkAPIConnection();
        });
    }

    // Add Pure Feed functionality
    document.getElementById('pureFeedTabBtn').addEventListener('click', function() {
        showTab('pureFeedTab');
    });

    // Refresh button for Pure Feed
    document.getElementById('refreshFeedBtn').addEventListener('click', function() {
        loadPureFeedPosts();
    });

    // Filter change handlers
    document.getElementById('feedPlatform').addEventListener('change', loadPureFeedPosts);
    document.getElementById('feedCategory').addEventListener('change', loadPureFeedPosts);

    // Insights tab additional functionality
    const insightsScanButton = document.getElementById('insightsScanButton');
    const viewPastInsightsLink = document.getElementById('viewPastInsightsLink');
    
    if (insightsScanButton) {
        insightsScanButton.addEventListener('click', function() {
            // Trigger the same action as the main scan button
            document.getElementById('scanButton').click();
            
            // After a brief delay, check for insights
            setTimeout(function() {
                checkForInsights();
            }, 500);
        });
    }
    
    if (viewPastInsightsLink) {
        viewPastInsightsLink.addEventListener('click', function(e) {
            e.preventDefault();
            // Open dashboard insights in a new tab
            chrome.tabs.create({ url: 'http://localhost:8000/ml-insights/' });
        });
    }
});

/**
 * Switch between tabs in the popup
 * @param {string} tabName - Name of the tab to show
 */
function showTab(tabName) {
    console.log(`Switching to tab: ${tabName}`);
    
    // Hide all tab contents
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(tab => {
        tab.style.display = 'none';
    });
    
    // Deactivate all tab buttons
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
        button.classList.remove('active');
    });
    
    // Show the selected tab content
    const selectedTab = document.getElementById(`${tabName}Tab`);
    if (selectedTab) {
        selectedTab.style.display = 'block';
    }
    
    // Activate the selected tab button
    const selectedButton = document.querySelector(`.tab-button[data-tab="${tabName}"]`);
    if (selectedButton) {
        selectedButton.classList.add('active');
    }
    
    // Special case for certain tabs
    if (tabName === 'pureFeed') {
        // If we have the function to load pure feed posts, call it
        if (typeof loadPureFeedPosts === 'function') {
            loadPureFeedPosts();
        }
    } else if (tabName === 'insights') {
        // Check if we need to load or refresh insights
        chrome.storage.local.get(['lastAnalyzedPosts'], function(result) {
            if (result.lastAnalyzedPosts && result.lastAnalyzedPosts.posts) {
                updateInsightsTab(
                    result.lastAnalyzedPosts.posts, 
                    result.lastAnalyzedPosts.platform
                );
            }
        });
    }
}

/**
 * Save data preferences and update status
 */
function saveDataPreferences() {
  const dataPreferences = {
    collectContent: document.getElementById('collectContent').checked,
    collectEngagement: document.getElementById('collectEngagement').checked,
    collectUsers: document.getElementById('collectUsers').checked,
    collectHashtags: document.getElementById('collectHashtags').checked,
    collectLocalML: document.getElementById('collectLocalML').checked
  };
  
  // Save data preferences
  chrome.storage.local.set({ dataPreferences: dataPreferences }, function() {
    // Show brief confirmation
    updateStatus('Data preferences saved successfully!', 'success', { showNotification: true });
    
    // Reset status after 2 seconds
    setTimeout(function() {
      const isConnected = serverConnected;
      updateStatus(
        isConnected ? 'Connected to dashboard server' : 'Not connected to dashboard server', 
        isConnected ? 'success' : 'error'
      );
    }, 2000);
  });
}

/**
 * Update API key and show status
 */
function updateAPIKey() {
  const apiKeyInput = document.getElementById('apiKey');
  if (!apiKeyInput) {
    updateStatus('API key input not found', 'error', { showNotification: true });
    return;
  }

  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    updateStatus('Please enter a valid API key', 'warning', { showNotification: true });
    return;
  }

  // Load current settings
  chrome.storage.sync.get(['settings'], function(result) {
    const settings = result.settings || DEFAULT_SETTINGS;
    
    // Update API key
    settings.apiKey = apiKey;
    
    // Save updated settings
    chrome.storage.sync.set({ settings: settings }, function() {
      // Update API client
      authDashboardAPI.setApiKey(apiKey);
      
      // Show success message
      updateStatus('API key saved successfully!', 'success', { showNotification: true });
      
      // Check connection with new API key
      setTimeout(() => {
        checkAPIConnection();
      }, 500);
    });
  });
}

/**
 * Update extension settings and show status
 */
function updateSettings() {
  // Get current settings
  chrome.storage.sync.get(['settings'], function(result) {
    const settings = result.settings || DEFAULT_SETTINGS;
    
    // Update settings from UI
    settings.autoScan = document.getElementById('autoScan').checked;
    settings.advancedML = document.getElementById('advancedML').checked;
    settings.collectSponsored = document.getElementById('collectSponsored').checked;
    settings.showNotifications = document.getElementById('showNotifications').checked;
    
    // Save updated settings
    chrome.storage.sync.set({ settings: settings }, function() {
      // Show success message
      updateStatus('Settings updated successfully!', 'success', { showNotification: true });
    });
  });
}

/**
 * Update stats after a scan and show status
 * @param {string} platform - The platform that was scanned
 * @param {number} count - Number of posts scanned
 */
function updateStatsAfterScan(platform, count) {
  // Load current stats
  chrome.storage.sync.get(['settings'], function(result) {
    const settings = result.settings || DEFAULT_SETTINGS;
    
    // Update stats
    const stats = settings.stats || {
      totalPosts: 0,
      todayPosts: 0,
      mlProcessed: 0,
      lastScanDate: null
    };
    
    // Update totals
    stats.totalPosts += count;
    stats.todayPosts += count;
    stats.mlProcessed += count;
    stats.lastScanDate = new Date().toISOString();
    
    // Add to scan history
    const scanEntry = {
      platform,
      count,
      timestamp: new Date().toISOString()
    };
    
    settings.scanHistory = settings.scanHistory || [];
    settings.scanHistory.unshift(scanEntry);
    
    // Limit history to 10 entries
    if (settings.scanHistory.length > 10) {
      settings.scanHistory = settings.scanHistory.slice(0, 10);
    }
    
    // Save updated settings
    chrome.storage.sync.set({ settings: settings }, function() {
      // Update UI
      updateStatsDisplay(stats);
      updateRecentScansDisplay(settings.scanHistory);
      
      // Show success message
      updateStatus(`Added ${count} posts to your dashboard`, 'success', { 
        showNotification: true
      });
    });
  });
}

/**
 * Load and render ranked posts for the Pure Feed
 */
function loadPureFeedPosts() {
    // Get filters
    const platformFilter = document.getElementById('feedPlatform').value;
    const categoryFilter = document.getElementById('feedCategory').value;
    
    // Show loading state
    const container = document.getElementById('pureFeedContainer');
    container.innerHTML = `
        <div class="loading-indicator">
            <div class="spinner"></div>
            <p>Loading your ranked posts...</p>
        </div>
    `;
    
    // Get ranked posts from storage
    chrome.storage.local.get(['rankedPosts'], function(result) {
        const rankedPosts = result.rankedPosts || {};
        
        // Convert to array
        let posts = Object.values(rankedPosts);
        
        // Check if we have any posts
        if (!posts || posts.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>No ranked posts found.</p>
                    <p>Try scanning some social media pages first.</p>
                </div>
            `;
            return;
        }
        
        // Apply platform filter
        if (platformFilter && platformFilter !== 'all') {
            posts = posts.filter(post => post.platform === platformFilter);
        }
        
        // Apply category filter
        if (categoryFilter && categoryFilter !== 'all') {
            posts = posts.filter(post => {
                const category = getCategoryFromScore(post.authenticity_score || 50);
                return category.name.toLowerCase() === categoryFilter.toLowerCase();
            });
        }
        
        // Sort by authenticity score (high to low)
        posts.sort((a, b) => (b.authenticity_score || 0) - (a.authenticity_score || 0));
        
        // Limit to 20 posts for performance
        posts = posts.slice(0, 20);
        
        // Render posts with updated UI
        setTimeout(() => {
            renderRankedPosts(posts);
            
            // Scroll to top
            container.scrollTop = 0;
            
            // Show post count
            const countString = posts.length === 1 ? '1 post' : `${posts.length} posts`;
            container.insertAdjacentHTML('afterbegin', `
                <div class="results-summary mb-sm">
                    Showing ${countString} sorted by authenticity score
                </div>
            `);
        }, 300); // Small delay for better visual feedback
    });
}

/**
 * Render ranked posts in the Pure Feed tab
 */
function renderRankedPosts(posts, options = {}) {
    const container = document.getElementById('pureFeedContainer');
    
    // Clear previous content
    container.innerHTML = '';
    
    if (!posts || posts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>No posts found matching your criteria.</p>
                <p>Try changing your filters or scanning more pages.</p>
            </div>
        `;
        return;
    }
    
    // Create posts
    posts.forEach(post => {
        // Get score class and category
        const scoreClass = getScoreColorClass(post.authenticity_score);
        const category = getCategoryFromScore(post.authenticity_score);
        
        // Platform icon
        const platformIcon = getPlatformIcon(post.platform);
        
        // Create post element
        const postElement = document.createElement('div');
        postElement.className = `post-item ${scoreClass}`;
        
        // Format badges
        const badges = [];
        if (post.is_sponsored) badges.push('<span class="badge sponsored">Sponsored</span>');
        if (post.is_friend) badges.push('<span class="badge friend">Friend</span>');
        if (post.is_family) badges.push('<span class="badge family">Family</span>');
        if (post.verified) badges.push('<span class="badge verified">Verified</span>');
        
        // Format engagement metrics
        const engagement = [];
        if (post.likes !== undefined && post.likes > 0) {
            engagement.push(`<div class="engagement-item"><span class="engagement-icon">👍</span> ${post.likes}</div>`);
        }
        if (post.comments !== undefined && post.comments > 0) {
            engagement.push(`<div class="engagement-item"><span class="engagement-icon">💬</span> ${post.comments}</div>`);
        }
        if (post.shares !== undefined && post.shares > 0) {
            engagement.push(`<div class="engagement-item"><span class="engagement-icon">↗️</span> ${post.shares}</div>`);
        }
        
        // Create authenticity meter with score visualization
        const authenticityMeter = `
            <div class="authenticity-score-container">
                <div class="authenticity-meter">
                    <div class="authenticity-fill ${scoreClass}" style="width: ${post.authenticity_score}%"></div>
                </div>
            </div>
        `;
        
        // Set inner HTML with improved layout
        postElement.innerHTML = `
            <div class="post-header">
                <div class="post-user-info">
                    <div class="post-platform">
                        ${platformIcon}
                        ${post.platform}
                    </div>
                    <div class="post-user">${post.original_user || 'Unknown'}</div>
                </div>
                <div class="post-score">
                    <span class="score-pill ${scoreClass}">${post.authenticity_score}</span>
                    <span class="score-category">${category.name}</span>
                </div>
            </div>
            
            ${authenticityMeter}
            
            <div class="post-content">
                ${truncateText(post.content || '', 150)}
            </div>
            
            <div class="post-footer">
                <div class="post-metrics">
                    ${badges.join('')}
                </div>
                <div class="post-engagement">
                    ${engagement.join('')}
                </div>
            </div>
        `;
        
        // Add to container
        container.appendChild(postElement);
    });
}

/**
 * Get authenticity category from score
 */
function getCategoryFromScore(score) {
    // Define score ranges
    const categories = [
        { name: "Pure soul", range: [90, 100], description: "Vulnerable, funny, deep, unique." },
        { name: "Insightful", range: [70, 89], description: "Honest, charmingly human." },
        { name: "Neutral", range: [40, 69], description: "Safe but not manipulative." },
        { name: "Performative", range: [20, 39], description: "Cringe, bland, try-hard." },
        { name: "Spam/Ads", range: [0, 19], description: "Spam, ads, outrage bait." }
    ];
    
    // Find matching category
    for (const category of categories) {
        if (score >= category.range[0] && score <= category.range[1]) {
            return category;
        }
    }
    
    // Default to neutral
    return categories[2];
}

/**
 * Get CSS class for score color
 */
function getScoreColorClass(score) {
  if (score >= 90) return 'score-excellent';
  if (score >= 70) return 'score-good';
  if (score >= 40) return 'score-neutral';
  if (score >= 20) return 'score-poor';
  return 'score-bad';
}

/**
 * Get platform icon
 */
function getPlatformIcon(platform) {
  switch (platform?.toLowerCase()) {
    case 'facebook':
      return '<i class="fab fa-facebook"></i>';
    case 'instagram':
      return '<i class="fab fa-instagram"></i>';
    case 'linkedin':
      return '<i class="fab fa-linkedin"></i>';
    default:
      return '<i class="fas fa-globe"></i>';
  }
}

/**
 * Truncate text to a certain length
 */
function truncateText(text, maxLength) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

// Function to check for insights and display them
function checkForInsights() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (!tabs || tabs.length === 0) return;
        
        const currentTab = tabs[0];
        const url = currentTab.url;
        let platform = 'unknown';
        
        // Determine platform from URL
        if (url.includes('facebook.com')) {
            platform = 'facebook';
        } else if (url.includes('instagram.com')) {
            platform = 'instagram';
        } else if (url.includes('linkedin.com')) {
            platform = 'linkedin';
        } else if (url.includes('twitter.com') || url.includes('x.com')) {
            platform = 'twitter';
        }
        
        if (platform === 'unknown') {
            document.getElementById('currentPageInsights').innerHTML = `
                <div class="no-insights-state">
                    <div class="empty-state-icon">⚠️</div>
                    <h4 class="empty-state-title">Not a social media site</h4>
                    <p class="empty-state-message">Navigate to Facebook, Instagram, LinkedIn, or Twitter to collect insights.</p>
                </div>
            `;
            return;
        }
        
        // Get the latest scan for this platform
        chrome.storage.local.get(['settings'], function(result) {
            const settings = result.settings || DEFAULT_SETTINGS;
            const scanHistory = settings.scanHistory || [];
            
            // Find the most recent scan for this platform
            const latestScan = scanHistory.find(scan => scan.platform === platform);
            
            if (!latestScan) {
                document.getElementById('currentPageInsights').innerHTML = `
                    <div class="no-insights-state">
                        <div class="empty-state-icon">📊</div>
                        <h4 class="empty-state-title">No insights for ${platform.charAt(0).toUpperCase() + platform.slice(1)}</h4>
                        <p class="empty-state-message">Scan this page to generate insights.</p>
                        <button id="scanAgainBtn" class="btn btn-primary mt-md">Scan Now</button>
                    </div>
                `;
                
                // Add event listener for scan button
                document.getElementById('scanAgainBtn').addEventListener('click', function() {
                    document.getElementById('scanButton').click();
                });
                return;
            }
            
            // Display insights
            document.getElementById('currentPageInsights').innerHTML = `
                <div class="insights-container">
                    <div class="insights-header">
                        <h4>${platform.charAt(0).toUpperCase() + platform.slice(1)} Insights</h4>
                        <div class="insights-date">From ${new Date(latestScan.timestamp).toLocaleString()}</div>
                    </div>
                    
                    <div class="insights-card">
                        <div class="insight-stat">
                            <div class="insight-value">${latestScan.count}</div>
                            <div class="insight-label">Posts collected</div>
                        </div>
                        
                        <div class="insight-stat">
                            <div class="insight-value">${Math.round(latestScan.count * 0.7)}</div>
                            <div class="insight-label">Authentic posts</div>
                        </div>
                        
                        <div class="insight-stat">
                            <div class="insight-value">${Math.round(latestScan.count * 0.3)}</div>
                            <div class="insight-label">Promotional</div>
                        </div>
                    </div>
                    
                    <div class="view-more-container">
                        <a href="#" id="viewMoreInsightsBtn" class="btn-link">View detailed analysis</a>
                    </div>
                </div>
            `;
            
            // Add event listener for "View detailed analysis" button
            document.getElementById('viewMoreInsightsBtn').addEventListener('click', function(e) {
                e.preventDefault();
                chrome.tabs.create({ url: 'http://localhost:8000/ml-insights/' });
            });
        });
    });
}

/**
 * Function to perform scan on the current page
 */
function performScan() {
    // If not connected to server, show warning
    if (!serverConnected) {
        updateStatus('Cannot scan: Not connected to dashboard server', 'error');
        return;
    }

    const scanButton = document.getElementById('scanButton');
    
    // Disable button during scan
    scanButton.disabled = true;
    scanButton.textContent = 'Scanning...';
    updateStatus('Scanning current page...', 'checking');
    
    // Get the active tab
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        const activeTab = tabs[0];
        
        // Detect platform based on URL
        let platform = 'unknown';
        if (activeTab.url.includes('instagram.com')) {
            platform = 'instagram';
        } else if (activeTab.url.includes('facebook.com')) {
            platform = 'facebook';
        } else if (activeTab.url.includes('linkedin.com')) {
            platform = 'linkedin';
        }
        
        // Skip if we're not on a supported platform
        if (platform === 'unknown') {
            scanButton.disabled = false;
            scanButton.textContent = 'Scan Current Page';
            updateStatus('This page is not supported for scanning.', 'error');
            return;
        }
        
        // Load settings for the scan
        chrome.storage.local.get(['settings', 'dataPreferences'], function(result) {
            const settings = result.settings || DEFAULT_SETTINGS;
            const dataPreferences = result.dataPreferences || DEFAULT_DATA_PREFERENCES;
            
            // Execute content script function to collect posts
            chrome.tabs.sendMessage(activeTab.id, {
                action: 'collectPosts',
                platform: platform,
                settings: {
                    advancedML: settings.advancedML,
                    collectSponsored: settings.collectSponsored,
                    dataPreferences: dataPreferences
                }
            }, function(response) {
                // Re-enable button and update status
                scanButton.disabled = false;
                scanButton.textContent = 'Scan Current Page';
                
                // Handle runtime errors
                if (chrome.runtime.lastError) {
                    updateStatus('Error: Content script not responding. Try refreshing the page.', 'error');
                    console.error('Runtime error:', chrome.runtime.lastError);
                    return;
                }
                
                // Handle missing response
                if (!response) {
                    updateStatus('Error: No response from content script.', 'error');
                    return;
                }
                
                // Handle scan results
                if (response.success) {
                    const count = response.posts ? response.posts.length : 0;
                    updateStatus(`Successfully scanned ${count} posts!`, 'success');
                    
                    // Update stats if posts were collected
                    if (count > 0) {
                        updateStatsAfterScan(platform, count);
                    }
                } else {
                    updateStatus(response.message || 'Scan failed.', 'error');
                }
            });
        });
    });
}

/**
 * Update insights tab with real post analysis
 * @param {Array} posts - The posts to analyze
 * @param {string} platform - The social media platform
 */
function updateInsightsTab(posts, platform) {
    console.log(`Updating insights tab with ${posts.length} ${platform} posts`);
    
    const insightsContainer = document.getElementById('currentPageInsights');
    if (!insightsContainer) {
        console.error('Insights container not found');
        return;
    }
    
    // Show loading during analysis
    insightsContainer.innerHTML = `
        <div class="loading-area">
            <p>Analyzing ${posts.length} posts from ${platform}...</p>
            <div class="loader"></div>
        </div>
    `;
    
    // If no posts to analyze
    if (!posts || posts.length === 0) {
        insightsContainer.innerHTML = `
            <div class="no-insights-state">
                <div class="empty-state-icon">📊</div>
                <h3 class="empty-state-title">No Posts to Analyze</h3>
                <p class="empty-state-message">We couldn't find any posts to analyze. Try collecting posts first.</p>
            </div>
        `;
        return;
    }
    
    // Perform actual analysis on the posts
    try {
        // Extract key metrics from posts
        const metrics = {
            totalPosts: posts.length,
            sentimentScores: [],
            patternTypes: {},
            manipulativeCount: 0,
            sponsoredCount: 0,
            verifiedCount: 0,
            engagementTotal: 0,
            authenticityCounts: {
                excellent: 0,
                good: 0,
                neutral: 0,
                poor: 0,
                bad: 0
            }
        };
        
        // Analyze each post
        posts.forEach(post => {
            // Count sentiment scores (normalize if needed)
            const sentiment = post.sentiment_score || 0;
            metrics.sentimentScores.push(sentiment);
            
            // Count patterns by type
            if (post.patterns && Array.isArray(post.patterns)) {
                post.patterns.forEach(pattern => {
                    if (pattern.type) {
                        metrics.patternTypes[pattern.type] = (metrics.patternTypes[pattern.type] || 0) + 1;
                    }
                });
            }
            
            // Count manipulative posts
            if (post.is_manipulative || 
                (post.authenticity_score && post.authenticity_score < 40)) {
                metrics.manipulativeCount++;
            }
            
            // Count sponsored posts
            if (post.is_sponsored) {
                metrics.sponsoredCount++;
            }
            
            // Count verified authors
            if (post.author_verified) {
                metrics.verifiedCount++;
            }
            
            // Sum engagement
            metrics.engagementTotal += (post.likes || 0) + (post.comments || 0) + (post.shares || 0);
            
            // Count by authenticity category
            const score = post.authenticity_score || 50;
            if (score >= 80) metrics.authenticityCounts.excellent++;
            else if (score >= 60) metrics.authenticityCounts.good++;
            else if (score >= 40) metrics.authenticityCounts.neutral++;
            else if (score >= 20) metrics.authenticityCounts.poor++;
            else metrics.authenticityCounts.bad++;
        });
        
        // Calculate averages
        const avgSentiment = metrics.sentimentScores.length > 0 
            ? metrics.sentimentScores.reduce((sum, score) => sum + score, 0) / metrics.sentimentScores.length
            : 0;
            
        // Get top patterns
        const sortedPatterns = Object.entries(metrics.patternTypes)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([type, count]) => {
                // Make pattern names more readable
                const readableName = type
                    .replace(/_/g, ' ')
                    .replace(/\b\w/g, c => c.toUpperCase());
                return [readableName, count];
            });
        
        // Calculate overall risk score (0-100)
        let riskScore = 0;
        if (metrics.totalPosts > 0) {
            riskScore = Math.round(
                (metrics.manipulativeCount / metrics.totalPosts * 60) + 
                (Object.keys(metrics.patternTypes).length * 5) +
                (metrics.sponsoredCount / metrics.totalPosts * 20)
            );
            riskScore = Math.min(100, Math.max(0, riskScore));
        }
        
        // Create the summary HTML
        let html = `
            <div class="insights-summary">
                <h4>Feed Analysis Results</h4>
                <p>Analyzed ${metrics.totalPosts} posts from ${platform}</p>
                
                <div class="authenticity-meter">
                    <div class="authenticity-fill ${getScoreColorClass(100 - riskScore)}" 
                         style="width: ${100 - riskScore}%"></div>
                </div>
                
                <div class="insight-stat">
                    <span class="stat-label">Feed Health Score:</span>
                    <span class="stat-value">${100 - riskScore}/100 
                        ${riskScore < 30 ? '✅' : riskScore < 60 ? '⚠️' : '❌'}</span>
                </div>
                
                <div class="insight-stat">
                    <span class="stat-label">Manipulative Content:</span>
                    <span class="stat-value">${metrics.manipulativeCount} posts 
                        (${Math.round(metrics.manipulativeCount/metrics.totalPosts*100)}%)</span>
                </div>
                
                <div class="insight-stat">
                    <span class="stat-label">Sponsored Content:</span>
                    <span class="stat-value">${metrics.sponsoredCount} posts
                        (${Math.round(metrics.sponsoredCount/metrics.totalPosts*100)}%)</span>
                </div>
                
                <div class="insight-stat">
                    <span class="stat-label">Average Sentiment:</span>
                    <span class="stat-value">${avgSentiment.toFixed(2)} 
                        ${avgSentiment > 0.3 ? '😊' : avgSentiment < -0.3 ? '😔' : '😐'}</span>
                </div>
        `;
        
        // Add platform-specific metrics
        if (platform === 'linkedin') {
            html += `
                <div class="insight-stat">
                    <span class="stat-label">Professional Content:</span>
                    <span class="stat-value">${metrics.authenticityCounts.excellent + metrics.authenticityCounts.good} posts 
                        (${Math.round((metrics.authenticityCounts.excellent + metrics.authenticityCounts.good)/metrics.totalPosts*100)}%)</span>
                </div>
            `;
        }
        
        // Add pattern breakdown if available
        if (sortedPatterns.length > 0) {
            html += `
                <div class="insight-stat">
                    <span class="stat-label">Top Influence Patterns:</span>
                    <ol class="pattern-list">
                        ${sortedPatterns.map(([type, count]) => 
                            `<li>${type} (${count})</li>`
                        ).join('')}
                    </ol>
                </div>
            `;
        }
        
        html += `</div>`;
        
        // Add educational component
        html += `
            <div class="educational-component">
                <h4>Understanding Your Feed</h4>
                <p>The content you see is designed to influence your behavior and keep you engaged.
                   Being aware of these patterns helps you make more conscious choices.</p>
                
                <div class="learn-more-section">
                    <a href="#" id="viewFullReportBtn" class="btn btn-primary btn-sm">View Full Report</a>
                    <a href="https://authentic-dashboard.com/learn" target="_blank" class="btn-link ml-sm">Learn more</a>
                </div>
            </div>
        `;
        
        // Update the insights container
        insightsContainer.innerHTML = html;
        
        // Add event listener for the full report button
        const reportBtn = document.getElementById('viewFullReportBtn');
        if (reportBtn) {
            reportBtn.addEventListener('click', (e) => {
                e.preventDefault();
                // Save the current analysis to storage
                chrome.storage.local.set({
                    lastAnalysis: {
                        platform,
                        timestamp: Date.now(),
                        metrics,
                        posts: posts.slice(0, 10) // Store a subset of posts for the report
                    }
                }, () => {
                    // Open the full report page
                    chrome.tabs.create({ url: chrome.runtime.getURL('report.html') });
                });
            });
        }
    } catch (error) {
        console.error('Error analyzing posts:', error);
        insightsContainer.innerHTML = `
            <div class="error-state">
                <p>Error analyzing posts: ${error.message}</p>
                <button id="retryAnalysisBtn" class="btn btn-primary">Retry Analysis</button>
            </div>
        `;
        
        // Add event listener for retry button
        const retryBtn = document.getElementById('retryAnalysisBtn');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                updateInsightsTab(posts, platform);
            });
        }
    }
}

// Extend the existing setupSettingsPage function
const originalSetupSettingsPage = window.setupSettingsPage || function() {};
window.setupSettingsPage = function() {
  originalSetupSettingsPage();
  addAutoScanSettings();
};

// Add message handling for auto-scan status updates
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === 'updateAutoScanStatus') {
    // Use updateStatus instead of directly setting element text
    updateStatus(message.status, message.status.includes('Error') ? 'error' : 'default');
  }
  
  return true;
});

// Function to check if file exists
function fileExists(url) {
  return new Promise((resolve) => {
    fetch(url, { method: 'HEAD' })
      .then(response => resolve(response.ok))
      .catch(() => resolve(false));
  });
}

// Function to load icons safely
async function loadIconsSafely() {
  const iconElements = document.querySelectorAll('.platform-icon img');
  
  iconElements.forEach(async (img) => {
    const src = img.getAttribute('src');
    const exists = await fileExists(src);
    
    if (!exists) {
      // If icon file doesn't exist or is empty, use CSS background instead
      const platform = img.closest('.platform-card').classList[1];
      img.style.display = 'none';
      img.parentElement.classList.add(`${platform}-icon-fallback`);
    }
  });
}
  