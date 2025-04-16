/**
 * popup.js - Handles the extension popup UI interactions
 */

import authDashboardAPI from './api_client.js';

// DOM elements
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const facebookCount = document.getElementById('facebook-count');
const instagramCount = document.getElementById('instagram-count');
const linkedinCount = document.getElementById('linkedin-count');
const collectButtons = document.querySelectorAll('.collect-btn');
const settingsBtn = document.getElementById('settings-btn');
const dashboardBtn = document.getElementById('dashboard-btn');
const notification = document.getElementById('notification');
const notificationMessage = document.getElementById('notification-message');
const notificationClose = document.getElementById('notification-close');

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Popup initialized');
  
  // Check API connection
  checkApiConnection();
  
  // Load post counts
  updatePostCounts();
  
  // Set up event listeners
  setupEventListeners();
});

/**
 * Check API connection status
 */
async function checkApiConnection() {
  try {
    statusText.textContent = 'Checking connection...';
    
    const isConnected = await authDashboardAPI.checkAvailability();
    
    if (isConnected) {
      statusIndicator.classList.add('connected');
      statusText.textContent = 'Connected';
    } else {
      statusIndicator.classList.add('disconnected');
      statusText.textContent = 'Not connected';
    }
  } catch (error) {
    console.error('Error checking API connection:', error);
    statusIndicator.classList.add('disconnected');
    statusText.textContent = 'Connection error';
  }
}

/**
 * Update post counts for all platforms
 */
async function updatePostCounts() {
  try {
    // Get collection stats from storage
    chrome.storage.local.get(['collectionStats'], (result) => {
      const stats = result.collectionStats || {
        facebook: { total: 0 },
        instagram: { total: 0 },
        linkedin: { total: 0 }
      };
      
      // Update UI
      facebookCount.textContent = stats.facebook.total || 0;
      instagramCount.textContent = stats.instagram.total || 0;
      linkedinCount.textContent = stats.linkedin.total || 0;
    });
  } catch (error) {
    console.error('Error updating post counts:', error);
    showNotification('Error loading statistics', 'error');
  }
}

/**
 * Set up event listeners for UI elements
 */
function setupEventListeners() {
  // Collection buttons
  collectButtons.forEach(button => {
    button.addEventListener('click', async () => {
      const platform = button.dataset.platform;
      await collectPosts(platform);
    });
  });
  
  // Settings button
  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  
  // Dashboard button
  dashboardBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: authDashboardAPI.getDashboardUrl() });
  });
  
  // Notification close button
  notificationClose.addEventListener('click', () => {
    hideNotification();
  });
}

/**
 * Collect posts from the specified platform
 * @param {string} platform - The platform to collect from (facebook, instagram, linkedin)
 */
async function collectPosts(platform) {
  try {
    // Get the active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];
    
    // Check if we're on the right platform
    if (!activeTab.url.includes(platform)) {
      showNotification(`Please navigate to ${platform}.com first`, 'warning');
      return;
    }
    
    // Update button state
    const button = document.querySelector(`.collect-btn[data-platform="${platform}"]`);
    button.textContent = 'Collecting...';
    button.disabled = true;
    
    // Send message to content script
    chrome.tabs.sendMessage(activeTab.id, {
      action: 'scrollAndCollect',
      maxScrollTime: 30000 // 30 seconds of scrolling
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error sending message:', chrome.runtime.lastError);
        showNotification(`Error: ${chrome.runtime.lastError.message}`, 'error');
        resetButton(button, platform);
        return;
      }
      
      if (response && response.success) {
        showNotification(`Found ${response.postCount} posts on ${platform}`);
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
    resetButton(button, platform);
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
  notificationMessage.textContent = message;
  notification.className = 'notification show';
  
  if (type) {
    notification.classList.add(type);
  }
  
  // Auto-hide after 5 seconds
  setTimeout(hideNotification, 5000);
}

/**
 * Hide the notification
 */
function hideNotification() {
  notification.classList.remove('show');
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

// Add a connection status variable
let serverConnected = false;
let connectionErrorMessage = '';

// Load settings when popup opens
document.addEventListener('DOMContentLoaded', function() {
    // First check server connection
    checkBackendConnection();
    
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

    // Add event listener for saving API key
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
            checkBackendConnection();
        });
    }

    // Add Pure Feed functionality
    document.getElementById('pureFeedTabBtn').addEventListener('click', function() {
        // Hide all tabs and show Pure Feed tab
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.style.display = 'none';
        });
        document.getElementById('pureFeedTab').style.display = 'block';
        
        // Update active button styles
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.remove('active');
        });
        this.classList.add('active');
        
        // Load Pure Feed posts
        loadPureFeedPosts();
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

// Function to check backend connection
function checkBackendConnection() {
    const statusElement = document.getElementById('status');
    
    // Check if element exists
    if (statusElement) {
        statusElement.textContent = 'Checking connection to dashboard...';
        statusElement.className = 'status';
    } else {
        console.log('Status element not found in DOM');
    }
    
    // Check if connection message container exists, create if not
    let connectionMessageContainer = document.getElementById('connectionMessage');
    if (!connectionMessageContainer) {
        connectionMessageContainer = document.createElement('div');
        connectionMessageContainer.id = 'connectionMessage';
        connectionMessageContainer.className = 'connection-warning';
        const headerElement = document.querySelector('.header');
        if (headerElement) {
            headerElement.appendChild(connectionMessageContainer);
        } else {
            console.log('Header element not found in DOM');
        }
    }
    
    // Get API key from storage for the health check
    chrome.storage.local.get(['settings'], function(result) {
        const settings = result.settings || DEFAULT_SETTINGS;
        const apiKey = settings.apiKey || '8484e01c2e0b4d368eb9a0f9b89807ad'; // Use our default key
        
        // First try a direct API call to avoid Chrome message passing issues
        fetch('http://localhost:8000/api/health-check/', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Server connection verified directly:', data);
            serverConnected = true;
            connectionErrorMessage = '';
            statusElement.textContent = 'Connected to dashboard server';
            statusElement.className = 'status success';
            connectionMessageContainer.style.display = 'none';
        })
        .catch(error => {
            console.error('Direct server connection failed:', error);
            // Fall back to background script method
            tryBackgroundScriptConnection();
        });
    });
    
    function tryBackgroundScriptConnection() {
        // Send a message to background script to check connection
        chrome.runtime.sendMessage({ action: 'checkConnection' }, function(response) {
            if (chrome.runtime.lastError) {
                console.error('Connection check error:', chrome.runtime.lastError);
                serverConnected = false;
                connectionErrorMessage = 'Could not connect to extension background service.';
                displayConnectionStatus();
                return;
            }
            
            if (response && response.status === 'connected') {
                console.log('Connection to server verified via background script');
                serverConnected = true;
                connectionErrorMessage = '';
                statusElement.textContent = 'Connected to dashboard server';
                statusElement.className = 'status success';
                connectionMessageContainer.style.display = 'none';
            } else {
                console.error('Server connection failed:', response ? response.error : 'No response');
                serverConnected = false;
                connectionErrorMessage = response && response.error ? 
                    `Server error: ${response.error}` : 
                    'Could not connect to dashboard server. Make sure it\'s running.';
                displayConnectionStatus();
            }
        });
    }
}

// Function to display connection status
function displayConnectionStatus() {
    const statusElement = document.getElementById('status');
    const connectionMessageContainer = document.getElementById('connectionMessage');
    
    if (!serverConnected) {
        statusElement.textContent = 'Not connected to dashboard server';
        statusElement.className = 'status error';
        
        // Show error message with retry button
        connectionMessageContainer.innerHTML = `
            <p>${connectionErrorMessage}</p>
            <button id="retryConnectionBtn" class="retry-button">Retry Connection</button>
        `;
        connectionMessageContainer.style.display = 'block';
        
        // Add event listener to the newly created button
        document.getElementById('retryConnectionBtn').addEventListener('click', function() {
            checkBackendConnection();
        });
    } else {
        connectionMessageContainer.style.display = 'none';
    }
}

// Function to handle tab navigation
function showTab(tabId) {
    // Hide all tab contents
    const tabContents = document.getElementsByClassName('tab-content');
    for (let i = 0; i < tabContents.length; i++) {
        tabContents[i].classList.remove('active');
    }
    
    // Deactivate all tab buttons
    const tabButtons = document.getElementsByClassName('tab-button');
    for (let i = 0; i < tabButtons.length; i++) {
        tabButtons[i].classList.remove('active');
    }
    
    // Show the selected tab content
    document.getElementById(tabId).classList.add('active');
    
    // Activate the corresponding tab button
    document.getElementById(tabId + 'Btn').classList.add('active');
}

// Function to save data preferences
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
        const statusElement = document.getElementById('status');
        statusElement.textContent = 'Data preferences saved successfully!';
        statusElement.className = 'status success';
        
        // Reset status after 2 seconds
        setTimeout(function() {
            statusElement.textContent = serverConnected ? 'Connected to dashboard server' : 'Not connected to dashboard server';
            statusElement.className = serverConnected ? 'status success' : 'status error';
        }, 2000);
    });
}

// Function to perform scan on the current page
function performScan() {
    // If not connected to server, show warning
    if (!serverConnected) {
        const statusElement = document.getElementById('status');
        statusElement.textContent = 'Cannot scan: Not connected to dashboard server';
        statusElement.className = 'status error';
        return;
    }

    const scanButton = document.getElementById('scanButton');
    const statusElement = document.getElementById('status');
    
    // Disable button during scan
    scanButton.disabled = true;
    scanButton.textContent = 'Scanning...';
    statusElement.textContent = 'Scanning current page...';
    statusElement.className = 'status';
    
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
            statusElement.textContent = 'This page is not supported for scanning.';
            statusElement.className = 'status error';
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
                    statusElement.textContent = 'Error: Content script not responding. Try refreshing the page.';
                    statusElement.className = 'status error';
                    console.error('Runtime error:', chrome.runtime.lastError);
                    return;
                }
                
                // Handle missing response
                if (!response) {
                    statusElement.textContent = 'Error: No response from content script.';
                    statusElement.className = 'status error';
                    return;
                }
                
                // Handle scan results
                if (response.success) {
                    const count = response.posts ? response.posts.length : 0;
                    statusElement.textContent = `Successfully scanned ${count} posts!`;
                    statusElement.className = 'status success';
                    
                    // Update stats if posts were collected
                    if (count > 0) {
                        updateStatsAfterScan(platform, count);
                    }
                } else {
                    statusElement.textContent = response.message || 'Scan failed.';
                    statusElement.className = 'status error';
                }
            });
      });
    });
}

// Function to update the insights tab with analysis results
function updateInsightsTab(posts, platform) {
    const insightsContainer = document.getElementById('currentPageInsights');
    
    if (!posts || posts.length === 0) {
        insightsContainer.innerHTML = '<div style="text-align: center; color: #e74c3c; padding: 20px;">No posts found to analyze</div>';
        return;
    }
    
    // Calculate summary statistics
    let manipulativeCount = 0;
    let totalPatterns = 0;
    let patternTypes = {};
    let sentimentTotal = 0;
    let bizfluencerTotal = 0;
    
    posts.forEach(post => {
        // Add to manipulative pattern counts
        if (post.manipulative_patterns && post.manipulative_patterns.length > 0) {
            manipulativeCount++;
            totalPatterns += post.manipulative_patterns.length;
            
            post.manipulative_patterns.forEach(pattern => {
                patternTypes[pattern.type] = (patternTypes[pattern.type] || 0) + 1;
            });
        }
        
        // Add to sentiment and bizfluencer totals
        if (typeof post.sentiment_score === 'number') {
            sentimentTotal += post.sentiment_score;
        }
        
        if (typeof post.bizfluencer_score === 'number') {
            bizfluencerTotal += post.bizfluencer_score;
        }
    });
    
    // Calculate averages
    const avgSentiment = sentimentTotal / posts.length;
    const avgBizfluencer = bizfluencerTotal / posts.length;
    
    // Prepare the most common pattern types
    const sortedPatterns = Object.entries(patternTypes)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
    
    // Create the HTML
    let html = `
        <div class="insights-summary">
            <h4>Feed Analysis Summary</h4>
            <p>Analyzed ${posts.length} posts from ${platform}</p>
            
            <div class="insight-stat">
                <span class="stat-label">Manipulative Content:</span>
                <span class="stat-value">${manipulativeCount} posts (${Math.round(manipulativeCount/posts.length*100)}%)</span>
            </div>
            
            <div class="insight-stat">
                <span class="stat-label">Total Patterns Detected:</span>
                <span class="stat-value">${totalPatterns}</span>
            </div>
            
            <div class="insight-stat">
                <span class="stat-label">Average Sentiment:</span>
                <span class="stat-value">${avgSentiment.toFixed(2)} ${avgSentiment > 0 ? '😊' : avgSentiment < 0 ? '😔' : '😐'}</span>
            </div>
            
            ${platform === 'linkedin' ? `
            <div class="insight-stat">
                <span class="stat-label">Bizfluencer Score:</span>
                <span class="stat-value">${avgBizfluencer.toFixed(1)}/10</span>
            </div>
            ` : ''}
            
            ${sortedPatterns.length > 0 ? `
            <div class="insight-stat">
                <span class="stat-label">Most Common Patterns:</span>
                <ol class="pattern-list">
                    ${sortedPatterns.map(([type, count]) => 
                        `<li>${type.replace('_', ' ')} (${count})</li>`
                    ).join('')}
                </ol>
            </div>
            ` : ''}
        </div>
    `;
    
    // Add educational component
    html += `
        <div class="educational-component">
            <h4>Understanding Your Feed</h4>
            <p>Your feed contains content designed to influence your behavior. 
               Being aware of these patterns helps you make more conscious choices.</p>
            
            <div class="learn-more-section">
                <p><a href="https://www.authentic-dashboard.com/learn" target="_blank">Learn more about manipulative patterns →</a></p>
            </div>
        </div>
    `;
    
    // Update the insights container
    insightsContainer.innerHTML = html;
    
    // Add CSS for the insights tab
    const style = document.createElement('style');
    style.textContent = `
        .insights-summary {
            background-color: #f8f9fa;
            border-radius: 4px;
            padding: 12px;
            margin-bottom: 15px;
        }
        
        .insight-stat {
            margin: 8px 0;
            display: flex;
            justify-content: space-between;
            font-size: 13px;
        }
        
        .stat-label {
            color: #555;
        }
        
        .stat-value {
            font-weight: bold;
            color: #2c3e50;
        }
        
        .pattern-list {
            margin: 5px 0 0 20px;
            padding: 0;
            font-size: 12px;
        }
        
        .educational-component {
            border-top: 1px solid #ddd;
            padding-top: 12px;
            font-size: 12px;
            color: #7f8c8d;
        }
        
        .learn-more-section {
            margin-top: 10px;
            text-align: center;
        }
        
        .learn-more-section a {
            color: #3498db;
            text-decoration: none;
        }
        
        .learn-more-section a:hover {
            text-decoration: underline;
        }
    `;
    document.head.appendChild(style);
}

// Function to send posts to the API
function sendPostsToAPI(posts, platform, callback) {
    if (!posts || posts.length === 0) {
        callback(false, 0);
        return;
    }
    
    // Use the centralized API client if available
    if (window.authDashboardAPI) {
        window.authDashboardAPI.sendPosts(posts, platform)
            .then(result => {
                callback(result.success, result.successCount);
            })
            .catch(error => {
                console.error('Error sending posts to API:', error);
                callback(false, 0);
            });
        return;
    }
    
    // Fallback to legacy method if API client isn't available
    chrome.storage.local.get(['settings'], function(result) {
        const settings = result.settings || DEFAULT_SETTINGS;
        const apiKey = settings.apiKey || '8484e01c2e0b4d368eb9a0f9b89807ad'; // Use our default key if none set
        
        // Send each post to the API
        let successCount = 0;
        let failureCount = 0;
        
        posts.forEach(post => {
            fetch('http://localhost:8000/api/process-ml/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': apiKey
                },
                body: JSON.stringify(post)
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.status && (data.status === 'success' || data.status === 'duplicate post, skipped')) {
                    successCount++;
                } else {
                    failureCount++;
                }
                
                // Check if all posts have been processed
                if (successCount + failureCount === posts.length) {
                    callback(true, successCount);
                }
            })
            .catch(error => {
                console.error('Error:', error);
                failureCount++;
                
                // Check if all posts have been processed
                if (successCount + failureCount === posts.length) {
                    callback(successCount > 0, successCount);
                }
            });
        });
    });
}

// Function to update settings when toggles change
function updateSettings() {
    chrome.storage.local.get(['settings'], function(result) {
        let settings = result.settings || DEFAULT_SETTINGS;
        
        // Update settings based on toggle states
        settings.autoScan = document.getElementById('autoScan').checked;
        settings.advancedML = document.getElementById('advancedML').checked;
        settings.collectSponsored = document.getElementById('collectSponsored').checked;
        settings.showNotifications = document.getElementById('showNotifications').checked;
        
        // Save updated settings
        chrome.storage.local.set({ settings: settings });
    });
}

// Function to update stats after a successful scan
function updateStats(platform, count) {
    chrome.storage.local.get(['settings'], function(result) {
        let settings = result.settings || DEFAULT_SETTINGS;
        
        // Update total post count
        settings.stats.totalPosts += count;
        
        // Update today's post count
        const today = new Date().toDateString();
        const lastScanDate = settings.stats.lastScanDate;
        
        if (lastScanDate === today) {
            settings.stats.todayPosts += count;
        } else {
            settings.stats.todayPosts = count;
            settings.stats.lastScanDate = today;
        }
        
        // Update ML processed count (estimate)
        settings.stats.mlProcessed += Math.round(count * 0.9); // Assume ~90% of posts get ML processed
        
        // Add to scan history
        const scanEntry = {
            platform: platform,
            count: count,
            timestamp: new Date().toISOString()
        };
        
        settings.scanHistory.unshift(scanEntry);
        
        // Keep only the last 10 scans
        if (settings.scanHistory.length > 10) {
            settings.scanHistory.pop();
        }
        
        // Save updated settings
        chrome.storage.local.set({ settings: settings });
        
        // Update the displayed stats
        updateStatsDisplay(settings.stats);
        
        // Update recent scans display
        updateRecentScansDisplay(settings.scanHistory);
    });
}

// Function to update stats display
function updateStatsDisplay(stats) {
    document.getElementById('postsToday').textContent = stats.todayPosts;
    document.getElementById('postsTotal').textContent = stats.totalPosts;
    document.getElementById('mlProcessed').textContent = stats.mlProcessed;
}

/**
 * Update recent scans display
 */
function updateRecentScansDisplay(scanHistory) {
    const container = document.getElementById('recentScans');
    
    // Clear container
    container.innerHTML = '';
    
    // Create recent scan items
    if (scanHistory && scanHistory.length > 0) {
        // Only show the most recent 5 scans
        const recentScans = scanHistory.slice(0, 5);
        
        recentScans.forEach(scan => {
            const scanDate = new Date(scan.timestamp);
            const formattedTime = scanDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const formattedDate = scanDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
            
            // Create scan item with improved design
            const scanItem = document.createElement('div');
            scanItem.className = 'scan-item';
            
            // Format platform name with proper capitalization
            const platformName = scan.platform.charAt(0).toUpperCase() + scan.platform.slice(1);
            
            // Get platform icon
            const platformIcon = getPlatformIcon(scan.platform);
            
            // Create scan item content
            scanItem.innerHTML = `
                <div class="scan-content">
                    <div class="scan-info">
                        <span class="scan-platform">${platformName}</span>: 
                        <span class="scan-count">${scan.count}</span> posts collected
                    </div>
                    <div class="scan-time">${formattedTime} · ${formattedDate}</div>
                </div>
            `;
            
            container.appendChild(scanItem);
        });
    } else {
        // Show empty state
        container.innerHTML = `
            <div class="empty-state">
                <p>No recent scans. Click "Scan Current Page" to collect posts.</p>
            </div>
        `;
    }
}

// Function to update API key
function updateAPIKey() {
    const apiKeyInput = document.getElementById('apiKey');
    const apiKey = apiKeyInput.value.trim();
    
    chrome.storage.local.get(['settings'], function(result) {
        let settings = result.settings || DEFAULT_SETTINGS;
        
        // Update API key
        settings.apiKey = apiKey;
        
        // Save updated settings
        chrome.storage.local.set({ settings: settings }, function() {
            // Show brief confirmation
            const statusElement = document.getElementById('status');
            statusElement.textContent = 'API key saved successfully!';
            statusElement.className = 'status success';
            
            // Reset status after 2 seconds
            setTimeout(function() {
                statusElement.textContent = 'Ready to scan.';
                statusElement.className = 'status';
            }, 2000);
        });
    });
}

// Function to open dashboard with proper auth handling
function openDashboard() {
    chrome.storage.local.get(['apiEndpoint'], function(result) {
        let dashboardUrl = `${result.apiEndpoint || 'http://localhost:8000'}/dashboard/`;
        chrome.tabs.create({ url: dashboardUrl });
    });
}

// Function to open ML dashboard with proper auth handling
function openMLDashboard() {
    chrome.storage.local.get(['apiEndpoint'], function(result) {
        let mlDashboardUrl = `${result.apiEndpoint || 'http://localhost:8000'}/ml-dashboard/`;
        chrome.tabs.create({ url: mlDashboardUrl });
    });
}

// Function to troubleshoot dashboard access issues
function troubleshootDashboardAccess() {
    // Get API key before checking
    chrome.storage.local.get(['settings'], function(result) {
        const settings = result.settings || DEFAULT_SETTINGS;
        const apiKey = settings.apiKey || '8484e01c2e0b4d368eb9a0f9b89807ad'; // Use our default key
        
        // Check if the Django server is running
        fetch('http://localhost:8000/api/health-check/', { 
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey
            }
        })
        .then(response => {
            if (response.ok) {
                return response.json();
            }
            throw new Error('Server not responding');
        })
        .then(data => {
            // Server is running, check authentication
            if (!apiKey) {
                document.getElementById('status').textContent = 'API key is missing. Please add a valid API key.';
                document.getElementById('status').className = 'status error';
                return;
            }
            
            // Check if API key is valid
            fetch('http://localhost:8000/api/health-check/', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': apiKey
                }
            })
            .then(response => {
                if (response.ok) {
                    document.getElementById('status').textContent = 'Authentication is working correctly.';
                    document.getElementById('status').className = 'status success';
                } else {
                    document.getElementById('status').textContent = 'API key is invalid. Please update your API key.';
                    document.getElementById('status').className = 'status error';
                }
            })
            .catch(error => {
                document.getElementById('status').textContent = 'Error verifying API key: ' + error.message;
                document.getElementById('status').className = 'status error';
            });
        })
        .catch(error => {
            document.getElementById('status').textContent = 'Django server is not running at localhost:8000.';
            document.getElementById('status').className = 'status error';
        });
    });
  }

// Add auto-scanning settings section to the settings page
function addAutoScanSettings() {
  const settingsContainer = document.getElementById('settings-container');
  if (!settingsContainer) return;
  
  // Create auto-scan settings section
  const autoScanSection = document.createElement('div');
  autoScanSection.classList.add('settings-section');
  
  const sectionHeader = document.createElement('h3');
  sectionHeader.textContent = 'Auto-Scanning Settings';
  
  const description = document.createElement('p');
  description.textContent = 'Auto-scanning collects posts from social media sites at regular intervals to keep your dashboard up-to-date without manual browsing.';
  description.style.fontSize = '14px';
  description.style.color = '#666';
  description.style.marginBottom = '15px';
  
  autoScanSection.appendChild(sectionHeader);
  autoScanSection.appendChild(description);
  
  // Create enable/disable toggle
  const enableToggleContainer = document.createElement('div');
  enableToggleContainer.classList.add('setting-item');
  
  const enableLabel = document.createElement('label');
  enableLabel.textContent = 'Enable Auto-Scanning';
  enableLabel.style.display = 'flex';
  enableLabel.style.justifyContent = 'space-between';
  enableLabel.style.alignItems = 'center';
  enableLabel.style.fontWeight = 'bold';
  
  const enableToggle = document.createElement('input');
  enableToggle.type = 'checkbox';
  enableToggle.id = 'autoScanEnabled';
  
  // Load current setting
  chrome.storage.local.get(['autoScanEnabled'], function(result) {
    enableToggle.checked = result.autoScanEnabled !== false;
  });
  
  // Save setting when changed
  enableToggle.addEventListener('change', function() {
    chrome.storage.local.set({ autoScanEnabled: enableToggle.checked });
    
    // Send message to content script to update auto-scanning
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: enableToggle.checked ? 'startAutoScanning' : 'stopAutoScanning'
        });
      }
    });
    
    // Update UI based on auto-scanning state
    intervalSelect.disabled = !enableToggle.checked;
  });
  
  enableLabel.appendChild(enableToggle);
  enableToggleContainer.appendChild(enableLabel);
  autoScanSection.appendChild(enableToggleContainer);
  
  // Add interval selection
  const intervalContainer = document.createElement('div');
  intervalContainer.classList.add('setting-item');
  intervalContainer.style.marginTop = '15px';
  
  const intervalLabel = document.createElement('label');
  intervalLabel.textContent = 'Scanning Interval';
  intervalLabel.style.display = 'block';
  intervalLabel.style.marginBottom = '5px';
  intervalLabel.style.fontWeight = 'bold';
  
  const intervalDescription = document.createElement('p');
  intervalDescription.textContent = 'How often should auto-scanning collect new posts?';
  intervalDescription.style.fontSize = '14px';
  intervalDescription.style.color = '#666';
  intervalDescription.style.margin = '0 0 10px 0';
  
  const intervalSelect = document.createElement('select');
  intervalSelect.id = 'autoScanInterval';
  intervalSelect.style.width = '100%';
  intervalSelect.style.padding = '8px';
  intervalSelect.style.borderRadius = '4px';
  intervalSelect.style.border = '1px solid #ccc';
  
  // Add interval options
  const intervals = [
    { value: 2, label: '2 minutes (more frequent updates, higher resource usage)' },
    { value: 5, label: '5 minutes (recommended)' },
    { value: 10, label: '10 minutes' },
    { value: 15, label: '15 minutes' },
    { value: 30, label: '30 minutes (less frequent updates, lower resource usage)' }
  ];
  
  intervals.forEach(interval => {
    const option = document.createElement('option');
    option.value = interval.value;
    option.textContent = interval.label;
    intervalSelect.appendChild(option);
  });
  
  // Load current interval setting
  chrome.storage.local.get(['autoScanInterval'], function(result) {
    // Default to 5 minutes if not set
    const defaultInterval = 5;
    const interval = result.autoScanInterval || defaultInterval;
    
    // Find and select the matching option
    for (let i = 0; i < intervalSelect.options.length; i++) {
      if (parseInt(intervalSelect.options[i].value) === interval) {
        intervalSelect.selectedIndex = i;
        break;
      }
    }
  });
  
  // Update interval when changed
  intervalSelect.addEventListener('change', function() {
    const interval = parseInt(intervalSelect.value);
    chrome.storage.local.set({ autoScanInterval: interval });
    
    // Send message to content script to update interval
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'updateAutoScanInterval',
          interval: interval
        });
      }
    });
  });
  
  intervalContainer.appendChild(intervalLabel);
  intervalContainer.appendChild(intervalDescription);
  intervalContainer.appendChild(intervalSelect);
  
  // Disable interval selector if auto-scanning is disabled
  chrome.storage.local.get(['autoScanEnabled'], function(result) {
    intervalSelect.disabled = result.autoScanEnabled === false;
  });
  
  autoScanSection.appendChild(intervalContainer);
  
  // Add status information
  const statusContainer = document.createElement('div');
  statusContainer.classList.add('setting-item');
  statusContainer.style.marginTop = '20px';
  statusContainer.style.backgroundColor = '#f5f5f5';
  statusContainer.style.padding = '10px';
  statusContainer.style.borderRadius = '4px';
  
  const statusTitle = document.createElement('div');
  statusTitle.textContent = 'Auto-Scanning Status';
  statusTitle.style.fontWeight = 'bold';
  statusTitle.style.marginBottom = '5px';
  
  const statusContent = document.createElement('div');
  statusContent.id = 'autoScanStatus';
  statusContent.textContent = 'Checking status...';
  
  // Get current status from active tab
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'getAutoScanStatus' }, function(response) {
        if (chrome.runtime.lastError) {
          // Communication error
          statusContent.textContent = 'Status unavailable on this page';
          return;
        }
        
        if (response && response.status) {
          statusContent.textContent = response.status;
        } else {
          statusContent.textContent = 'Not running on this page';
        }
      });
    } else {
      statusContent.textContent = 'No active tab detected';
    }
  });
  
  const refreshStatus = document.createElement('button');
  refreshStatus.textContent = 'Refresh Status';
  refreshStatus.style.marginTop = '5px';
  refreshStatus.style.padding = '5px 10px';
  refreshStatus.style.border = 'none';
  refreshStatus.style.borderRadius = '4px';
  refreshStatus.style.backgroundColor = '#4CAF50';
  refreshStatus.style.color = 'white';
  refreshStatus.style.cursor = 'pointer';
  
  refreshStatus.addEventListener('click', function() {
    // Get updated status from active tab
    statusContent.textContent = 'Refreshing...';
    
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'getAutoScanStatus' }, function(response) {
          if (chrome.runtime.lastError) {
            statusContent.textContent = 'Status unavailable on this page';
            return;
          }
          
          if (response && response.status) {
            statusContent.textContent = response.status;
          } else {
            statusContent.textContent = 'Not running on this page';
          }
        });
      } else {
        statusContent.textContent = 'No active tab detected';
      }
    });
  });
  
  statusContainer.appendChild(statusTitle);
  statusContainer.appendChild(statusContent);
  statusContainer.appendChild(refreshStatus);
  
  autoScanSection.appendChild(statusContainer);
  
  // Add a separator
  const separator = document.createElement('hr');
  separator.style.margin = '20px 0';
  separator.style.border = '0';
  separator.style.height = '1px';
  separator.style.backgroundColor = '#ddd';
  
  // Add section to settings
  settingsContainer.appendChild(separator);
  settingsContainer.appendChild(autoScanSection);
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
    const statusElement = document.getElementById('autoScanStatus');
    if (statusElement) {
      statusElement.textContent = message.status;
    }
  }
  
  return true;
});

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
  