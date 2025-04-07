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
            url: 'http://localhost:8000/onboarding/'
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
                throw { response, error: new Error(`HTTP error in ML processing! Status: ${response.status}`) };
            }
            return response.json();
        })
        .then(mlData => {
            console.log('ML processing successful:', mlData);
            
            // Now send to the post storage endpoint
            return fetch('http://localhost:8000/api/post/', {
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
      iconUrl: 'icon48.png',
      title: message.title || 'Authentic Dashboard',
      message: message.message || 'Notification from Authentic Dashboard'
    });
    // Always send a response
    sendResponse({success: true});
    return true;
  }
  
  // Handle connection check messages
  if (message.action === 'checkConnection') {
    // Get API key first
    chrome.storage.local.get(['settings'], function(result) {
      const settings = result.settings || { apiKey: '8484e01c2e0b4d368eb9a0f9b89807ad' };
      const apiKey = settings.apiKey || '8484e01c2e0b4d368eb9a0f9b89807ad';
      
      // Verify backend API connection
      fetch('http://localhost:8000/api/health-check/', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        }
      })
      .then(response => {
        if (!response.ok) {
          throw { response, error: new Error(`HTTP error! Status: ${response.status}`) };
        }
        return response.json();
      })
      .then(data => {
        console.log('Backend connection check successful:', data);
        sendResponse({status: 'connected', server: true, data});
      })
      .catch(err => {
        let errorObject = err.error || err;
        let response = err.response;
        
        if (response) {
          // HTTP error
          handleFetchError(errorObject, response).then(errorData => {
            console.error('Backend connection check failed:', errorData);
            sendResponse({
              status: 'disconnected', 
              server: false, 
              error: errorData.message || 'Unknown error',
              details: errorData
            });
          });
        } else {
          // Network error
          console.error('Backend connection check failed:', errorObject);
          sendResponse({
            status: 'disconnected', 
            server: false, 
            error: errorObject.message || 'Network error',
            details: { networkError: true }
          });
        }
      });
    });
    
    // Return true to indicate we will send the response asynchronously
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