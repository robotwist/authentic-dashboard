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
export function setupMessageListeners(backgroundWorker) {
  try {
    console.log("Setting up message listeners...");
    
    // Listen for messages from content scripts/popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log("Background script received message:", message.action);
      
      // Always prepare a response handler to prevent connection issues
      let handled = false;
      
      try {
        if (message.action === 'getPosts') {
          // Handle get posts request
          handleGetPosts(message, sender, sendResponse);
          handled = true;
        } 
        else if (message.action === 'checkApiConnection') {
          // Check API connection
          handleApiConnectionCheck(message, sendResponse);
          handled = true;
        } 
        else if (message.action === 'setApiEndpoint') {
          // Set API endpoint
          handleSetApiEndpoint(message, sendResponse);
          handled = true;
        } 
        else if (message.action === 'settingsUpdated') {
          // Handle settings update
          handleSettingsUpdate(message, sendResponse);
          handled = true;
        } 
        else if (message.action === 'collectPostsFromPage') {
          // Handle post collection request
          handleCollectPosts(message, sender, sendResponse, backgroundWorker);
          handled = true;
        } 
        else if (message.action === 'reportError') {
          // Handle error reporting
          handleErrorReport(message, sender, sendResponse);
          handled = true;
        } 
        else {
          console.log("Unhandled message action:", message.action);
        }
      } catch (error) {
        console.error(`Error handling message ${message.action}:`, error);
        recordError('extension', error, { component: 'message_handler', action: message.action });
        
        // Send error response
        try {
          sendResponse({ success: false, error: error.message });
        } catch (responseError) {
          console.error("Error sending error response:", responseError);
        }
      }
      
      // Return true if we're handling async (using sendResponse later)
      return handled;
    });
    
    console.log("Message listeners initialized");
  } catch (error) {
    console.error("Error setting up message listeners:", error);
    recordError('extension', error, { component: 'messaging_setup' });
  }
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

export {
  setupMessageListeners
}; 