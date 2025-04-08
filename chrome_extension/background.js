// Listen for tab updates to trigger auto-scanning
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    // Only act when the page is fully loaded
    if (changeInfo.status === 'complete') {
        // Check if we're on a supported platform
        const supportedPlatforms = ['instagram.com', 'facebook.com', 'linkedin.com'];
        const isSupported = supportedPlatforms.some(platform => tab.url.includes(platform));
        
        if (isSupported) {
            // Check if auto-scan is enabled
            chrome.storage.local.get(['settings'], function(result) {
                const settings = result.settings || {
                    autoScan: true,
                    advancedML: true,
                    collectSponsored: true,
                    showNotifications: true
                };
                
                if (settings.autoScan) {
                    // Wait a bit for page to fully render content
                    setTimeout(() => {
                        performAutoScan(tabId, tab.url, settings);
                    }, 3000);
                }
            });
        }
    }
});

// Listen for installation and update events
chrome.runtime.onInstalled.addListener(function(details) {
    if (details.reason === 'install') {
        // Initialize default settings on install
        const defaultSettings = {
            autoScan: true,
            advancedML: true,
            collectSponsored: true,
            showNotifications: true,
            scanHistory: [],
            stats: {
                totalPosts: 0,
                todayPosts: 0,
                mlProcessed: 0,
                lastScanDate: new Date().toDateString()
            }
        };
        
        chrome.storage.local.set({ settings: defaultSettings });
        
        // Open onboarding page
        chrome.tabs.create({
            url: 'http://127.0.0.1:8080/onboarding/'
        });
    }
});

// Function to perform auto scan when navigating to supported platforms
function performAutoScan(tabId, url, settings) {
    // Determine platform from URL
    let platform = 'unknown';
    if (url.includes('instagram.com')) {
        platform = 'instagram';
    } else if (url.includes('facebook.com')) {
        platform = 'facebook';
    } else if (url.includes('linkedin.com')) {
        platform = 'linkedin';
    }
    
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

// Function to send posts to backend API
function sendPostsToAPI(posts, platform, settings) {
    if (!posts || posts.length === 0) {
        return;
    }
    
    // Use the default API key if none is provided
    const apiKey = settings.apiKey || '8484e01c2e0b4d368eb9a0f9b89807ad';
    let successCount = 0;
    let failureCount = 0;
    
    posts.forEach(post => {
        // Ensure boolean fields are properly formatted as true booleans
        // This fixes the issue with the API validation
        if (post.is_friend !== undefined) post.is_friend = Boolean(post.is_friend);
        if (post.is_family !== undefined) post.is_family = Boolean(post.is_family);
        if (post.verified !== undefined) post.verified = Boolean(post.verified);
        if (post.is_sponsored !== undefined) post.is_sponsored = Boolean(post.is_sponsored);
        if (post.is_job_post !== undefined) post.is_job_post = Boolean(post.is_job_post);
        
        // First, send to ML processing endpoint
        fetch('http://127.0.0.1:8080/api/process-ml/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey
            },
            body: JSON.stringify(post)
        })
        .then(response => {
            if (!response.ok) {
                throw { response, error: new Error(`HTTP error in ML processing! Status: ${response.status}`) };
            }
            return response.json();
        })
        .then(mlData => {
            console.log('ML processing successful:', mlData);
            
            // Now send to the post storage endpoint
            return fetch('http://127.0.0.1:8080/api/post/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': apiKey
                },
                body: JSON.stringify(post)
            });
        })
        .then(response => {
            // Check for HTTP errors
            if (!response.ok) {
                throw { response, error: new Error(`HTTP error in post storage! Status: ${response.status}`) };
            }
            return response.json();
        })
        .then(data => {
            if (data.status && (data.status === 'post saved and processed' || data.status === 'duplicate post, skipped')) {
                successCount++;
            } else {
                failureCount++;
            }
            
            // Check if all posts have been processed
            if (successCount + failureCount === posts.length && successCount > 0) {
                // Update stats
                updateStats(platform, successCount, settings);
                
                // Show notification if enabled
                if (settings.showNotifications) {
                    showNotification(
                        'Authentic Dashboard', 
                        `Auto-scan: Collected ${successCount} posts from ${platform}.`
                    );
                }
            }
        })
        .catch(err => {
            console.error('Error sending post to API:', err);
            failureCount++;
            
            let errorObject = err.error || err;
            let response = err.response;
            
            // Process the error
            if (response) {
                handleFetchError(errorObject, response).then(errorData => {
                    console.error('API Error details:', errorData);
                    
                    // Show notification about API error
                    if (settings.showNotifications && failureCount === 1) {
                        showNotification(
                            'API Connection Error',
                            errorData.message || 'Could not connect to the dashboard server.',
                            'error'
                        );
                    }
                });
            } else {
                // Network error case
                if (settings.showNotifications && failureCount === 1) {
                    showNotification(
                        'API Connection Error',
                        `Could not connect to the dashboard server: ${errorObject.message}`,
                        'error'
                    );
                }
            }
        });
    });
}

// Function to update stats after successful scan
function updateStats(platform, count, currentSettings) {
    chrome.storage.local.get(['settings'], function(result) {
        // Make sure to get the most up-to-date settings
        let settings = result.settings || currentSettings;
        
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
        settings.stats.mlProcessed += Math.round(count * 0.9);
        
        // Add to scan history
        const scanEntry = {
            platform: platform,
            count: count,
            timestamp: new Date().toISOString(),
            automatic: true
        };
        
        settings.scanHistory.unshift(scanEntry);
        
        // Keep only the last 10 scans
        if (settings.scanHistory.length > 10) {
            settings.scanHistory.pop();
        }
        
        // Save updated settings
        chrome.storage.local.set({ settings: settings });
    });
}

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

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === 'showNotification') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon128.png',
      title: message.title || 'Authentic Dashboard',
      message: message.message || 'Notification from Authentic Dashboard',
      priority: 1
    });
    
    return true;
  }
  
  // Handle API endpoint check request
  if (message.action === 'checkAPIEndpoint') {
    checkAPIEndpoint();
    return true;
  }
  
  // Handle successful auto-scan completion
  if (message.action === 'autoScanComplete') {
    // Only show notification if significant number of posts were found
    if (message.postsFound && message.postsFound >= 3) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon128.png',
        title: 'Auto-Scan Complete',
        message: `Found ${message.postsFound} new posts on ${message.platform}`,
        priority: 1
      });
    }
    
    // Update badge with count
    if (sender.tab) {
      chrome.action.setBadgeText({
        text: message.postsFound.toString(),
        tabId: sender.tab.id
      });
      
      // Clear badge after 5 seconds
      setTimeout(() => {
        chrome.action.setBadgeText({
          text: '',
          tabId: sender.tab.id
        });
      }, 5000);
    }
    
    return true;
  }
});

// Function to handle fetch errors with better error messages
function handleFetchError(error, response) {
  if (!response) {
    // Network error (server unreachable)
    return {
      status: 'error',
      message: 'Network error: Server unreachable. Check if the dashboard server is running.',
      error: error.message
    };
  }
  
  // Try to parse the error response
  return response.json()
    .then(errorData => {
      return {
        status: 'error',
        message: errorData.error || errorData.message || `HTTP Error: ${response.status}`,
        statusCode: response.status,
        error: errorData
      };
    })
    .catch(() => {
      // If we can't parse the JSON, just return the status
      return {
        status: 'error',
        message: `HTTP Error: ${response.status}`,
        statusCode: response.status
      };
    });
}

// Improved function to show notifications
function showNotification(title, message, type = 'info') {
  let iconPath = 'icon48.png';
  
  // Different icons for different notification types
  if (type === 'error') {
    title = title || 'Error';
    iconPath = 'icon48.png'; // You could use a different icon for errors
  }
  
  chrome.notifications.create({
    type: 'basic',
    iconUrl: iconPath,
    title: title,
    message: message
  });
}

// Enhanced API endpoint check
function checkAPIEndpoint() {
    console.log("Checking API endpoint availability...");
    
    chrome.storage.local.get(['apiEndpoint', 'apiKey'], function(result) {
        const apiEndpoint = result.apiEndpoint || 'http://localhost:8000';
        const apiKey = result.apiKey || '';
        
        console.log("Testing API endpoint:", apiEndpoint);
        
        fetch(`${apiEndpoint}/api/health-check/`, {
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
            throw new Error("API server not available");
        })
        .then(data => {
            console.log("API server available:", data);
            
            // Store API status
            chrome.storage.local.set({
                apiAvailable: true,
                apiLastCheck: Date.now(),
                apiEndpoint: apiEndpoint
            });
            
            // Update badge to green
            chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
            chrome.action.setBadgeText({ text: '✓' });
            
            setTimeout(() => {
                chrome.action.setBadgeText({ text: '' });
            }, 5000);
        })
        .catch(error => {
            console.error("API server not available:", error);
            
            // Try alternative endpoints
            const currentEndpoint = apiEndpoint;
            const alternativeEndpoints = [
                'http://localhost:8000',
                'http://127.0.0.1:8000',
                'http://0.0.0.0:8000'
            ];

            // Function to try the next endpoint
            const tryNextEndpoint = (index) => {
                if (index >= alternativeEndpoints.length) {
                    // If all alternatives fail, update status
                    chrome.storage.local.set({
                        apiAvailable: false,
                        apiLastCheck: Date.now()
                    });
                    
                    // Update badge to red
                    chrome.action.setBadgeBackgroundColor({ color: '#F44336' });
                    chrome.action.setBadgeText({ text: '!' });
                    
                    return;
                }
                
                const endpoint = alternativeEndpoints[index];
                
                // Skip current endpoint
                if (endpoint === currentEndpoint) {
                    tryNextEndpoint(index + 1);
                    return;
                }
                
                console.log(`Trying alternative endpoint: ${endpoint}`);
                
                fetch(`${endpoint}/api/health-check/`, {
                    method: 'GET'
                })
                .then(response => {
                    if (response.ok) {
                        console.log(`Alternative endpoint available: ${endpoint}`);
                        
                        // Store the working endpoint
                        chrome.storage.local.set({
                            apiAvailable: true,
                            apiLastCheck: Date.now(),
                            apiEndpoint: endpoint,
                            apiAutoDetected: true
                        });
                        
                        // Update badge
                        chrome.action.setBadgeBackgroundColor({ color: '#FFC107' });
                        chrome.action.setBadgeText({ text: '✓' });
                        
                        setTimeout(() => {
                            chrome.action.setBadgeText({ text: '' });
                        }, 5000);
                        
                        // Notify user that we found an alternative endpoint
                        chrome.notifications.create({
                            type: 'basic',
                            iconUrl: 'icon128.png',
                            title: 'API Endpoint Changed',
                            message: `Connected to alternative endpoint: ${endpoint}`
                        });
                    } else {
                        // Try next endpoint
                        tryNextEndpoint(index + 1);
                    }
                })
                .catch(() => {
                    // Try next endpoint
                    tryNextEndpoint(index + 1);
                });
            };
            
            // Start trying alternatives
            tryNextEndpoint(0);
        });
    });
}

// Run API endpoint check every 5 minutes
setInterval(checkAPIEndpoint, 5 * 60 * 1000);

// Also run it on startup
checkAPIEndpoint(); 