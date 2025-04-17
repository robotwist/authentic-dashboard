/**
 * messaging.js - Message handling for Authentic Dashboard
 * 
 * Handles all Chrome messaging between background, content scripts, and external sources.
 */

import { createResponse, safeApiFetch } from './utils.js';
import { showNotification, updateBadge } from './notifications.js';
import { updateStats, logApiTelemetry } from './stats.js';
import { processPostsInMainThread, deduplicatePostsInMainThread } from './worker.js';
import { performAutoScan } from './scanner.js';
import { trackOperation } from './keep-alive.js';
import { recordError } from './error_handling.js';

const RETRY_DELAYS = [100, 500, 1000, 2000, 5000]; // Increasing backoff
const MAX_RETRIES = 3;

/**
 * Handle incoming message to send posts to the API
 * @param {Object} request - Message request
 * @param {Object} sender - Message sender
 * @param {Function} sendResponse - Function to send response
 * @returns {boolean} - Whether to keep the message channel open
 */
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

/**
 * Handle API messages from content scripts and popup
 * @param {Object} request - Message request
 * @param {Object} sender - Message sender
 * @param {Function} sendResponse - Function to send response
 * @returns {boolean} - Whether to keep the message channel open
 */
function handleApiMessages(request, sender, sendResponse) {
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
}

/**
 * Handle error reporting from content scripts and popup
 * @param {Object} request - Message request
 * @param {Function} sendResponse - Function to send response
 * @returns {boolean} - Whether to keep the message channel open
 */
function handleErrorReport(request, sender, sendResponse) {
  const report = request.report;
  console.warn(`Received error report: ${report.category}`, report);
  
  // Track operation to ensure service worker stays alive
  trackOperation(true);
  
  // Get API settings
  chrome.storage.local.get(['apiKey', 'apiEndpoint'], function(result) {
    const apiKey = result.apiKey;
    const apiEndpoint = result.apiEndpoint || 'http://localhost:8000';
    
    // Send to server if we have an endpoint
    if (apiEndpoint && apiKey) {
      fetch(`${apiEndpoint}/api/error-report/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        body: JSON.stringify({
          report,
          extension_version: chrome.runtime.getManifest().version,
          browser: navigator.userAgent,
        timestamp: Date.now()
        })
      })
      .then(response => {
        if (!response.ok) {
          throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        return response.json();
      })
      .then(data => {
        console.log('Error report sent to server successfully');
        sendResponse(createResponse(true, { message: 'Error report sent' }));
      })
      .catch(error => {
        console.error('Failed to send error report to server:', error);
        
        // Store for later sending
        storeErrorReportLocally(report);
        sendResponse(createResponse(false, null, 'Failed to send report: ' + error.message));
      })
      .finally(() => {
        trackOperation(false);
      });
    } else {
      // No API settings, just store locally
      storeErrorReportLocally(report);
      sendResponse(createResponse(true, { message: 'Error report stored locally' }));
      trackOperation(false);
    }
  });
  
  return true; // Keep the message channel open for async response
}

/**
 * Store error report locally for later sending
 * @param {Object} report - Error report
 */
function storeErrorReportLocally(report) {
  chrome.storage.local.get(['pendingErrorReports'], function(result) {
    const pendingReports = result.pendingErrorReports || [];
    
    pendingReports.push({
      timestamp: Date.now(),
      report
    });
    
    // Limit to maximum 50 stored reports
    if (pendingReports.length > 50) {
      pendingReports.splice(0, pendingReports.length - 50);
    }
    
    chrome.storage.local.set({ pendingErrorReports });
    console.log('Error report stored locally for later sending');
  });
}

/**
 * Setup message listeners for the extension
 * @param {Object} backgroundWorker - Background worker instance
 */
function setupMessageListeners(backgroundWorker) {
  console.log('Setting up message listeners with improved error handling');
  
  // Track pending responses to prevent message channel closure
  const pendingResponses = new Map();
  
  // Set up a cleanup interval to prevent memory leaks from uncompleted responses
  setInterval(() => {
    const now = Date.now();
    pendingResponses.forEach((data, id) => {
      if (now - data.timestamp > 30000) { // 30 second timeout
        console.warn(`Message ${id} timed out without response`);
        // If we have a sendResponse function, call it to close the channel properly
        if (data.sendResponse && typeof data.sendResponse === 'function') {
          try {
            data.sendResponse({ error: 'Response timeout', success: false });
          } catch (e) {
            console.error('Error sending timeout response:', e);
          }
        }
        pendingResponses.delete(id);
      }
    });
  }, 10000); // Check every 10 seconds
  
  // Handle messages from content scripts, popup, and other extension components
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Generate a unique ID for this message
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`Received message ${messageId}:`, message);
    
    // Store this pending response
    pendingResponses.set(messageId, {
      message,
      sender,
      sendResponse,
      timestamp: Date.now()
    });
    
    // Always return true to indicate we'll respond asynchronously
    // This keeps the message channel open
    
    try {
      // Handle different message actions
      if (message.action === 'checkConnection') {
        // Handle connectivity check
        handleConnectionCheck(message)
          .then(result => {
            sendSafeResponse(sendResponse, result);
            pendingResponses.delete(messageId);
          })
          .catch(error => {
            console.error('Error in connection check:', error);
            sendSafeResponse(sendResponse, {
              success: false,
              error: error.message || 'Unknown error in connection check'
            });
            pendingResponses.delete(messageId);
          });
      }
      else if (message.action === 'scrollAndCollect') {
        // Content script requesting scroll and collection
        handleScrollAndCollect(message, sender)
          .then(result => {
            sendSafeResponse(sendResponse, result);
            pendingResponses.delete(messageId);
          })
          .catch(error => {
            console.error('Error in scroll and collect:', error);
            sendSafeResponse(sendResponse, {
              success: false,
              error: error.message || 'Unknown error in scroll and collect'
            });
            pendingResponses.delete(messageId);
          });
      }
      else if (message.action === 'performAnalysis') {
        // Handle analysis requests
        if (backgroundWorker) {
          // Use the worker for heavy processing
          backgroundWorker.postMessage({
            type: 'analyze',
            data: message.data
          });
          
          backgroundWorker.onmessage = (event) => {
            sendSafeResponse(sendResponse, event.data);
            pendingResponses.delete(messageId);
          };
          
          backgroundWorker.onerror = (error) => {
            console.error('Worker error:', error);
            sendSafeResponse(sendResponse, {
              success: false,
              error: 'Worker processing failed'
            });
            pendingResponses.delete(messageId);
          };
        } else {
          // Fallback to main thread
          performAnalysisInMainThread(message.data)
            .then(result => {
              sendSafeResponse(sendResponse, result);
              pendingResponses.delete(messageId);
            })
            .catch(error => {
              console.error('Analysis error:', error);
              sendSafeResponse(sendResponse, {
                success: false,
                error: error.message || 'Unknown error in analysis'
              });
              pendingResponses.delete(messageId);
            });
        }
      }
      else if (message.action === 'sendPosts') {
        // Handle posts sent from content script for API submission
        return handleSendPosts(message, sender, sendResponse);
      }
      else if (message.action === 'checkApiConnection') {
        // Check if the API is available
        return handleApiConnectionCheck(message, sendResponse);
      }
      else if (message.action === 'setApiEndpoint') {
        // Update the API endpoint in settings
        return handleSetApiEndpoint(message, sendResponse);
      }
      else if (message.action === 'updateSettings') {
        // Handle settings updates
        return handleSettingsUpdate(message, sendResponse);
      }
      else if (message.action === 'collectPosts') {
        // Handle automated post collection request
        return handleCollectPosts(message, sender, sendResponse, backgroundWorker);
      }
      else if (message.action === 'getPosts') {
        // Get collected posts
        return handleGetPosts(message, sender, sendResponse);
      }
      else if (message.action === 'api') {
        // Handle generic API calls
        return handleApiMessages(message, sender, sendResponse);
      }
      else if (message.action === 'reportError') {
        // Handle error reporting
        return handleErrorReport(message, sender, sendResponse);
      }
      else {
        // Unknown message type
        console.warn('Unknown message action:', message.action);
        sendSafeResponse(sendResponse, {
          success: false,
          error: `Unknown message action: ${message.action}`
        });
        pendingResponses.delete(messageId);
      }
    } catch (error) {
      console.error('Error processing message:', error);
      recordError('extension', error, { component: 'message_handler' });
      
      sendSafeResponse(sendResponse, {
        success: false,
        error: error.message || 'Unknown error processing message'
      });
      pendingResponses.delete(messageId);
    }
    
    // Return true to indicate we'll respond asynchronously
          return true;
  });
  
  console.log('Message listeners setup complete');
}

/**
 * Safely send a response, handling potential errors if the channel has closed
 * @param {Function} sendResponse - Chrome's sendResponse function
 * @param {Object} data - Data to send
 */
function sendSafeResponse(sendResponse, data) {
  try {
    sendResponse(data);
  } catch (error) {
    console.warn('Error sending response, channel may be closed:', error);
    // We can't do much if the channel is already closed
  }
}

/**
 * Handle connection check request with retries
 * @param {Object} message - The message data
 * @returns {Promise<Object>} - Response data
 */
async function handleConnectionCheck(message) {
  let lastError = null;
  
  // Try multiple times with increasing delays
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      // Attempt to check connection
      const result = await checkConnection(message.target || 'api');
      return { success: true, connected: result };
    } catch (error) {
      console.warn(`Connection check attempt ${i+1} failed:`, error);
      lastError = error;
      
      // Wait before next retry
      if (i < MAX_RETRIES - 1) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[i]));
      }
    }
  }
  
  throw lastError || new Error('Connection check failed after retries');
}

/**
 * Check connection to a specified target
 * @param {string} target - Connection target ('api', 'server', etc.)
 * @returns {Promise<boolean>} - Promise resolving to connection status
 */
async function checkConnection(target) {
  console.log(`Checking connection to ${target}`);
  
  if (target === 'api') {
    // Import conditionally to avoid circular dependencies
    const { checkApiAvailability } = await import('./api-client.js');
    return await checkApiAvailability(true); // Force fresh check
  }
  
  return false; // Fallback
}

/**
 * Handle scroll and collect request from content scripts
 * @param {Object} message - The message data
 * @param {Object} sender - Message sender info
 * @returns {Promise<Object>} - Response data
 */
async function handleScrollAndCollect(message, sender) {
  // Implementation for scroll and collect functionality
  // This is just a placeholder - you would implement the actual scrolling logic
  console.log('Handling scroll and collect:', message);
  
  // In a real implementation, you might:
  // 1. Coordinate with the content script to scroll the page
  // 2. Collect posts or content
  // 3. Process and store the data
  
  return {
    success: true,
    postCount: 0, // This would be the actual count in a real implementation
    message: 'Scroll and collect completed'
  };
}

/**
 * Fallback analysis in main thread if worker is unavailable
 * @param {Object} data - Data to analyze
 * @returns {Promise<Object>} - Analysis results
 */
async function performAnalysisInMainThread(data) {
  console.log('Performing analysis in main thread');
  
  // Implementation would depend on what analysis is needed
  // This is a placeholder
  
  return {
    success: true,
    results: {
      analyzed: true,
      score: 0.85
    }
  };
}

/**
 * Handle API connection check
 * @param {Object} message - Message object
 * @param {Function} sendResponse - Response callback
 */
function handleApiConnectionCheck(message, sendResponse) {
  console.log("Checking API connection...");
  
  // Import dynamically to avoid circular dependencies
  import('./api-client.js').then(module => {
    module.checkApiAvailability(true)
      .then(available => {
        sendResponse({ success: true, available });
        })
        .catch(error => {
        console.error("Error checking API:", error);
        sendResponse({ success: false, error: error.message });
      });
  }).catch(error => {
    console.error("Error importing API client module:", error);
    sendResponse({ success: false, error: "Failed to load API client module" });
  });
}

/**
 * Handle setting API endpoint
 * @param {Object} message - Message object
 * @param {Function} sendResponse - Response callback
 */
function handleSetApiEndpoint(message, sendResponse) {
  const { apiKey, apiUrl } = message;
  
  console.log("Setting API endpoint:", apiUrl);
  
  chrome.storage.sync.get(['settings'], (result) => {
    const settings = result.settings || {};
    settings.apiKey = apiKey;
    settings.apiUrl = apiUrl;
    
    chrome.storage.sync.set({ settings }, () => {
      // Check connection with new settings
      import('./api-client.js').then(module => {
        module.checkApiAvailability(true)
          .then(available => {
            sendResponse({ success: true, available });
          })
          .catch(error => {
            console.error("Error checking API with new settings:", error);
            sendResponse({ success: false, error: error.message });
          });
      }).catch(error => {
        console.error("Error importing API client module:", error);
        sendResponse({ success: false, error: "Failed to load API client module" });
      });
    });
  });
}

/**
 * Handle settings update
 * @param {Object} message - Message object
 * @param {Function} sendResponse - Response callback
 */
function handleSettingsUpdate(message, sendResponse) {
  const { settings } = message;
  
  console.log("Updating settings");
  
  // Update auto-collection schedule if needed
  if (settings.hasOwnProperty('autoCollect') || settings.hasOwnProperty('autoCollectInterval')) {
    // Import dynamically to avoid circular dependencies
    import('./scheduler.js').then(module => {
      // Rerun setup to update alarms
      module.setupScheduledTasks();
      sendResponse({ success: true });
    }).catch(error => {
      console.error("Error importing scheduler module:", error);
      sendResponse({ success: false, error: "Failed to update scheduler" });
    });
  } else {
    sendResponse({ success: true });
  }
}

/**
 * Handle collecting posts
 * @param {Object} message - Message object
 * @param {Object} sender - Sender information
 * @param {Function} sendResponse - Response callback
 * @param {Worker} backgroundWorker - Background worker
 */
function handleCollectPosts(message, sender, sendResponse, backgroundWorker) {
  console.log("Collecting posts from page");
  
  // If we have a background worker, offload the work there
  if (backgroundWorker) {
    backgroundWorker.postMessage({
      action: 'collectPosts',
      tabId: sender.tab.id,
      platform: message.platform,
      options: message.options
    });
    
    backgroundWorker.onmessage = (event) => {
      if (event.data.action === 'collectPostsResult') {
        sendResponse(event.data.result);
      }
    };
  } else {
    // No worker, so respond that we need to do this in the content script
    sendResponse({ 
      success: true, 
      processInContent: true,
      message: "No background worker available, processing in content script" 
        });
      }
    }

/**
 * Handle getting posts
 * @param {Object} message - Message object
 * @param {Object} sender - Sender information
 * @param {Function} sendResponse - Response callback
 */
function handleGetPosts(message, sender, sendResponse) {
  const { platform, limit } = message;
  
  console.log(`Getting ${limit || 'all'} posts for ${platform}`);
  
  // We'll implement this later as needed
  sendResponse({ 
    success: true, 
    posts: [], 
    message: "Post retrieval not implemented yet" 
  });
}

// Export other helper functions that might be needed externally
export {
  handleSendPosts,
  handleApiMessages,
  handleErrorReport,
  handleApiConnectionCheck,
  handleSetApiEndpoint,
  handleCollectPosts,
  handleGetPosts
}; 