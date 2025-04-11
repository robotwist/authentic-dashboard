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
                const settings = result.settings || DEFAULT_SETTINGS;
                
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
        // Set default settings
        chrome.storage.local.get(['settings'], function(result) {
            if (!result.settings) {
                chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
                console.log("Default settings initialized");
            }
        });
        
        // Show welcome notification
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon128.png',
            title: 'Welcome to Authentic Dashboard',
            message: 'Thanks for installing! Click to open the onboarding page.'
        });
    } else if (details.reason === 'update') {
        // Check if API endpoint exists, if not add it
        chrome.storage.local.get(['settings'], function(result) {
            if (result.settings && !result.settings.apiEndpoint) {
                result.settings.apiEndpoint = DEFAULT_SETTINGS.apiEndpoint;
                chrome.storage.local.set({ settings: result.settings });
                console.log("Added API endpoint to settings");
            }
        });
    }
    
    // Always reset API availability status on install or update
    resetApiAvailabilityStatus();
});

// Also reset API status on browser startup
chrome.runtime.onStartup.addListener(function() {
    console.log("Extension starting up - resetting API availability status");
    resetApiAvailabilityStatus();
});

// Function to reset API availability status
function resetApiAvailabilityStatus() {
    console.log("Resetting API availability status");
    chrome.storage.local.set({
        apiAvailable: undefined,
        apiLastCheck: 0
    }, function() {
        console.log("API availability status has been reset");
        
        // Force a fresh check if authDashboardAPI is available
        setTimeout(() => {
            if (window.authDashboardAPI) {
                window.authDashboardAPI.checkAvailability(true)
                    .then(status => {
                        console.log("Initial API availability check result:", status);
                    })
                    .catch(err => {
                        console.error("Error checking API availability:", err);
                    });
            }
        }, 2000); // Wait for API client to initialize
    });
}

// Listen for clicks on notifications
chrome.notifications.onClicked.addListener(function(notificationId) {
    // Open dashboard
    chrome.tabs.create({ url: 'http://localhost:8000/dashboard/' });
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
    
    // Use the API client to send posts
    window.authDashboardAPI.sendPosts(posts, platform)
        .then(result => {
            if (result.success) {
                // Update stats
                updateStats(platform, result.successCount, settings);
                
                // Show notification if enabled
                if (settings.showNotifications) {
                    showNotification(
                        'Authentic Dashboard', 
                        `Auto-scan: Collected ${result.successCount} posts from ${platform}.`
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
}

// Track statistics for each scan
function updateStats(platform, count, settings) {
    const today = new Date().toISOString().split('T')[0];
    
    chrome.storage.local.get(['stats'], function(result) {
        let stats = result.stats || {};
        
        if (!stats[today]) {
            stats[today] = {
                totalPosts: 0,
                platforms: {}
            };
        }
        
        if (!stats[today].platforms[platform]) {
            stats[today].platforms[platform] = 0;
        }
        
        stats[today].totalPosts += count;
        stats[today].platforms[platform] += count;
        
        // Limit stats to last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
        
        for (const day in stats) {
            if (day < thirtyDaysAgoStr) {
                delete stats[day];
            }
        }
        
        chrome.storage.local.set({ stats: stats });
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

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'showNotification') {
        showNotification(request.title, request.message, request.type);
        sendResponse({success: true});
    } else if (request.action === 'checkAPIEndpoint') {
        // Force a check of the API availability
        window.authDashboardAPI.checkAvailability(true)
            .then(status => {
                sendResponse({
                    success: true,
                    available: status.available,
                    endpoint: status.endpoint
                });
            })
            .catch(error => {
                sendResponse({
                    success: false,
                    error: error.message
                });
            });
        
        // Return true to indicate we'll send a response asynchronously
        return true;
    } else if (request.action === 'getStats') {
        chrome.storage.local.get(['stats'], function(result) {
            sendResponse({
                success: true,
                stats: result.stats || {}
            });
        });
        
        // Return true to indicate we'll send a response asynchronously
        return true;
    }
});

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

// Run API endpoint check every 5 minutes
setInterval(() => {
    window.authDashboardAPI.checkAvailability(true);
}, 5 * 60 * 1000);

// Also run it on startup
// Wait for the API client to initialize before checking availability
setTimeout(() => {
    if (window.authDashboardAPI) {
        window.authDashboardAPI.checkAvailability(true);
    }
}, 2000); // Wait 2 seconds for initialization 