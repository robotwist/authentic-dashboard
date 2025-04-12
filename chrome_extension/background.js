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

// Keep-alive mechanism to prevent service worker from becoming inactive
let keepAliveInterval;
let isProcessingMessages = false;
let pendingOperations = 0;

// Function to keep the service worker alive during operations
function keepAlive() {
  if (!keepAliveInterval) {
    console.log("Starting background script keep-alive interval");
    keepAliveInterval = setInterval(() => {
      console.log("Background service worker keep-alive ping");
      
      // Check for stuck operations
      if (isProcessingMessages && pendingOperations > 0) {
        console.log(`Still processing ${pendingOperations} pending operations`);
      }
    }, 20000); // Every 20 seconds
  }
}

// Start keep-alive when extension loads
keepAlive();

// Track active operations to prevent premature termination
function trackOperation(increment = true) {
  if (increment) {
    pendingOperations++;
    isProcessingMessages = true;
  } else {
    pendingOperations = Math.max(0, pendingOperations - 1);
    if (pendingOperations === 0) {
      isProcessingMessages = false;
    }
  }
  console.log(`Active operations: ${pendingOperations}`);
}

// Enhanced error handling for API requests
function safeApiFetch(url, options, maxRetries = 3) {
  let retryCount = 0;
  const initialDelay = 1000;
  
  return new Promise((resolve, reject) => {
    function attemptFetch(delay) {
      console.log(`API fetch attempt ${retryCount + 1}/${maxRetries + 1} to ${url}`);
      
      fetch(url, options)
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
          }
          return response.json();
        })
        .then(data => {
          console.log(`API fetch successful: ${url}`);
          resolve(data);
        })
        .catch(error => {
          console.error(`Error in API fetch (attempt ${retryCount + 1}):`, error);
          
          if (retryCount < maxRetries) {
            retryCount++;
            const nextDelay = delay * 2; // Exponential backoff
            console.log(`Retrying in ${nextDelay}ms...`);
            setTimeout(() => attemptFetch(nextDelay), nextDelay);
          } else {
            console.error("Max retries exceeded. Giving up.");
            reject(error);
          }
        });
    }
    
    attemptFetch(initialDelay);
  });
}

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

// Standard response format function
function createResponse(success, data = null, error = null) {
  const response = { success };
  
  if (success && data !== null) {
    response.data = data;
  }
  
  if (!success && error !== null) {
    response.error = typeof error === 'object' ? error.message || JSON.stringify(error) : error;
  }
  
  return response;
}

// Optimized handler for sending posts to the API
function handleSendPosts(request, sender, sendResponse) {
    // Track this operation to ensure service worker stays active
    trackOperation(true);
    
    console.log("Background script received sendPosts message:", request.platform, 
                request.posts ? request.posts.length : 0, 
                "from:", sender.tab ? sender.tab.url : "extension");
    
    // Validate the request
    if (!request.posts || !Array.isArray(request.posts) || request.posts.length === 0) {
        console.error("Invalid posts data received");
        sendResponse(createResponse(false, null, "Invalid posts data"));
        trackOperation(false);
        return true;
    }
    
    if (!request.platform) {
        console.error("Missing platform in sendPosts request");
        sendResponse(createResponse(false, null, "Missing platform"));
        trackOperation(false);
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
    
    // Log a summary of the posts received
    console.log(`Processing ${formattedPosts.length} ${request.platform} posts:`, {
        has_content: formattedPosts.filter(p => p.content && p.content.length > 0).length,
        has_images: formattedPosts.filter(p => p.image_urls && p.image_urls.length > 0).length,
        sponsored_count: formattedPosts.filter(p => p.is_sponsored).length
    });
    
    // Retrieve API settings
    chrome.storage.local.get(['apiKey', 'apiEndpoint'], function(result) {
        const apiKey = result.apiKey;
        const apiEndpoint = result.apiEndpoint || 'http://127.0.0.1:8000';
        
        console.log(`Using API endpoint: ${apiEndpoint}`);
        
        // Make the API call with retry logic
        safeApiFetch(`${apiEndpoint}/api/collect-posts/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey
            },
            body: JSON.stringify({
                platform: request.platform,
                posts: formattedPosts
            })
        }, 3) // 3 retries max
        .then(data => {
            console.log(`Successfully sent ${formattedPosts.length} ${request.platform} posts:`, data);
            
            // Update statistics
            updateStats(request.platform, formattedPosts.length);
            
            // Show a notification for larger collections
            if (formattedPosts.length >= 5) {
                showNotification(
                    `${formattedPosts.length} ${request.platform} Posts Collected`,
                    `Successfully processed and analyzed ${formattedPosts.length} posts.`,
                    'success'
                );
            }
            
            sendResponse(createResponse(true, {
                message: `Successfully sent ${formattedPosts.length} posts from ${request.platform}`,
                result: data
            }));
            trackOperation(false);
        })
        .catch(error => {
            console.error(`Error sending ${request.platform} posts:`, error);
            
            // Show error notification for user feedback
            showNotification(
                'Error Collecting Posts',
                `Failed to process ${request.platform} posts: ${error.toString().substring(0, 50)}`,
                'error'
            );
            
            sendResponse(createResponse(false, null, error.toString()));
            trackOperation(false);
        });
    });
    
    return true; // Keep the message channel open for the async response
}

// Modify the existing message listener by replacing it with an enhanced version
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    // Ensure service worker stays alive during API operations
    keepAlive();
    
    console.log("Background script received message:", request.action, 
                "from:", sender.tab ? sender.tab.url : "extension");
    
    if (request.action === 'ping') {
        // Simple ping-pong to wake and check service worker status
        console.log("Received ping, responding with pong");
        sendResponse({
            status: 'awake',
            timestamp: Date.now(),
            pendingOperations: pendingOperations
        });
        return false; // No need to keep channel open
    } else if (request.action === 'showNotification') {
        showNotification(request.title, request.message, request.type);
        sendResponse(createResponse(true));
    } else if (request.action === 'checkAPIEndpoint') {
        // Force a check of the API availability
        if (authDashboardAPI) {
            authDashboardAPI.checkAvailability(request.forceCheck || true)
            .then(status => {
                    sendResponse(createResponse(true, {
                        available: status.available,
                        endpoint: status.endpoint,
                        apiKey: status.apiKey
                    }));
                })
                .catch(error => {
                    sendResponse(createResponse(false, null, error));
                });
        } else {
            // Fallback if API client isn't available
            checkAPIAvailabilityDirectly()
                .then(result => {
                    sendResponse(createResponse(true, {
                        available: result.available,
                        endpoint: result.endpoint,
                        apiKey: result.apiKey
                    }));
                })
                .catch(error => {
                    sendResponse(createResponse(false, null, error));
                });
        }
        return true; // Keep the message channel open for the async response
    } else if (request.action === 'proxyApiCall') {
        // Track this operation to ensure service worker stays active
        trackOperation(true);
        
        // Enhanced logging
        console.log(`Proxying API call to ${request.endpoint} with method ${request.method || 'GET'}`);
        if (request.body) {
            console.log(`Request body summary: ${JSON.stringify(request.body).substring(0, 100)}...`);
        }
        
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
            
            // Make the actual fetch request with retry logic
            safeApiFetch(request.endpoint, {
                method: request.method || 'GET',
                headers: headers,
                body: request.body ? JSON.stringify(request.body) : null
            }, 3) // 3 retries max
            .then(data => {
                console.log(`API call to ${request.endpoint} succeeded`);
                sendResponse(createResponse(true, data));
                trackOperation(false); // Mark operation as complete
            })
            .catch(error => {
                console.error(`API call to ${request.endpoint} failed:`, error);
                sendResponse(createResponse(false, null, error.toString()));
                trackOperation(false); // Mark operation as complete
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
                sendResponse(createResponse(true, {
                    data: data,
                    status: 'API is operational'
                }));
            })
            .catch(error => {
                sendResponse(createResponse(false, null, error));
            });
        return true;
    } else if (request.action === 'verifyApiKey') {
        // Verify an API key
        const endpoint = request.endpoint || 'http://localhost:8000';
        const apiKey = request.apiKey;
        
        if (!apiKey) {
            sendResponse(createResponse(false, null, 'No API key provided'));
            return true;
        }
        
        fetch(`${endpoint}/api/verify-key/`, {
            headers: {
                'X-API-Key': apiKey
            }
        })
            .then(response => response.json())
            .then(data => {
                sendResponse(createResponse(true, {
                    valid: data.valid === true,
                    data: data
                }));
            })
            .catch(error => {
                sendResponse(createResponse(false, null, error));
            });
        return true;
    } else if (request.action === 'checkConnection') {
        // Check connection to server
        try {
            // Simple response to tell content script that background script is responsive
            // This doesn't actually check the API yet - just confirms background script is working
            sendResponse(createResponse(true, {
                status: 'connected',
                backgroundScriptWorking: true
            }));
            
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
            sendResponse(createResponse(false, null, error));
        }
        return true;
    } else if (request.action === 'sendPosts') {
        return handleSendPosts(request, sender, sendResponse);
    } else if (request.action === 'getStats') {
        chrome.storage.local.get(['stats'], function(result) {
            sendResponse(createResponse(true, {
                stats: result.stats || {}
            }));
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
            sendResponse(createResponse(true, {
                available: response.ok,
                status: response.status
            }));
        })
        .catch(error => {
            console.error("Health check error:", error);
            sendResponse(createResponse(false, null, error));
        });
        
        return true; // Keep the message channel open for the async response
    } else if (request.action === 'logApiTelemetry') {
        // Store API telemetry data for monitoring and performance analysis
        trackOperation(true);
        
        try {
            // Validate the telemetry data
            if (!request.telemetry || !request.telemetry.requestId) {
                console.error("Invalid telemetry data received");
                sendResponse(createResponse(false, null, "Invalid telemetry data"));
                trackOperation(false);
                return true;
            }
            
            // Log summary of the API call
            const telemetry = request.telemetry;
            console.log(`API Telemetry [${telemetry.requestId}]: ${telemetry.method} ${telemetry.endpoint} - ${telemetry.success ? 'Success' : 'Failed'} (${telemetry.duration.toFixed(2)}ms)`);
            
            // Store telemetry data in local storage
            chrome.storage.local.get(['apiTelemetry'], function(result) {
                let apiTelemetry = result.apiTelemetry || {
                    recentCalls: [],
                    stats: {
                        totalCalls: 0,
                        successCalls: 0,
                        failureCalls: 0,
                        totalDuration: 0,
                        lastUpdated: new Date().toISOString()
                    }
                };
                
                // Add this call to recent calls
                apiTelemetry.recentCalls.unshift({
                    id: telemetry.requestId,
                    endpoint: telemetry.endpoint,
                    method: telemetry.method,
                    duration: telemetry.duration,
                    success: telemetry.success,
                    error: telemetry.error,
                    timestamp: telemetry.timestamp || new Date().toISOString(),
                    retries: telemetry.retryCount || 0
                });
                
                // Keep only the most recent 100 calls
                if (apiTelemetry.recentCalls.length > 100) {
                    apiTelemetry.recentCalls = apiTelemetry.recentCalls.slice(0, 100);
                }
                
                // Update statistics
                apiTelemetry.stats.totalCalls++;
                if (telemetry.success) {
                    apiTelemetry.stats.successCalls++;
                } else {
                    apiTelemetry.stats.failureCalls++;
                }
                apiTelemetry.stats.totalDuration += telemetry.duration;
                apiTelemetry.stats.lastUpdated = new Date().toISOString();
                
                // Calculate aggregate statistics
                const successRate = (apiTelemetry.stats.successCalls / apiTelemetry.stats.totalCalls) * 100;
                const avgDuration = apiTelemetry.stats.totalDuration / apiTelemetry.stats.totalCalls;
                
                // Add computed statistics
                apiTelemetry.stats.successRate = successRate.toFixed(2) + '%';
                apiTelemetry.stats.avgDuration = avgDuration.toFixed(2) + 'ms';
                
                // Organize calls by endpoint for analysis
                const endpointStats = {};
                apiTelemetry.recentCalls.forEach(call => {
                    // Extract base endpoint path
                    const urlObj = new URL(call.endpoint);
                    const baseEndpoint = urlObj.pathname;
                    
                    if (!endpointStats[baseEndpoint]) {
                        endpointStats[baseEndpoint] = {
                            calls: 0,
                            successes: 0,
                            failures: 0,
                            totalDuration: 0
                        };
                    }
                    
                    endpointStats[baseEndpoint].calls++;
                    if (call.success) endpointStats[baseEndpoint].successes++;
                    else endpointStats[baseEndpoint].failures++;
                    endpointStats[baseEndpoint].totalDuration += call.duration;
                });
                
                // Add endpoint statistics
                apiTelemetry.stats.endpoints = endpointStats;
                
                // Store updated telemetry
                chrome.storage.local.set({ apiTelemetry: apiTelemetry }, function() {
                    if (chrome.runtime.lastError) {
                        console.error("Error storing API telemetry:", chrome.runtime.lastError);
                        sendResponse(createResponse(false, null, chrome.runtime.lastError.message));
                    } else {
                        sendResponse(createResponse(true, { stored: true }));
                    }
                    trackOperation(false);
                });
            });
        } catch (error) {
            console.error("Error processing API telemetry:", error);
            sendResponse(createResponse(false, null, error.toString()));
            trackOperation(false);
        }
        
        return true; // Keep the message channel open for the async response
    } else if (request.action === 'updatePostCount') {
        // Handle updating post counts and badge
        try {
            // Validate required parameters
            if (!request.platform || !request.count && request.count !== 0) {
                console.error("Invalid post count update request");
                sendResponse(createResponse(false, null, "Invalid parameters"));
                return true;
            }
            
            console.log(`Received post count update: ${request.count} posts from ${request.platform}`);
            
            // Store the count in today's stats
            const today = new Date().toISOString().split('T')[0];
            
            chrome.storage.local.get(['stats'], function(result) {
                let stats = result.stats || {};
                
                if (!stats[today]) {
                    stats[today] = {
                        totalPosts: 0,
                        platforms: {}
                    };
                }
                
                if (!stats[today].platforms[request.platform]) {
                    stats[today].platforms[request.platform] = 0;
                }
                
                // Add to today's total for this platform
                stats[today].platforms[request.platform] += request.count;
                
                // Update the overall total
                stats[today].totalPosts += request.count;
                
                // Get the total count for today to use for badge
                const todayTotal = stats[today].totalPosts;
                
                // Store updated stats
                chrome.storage.local.set({ stats: stats }, function() {
                    if (chrome.runtime.lastError) {
                        console.error("Error updating stats:", chrome.runtime.lastError);
                    } else {
                        console.log(`Updated stats for ${today}: ${todayTotal} total posts`);
                        
                        // Update badge if count is significant
                        if (request.count >= 5) {
                            updateBadge(request.count);
                        }
                        
                        // If this came from a specific tab, we can send a notification
                        if (sender && sender.tab && sender.tab.id) {
                            // Get extension settings
                            chrome.storage.local.get(['settings'], function(settingsResult) {
                                const settings = settingsResult.settings || {};
                                
                                // Show notification if enabled in settings
                                if (settings.showNotifications !== false) {
                                    showNotification(
                                        'Posts Collected',
                                        `${request.count} posts were collected from ${request.platform}.`
                                    );
                                }
                            });
                        }
                    }
                    
                    sendResponse(createResponse(true, { updated: true, todayTotal: todayTotal }));
                });
            });
            
            return true; // Keep message channel open for async response
        } catch (error) {
            console.error("Error processing post count update:", error);
            sendResponse(createResponse(false, null, error.toString()));
            return true;
        }
    } else if (request.action === 'processPosts') {
        // Process posts using the background worker if available
        trackOperation(true);
        
        try {
            // Validate required parameters
            if (!request.posts || !Array.isArray(request.posts)) {
                console.error("Invalid posts data for processing");
                sendResponse(createResponse(false, null, "Posts must be a valid array"));
                trackOperation(false);
                return true;
            }
            
            const taskId = `process_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const postsCount = request.posts.length;
            
            console.log(`Received request to process ${postsCount} posts (${taskId})`);
            
            // Use worker if available, otherwise process in main thread
            if (backgroundWorker) {
                console.log(`Using background worker to process ${postsCount} posts`);
                
                // Set up a one-time message handler for this specific task
                const messageHandler = function(e) {
                    const { action, id, error, posts, stats } = e.data;
                    
                    // Only handle messages for this specific task
                    if (id !== taskId) return;
                    
                    if (action === 'error') {
                        console.error(`Worker error processing posts (${id}):`, error);
                        sendResponse(createResponse(false, null, error));
                        backgroundWorker.removeEventListener('message', messageHandler);
                        trackOperation(false);
                    } else if (action === 'processPostsComplete') {
                        console.log(`Worker successfully processed ${stats.count} posts in ${stats.duration}ms`);
                        sendResponse(createResponse(true, {
                            posts: posts,
                            stats: stats
                        }));
                        backgroundWorker.removeEventListener('message', messageHandler);
                        trackOperation(false);
                    }
                };
                
                // Add the specific message handler
                backgroundWorker.addEventListener('message', messageHandler);
                
                // Send the task to the worker
                backgroundWorker.postMessage({
                    action: 'processPosts',
                    id: taskId,
                    data: {
                        posts: request.posts,
                        settings: request.settings || {}
                    }
                });
            } else {
                // Process in the main thread if no worker available
                console.log(`Processing ${postsCount} posts in main thread (no worker available)`);
                
                const startTime = Date.now();
                
                try {
                    const enhancedPosts = processPostsInMainThread(request.posts, request.settings || {});
                    const duration = Date.now() - startTime;
                    
                    console.log(`Processed ${enhancedPosts.length} posts in ${duration}ms`);
                    
                    sendResponse(createResponse(true, {
                        posts: enhancedPosts,
                        stats: {
                            count: enhancedPosts.length,
                            duration: duration,
                            avgTimePerPost: Math.round(duration / enhancedPosts.length)
                        }
                    }));
                } catch (processingError) {
                    console.error("Error processing posts in main thread:", processingError);
                    sendResponse(createResponse(false, null, processingError.toString()));
                }
                
                trackOperation(false);
            }
            
        } catch (error) {
            console.error("Error handling processPosts request:", error);
            sendResponse(createResponse(false, null, error.toString()));
            trackOperation(false);
        }
        
        return true; // Keep the message channel open for the async response
    } else if (request.action === 'deduplicatePosts') {
        // Deduplicate posts using the background worker if available
        trackOperation(true);
        
        try {
            // Validate required parameters
            if (!request.posts || !Array.isArray(request.posts)) {
                console.error("Invalid posts data for deduplication");
                sendResponse(createResponse(false, null, "Posts must be a valid array"));
                trackOperation(false);
                return true;
            }
            
            const taskId = `dedupe_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const postsCount = request.posts.length;
            const existingCount = request.existing ? request.existing.length : 0;
            
            console.log(`Received request to deduplicate ${postsCount} posts against ${existingCount} existing (${taskId})`);
            
            // Use worker if available, otherwise process in main thread
            if (backgroundWorker) {
                console.log(`Using background worker for deduplication`);
                
                // Set up a one-time message handler for this specific task
                const messageHandler = function(e) {
                    const { action, id, error, posts, stats } = e.data;
                    
                    // Only handle messages for this specific task
                    if (id !== taskId) return;
                    
                    if (action === 'error') {
                        console.error(`Worker error during deduplication (${id}):`, error);
                        sendResponse(createResponse(false, null, error));
                        backgroundWorker.removeEventListener('message', messageHandler);
                        trackOperation(false);
                    } else if (action === 'deduplicateComplete') {
                        console.log(`Worker successfully deduplicated posts: ${stats.unique} unique out of ${stats.original}`);
                        sendResponse(createResponse(true, {
                            posts: posts,
                            stats: stats
                        }));
                        backgroundWorker.removeEventListener('message', messageHandler);
                        trackOperation(false);
                    }
                };
                
                // Add the specific message handler
                backgroundWorker.addEventListener('message', messageHandler);
                
                // Send the task to the worker
                backgroundWorker.postMessage({
                    action: 'deduplicate',
                    id: taskId,
                    data: {
                        posts: request.posts,
                        existing: request.existing || []
                    }
                });
            } else {
                // Process in the main thread if no worker available
                console.log(`Deduplicating ${postsCount} posts in main thread (no worker available)`);
                
                const startTime = Date.now();
                
                try {
                    const result = deduplicatePostsInMainThread(request.posts, request.existing || []);
                    const duration = Date.now() - startTime;
                    
                    console.log(`Deduplicated posts in ${duration}ms: ${result.uniquePosts.length} unique out of ${postsCount}`);
                    
                    sendResponse(createResponse(true, {
                        posts: result.uniquePosts,
                        stats: {
                            original: postsCount,
                            unique: result.uniquePosts.length,
                            duplicates: postsCount - result.uniquePosts.length,
                            duration: duration
                        }
                    }));
                } catch (processingError) {
                    console.error("Error deduplicating posts in main thread:", processingError);
                    sendResponse(createResponse(false, null, processingError.toString()));
                }
                
                trackOperation(false);
            }
            
        } catch (error) {
            console.error("Error handling deduplicatePosts request:", error);
            sendResponse(createResponse(false, null, error.toString()));
            trackOperation(false);
        }
        
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

/**
 * Update the browser action badge with post count
 * @param {number} count - Number to display on badge
 * @param {string} color - Badge background color (default: green)
 */
function updateBadge(count, color = '#4CAF50') {
  try {
    // Format large numbers
    let badgeText = count.toString();
    if (count > 999) {
      badgeText = Math.floor(count / 1000) + 'k';
    }
    
    // Set the badge text
    chrome.action.setBadgeText({ text: badgeText });
    
    // Set badge background color
    chrome.action.setBadgeBackgroundColor({ color: color });
    
    // Clear badge after 5 seconds
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '' });
    }, 5000);
    
    console.log(`Updated badge with count: ${count}`);
  } catch (error) {
    // Handle errors gracefully - this is a non-critical feature
    console.error('Error updating badge:', error);
    
    // Try older API if newer one failed (for backward compatibility)
    try {
      if (chrome.browserAction) {
        chrome.browserAction.setBadgeText({ text: count.toString() });
        chrome.browserAction.setBadgeBackgroundColor({ color: color });
        
        setTimeout(() => {
          chrome.browserAction.setBadgeText({ text: '' });
        }, 5000);
      }
    } catch (innerError) {
      console.error('Error with fallback badge update:', innerError);
    }
  }
}

// Scheduled cache cleanup to prevent excessive storage use
// This function will clean up old fingerprints, processed posts, and other cached data
function scheduledCacheCleanup() {
  console.log("Starting scheduled cache cleanup...");
  
  chrome.storage.local.get(
    ['processedFingerprints', 'processedPosts', 'stats'], 
    function(result) {
      const now = Date.now();
      const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;  // One week in milliseconds
      const ONE_MONTH = 30 * 24 * 60 * 60 * 1000; // One month in milliseconds
      let cleanupStats = {
        fingerprintsRemoved: 0,
        postsRemoved: 0,
        statsDaysRemoved: 0
      };
      
      // Clean up fingerprints older than a week
      if (result.processedFingerprints) {
        const updatedFingerprints = {};
        let count = 0;
        
        // Keep only fingerprints from the last week
        Object.entries(result.processedFingerprints).forEach(([fingerprint, timestamp]) => {
          if (now - timestamp < ONE_WEEK) {
            updatedFingerprints[fingerprint] = timestamp;
            count++;
          } else {
            cleanupStats.fingerprintsRemoved++;
          }
        });
        
        chrome.storage.local.set({processedFingerprints: updatedFingerprints});
        console.log(`Cleaned up fingerprints: kept ${count}, removed ${cleanupStats.fingerprintsRemoved}`);
      }
      
      // Clean up processed posts
      if (result.processedPosts) {
        // Keep only the most recent 1000 posts
        const MAX_POSTS = 1000;
        const posts = Object.entries(result.processedPosts);
        
        if (posts.length > MAX_POSTS) {
          // Sort by recency if we have timestamps, otherwise just take the last 1000
          const updatedPosts = {};
          const postsToKeep = posts.slice(-MAX_POSTS);
          
          postsToKeep.forEach(([id, value]) => {
            updatedPosts[id] = value;
          });
          
          cleanupStats.postsRemoved = posts.length - postsToKeep.length;
          chrome.storage.local.set({processedPosts: updatedPosts});
          console.log(`Cleaned up processed posts: kept ${postsToKeep.length}, removed ${cleanupStats.postsRemoved}`);
        } else {
          console.log(`Processed posts (${posts.length}) under threshold, no cleanup needed`);
        }
      }
      
      // Clean up old stats data (keep only last month)
      if (result.stats) {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
        
        const updatedStats = {...result.stats};
        
        for (const day in updatedStats) {
          if (day < thirtyDaysAgoStr) {
            delete updatedStats[day];
            cleanupStats.statsDaysRemoved++;
          }
        }
        
        if (cleanupStats.statsDaysRemoved > 0) {
          chrome.storage.local.set({stats: updatedStats});
          console.log(`Cleaned up stats: removed ${cleanupStats.statsDaysRemoved} days older than ${thirtyDaysAgoStr}`);
        }
      }
      
      // Log summary of cleanup
      console.log("Cache cleanup completed:", cleanupStats);
      
      // Check storage usage after cleanup
      chrome.storage.local.getBytesInUse(null, function(bytesInUse) {
        const kilobytes = Math.round(bytesInUse / 1024);
        console.log(`Current storage usage: ${kilobytes} KB`);
      });
    }
  );
}

// Perform cache cleanup on browser startup
chrome.runtime.onStartup.addListener(function() {
  console.log("Extension starting up - performing cache cleanup");
  // Wait a short delay to ensure other startup tasks complete first
  setTimeout(scheduledCacheCleanup, 5000);
});

// Also clean up on installation/update
chrome.runtime.onInstalled.addListener(function(details) {
  // Only clean on update, not first install (nothing to clean on first install)
  if (details.reason === 'update') {
    console.log("Extension updated - performing cache cleanup");
    setTimeout(scheduledCacheCleanup, 5000);
  }
});

// Schedule daily cache cleanup
const DAY_IN_MS = 24 * 60 * 60 * 1000;
setInterval(scheduledCacheCleanup, DAY_IN_MS);

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

/**
 * Try to create a background worker for processing tasks
 * @returns {Promise<Worker|null>} - Promise resolving to Worker or null if unavailable
 */
function createBackgroundWorker() {
  return new Promise((resolve) => {
    try {
      // Check if workers are supported in this context
      if (typeof Worker === 'undefined') {
        console.log("Web Workers are not supported in this context");
        resolve(null);
        return;
      }
      
      // Create a blob URL for the worker script
      const workerScript = `
        // Background worker for processing posts
        self.onmessage = function(e) {
          const { action, data, id } = e.data;
          
          console.log('Worker received task:', action, id);
          
          switch (action) {
            case 'processPosts':
              processPosts(data.posts, data.settings, id);
              break;
            case 'deduplicate':
              deduplicatePosts(data.posts, data.existing || [], id);
              break;
            case 'ping':
              // Simple ping to check if worker is alive
              self.postMessage({ 
                action: 'pong', 
                id: id,
                timestamp: Date.now() 
              });
              break;
            default:
              self.postMessage({ 
                action: 'error', 
                id: id,
                error: 'Unknown action: ' + action 
              });
          }
        };
        
        // Process posts to extract additional features and metadata
        function processPosts(posts, settings, taskId) {
          if (!posts || !Array.isArray(posts)) {
            self.postMessage({ 
              action: 'error', 
              id: taskId,
              error: 'Invalid posts data' 
            });
            return;
          }
          
          try {
            const startTime = Date.now();
            const enhancedPosts = posts.map(post => {
              // Clone the post to avoid modifying original
              const enhancedPost = {...post};
              
              // Extract and count hashtags if not already present
              if (post.content && !post.hashtags) {
                const hashtagMatches = post.content.match(/#[a-zA-Z0-9_]+/g) || [];
                enhancedPost.hashtags = hashtagMatches.map(tag => tag.substring(1)).join(',');
                enhancedPost.hashtag_count = hashtagMatches.length;
              }
              
              // Count mentions
              if (post.content) {
                const mentionMatches = post.content.match(/@[a-zA-Z0-9_]+/g) || [];
                enhancedPost.mention_count = mentionMatches.length;
              }
              
              // Analyze content length
              if (post.content) {
                enhancedPost.content_length = post.content.length;
                enhancedPost.word_count = post.content.split(/\\s+/).filter(Boolean).length;
              }
              
              // Detect probable ads based on keywords if not already flagged
              if (post.content && !post.is_sponsored) {
                const adKeywords = ['sponsored', 'partner', 'promotion', 'ad', 'advertisement', 
                                    'paid', 'offer', 'discount', 'sale', 'buy', 'promo'];
                const hasAdKeywords = adKeywords.some(keyword => 
                  post.content.toLowerCase().includes(keyword)
                );
                
                enhancedPost.probably_sponsored = hasAdKeywords;
              }
              
              return enhancedPost;
            });
            
            const duration = Date.now() - startTime;
            
            self.postMessage({ 
              action: 'processPostsComplete', 
              id: taskId,
              posts: enhancedPosts,
              stats: {
                count: enhancedPosts.length,
                duration: duration,
                avgTimePerPost: Math.round(duration / enhancedPosts.length)
              }
            });
          } catch (error) {
            self.postMessage({ 
              action: 'error', 
              id: taskId,
              error: error.toString(),
              stack: error.stack
            });
          }
        }
        
        // Function to deduplicate posts based on content
        function deduplicatePosts(newPosts, existingPosts, taskId) {
          if (!newPosts || !Array.isArray(newPosts)) {
            self.postMessage({ 
              action: 'error', 
              id: taskId,
              error: 'Invalid posts data' 
            });
            return;
          }
          
          try {
            const startTime = Date.now();
            
            // Create a Set of fingerprints from existing posts
            const existingFingerprints = new Set();
            
            existingPosts.forEach(post => {
              const fingerprint = generatePostFingerprint(post);
              existingFingerprints.add(fingerprint);
            });
            
            // Filter out duplicates
            const uniquePosts = newPosts.filter(post => {
              const fingerprint = generatePostFingerprint(post);
              return !existingFingerprints.has(fingerprint);
            });
            
            const duration = Date.now() - startTime;
            
            self.postMessage({ 
              action: 'deduplicateComplete', 
              id: taskId,
              posts: uniquePosts,
              stats: {
                original: newPosts.length,
                unique: uniquePosts.length,
                duplicates: newPosts.length - uniquePosts.length,
                duration: duration
              }
            });
          } catch (error) {
            self.postMessage({ 
              action: 'error', 
              id: taskId,
              error: error.toString(),
              stack: error.stack
            });
          }
        }
        
        // Helper function to generate a fingerprint for a post
        function generatePostFingerprint(post) {
          // Use a combination of platform, user, and content
          const platform = post.platform || '';
          const user = post.original_user || post.user || '';
          const content = post.content || '';
          
          // Take first 50 chars of content for fingerprint
          const contentSnippet = content.substring(0, 50);
          
          return \`\${platform}:\${user}:\${contentSnippet}\`;
        }
      `;
      
      // Create a blob with the worker code
      const blob = new Blob([workerScript], { type: 'application/javascript' });
      const blobURL = URL.createObjectURL(blob);
      
      // Create the worker
      const worker = new Worker(blobURL);
      
      // Set up message handler
      worker.onmessage = function(e) {
        const { action, id, error, posts, stats } = e.data;
        
        if (action === 'error') {
          console.error(`Worker error (${id}):`, error);
        } else if (action === 'processPostsComplete') {
          console.log(`Worker completed post processing (${id}):`, stats);
        } else if (action === 'deduplicateComplete') {
          console.log(`Worker completed deduplication (${id}):`, stats);
        } else if (action === 'pong') {
          console.log(`Worker is responsive (${id}), responded in ${Date.now() - stats.timestamp}ms`);
        }
      };
      
      // Handle worker errors
      worker.onerror = function(error) {
        console.error('Worker error:', error);
      };
      
      // Test the worker with a ping
      worker.postMessage({ 
        action: 'ping', 
        id: 'init_' + Date.now(),
        data: {} 
      });
      
      console.log('Background worker created successfully');
      resolve(worker);
    } catch (error) {
      console.error('Error creating background worker:', error);
      resolve(null);
    }
  });
}

// Create a background worker when the extension starts
let backgroundWorker = null;
createBackgroundWorker().then(worker => {
  backgroundWorker = worker;
  
  if (worker) {
    console.log('Background worker is ready for tasks');
  } else {
    console.log('Background worker could not be created, will process on main thread');
  }
}).catch(error => {
  console.error('Failed to initialize background worker:', error);
});

// Run API endpoint check every 5 minutes
setInterval(() => {
    authDashboardAPI.checkAvailability(true);
}, 5 * 60 * 1000);

/**
 * Process posts in the main thread if no worker is available
 * @param {Array} posts - Array of posts to process
 * @param {Object} settings - Processing settings
 * @returns {Array} - Enhanced posts
 */
function processPostsInMainThread(posts, settings = {}) {
  if (!posts || !Array.isArray(posts)) {
    throw new Error('Invalid posts data');
  }
  
  const enhancedPosts = posts.map(post => {
    // Clone the post to avoid modifying original
    const enhancedPost = {...post};
    
    // Extract and count hashtags if not already present
    if (post.content && !post.hashtags) {
      const hashtagMatches = post.content.match(/#[a-zA-Z0-9_]+/g) || [];
      enhancedPost.hashtags = hashtagMatches.map(tag => tag.substring(1)).join(',');
      enhancedPost.hashtag_count = hashtagMatches.length;
    }
    
    // Count mentions
    if (post.content) {
      const mentionMatches = post.content.match(/@[a-zA-Z0-9_]+/g) || [];
      enhancedPost.mention_count = mentionMatches.length;
    }
    
    // Analyze content length
    if (post.content) {
      enhancedPost.content_length = post.content.length;
      enhancedPost.word_count = post.content.split(/\s+/).filter(Boolean).length;
    }
    
    // Detect probable ads based on keywords if not already flagged
    if (post.content && !post.is_sponsored) {
      const adKeywords = ['sponsored', 'partner', 'promotion', 'ad', 'advertisement', 
                         'paid', 'offer', 'discount', 'sale', 'buy', 'promo'];
      const hasAdKeywords = adKeywords.some(keyword => 
        post.content.toLowerCase().includes(keyword)
      );
      
      enhancedPost.probably_sponsored = hasAdKeywords;
    }
    
    return enhancedPost;
  });
  
  return enhancedPosts;
}

/**
 * Deduplicate posts in the main thread if no worker is available
 * @param {Array} newPosts - New posts to check
 * @param {Array} existingPosts - Existing posts to check against
 * @returns {Object} - Result containing unique posts and stats
 */
function deduplicatePostsInMainThread(newPosts, existingPosts = []) {
  if (!newPosts || !Array.isArray(newPosts)) {
    throw new Error('Invalid posts data');
  }
  
  // Create a Set of fingerprints from existing posts
  const existingFingerprints = new Set();
  
  existingPosts.forEach(post => {
    const fingerprint = generatePostFingerprint(post);
    existingFingerprints.add(fingerprint);
  });
  
  // Filter out duplicates
  const uniquePosts = newPosts.filter(post => {
    const fingerprint = generatePostFingerprint(post);
    return !existingFingerprints.has(fingerprint);
  });
  
  return {
    uniquePosts,
    stats: {
      original: newPosts.length,
      unique: uniquePosts.length,
      duplicates: newPosts.length - uniquePosts.length
    }
  };
}

/**
 * Generate a fingerprint for a post
 * @param {Object} post - The post to fingerprint
 * @returns {string} - A unique fingerprint based on post content
 */
function generatePostFingerprint(post) {
  // Use a combination of platform, user, and content
  const platform = post.platform || '';
  const user = post.original_user || post.user || '';
  const content = post.content || '';
  
  // Take first 50 chars of content for fingerprint
  const contentSnippet = content.substring(0, 50);
  
  return `${platform}:${user}:${contentSnippet}`;
} 