// Import the API client when running as a module
import authDashboardAPI from './api_client.js';

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
            if (typeof authDashboardAPI !== 'undefined') {
                authDashboardAPI.checkAvailability(true)
                    .then(status => {
                        console.log("Initial API availability check result:", status);
                    })
                    .catch(err => {
                        console.error("Error checking API availability:", err);
                    });
            } else {
                console.log("authDashboardAPI not available in background context");
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
    authDashboardAPI.sendPosts(posts, platform)
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
    console.log("Background script received message:", request.action);
    
    if (request.action === 'showNotification') {
        showNotification(request.title, request.message, request.type);
        sendResponse({success: true});
    } else if (request.action === 'checkAPIEndpoint') {
        // Force a check of the API availability
        if (authDashboardAPI) {
            authDashboardAPI.checkAvailability(request.forceCheck || true)
            .then(status => {
                    sendResponse({
                        success: true,
                        available: status.available,
                        endpoint: status.endpoint,
                        apiKey: status.apiKey
                    });
                })
                .catch(error => {
                    sendResponse({
                        success: false,
                        error: error.message
                    });
                });
        } else {
            // Fallback if API client isn't available
            checkAPIAvailabilityDirectly()
                .then(result => {
                    sendResponse({
                        success: true,
                        available: result.available,
                        endpoint: result.endpoint,
                        apiKey: result.apiKey
                    });
                })
                .catch(error => {
                    sendResponse({
                        success: false,
                        error: error.message
                    });
                });
        }
        return true; // Keep the message channel open for the async response
    } else if (request.action === 'proxyApiCall') {
        // New handler to proxy API calls from content scripts to bypass CSP restrictions
        console.log(`Proxying API call to ${request.endpoint}`);
        
        // Get stored API key if not provided
        chrome.storage.local.get(['apiKey'], function(result) {
            const apiKey = request.headers['X-API-Key'] || 
                           request.headers['x-api-key'] || 
                           result.apiKey || 
                           '42ad72779a934c2d8005992bbecb6772'; // Default fallback
            
            // Setup headers with API key
            const headers = { 
                'Content-Type': 'application/json',
                'X-API-Key': apiKey,
                ...request.headers 
            };
            
            // Make the actual fetch request
            fetch(request.endpoint, {
                method: request.method || 'GET',
                headers: headers,
                body: request.body ? JSON.stringify(request.body) : null
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                sendResponse({
                    success: true,
                    data: data
                });
            })
            .catch(error => {
                console.error("Error in proxied API call:", error);
                sendResponse({
                    success: false,
                    error: error.message || "Unknown error in API call"
                });
            });
        });
        
        return true; // Keep the message channel open for the async response
    } else if (request.action === 'healthCheck') {
        // Simple API health check
        const endpoint = request.endpoint || 'http://localhost:8000';
        const apiKey = request.apiKey;
        
        fetch(`${endpoint}/api/health-check/`)
            .then(response => response.json())
            .then(data => {
                sendResponse({
                    success: true,
                    data: data,
                    status: 'API is operational'
                });
            })
            .catch(error => {
                sendResponse({
                    success: false,
                    error: error.message
                });
            });
        return true;
    } else if (request.action === 'verifyApiKey') {
        // Verify an API key
        const endpoint = request.endpoint || 'http://localhost:8000';
        const apiKey = request.apiKey;
        
        if (!apiKey) {
            sendResponse({
                success: false,
                error: 'No API key provided'
            });
            return true;
        }
        
        fetch(`${endpoint}/api/verify-key/`, {
            headers: {
                'X-API-Key': apiKey
            }
        })
            .then(response => response.json())
            .then(data => {
                sendResponse({
                    success: true,
                    valid: data.valid === true,
                    data: data
                });
            })
            .catch(error => {
                sendResponse({
                    success: false,
                    error: error.message
                });
            });
        return true;
    } else if (request.action === 'checkConnection') {
        // Check connection to server
        try {
            // Simple response to tell content script that background script is responsive
            // This doesn't actually check the API yet - just confirms background script is working
            sendResponse({
                status: 'connected',
                backgroundScriptWorking: true
            });
            
            // Then also check actual API connection if requested
            if (request.checkApi && authDashboardAPI) {
                authDashboardAPI.checkAvailability(true)
                    .then(status => {
                        console.log("API connection check result:", status);
                    })
                    .catch(error => {
                        console.error("API connection check error:", error);
                    });
            }
        } catch (error) {
            console.error("Error in checkConnection handler:", error);
            sendResponse({
                status: 'error',
                error: error.message
            });
        }
        return true;
    } else if (request.action === 'sendPosts') {
        // This handler processes post data from content scripts and sends it to API
        console.log("Background script received sendPosts message:", request.platform, 
                    request.posts ? request.posts.length : 0);
        
        // Validate the request
        if (!request.posts || !Array.isArray(request.posts) || request.posts.length === 0) {
            console.error("Invalid posts data received");
            sendResponse({
                success: false,
                error: "Invalid posts data"
            });
            return true;
        }
        
        if (!request.platform) {
            console.error("Missing platform in sendPosts request");
            sendResponse({
                success: false,
                error: "Missing platform"
            });
            return true;
        }
        
        // Format boolean fields properly (ensure they are actual booleans)
        const formattedPosts = request.posts.map(post => ({
            ...post,
            is_friend: Boolean(post.is_friend),
            is_family: Boolean(post.is_family),
            verified: Boolean(post.verified),
            is_sponsored: Boolean(post.is_sponsored),
            is_job_post: Boolean(post.is_job_post)
        }));
        
        // Use the API client to send the posts
        try {
            if (authDashboardAPI) {
                console.log("Using API client to send posts to API");
                authDashboardAPI.sendPosts(formattedPosts, request.platform)
                    .then(result => {
                        console.log("Successfully sent posts via API client:", result);
                        sendResponse({
                            success: true, 
                            message: `Successfully sent ${formattedPosts.length} posts from ${request.platform}`,
                            result: result
                        });
                    })
                    .catch(error => {
                        console.error("Error sending posts via API client:", error);
                        sendResponse({
                            success: false,
                            error: error.message || "Unknown error sending posts",
                            errorDetails: error
                        });
                    });
            } else {
                console.error("API client not available");
                sendResponse({
                    success: false,
                    error: "API client not available"
                });
            }
        } catch (error) {
            console.error("Exception in sendPosts handler:", error);
            sendResponse({
                success: false,
                error: error.message || "Unknown error in sendPosts handler"
            });
        }
        
        return true; // Keep the message channel open for the async response
    } else if (request.action === 'getStats') {
        chrome.storage.local.get(['stats'], function(result) {
            sendResponse({
                success: true,
                stats: result.stats || {}
            });
        });
        
        // Return true to indicate we'll send a response asynchronously
        return true;
    } else if (request.action === 'performHealthCheck') {
        // Handle health check requests from content scripts
        console.log("Background script received health check request for:", request.endpoint);
        
        const endpoint = request.endpoint || 'http://localhost:8000';
        
        // Use fetch directly from background script (not subject to website CSP)
        fetch(`${endpoint}/api/health-check/`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => {
            console.log("Health check result:", response.status, response.ok);
            sendResponse({
                success: true,
                available: response.ok,
                status: response.status
            });
        })
        .catch(error => {
            console.error("Health check error:", error);
            sendResponse({
                success: false,
                available: false,
                error: error.message
            });
        });
        
        return true; // Keep the message channel open for the async response
    }
});

// Add external message listener to allow communication from websites
chrome.runtime.onMessageExternal.addListener(function(request, sender, sendResponse) {
    console.log("Received external message from:", sender.url);
    
    // Only allow messages from trusted domains
    const trustedDomains = [
        'localhost',
        '127.0.0.1',
        'authentic-dashboard.com',
        'authentic-dashboard.herokuapp.com'
    ];
    
    const senderUrl = new URL(sender.url);
    const isTrusted = trustedDomains.some(domain => senderUrl.hostname.includes(domain));
    
    if (!isTrusted) {
        console.error("Message received from untrusted domain:", senderUrl.hostname);
        sendResponse({ error: "Unauthorized domain" });
        return;
    }
    
    // Handle only limited set of actions from external sources
    if (request.action === 'checkStatus') {
        sendResponse({
            success: true,
            version: chrome.runtime.getManifest().version,
            name: chrome.runtime.getManifest().name
        });
    } else if (request.action === 'checkAPIEndpoint') {
        // Check API connection status for external site
        if (authDashboardAPI) {
            authDashboardAPI.checkAvailability(true)
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
                        error: error.message || "API check failed"
                    });
                });
                
            return true; // Keep message channel open for async response
        } else {
            sendResponse({
                success: false,
                error: "API client not available"
            });
        }
    } else {
        sendResponse({ error: "Unsupported action" });
    }
});

// Helper function to check API availability directly
function checkAPIAvailabilityDirectly() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(['apiEndpoint', 'apiKey'], function(result) {
            const apiEndpoint = result.apiEndpoint || 'http://localhost:8000';
            const apiKey = result.apiKey;
            
            // Try the health check endpoint
            fetch(`${apiEndpoint}/api/health-check/`)
                .then(response => {
                    if (response.ok) {
                        // API is available
                        chrome.storage.local.set({
                            apiAvailable: true,
                            apiLastCheck: Date.now()
                        });
                        
                        resolve({
                            available: true,
                            endpoint: apiEndpoint,
                            apiKey: apiKey
                        });
                    } else {
                        // API returned an error
                        throw new Error(`API returned status ${response.status}`);
                    }
                })
                .catch(error => {
                    console.error("Direct API check failed:", error);
                    
                    // Try alternative endpoints
                    const alternativeEndpoints = [
                        'http://localhost:8000',
                        'http://127.0.0.1:8000',
                        'http://0.0.0.0:8000'
                    ].filter(ep => ep !== apiEndpoint);
                    
                    // Try each alternative
                    tryNextEndpoint(0, alternativeEndpoints);
                });
                
            function tryNextEndpoint(index, endpoints) {
                if (index >= endpoints.length) {
                    // All alternatives failed
                    chrome.storage.local.set({
                        apiAvailable: false,
                        apiLastCheck: Date.now()
                    });
                    
                    reject(new Error("All API endpoints are unavailable"));
                    return;
                }
                
                const endpoint = endpoints[index];
                
                fetch(`${endpoint}/api/health-check/`)
                    .then(response => {
                        if (response.ok) {
                            // Found a working endpoint
                            chrome.storage.local.set({
                                apiAvailable: true,
                                apiLastCheck: Date.now(),
                                apiEndpoint: endpoint
                            });
                            
                            resolve({
                                available: true,
                                endpoint: endpoint,
                                apiKey: apiKey
                            });
                        } else {
                            // Try next endpoint
                            tryNextEndpoint(index + 1, endpoints);
                        }
                    })
                    .catch(() => {
                        // Try next endpoint
                        tryNextEndpoint(index + 1, endpoints);
                    });
            }
        });
    });
}

// Helper function to send posts with direct fetch API
function sendPostsWithDirectFetch(posts, platform, apiKey, apiEndpoint, sendResponse) {
    // Default values if not provided
    const key = apiKey || '42ad72779a934c2d8005992bbecb6772';
    const endpoint = apiEndpoint || 'http://localhost:8000';
    
    console.log(`Using direct fetch to send ${posts.length} posts to ${endpoint}`);
    
    // Implement retry logic for API calls
    let retryCount = 0;
    const maxRetries = 3;
    const initialDelay = 1000; // 1 second
    
    function attemptFetch(delay) {
        console.log(`API call attempt ${retryCount + 1}/${maxRetries + 1} for ${platform} posts`);
        
        fetch(`${endpoint}/api/collect-posts/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': key
            },
            body: JSON.stringify({
                platform: platform,
                posts: posts
            })
        })
        .then(response => {
            if (!response.ok) {
                if (response.status === 429) {
                    // Rate limited - longer backoff
                    throw new Error(`Rate limited! Status: ${response.status}`);
                }
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log("Successfully sent posts with direct fetch:", data);
            sendResponse({
                success: true,
                message: `Successfully sent ${posts.length} posts from ${platform}`,
                result: data
            });
        })
        .catch(error => {
            console.error(`Error sending posts (attempt ${retryCount + 1}):`, error);
            
            if (retryCount < maxRetries) {
                retryCount++;
                const nextDelay = delay * 2; // Exponential backoff
                console.log(`Retrying in ${nextDelay}ms...`);
                setTimeout(() => attemptFetch(nextDelay), nextDelay);
            } else {
                console.error("Max retries exceeded. Giving up.");
                sendResponse({
                    success: false,
                    error: error.message,
                    message: `Failed to send posts after ${maxRetries + 1} attempts`
                });
            }
        });
    }
    
    // Start the first attempt
    attemptFetch(initialDelay);
    
    // Return true to keep the message channel open for the async response
    return true;
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

// Run API endpoint check every 5 minutes
setInterval(() => {
    authDashboardAPI.checkAvailability(true);
}, 5 * 60 * 1000);

// Also run it on startup
// Service Workers don't have window, use self or globalThis instead
setTimeout(() => {
    // Check if API client is available in the service worker context
    if (typeof authDashboardAPI !== 'undefined') {
        authDashboardAPI.checkAvailability(true);
    } else {
        console.log("authDashboardAPI not available in background context");
    }
}, 2000); // Wait 2 seconds for initialization 