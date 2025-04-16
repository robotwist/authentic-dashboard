/**
 * Authentic Dashboard Chrome Extension Content Script
 * 
 * This script runs in the context of social media sites to collect and analyze posts.
 * It uses a standardized approach across all platforms (Instagram, Facebook, and LinkedIn):
 * 
 * 1. Auto-scrolling: Each platform uses simulateInfiniteScroll to load more content
 * 2. Collection: Platform-specific collection functions extract post data from the DOM
 * 3. Processing: Posts are analyzed, ranked, and prepared for the API
 * 4. Communication: All API calls go through the background script to bypass CSP restrictions
 * 
 * The script is designed to be resilient to various platform layouts and changes,
 * with fallback mechanisms and extensive error handling.
 * Cursor: This script scrapes posts from [PLATFORM] using modular selectors. Help improve selector reliability and async behavior.

 */

// Test function to diagnose CSP issues
function testApiConnections() {
  console.log("=== TESTING API CONNECTIONS ===");
  
  // First attempt: Direct fetch (will likely fail due to CSP)
  console.log("Testing direct fetch API call (likely to fail due to CSP)...");
  fetch('http://localhost:8000/api/health-check/')
    .then(response => response.json())
    .then(data => {
      console.log("✅ DIRECT FETCH SUCCEEDED:", data);
    })
    .catch(error => {
      console.error("❌ DIRECT FETCH FAILED:", error.message);
      
      // Second attempt: Using background script (should work)
      console.log("Testing background script API call...");
      safeApiCall('/api/health-check/')
        .then(data => {
          console.log("✅ SAFE API CALL SUCCEEDED:", data);
        })
        .catch(error => {
          console.error("❌ SAFE API CALL FAILED:", error);
        });
    });
    
  console.log("=== TEST COMPLETE (check console for results) ===");
}

/**
 * Unified API communication function that sends requests through the background script
 * to bypass Content Security Policy restrictions with enhanced error handling
 * 
 * @param {string} endpoint - API endpoint path (with or without domain)
 * @param {Object} options - Request options (method, body, headers)
 * @returns {Promise} - Promise that resolves with the API response
 */
function communicateWithAPI(endpoint, options = {}) {
  const requestId = generateRequestId();
  const startTime = performance.now();
  const requestMethod = options.method || 'GET';
  
  console.log(`[API:${requestId}] Starting ${requestMethod} request to ${endpoint}`);
  
  // Track telemetry for this request
  const telemetry = {
    requestId,
    endpoint,
    method: requestMethod,
    startTime,
    retryCount: 0,
    success: false,
    error: null,
    duration: 0,
    networkErrors: 0,
    serverErrors: 0
  };
  
  // Track API requests globally for debugging
  window.apiStats = window.apiStats || {
    total: 0,
    succeeded: 0,
    failed: 0,
    networkErrors: 0,
    serverErrors: 0,
    rateLimited: 0,
    authErrors: 0
  };
  window.apiStats.total++;
  
  return new Promise((resolve, reject) => {
    // Normalize the endpoint
    if (!endpoint.startsWith('/') && !endpoint.startsWith('http')) {
      endpoint = '/' + endpoint;
      console.log(`[API:${requestId}] Normalized endpoint: ${endpoint}`);
    }
    
    // Extract API domain from endpoint if it's a full URL
    let apiPath = endpoint;
    let domain = 'http://localhost:8000';
    
    if (endpoint.startsWith('http')) {
      try {
        const url = new URL(endpoint);
        domain = url.origin;
        apiPath = url.pathname + url.search;
        console.log(`[API:${requestId}] Parsed URL - domain: ${domain}, path: ${apiPath}`);
      } catch (error) {
        const errorMsg = `Invalid URL: ${endpoint}`;
        console.error(`[API:${requestId}] ${errorMsg}`, error);
        
        // Complete telemetry
        telemetry.success = false;
        telemetry.error = errorMsg;
        telemetry.duration = performance.now() - startTime;
        reportTelemetry(telemetry);
        window.apiStats.failed++;
        
        reject(errorMsg);
        return;
      }
    }
    
    const fullEndpoint = domain + apiPath;
    
    // Log request details at debug level
    const bodySize = options.body ? JSON.stringify(options.body).length : 0;
    console.log(`[API:${requestId}] Request details:`, {
      url: fullEndpoint,
      method: requestMethod,
      bodySize: formatBytes(bodySize),
      hasHeaders: !!options.headers,
      timestamp: new Date().toISOString()
    });
    
    // Create a timer to detect potential service worker inactivity
    const timeoutDuration = options.timeout || 15000;
    const timeoutId = setTimeout(() => {
      console.warn(`[API:${requestId}] No response after ${timeoutDuration}ms, service worker may be inactive`);
      
      // Try to wake up the service worker
      wakeServiceWorker()
        .then(() => {
          console.log(`[API:${requestId}] Service worker wakened, retrying request`);
          telemetry.retryCount++;
          
          // Retry the original request after waking with increased timeout
          return sendMessageWithRetry({
            action: 'proxyApiCall',
            requestId,
            endpoint: fullEndpoint,
            method: requestMethod,
            headers: options.headers || {},
            body: options.body || null
          }, 3, 1500); // Longer delay after wake
        })
        .then(response => processResponse(response))
        .catch(error => {
          const errorMsg = `Failed to communicate after wake attempt: ${error}`;
          console.error(`[API:${requestId}] ${errorMsg}`);
          
          // Complete telemetry
          telemetry.success = false;
          telemetry.error = errorMsg;
          telemetry.duration = performance.now() - startTime;
          reportTelemetry(telemetry);
          window.apiStats.failed++;
          window.apiStats.networkErrors++;
          
          reject(errorMsg);
        });
    }, timeoutDuration);
    
    // Helper to process response consistently
    const processResponse = (response) => {
      clearTimeout(timeoutId); // Clear the timeout if we got a response
      const duration = performance.now() - startTime;
      
      if (!response) {
        const errorMsg = "Empty response from background script";
        console.error(`[API:${requestId}] ${errorMsg}`);
        
        // Complete telemetry
        telemetry.success = false;
        telemetry.error = errorMsg;
        telemetry.duration = duration;
        telemetry.networkErrors++;
        reportTelemetry(telemetry);
        window.apiStats.failed++;
        window.apiStats.networkErrors++;
        
        reject(errorMsg);
        return;
      }
      
      // Log response metrics
      const responseSize = response.data ? JSON.stringify(response.data).length : 0;
      console.log(`[API:${requestId}] Response received in ${duration.toFixed(2)}ms:`, {
        success: response.success,
        size: formatBytes(responseSize),
        status: response.status || 'unknown'
      });
      
      if (response.success) {
        // Complete telemetry for success
        telemetry.success = true;
        telemetry.duration = duration;
        reportTelemetry(telemetry);
        window.apiStats.succeeded++;
        
        resolve(response.data);
      } else {
        const errorMsg = response.error || 'Unknown API error';
        const errorStatus = response.status;
        console.error(`[API:${requestId}] Request failed: ${errorMsg} (Status: ${errorStatus})`);
        
        // Check if we should retry based on error type
        const shouldRetry = 
          // Network errors can be retried
          (typeof errorMsg === 'string' && (
            errorMsg.includes('network') || 
            errorMsg.includes('timeout') || 
            errorMsg.includes('connection')
          )) ||
          // Server errors (500s) can be retried
          (errorStatus >= 500 && errorStatus < 600);
            
        // If we have retries left and this error is retryable, try again
        if (shouldRetry && telemetry.retryCount < (options.maxRetries || 3)) {
          telemetry.retryCount++;
          const isServerError = errorStatus >= 500 && errorStatus < 600;
          
          if (isServerError) {
            telemetry.serverErrors++;
            window.apiStats.serverErrors++;
            console.warn(`[API:${requestId}] Server error detected, retrying (${telemetry.retryCount}/${options.maxRetries || 3})...`);
          } else {
            telemetry.networkErrors++;
            window.apiStats.networkErrors++;
            console.warn(`[API:${requestId}] Network error detected, retrying (${telemetry.retryCount}/${options.maxRetries || 3})...`);
          }
          
          // Calculate delay with exponential backoff
          const retryDelay = Math.min(1000 * Math.pow(2, telemetry.retryCount - 1), 10000);
          
          // Add jitter to avoid all clients retrying simultaneously
          const jitter = Math.random() * 0.3 + 0.85; // 0.85-1.15
          const delay = Math.floor(retryDelay * jitter);
          
          console.log(`[API:${requestId}] Retrying in ${delay}ms...`);
          
          setTimeout(() => {
            console.log(`[API:${requestId}] Executing retry ${telemetry.retryCount}...`);
            
            // Retry the request with the same parameters
            sendMessageWithRetry({
              action: 'proxyApiCall',
              requestId,
              endpoint: fullEndpoint,
              method: requestMethod,
              headers: options.headers || {},
              body: options.body || null,
              retry: telemetry.retryCount
            }, 
            options.maxRetries || 3,
            options.retryDelay || 1000)
            .then(response => processResponse(response))
            .catch(error => {
              const errorMsg = `Error during retry: ${error}`;
              console.error(`[API:${requestId}] ${errorMsg}`);
              
              // Complete telemetry
              telemetry.success = false;
              telemetry.error = errorMsg;
              telemetry.duration = performance.now() - startTime;
              reportTelemetry(telemetry);
              window.apiStats.failed++;
              
              reject(errorMsg);
            });
          }, delay);
          
          return;
        }
        
        // Check for specific error types that warrant special handling
        if (typeof errorMsg === 'string') {
          // Handle rate limiting
          if (errorStatus === 429 || errorMsg.includes('429') || errorMsg.toLowerCase().includes('rate limit')) {
            console.warn(`[API:${requestId}] Rate limited - backing off`);
            window.apiStats.rateLimited++;
            
            // Store rate limit status in session storage
            try {
              const rateLimitDuration = 60 * 1000; // Default to 1 minute
              sessionStorage.setItem('api_rate_limited', 'true');
              sessionStorage.setItem('api_rate_limit_until', Date.now() + rateLimitDuration);
            } catch (e) {
              // Session storage might not be available
            }
          }
          
          // Handle authentication errors
          if (errorStatus === 401 || errorStatus === 403 || 
              errorMsg.includes('401') || errorMsg.includes('403') || 
              errorMsg.toLowerCase().includes('unauthorized')) {
            console.warn(`[API:${requestId}] Authentication error - may need to re-authenticate`);
            window.apiStats.authErrors++;
            
            // Notify UI to potentially prompt for re-auth
            chrome.runtime.sendMessage({
              action: 'authenticationError',
              endpoint: fullEndpoint
            });
          }
        }
        
        // Complete telemetry for error
        telemetry.success = false;
        telemetry.error = errorMsg;
        telemetry.duration = duration;
        reportTelemetry(telemetry);
        window.apiStats.failed++;
        
        reject(errorMsg);
      }
    };
    
    // Smart rate limit backoff system
    let isRateLimited = false;
    let rateLimitDelay = 0;
    
    try {
      const rateLimitUntil = parseInt(sessionStorage.getItem('api_rate_limit_until') || '0');
      if (rateLimitUntil > Date.now()) {
        isRateLimited = true;
        rateLimitDelay = Math.ceil((rateLimitUntil - Date.now()) / 1000);
        console.warn(`[API:${requestId}] Rate limit active for ${rateLimitDelay}s more`);
      } else if (sessionStorage.getItem('api_rate_limited')) {
        // Clear expired rate limit
        sessionStorage.removeItem('api_rate_limited');
        sessionStorage.removeItem('api_rate_limit_until');
      }
    } catch (e) {
      // Session storage might not be available
    }
    
    // Allow request to bypass rate limiting if specified
    if (isRateLimited && !options.ignoreRateLimit) {
      // If the request is marked as essential, wait and then try anyway
      if (options.essential) {
        const waitTime = Math.min(rateLimitDelay * 1000, 10000); // Wait at most 10 seconds
        console.warn(`[API:${requestId}] Essential request will wait ${waitTime/1000}s for rate limit to clear`);
        
        setTimeout(() => {
          // Try the request after waiting (with ignoreRateLimit set to true)
          const newOptions = {...options, ignoreRateLimit: true};
          communicateWithAPI(endpoint, newOptions)
            .then(resolve)
            .catch(reject);
        }, waitTime);
        return;
      }
      
      const errorMsg = 'Request blocked due to active rate limiting';
      console.error(`[API:${requestId}] ${errorMsg}`);
      
      // Complete telemetry
      telemetry.success = false;
      telemetry.error = errorMsg;
      telemetry.duration = performance.now() - startTime;
      reportTelemetry(telemetry);
      window.apiStats.failed++;
      window.apiStats.rateLimited++;
      
      reject(errorMsg);
      return;
    }
    
    // Use the enhanced sendMessageWithRetry function with the request ID
    sendMessageWithRetry({
      action: 'proxyApiCall',
      requestId,
      endpoint: fullEndpoint,
      method: requestMethod,
      headers: options.headers || {},
      body: options.body || null
    }, 
    options.maxRetries || 3,
    options.retryDelay || 1000)
    .then(response => processResponse(response))
    .catch(error => {
      clearTimeout(timeoutId);
      
      const errorMsg = `Error communicating with background script: ${error}`;
      console.error(`[API:${requestId}] ${errorMsg}`);
      
      // Complete telemetry
      telemetry.success = false;
      telemetry.error = errorMsg;
      telemetry.duration = performance.now() - startTime;
      reportTelemetry(telemetry);
      
      reject(errorMsg);
    });
  });
}

/**
 * Generate a unique ID for API request tracking
 * @returns {string} A unique request ID
 */
function generateRequestId() {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 5)}`;
}

/**
 * Format bytes to human-readable size
 * @param {number} bytes - Number of bytes
 * @returns {string} Formatted size with units
 */
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " bytes";
  else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  else return (bytes / 1048576).toFixed(1) + " MB";
}

/**
 * Report telemetry data for API calls
 * @param {Object} telemetry - Telemetry data to report
 */
function reportTelemetry(telemetry) {
  // Store recent API calls for performance tracking
  try {
    // Get existing API call history
    const apiCallsJson = sessionStorage.getItem('api_calls_history') || '[]';
    const apiCalls = JSON.parse(apiCallsJson);
    
    // Add this call
    apiCalls.push({
      id: telemetry.requestId,
      endpoint: telemetry.endpoint,
      method: telemetry.method,
      time: new Date().toISOString(),
      duration: telemetry.duration,
      success: telemetry.success,
      retries: telemetry.retryCount
    });
    
    // Keep only last 50 calls
    if (apiCalls.length > 50) {
      apiCalls.shift();
    }
    
    // Save back to storage
    sessionStorage.setItem('api_calls_history', JSON.stringify(apiCalls));
    
    // Calculate and store performance metrics
    const successCalls = apiCalls.filter(call => call.success);
    const avgDuration = successCalls.reduce((sum, call) => sum + call.duration, 0) / 
                       (successCalls.length || 1);
    const successRate = (successCalls.length / apiCalls.length) * 100;
    
    sessionStorage.setItem('api_performance', JSON.stringify({
      avgResponseTime: avgDuration,
      successRate: successRate,
      totalCalls: apiCalls.length,
      lastUpdated: new Date().toISOString()
    }));
  } catch (error) {
    // Session storage might not be available
    console.log("Error storing API telemetry:", error);
  }
  
  // Also report to background page for long-term storage/analysis
  if (chrome.runtime) {
    try {
      chrome.runtime.sendMessage({
        action: 'logApiTelemetry',
        telemetry: {
          ...telemetry,
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString()
        }
      });
    } catch (e) {
      // Background page communication might fail
    }
  }
}

// Function to wake up the service worker if it's inactive
function wakeServiceWorker() {
  console.log("Attempting to wake service worker...");
  return new Promise((resolve, reject) => {
    // Send a simple ping message to wake up the service worker
    chrome.runtime.sendMessage({action: 'ping'}, response => {
      if (chrome.runtime.lastError) {
        console.error("Error waking service worker:", chrome.runtime.lastError);
        // Even if there's an error, the attempt itself might wake up the worker
        // so we'll resolve anyway after a short delay
        setTimeout(resolve, 500);
      } else {
        console.log("Service worker wake successful:", response);
        resolve(response);
      }
    });
  });
}

// Import the error handling module
import { recordError, createErrorHandler } from './modules/error_handling.js';

// Enhanced version of sendMessageWithRetry with exponential backoff and jitter
function sendMessageWithRetry(message, maxRetries = 3, baseRetryDelay = 1000) {
  console.log(`Sending message to background script (attempt 1/${maxRetries + 1}):`, message.action);
  
  // Create a unique retry ID for tracking
  const retryId = generateRequestId();
  console.log(`[Retry:${retryId}] Starting retry sequence for ${message.action}`);
  
  // Store global retry stats for debugging
  window.retryStats = window.retryStats || {
    total: 0,
    succeeded: 0,
    failed: 0,
    inProgress: 0
  };
  window.retryStats.total++;
  window.retryStats.inProgress++;
  
  return new Promise((resolve, reject) => {
    let currentRetry = 0;
    const startTime = performance.now();
    
    // Add jitter to avoid thundering herd problem
    const getJitter = () => Math.random() * 0.3 + 0.85; // 0.85-1.15 randomization factor
    
    // Calculate next retry delay with exponential backoff and jitter
    const getNextDelay = (retry) => {
      const exponentialDelay = baseRetryDelay * Math.pow(2, retry);
      const cappedDelay = Math.min(exponentialDelay, 30000); // Cap at 30 seconds
      return Math.round(cappedDelay * getJitter());
    };
    
    // Function to handle connection errors
    const handleConnectionError = (error) => {
      const errorMsg = error?.message || "Unknown error";
      console.error(`[Retry:${retryId}] Error sending message (attempt ${currentRetry + 1}/${maxRetries + 1}):`, errorMsg);
      
      // Record the error in the centralized system
      recordError('messaging', error, {
        retryId,
        messageAction: message.action,
        attempt: currentRetry + 1,
        maxRetries: maxRetries + 1
      });
      
      // Check if the error indicates a potential service worker issue
      const isServiceWorkerError = 
        errorMsg.includes("receiving end does not exist") || 
        errorMsg.includes("could not establish connection") ||
        errorMsg.includes("disconnected");
      
      // If it looks like a service worker issue, try to wake it first
      if (isServiceWorkerError && currentRetry === 0) {
        console.warn(`[Retry:${retryId}] Service worker appears to be inactive, attempting to wake...`);
        
        // Update the error registry
        recordError('messaging', 'Service worker disconnected', { disconnects: 1 });
        
        return wakeServiceWorker()
          .then(() => {
            console.log(`[Retry:${retryId}] Service worker wakened, continuing retry sequence`);
            // Record the successful reconnection
            recordError('messaging', 'Service worker reconnected', { reconnects: 1 });
            
            // Don't increment retry count for this special case
            const wakeupDelay = 1000; // Small delay to allow worker to initialize
            setTimeout(sendMessage, wakeupDelay);
          })
          .catch(wakeError => {
            console.error(`[Retry:${retryId}] Failed to wake service worker:`, wakeError);
            // Continue with normal retry process
            continueRetry();
          });
      }
      
      return continueRetry();
    };
    
    // Function to handle retry logic
    const continueRetry = () => {
      // Check if we should retry
      if (currentRetry < maxRetries) {
        currentRetry++;
        const nextDelay = getNextDelay(currentRetry - 1);
        
        console.log(`[Retry:${retryId}] Retrying in ${nextDelay}ms (attempt ${currentRetry + 1}/${maxRetries + 1})...`);
        
        // Wait and retry with exponential backoff
        setTimeout(sendMessage, nextDelay);
        return true;
      }
      
      // Maximum retries reached, reject the promise
      const duration = performance.now() - startTime;
      const failMsg = `Failed to send message after ${maxRetries + 1} attempts (${duration.toFixed(0)}ms)`;
      console.error(`[Retry:${retryId}] ${failMsg}`);
      
      // Update retry stats
      window.retryStats.failed++;
      window.retryStats.inProgress--;
      
      // Record the max retry failure
      recordError('messaging', failMsg, {
        retryId,
        messageAction: message.action,
        attempts: maxRetries + 1,
        duration: Math.round(duration)
      });
      
      reject(new Error(failMsg));
      return false;
    };
    
    const sendMessage = () => {
      // Add timestamp to help with debugging
      message.timestamp = Date.now();
      message.retryId = retryId;
      message.retryCount = currentRetry;
      
      try {
        chrome.runtime.sendMessage(message, (response) => {
          // Check if there was an error communicating with the background script
          if (chrome.runtime.lastError) {
            return handleConnectionError(chrome.runtime.lastError);
          }
          
          // Check for empty response (could indicate background script issue)
          if (!response) {
            console.warn(`[Retry:${retryId}] Empty response received from background script`);
            return continueRetry();
          }
          
          // No error, resolve with the response
          const duration = performance.now() - startTime;
          console.log(`[Retry:${retryId}] Message ${message.action} succeeded after ${currentRetry} retries (${duration.toFixed(0)}ms)`);
          
          // Update retry stats
          window.retryStats.succeeded++;
          window.retryStats.inProgress--;
          
          resolve(response);
        });
      } catch (error) {
        // Handle unexpected exceptions during message sending
        return handleConnectionError(error);
      }
    };
    
    // Start the first attempt
    sendMessage();
  });
}

// Replace the safeApiCall function with our new unified function
// This function is now just an alias for backward compatibility
function safeApiCall(endpoint, options = {}) {
  console.log("Using safeApiCall (via communicateWithAPI) for:", endpoint);
  return communicateWithAPI(endpoint, options);
}

// Run the test immediately when the script loads
setTimeout(testApiConnections, 3000);

// Ultimate Directive
// I think the ultimate directive that should guide development could be:
// > "Restore user sovereignty over the digital experience by creating transparent tools that prioritize genuine human satisfaction rather than engagement metrics."
// This directive emphasizes:
// User control ("sovereignty")
// Transparency in how content is filtered
// Human-centered design (satisfaction vs engagement)
// Ethical technology principles

// Function to load Pure Feed module
function loadPureFeedModule() {
  try {
    const script = document.createElement('script');
    const scriptUrl = chrome.runtime.getURL('pure_feed.js');
    console.log('Attempting to load Pure Feed module from:', scriptUrl);
    
    script.src = scriptUrl;
    script.onload = () => {
      console.log('Pure Feed module loaded successfully');
      // Verify the module is available in the window object
      if (window.pureFeed) {
        console.log('PureFeed object is available in window');
      } else {
        console.warn('PureFeed object is NOT available in window after loading');
      }
    };
    script.onerror = (e) => console.error('Failed to load Pure Feed module:', e);
    (document.head || document.documentElement).appendChild(script);
  } catch (error) {
    console.error('Error loading Pure Feed module:', error);
  }
}

// Load Pure Feed module for post ranking and classification
loadPureFeedModule();

/**
 * Standardized function to send collected posts to the API through the background script
 * with comprehensive logging and error handling.
 * 
 * @param {Array} posts - Array of collected posts to send
 * @param {string} platform - The platform the posts were collected from (e.g., 'instagram', 'facebook', 'linkedin')
 * @param {Object} options - Optional settings for the request
 * @returns {Promise} - Promise that resolves with API response or rejects with error
 */
function sendPostsToAPI(posts, platform, options = {}) {
  return new Promise((resolve, reject) => {
    const startTime = performance.now();
    const batchId = generateBatchId();
    
    // Validate inputs
    if (!posts || !Array.isArray(posts)) {
      console.error(`[PostAPI:${batchId}] Invalid posts data: not an array`);
      reject(new Error("Posts must be a valid array"));
      return;
    }
    
    if (!platform) {
      console.error(`[PostAPI:${batchId}] Missing platform parameter`);
      reject(new Error("Platform is required"));
      return;
    }
    
    // Filter out invalid posts
    const validPosts = posts.filter(post => {
      if (!post) return false;
      
      // Ensure minimal required fields exist
      if (!post.content && !post.image_urls && !post.images) {
        console.warn(`[PostAPI:${batchId}] Skipping post with no content or images`);
        return false;
      }
      
      return true;
    });
    
    const totalPosts = posts.length;
    const validPostCount = validPosts.length;
    const skippedCount = totalPosts - validPostCount;
    
    if (validPostCount === 0) {
      console.warn(`[PostAPI:${batchId}] No valid posts to send (${skippedCount} invalid posts filtered out)`);
      resolve({ success: false, message: "No valid posts to send", totalPosts, validPostCount, skippedCount });
      return;
    }
    
    console.log(`[PostAPI:${batchId}] Preparing to send ${validPostCount} ${platform} posts (${skippedCount} filtered out)`);
    
    // Group posts by certain attributes for logging
    const sponsoredCount = validPosts.filter(p => p.is_sponsored).length;
    const imageCount = validPosts.filter(p => p.image_urls || p.images).length;
    const avgContentLength = validPosts.reduce((sum, p) => sum + (p.content ? p.content.length : 0), 0) / validPostCount;
    
    console.log(`[PostAPI:${batchId}] Post details: ${sponsoredCount} sponsored, ${imageCount} with images, avg content length: ${avgContentLength.toFixed(1)} chars`);
    
    // Get API settings from storage
    chrome.storage.local.get(['apiKey', 'apiEndpoint', 'settings'], function(result) {
      const apiKey = result.apiKey;
      const apiEndpoint = result.apiEndpoint || 'http://127.0.0.1:8000';
      const settings = result.settings || {};
      
      // Check if collection is enabled for this type of content
      if (platform === 'instagram' && settings.disableInstagram) {
        console.warn(`[PostAPI:${batchId}] Instagram collection is disabled in settings`);
        resolve({ success: false, message: "Instagram collection is disabled", disabled: true });
        return;
      }
      
      if (platform === 'facebook' && settings.disableFacebook) {
        console.warn(`[PostAPI:${batchId}] Facebook collection is disabled in settings`);
        resolve({ success: false, message: "Facebook collection is disabled", disabled: true });
        return;
      }
      
      if (platform === 'linkedin' && settings.disableLinkedIn) {
        console.warn(`[PostAPI:${batchId}] LinkedIn collection is disabled in settings`);
        resolve({ success: false, message: "LinkedIn collection is disabled", disabled: true });
        return;
      }
      
      // Add collection timestamp and batch ID
      const timestamp = new Date().toISOString();
      const enhancedPosts = validPosts.map(post => ({
        ...post,
        platform: platform,
        collected_at: post.collected_at || timestamp,
        batch_id: batchId,
        extension_version: chrome.runtime.getManifest().version
      }));
      
      // Log request size estimation
      const requestSize = JSON.stringify({
        platform: platform,
        posts: enhancedPosts
      }).length;
      
      console.log(`[PostAPI:${batchId}] Request size: ${formatBytes(requestSize)}`);
      
      // Use the standardized communicateWithAPI function
      communicateWithAPI(`${apiEndpoint}/api/collect-posts/`, {
        method: 'POST',
        headers: { 'X-API-Key': apiKey },
        body: {
          platform: platform,
          posts: enhancedPosts,
          batch_id: batchId,
          metadata: {
            browser: navigator.userAgent,
            url: window.location.href,
          timestamp: timestamp,
            collection_method: 'extension'
          }
        },
        timeout: 30000, // Longer timeout for large post batches
        maxRetries: 3
      })
      .then(response => {
        const duration = performance.now() - startTime;
        
        // Handle successful response
        console.log(`[PostAPI:${batchId}] Successfully sent ${validPostCount} posts in ${duration.toFixed(0)}ms:`, {
          success: true,
          processedCount: response.processed || validPostCount,
          newCount: response.new || 0,
          duration: `${duration.toFixed(0)}ms`,
          batchId: batchId
        });
        
        // Show in-page notification if enabled
        if (!options.suppressNotification) {
          showInPageNotification(
            `Collected ${validPostCount} posts from ${platform}`,
            `${response.new || 0} new posts added to your dashboard.`
          );
        }
        
        // Store this successful collection in history
        saveCollectionToHistory(platform, validPostCount, response.new || 0);
        
        // Update any UI elements showing post collection stats
        updatePostCountDisplay(platform, validPostCount);
        
        resolve({
          success: true,
          message: `Successfully sent ${validPostCount} posts`,
          processed: response.processed || validPostCount,
          new: response.new || 0,
          duration: duration,
          batchId: batchId,
          ...response
        });
        })
        .catch(error => {
        const duration = performance.now() - startTime;
        
        console.error(`[PostAPI:${batchId}] Error sending ${platform} posts (${duration.toFixed(0)}ms):`, error);
        
        // Show error notification if enabled and if the error wasn't due to disabled collection
        if (!options.suppressNotification && !error.toString().includes('disabled')) {
          showInPageNotification(
            `Error collecting posts`,
            `Could not send ${validPostCount} ${platform} posts: ${error}`,
            'error'
          );
        }
        
        reject({
          success: false,
          message: `Failed to send posts: ${error}`,
          error: error,
          duration: duration,
          batchId: batchId
          });
        });
    });
  });
}

/**
 * Generate a unique ID for post batches
 * @returns {string} A unique batch ID
 */
function generateBatchId() {
  return `batch_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
}

/**
 * Show a notification overlaid on the page that fades out
 * @param {string} title - Title of the notification
 * @param {string} message - Message content
 * @param {string} type - 'success', 'error', or 'info'
 */
function showInPageNotification(title, message, type = 'success') {
  try {
    // Create the notification element
    const notification = document.createElement('div');
    notification.className = `authentic-notification authentic-notification-${type}`;
    notification.innerHTML = `
      <div class="authentic-notification-header">
        <span class="authentic-notification-title">${title}</span>
        <span class="authentic-notification-close">×</span>
      </div>
      <div class="authentic-notification-content">${message}</div>
    `;
    
    // Style the notification
    notification.style.position = 'fixed';
    notification.style.bottom = '20px';
    notification.style.right = '20px';
    notification.style.backgroundColor = type === 'error' ? '#fee' : '#efd';
    notification.style.border = `1px solid ${type === 'error' ? '#f99' : '#aea'}`;
    notification.style.borderRadius = '8px';
    notification.style.padding = '12px';
    notification.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
    notification.style.zIndex = '9999999';
    notification.style.maxWidth = '300px';
    notification.style.fontSize = '14px';
    notification.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    notification.style.transition = 'opacity 0.5s ease-in-out';
    
    // Style the header
    const header = notification.querySelector('.authentic-notification-header');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.marginBottom = '8px';
    
    // Style the title
    const notificationTitle = notification.querySelector('.authentic-notification-title');
    notificationTitle.style.fontWeight = 'bold';
    notificationTitle.style.color = type === 'error' ? '#c00' : '#060';
    
    // Style the close button
    const closeButton = notification.querySelector('.authentic-notification-close');
    closeButton.style.cursor = 'pointer';
    closeButton.style.fontSize = '18px';
    closeButton.style.lineHeight = '14px';
    closeButton.onclick = function() {
      document.body.removeChild(notification);
    };
    
    // Style the content
    const content = notification.querySelector('.authentic-notification-content');
    content.style.color = '#555';
    
    // Add to the page
    document.body.appendChild(notification);
    
    // Remove after 5 seconds
    setTimeout(() => {
      notification.style.opacity = '0';
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 500);
    }, 5000);
  } catch (error) {
    // Silently fail if we can't add the notification (might be in a restricted context)
    console.error('Error showing notification:', error);
  }
}

/**
 * Save collection to history for tracking
 * @param {string} platform - Platform name
 * @param {number} count - Total post count
 * @param {number} newCount - New posts count
 */
function saveCollectionToHistory(platform, count, newCount) {
  try {
    chrome.storage.local.get(['collectionHistory'], function(result) {
      const history = result.collectionHistory || [];
      
      // Add this collection to history
      history.unshift({
        platform: platform,
        count: count,
        newCount: newCount,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        title: document.title
      });
      
      // Keep only the most recent 100 collections
      if (history.length > 100) {
        history.pop();
      }
      
      // Save back to storage
      chrome.storage.local.set({ collectionHistory: history });
    });
  } catch (error) {
    console.error('Error saving collection to history:', error);
  }
}

/**
 * Update any UI elements showing post counts
 * @param {string} platform - The platform name
 * @param {number} count - The post count
 */
function updatePostCountDisplay(platform, count) {
  // This function would update any UI elements in the page that show post counts
  // For example, a counter in the extension popup or badge
  try {
    chrome.runtime.sendMessage({
      action: 'updatePostCount',
      platform: platform,
      count: count
    });
  } catch (error) {
    // Silently fail - not critical
  }
}

// Global throttling variables
let lastCollectionTime = 0;
const COLLECTION_COOLDOWN = 5000; // 5 seconds minimum between collections
const RATE_LIMIT_BACKOFF = 60000; // 1 minute backoff if rate limited
let isRateLimited = false;
let rateLimitResetTime = 0;

// Add connection error handling
let connectionErrorCount = 0;
const MAX_CONNECTION_ERRORS = 3;
let lastConnectionError = null;

// Deduplication system - store content fingerprints
const FINGERPRINT_EXPIRATION = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHED_FINGERPRINTS = 500; // Maximum number of fingerprints to store

// Global variables for auto-scanning functionality
let autoScanEnabled = true;
let autoScanInterval = 5 * 60 * 1000; // 5 minutes by default
let autoScanTimer = null;
let lastAutoScanTime = 0;
let autoScanningActive = false;
let consecutiveScanFailures = 0;
const MAX_SCAN_FAILURES = 3;

// Adaptive selectors system for resilience against UI changes
const SELECTORS = {
  facebook: {
    posts: [
      '[data-pagelet^="FeedUnit"]',
      '[role="feed"] > div',
      '.x1lliihq',
      '.x1qjc9v5',
      'div[data-pagelet^="Feed"]'
    ],
    content: [
      '[data-ad-comet-preview="message"]',
      '[data-ad-preview="message"]',
      '[dir="auto"]',
      '.xdj266r',
      '.x11i5rnm'
    ]
  },
  instagram: {
    posts: [
      'article[role="presentation"]',
      'div._ab6k', 
      'div._aagw',
      'article._ab6k',
      'article',
      'div._aabd',
      'div.x1qjc9v5',
      '.x1y1aw1k',
      'div[style*="padding-bottom: 177.778%"]'
    ],
    content: [
      'div._a9zs',
      'div._a9zr',
      'span._aacl',
      'div._a9zr div',
      'span[class*="x193iq5w"]',
      'div[dir="auto"] span',
      'div.x1lliihq',
      'h1 + div'
    ]
  },
  linkedin: {
    posts: [
      '.feed-shared-update-v2',
      '.occludable-update',
      '.jobs-home-recommended-job',
      '.discover-entity-card'
    ],
    content: [
      '.feed-shared-update-v2__description',
      '.feed-shared-text',
      '.break-words'
    ]
  }
};

// Try multiple selectors until one works
function findElements(platform, selectorType) {
  if (!SELECTORS[platform] || !SELECTORS[platform][selectorType]) {
    console.warn(`No selectors defined for ${platform}.${selectorType}`);
    return [];
  }
  
  for (const selector of SELECTORS[platform][selectorType]) {
    const elements = document.querySelectorAll(selector);
    if (elements && elements.length > 0) {
      console.log(`Found ${elements.length} elements with ${selector}`);
      return elements;
    }
  }
  return [];
}

/**
 * Simulates infinite scrolling to load more content
 * 
 * @param {Object} options - Configuration options for scrolling
 * @param {number} options.maxScrollTime - Maximum scroll time in milliseconds (default: 30000)
 * @param {number} options.scrollInterval - Time between scroll actions in milliseconds (default: 1000)
 * @param {number} options.initialDelay - Time to wait before starting to scroll (default: 1000)
 * @param {number} options.pauseInterval - How often to pause scrolling to allow content to load (default: 3000)
 * @param {number} options.pauseDuration - How long to pause scrolling (default: 1500)
 * @param {string} options.postSelector - CSS selector for identifying posts (platform-specific)
 * @param {number} options.noNewPostsThreshold - How many scroll attempts with no new posts before stopping (default: 3)
 * @returns {Promise<number>} - Number of posts loaded
 */
function simulateInfiniteScroll(options = {}) {
  // Set default values
  const platform = getCurrentPlatform();
  const defaults = {
    maxScrollTime: 30000,
    scrollInterval: 1000,
    initialDelay: 1000,
    pauseInterval: 3000,
    pauseDuration: 1500,
    noNewPostsThreshold: 3
  };
  
  // Platform-specific settings
  const platformDefaults = {
    instagram: {
      postSelector: 'article', 
      initialDelay: 2000,
      pauseInterval: 3000
    },
    facebook: {
      postSelector: '[role="article"]',
      initialDelay: 1500,
      pauseInterval: 2500
    },
    linkedin: {
      postSelector: '.feed-shared-update-v2',
      initialDelay: 2500,
      pauseInterval: 4000
    }
  };
  
  // Merge defaults, platform defaults, and provided options
  const settings = { 
    ...defaults,
    ...(platformDefaults[platform] || {}),
    ...options
  };
  
  console.log(`[Authentic] Starting infinite scroll simulation for ${platform} with settings:`, settings);
  
  return new Promise((resolve, reject) => {
    // Initial post count before scrolling
    let lastPostCount = countVisiblePosts(settings.postSelector);
    console.log(`[Authentic] Initial post count: ${lastPostCount}`);
    
    let scrollStartTime = Date.now();
    let noNewPostsCount = 0;
    let scrollAttempts = 0;
    
    // Wait for the initial delay before starting to scroll
    setTimeout(() => {
      const scrollInterval = setInterval(() => {
        // Check if we've been scrolling for too long
        if (Date.now() - scrollStartTime > settings.maxScrollTime) {
          console.log(`[Authentic] Reached maximum scroll time (${settings.maxScrollTime}ms)`);
          clearInterval(scrollInterval);
          resolve(countVisiblePosts(settings.postSelector));
          return;
        }
        
        scrollAttempts++;
        
        // Scroll down
        window.scrollTo(0, document.body.scrollHeight);
        
        // If we need to pause to let content load (every pauseInterval)
        if (scrollAttempts % Math.floor(settings.pauseInterval / settings.scrollInterval) === 0) {
          clearInterval(scrollInterval);
          
          // After a pause, check if we got new posts
          setTimeout(() => {
            const currentPostCount = countVisiblePosts(settings.postSelector);
            console.log(`[Authentic] Posts count after pause: ${currentPostCount} (previously: ${lastPostCount})`);
            
            // Check if we found new posts
            if (currentPostCount <= lastPostCount) {
              noNewPostsCount++;
              console.log(`[Authentic] No new posts detected (${noNewPostsCount}/${settings.noNewPostsThreshold})`);
              
              // If we haven't found new posts for several attempts, stop scrolling
              if (noNewPostsCount >= settings.noNewPostsThreshold) {
                console.log('[Authentic] Stopping scroll - no new posts after multiple attempts');
                resolve(currentPostCount);
                return;
              }
    } else {
              // Reset counter if we found new posts
              noNewPostsCount = 0;
            }
            
            lastPostCount = currentPostCount;
            
            // Continue scrolling after the pause
            scrollInterval = setInterval(() => {
              // (Same scroll logic as before)
              if (Date.now() - scrollStartTime > settings.maxScrollTime) {
                console.log(`[Authentic] Reached maximum scroll time (${settings.maxScrollTime}ms)`);
                clearInterval(scrollInterval);
                resolve(countVisiblePosts(settings.postSelector));
    return;
  }
  
              scrollAttempts++;
              window.scrollTo(0, document.body.scrollHeight);
              
              if (scrollAttempts % Math.floor(settings.pauseInterval / settings.scrollInterval) === 0) {
                // Pause logic would repeat here
                // This creates a potential recursion issue, so we'll use the same loop
              }
            }, settings.scrollInterval);
          }, settings.pauseDuration);
        }
      }, settings.scrollInterval);
    }, settings.initialDelay);
  });
}

/**
 * Counts the number of visible posts on the page
 * 
 * @param {string} selector - CSS selector for posts
 * @returns {number} - Number of visible posts
 */
function countVisiblePosts(selector) {
  return document.querySelectorAll(selector).length;
}

// Detect current platform
function detectCurrentPlatform() {
    const url = window.location.href;
  if (url.includes('facebook.com')) {
    return 'facebook';
  } else if (url.includes('instagram.com')) {
    return 'instagram';
    } else if (url.includes('linkedin.com')) {
    return 'linkedin';
  }
  return 'unknown';
}

// Function to generate a content fingerprint
function generateFingerprint(platform, user, content) {
  // Create a fingerprint using platform, user, and first 50 chars of content
  // This helps identify the same post even if some details change
  const contentSnippet = (content || "").substring(0, 50).trim();
  return `${platform}:${user}:${contentSnippet}`;
}

// Function to check if content has already been processed
function isContentDuplicate(platform, user, content) {
  // Get the stored fingerprints
  const fingerprintKey = `${platform}_fingerprints`;
  let existingFingerprints = JSON.parse(localStorage.getItem(fingerprintKey) || '[]');
  
  // Generate fingerprint for the new content
  const newFingerprint = generateFingerprint(platform, user, content);
  
  // Always allow collection by returning false
  console.log(`${platform}: Allowing collection for all content`);
  return false;
}

// Function to record a fingerprint
function recordFingerprint(platform, user, content) {
  const fingerprint = generateFingerprint(platform, user, content);
  
  chrome.storage.local.get(['processedFingerprints'], function(result) {
    const now = Date.now();
    const expirationTime = now + FINGERPRINT_EXPIRATION;
    let fingerprints = result.processedFingerprints || {};
    
    // Add or update this fingerprint
    fingerprints[fingerprint] = expirationTime;
    
    // Clean up old fingerprints to avoid unlimited storage growth
    const fingerprintEntries = Object.entries(fingerprints);
    if (fingerprintEntries.length > MAX_CACHED_FINGERPRINTS) {
      // Sort by expiration time, remove oldest ones
      const sortedEntries = fingerprintEntries.sort((a, b) => a[1] - b[1]);
      const entriesToKeep = sortedEntries.slice(-MAX_CACHED_FINGERPRINTS);
      fingerprints = Object.fromEntries(entriesToKeep);
    }
    
    // Store updated fingerprints
    chrome.storage.local.set({processedFingerprints: fingerprints});
  });
}

// Function to check if the server is available
function checkServerAvailability(callback) {
    console.log("Checking server availability...");
    
    // Use the centralized API client if available
    if (window.authDashboardAPI) {
        // Always force a fresh check when called directly from content scripts
        window.authDashboardAPI.checkAvailability(true)
            .then(status => {
                console.log("API availability check result:", status);
                callback(status.available, status.endpoint, status.apiKey);
            })
            .catch(error => {
                console.error("Error checking server with API client:", error);
                callback(false, null, null);
            });
        return;
    }
    
    // Use message passing to communicate with background script for server availability check
    chrome.runtime.sendMessage({
        action: 'checkAPIEndpoint',
        forceCheck: true
    }, response => {
        if (chrome.runtime.lastError) {
            console.error("Error communicating with background script:", chrome.runtime.lastError);
            callback(false, null, null);
            return;
        }
        
        if (response && response.success) {
            console.log("Server availability check via background script:", response);
            callback(response.available, response.endpoint, response.apiKey);
        } else {
            console.error("Background script returned error:", response?.error || "Unknown error");
            callback(false, null, null);
        }
    });
}

/**
 * Enhanced collection function with better timeout and error handling for all platforms
 * 
 * @param {string} platform - The platform being collected (e.g., 'Instagram', 'Facebook', 'LinkedIn')
 * @param {Function} collectionFunction - The function that performs the actual collection
 * @param {Object} options - Additional options
 * @returns {Promise} - Resolves with collected posts
 */
function collectWithRateLimitProtection(platform, collectionFunction, options = {}) {
  console.log(`Starting ${platform} collection with rate limit protection`);
  
  // Platform-specific settings
  const platformSettings = {
    'Instagram': {
      timeout: 35000,   // Instagram often takes longer to load content
      retries: 2,       // Instagram is more sensitive to rate limits
      scrollTime: 30000 // Instagram needs more scrolling time
    },
    'Facebook': {
      timeout: 25000,
      retries: 3,
      scrollTime: 25000
    },
    'LinkedIn': {
      timeout: 35000,   // LinkedIn is slower to load content
      retries: 2,
      scrollTime: 35000
    },
    'default': {
      timeout: 20000,
      retries: 2,
      scrollTime: 25000
    }
  };
  
  // Get settings for the current platform or use defaults
  const settings = platformSettings[platform] || platformSettings.default;
  
  // Apply custom options on top of platform defaults
  const timeout = options.timeout || settings.timeout;
  const retries = options.retries || settings.retries;
  const scrollTime = options.scrollTime || settings.scrollTime;
  
  // Log collection attempt
  console.log(`Collection settings for ${platform}: timeout=${timeout}ms, retries=${retries}, scrollTime=${scrollTime}ms`);
  
  // Check if we're in rate limit backoff period
  if (isRateLimited && Date.now() < rateLimitResetTime) {
    const timeLeft = Math.ceil((rateLimitResetTime - Date.now()) / 1000);
    console.warn(`Rate limit in effect for ${platform}. Try again in ${timeLeft} seconds.`);
    return Promise.reject(new Error(`Rate limited for ${timeLeft} more seconds`));
  }
  
  // Check if we should enforce cooldown between collections
  const now = Date.now();
  if (now - lastCollectionTime < COLLECTION_COOLDOWN) {
    const cooldownLeft = Math.ceil((COLLECTION_COOLDOWN - (now - lastCollectionTime)) / 1000);
    console.log(`Collection cooldown active. Waiting ${cooldownLeft} seconds between requests.`);
    
    // Instead of rejecting, we'll wait and then continue
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        // After cooldown, proceed with collection
        performCollection(platform, collectionFunction, { timeout, retries, scrollTime })
          .then(resolve)
          .catch(reject);
      }, COLLECTION_COOLDOWN - (now - lastCollectionTime));
    });
  }
  
  // No rate limit or cooldown, proceed with collection
  return performCollection(platform, collectionFunction, { timeout, retries, scrollTime });
}

/**
 * Helper function to perform the actual collection with timeout handling
 * 
 * @param {string} platform - The platform being collected
 * @param {Function} collectionFunction - The function that performs the collection
 * @param {Object} options - Collection options including timeout
 * @returns {Promise} - Resolves with collected posts
 */
function performCollection(platform, collectionFunction, options = {}) {
  // Update collection timestamp
  lastCollectionTime = Date.now();
  
  // Get timeout from options or use a default
  const timeoutDuration = options.timeout || 20000; // Default 20s
  
  // Start a collection timeout
  let timeoutId;
  
  // Create the collection promise with timeout
  const collectionPromise = new Promise((resolve, reject) => {
    // Set timeout to prevent hanging collections
    timeoutId = setTimeout(() => {
      reject(new Error(`Collection timed out after ${timeoutDuration}ms`));
    }, timeoutDuration);
    
    // Try to run the collection function
    try {
      const result = collectionFunction();
      
      // Handle both promises and direct returns
      if (result && typeof result.then === 'function') {
        result
          .then(posts => {
            clearTimeout(timeoutId); // Clear timeout on success
            
            // Log collection success
            console.log(`Successfully collected ${posts ? posts.length : 0} posts from ${platform}`);
            
            resolve(posts);
          })
          .catch(error => {
            clearTimeout(timeoutId); // Clear timeout on error
            
            // Check for rate limit indicators in the error
            if (error && (
                error.toString().toLowerCase().includes('rate') ||
                error.toString().toLowerCase().includes('limit') ||
                error.toString().toLowerCase().includes('429')
            )) {
              console.error(`Rate limit detected for ${platform}. Backing off.`);
              isRateLimited = true;
              rateLimitResetTime = Date.now() + RATE_LIMIT_BACKOFF;
            }
            
            reject(error);
          });
      } else {
        // Function returned a direct result (not a promise)
        clearTimeout(timeoutId);
        
        // Log collection success
        console.log(`Successfully collected ${result ? result.length : 0} posts from ${platform} (direct)`);
        
        resolve(result);
      }
    } catch (error) {
      clearTimeout(timeoutId);
      console.error(`Error executing ${platform} collection function:`, error);
      reject(error);
    }
  });
  
  return collectionPromise.catch(error => {
    console.error(`Error in ${platform} collection:`, error);
    
    // Increment error counter
    if (error.toString().includes('timed out')) {
      console.warn(`Collection timeout for ${platform}. This is likely due to slow page loading or selector issues.`);
      
      // Add platform-specific advice
      if (platform === 'Instagram') {
        console.info("Instagram collection tips: try refreshing the page or scrolling manually before collecting.");
      } else if (platform === 'Facebook') {
        console.info("Facebook collection tips: ensure you're logged in and try scrolling manually to load content.");
      } else if (platform === 'LinkedIn') {
        console.info("LinkedIn collection tips: LinkedIn may limit content visibility. Try scrolling manually first.");
      }
    }
    
    // Track connection errors
    connectionErrorCount++;
    lastConnectionError = error.toString();
    
    // Rethrow to propagate the error
    throw error;
  });
}

// Add a function at the top of the file to handle post fingerprinting
function generatePostFingerprint(platform, user, contentSnippet, timestamp) {
  // Create a fingerprint based on platform, user, first 50 chars of content, and timestamp if available
  const contentPart = contentSnippet ? contentSnippet.substring(0, 50).trim() : '';
  return `${platform}_${user}_${contentPart}_${timestamp || ''}`;
}

function isPostAlreadyProcessed(fingerprint) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['processedPosts'], function(result) {
      const processedPosts = result.processedPosts || {};
      resolve(processedPosts[fingerprint] === true);
    });
  });
}

function markPostAsProcessed(fingerprint) {
  chrome.storage.local.get(['processedPosts'], function(result) {
    const processedPosts = result.processedPosts || {};
    
    // Add the new fingerprint
    processedPosts[fingerprint] = true;
    
    // Keep the size manageable by removing old entries if we have too many
    const keys = Object.keys(processedPosts);
    if (keys.length > 500) {
      // Remove the oldest 100 entries
      const keysToRemove = keys.slice(0, 100);
      keysToRemove.forEach(key => {
        delete processedPosts[key];
      });
    }
    
    // Save back to storage
    chrome.storage.local.set({ processedPosts: processedPosts });
  });
}

/**
 * Enhanced Instagram post collection that can handle different layouts
 * @returns {Promise<Array>} - Resolves with collected posts
 */
function collectInstagramPosts() {
  return new Promise((resolve, reject) => {
    try {
      console.log("Starting enhanced Instagram post collection...");

      // Detect which type of Instagram page we're on
      let pageType = 'unknown';
      const url = window.location.href;
      
      if (url.includes('/p/')) {
        pageType = 'post';
      } else if (url.includes('/explore/')) {
        pageType = 'explore';
      } else if (url.includes('/reels/')) {
        pageType = 'reels';
        } else {
        pageType = 'feed';
      }
      
      console.log(`Detected Instagram page type: ${pageType}`);
      
      // Try to find more posts with scrolling if not on a single post page
      if (pageType !== 'post') {
        // Scroll to load more content
        simulateInfiniteScroll().then(scrollResult => {
          // After scrolling, collect what we found
          collectInstagramPostElements(pageType).then(posts => {
            resolve(posts);
          }).catch(error => {
            console.error("Error during Instagram post processing:", error);
            reject(error);
          });
        }).catch(error => {
          console.error("Error during infinite scroll:", error);
          // Try to collect what we can even if scrolling failed
          collectInstagramPostElements(pageType).then(posts => {
            resolve(posts);
          }).catch(innerError => {
            reject(innerError);
          });
        });
      } else {
        // Single post page, no need to scroll
        collectInstagramPostElements(pageType).then(posts => {
          resolve(posts);
        }).catch(error => {
          reject(error);
        });
      }
    } catch (error) {
      console.error("Fatal error in Instagram collection:", error);
      reject(error);
    }
  });
}

/**
 * Helper function to collect Instagram posts after scrolling
 * @param {string} pageType - The type of Instagram page
 * @returns {Promise<Array>} - Resolves with collected posts
 */
function collectInstagramPostElements(pageType) {
  return new Promise((resolve, reject) => {
    try {
      // Expanded selector set for Instagram 
      const postSelectors = [
        'article[role="presentation"]',
        'div._ab6k', 
        'div._aagw',
        'article._ab6k',
        'article',
        'div._aabd',
        'div.x1qjc9v5',
        '.x1y1aw1k',
        'div[style*="padding-bottom: 177.778%"]',
        // New flexible selectors
        '[data-visualcompletion="media-vc-image"]',
        'div[style*="position: relative"] > div[role="button"]',
        'div[style*="padding-bottom"]',
        // Reels-specific selectors
        'div[data-visualcompletion="media"] > div > div',
        'div[data-media-type="GraphVideo"]'
      ];
      
      // Find post elements using our expanded selector set
      let postElements = [];
      for (const selector of postSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements && elements.length > 0) {
          console.log(`Found ${elements.length} elements with ${selector}`);
          postElements = Array.from(elements);
          break;
        }
      }
      
      // If we still have no elements, try a more aggressive approach
      if (postElements.length === 0) {
        console.warn("No posts found with standard selectors, trying alternative approach");
        
        // Look for images or videos as a fallback
        const mediaElements = document.querySelectorAll('img[srcset], video');
        const potentialPostElements = [];
        
        // Filter to only include elements that are likely posts (based on size, etc)
        Array.from(mediaElements).forEach(el => {
          // Get parent container that might be a post
          let parent = el.parentElement;
          for (let i = 0; i < 5; i++) { // Check up to 5 levels up
            if (!parent) break;
            
            // Check if this parent has characteristics of a post container
            const rect = parent.getBoundingClientRect();
            if (rect.width > 300 && rect.height > 300) {
              potentialPostElements.push(parent);
              break;
            }
            parent = parent.parentElement;
          }
        });
        
        // Use the potential posts if we found any
        if (potentialPostElements.length > 0) {
          console.log(`Found ${potentialPostElements.length} potential post elements using media-based detection`);
          postElements = potentialPostElements;
        }
      }
      
      // Limit to a reasonable number of posts to avoid processing too much
      const MAX_POSTS_TO_PROCESS = 20;
      if (postElements.length > MAX_POSTS_TO_PROCESS) {
        console.log(`Limiting processing to ${MAX_POSTS_TO_PROCESS} posts out of ${postElements.length} found`);
        postElements = postElements.slice(0, MAX_POSTS_TO_PROCESS);
      }
      
      console.log(`Found ${postElements.length} potential Instagram posts`);
      
      // Now extract data from the post elements
      const posts = [];
      let postCount = 0;
      
      // Process each post element
      Array.from(postElements).forEach((el, index) => {
        try {
          // Extract content/caption
          let content = "";
          
          // Try various selectors for content
          const contentSelectors = [
            'div._a9zs', 'div._a9zr', 'span._aacl', 'div._a9zr div',
            'span[class*="x193iq5w"]', 'div[dir="auto"] span', 
            'div.x1lliihq', 'h1 + div',
            'div[role="button"] + div span', // New pattern
            'span[dir="auto"]', // For alt text/captions
            'div[style*="padding-bottom"] + div', // For some layouts
            'a[role="link"] + div' // Feed captions
          ];
          
          for (const selector of contentSelectors) {
            const contentEl = el.querySelector(selector) || document.querySelector(selector);
            if (contentEl && contentEl.innerText) {
              content = contentEl.innerText.trim();
              if (content.length > 0) break;
            }
          }
          
          // If we couldn't find content, look for alt text on images as fallback
          if (!content || content.length < 3) {
            const img = el.querySelector('img[alt]');
            if (img && img.alt && img.alt.length > 5) {
              content = img.alt.trim();
            }
          }
          
          // Skip if content is too short and not on a single post page
          if ((!content || content.length < 3) && pageType !== 'post') {
    return;
  }
  
          // Extract username
          let username = "unknown";
          const usernameSelectors = [
            'a.notranslate', 'a.x1i10hfl', 'div._aaqt', 'h2',
            'span.x1lliihq', 'a[role="link"]', 'header a',
            // New patterns
            'a[tabindex="0"]', 
            'div[style*="flex-direction: row"] a',
            'h2 + div a', // Some profile links
            'a[href*="/"]' // Any link potentially containing username
          ];
          
          for (const selector of usernameSelectors) {
            const usernameEl = el.querySelector(selector) || document.querySelector(selector);
            if (usernameEl && usernameEl.innerText) {
              const potentialUser = usernameEl.innerText.trim();
              // Username validation - no spaces, reasonable length
              if (potentialUser.length > 0 && 
                  potentialUser.length < 40 && 
                  !potentialUser.includes("\n") && 
                  usernameEl.href && 
                  usernameEl.href.includes("/")) {
                username = potentialUser;
                break;
              }
            }
          }
          
          // Extract image URLs
          const imageUrls = [];
          const imgElements = el.querySelectorAll('img') || document.querySelectorAll('img');
          imgElements.forEach(img => {
            if (img.src && !img.src.includes('profile_pic') && 
                img.width > 100 && img.height > 100) {
              // Use srcset if available for higher quality
              if (img.srcset) {
                const bestSrc = getBestImageSrc(img.srcset);
                if (bestSrc) {
                  imageUrls.push(bestSrc);
                } else {
                  imageUrls.push(img.src);
                }
              } else {
                imageUrls.push(img.src);
              }
            }
          });
          
          // Extract hashtags
          const hashtags = [];
          if (content) {
            const hashtagMatches = content.match(/#[a-zA-Z0-9_]+/g);
            if (hashtagMatches) {
              hashtagMatches.forEach(tag => {
                hashtags.push(tag.substring(1)); // Remove the # symbol
              });
            }
          }
          
          // Extract engagement metrics if available
          let likes = 0;
          let comments = 0;
          
          // Look for like count
          const likeSelectors = [
            'section span', 'section div a span', 'span._aacl', 
            'div._aacl._aaco._aacw._aad0._aad6', 'a[href*="liked_by"]',
            // New patterns
            'div.x78zum5 span', 'div[role="button"] + a',
            'div[role="button"]:has(svg) + div span',
            'div.x1qjc9v5' // Like section container
          ];
          
          for (const selector of likeSelectors) {
            const likeEl = el.querySelector(selector) || document.querySelector(selector);
            if (likeEl && likeEl.innerText) {
              const likeText = likeEl.innerText.trim();
              if (likeText.match(/\d+/)) {
                const match = likeText.match(/(\d+[,.]?\d*[KkMm]?)/);
                if (match && match[1]) {
                  likes = parseSocialCount(match[1]);
                  break;
                }
              }
            }
          }
          
          // Create post object
          const post = {
            content: content || "",
            platform: 'instagram',
            original_user: username,
            verified: false, // Instagram verification is hard to detect reliably
            is_friend: false, // No reliable way to determine friendship on Instagram
            is_family: false,
            likes: likes,
            comments: comments,
            shares: 0, // Instagram doesn't have shares
            image_urls: imageUrls.join(','),
            collected_at: new Date().toISOString(),
            is_sponsored: content.toLowerCase().includes('paid partnership') || 
                         el.innerText.toLowerCase().includes('sponsored'),
            is_job_post: content.toLowerCase().includes('hiring') || 
                         content.toLowerCase().includes('job opening'),
            content_length: content ? content.length : 0,
            hashtags: hashtags.join(',')
          };
          
          posts.push(post);
          postCount++;
          console.log(`Added Instagram post from ${username}${content ? ': "' + content.substring(0, 30) + '..."' : ''}`);
        } catch (error) {
          console.error(`Error processing Instagram post ${index}:`, error);
        }
      });
      
      console.log(`Collected ${postCount} Instagram posts from ${pageType} page`);
      
      // Send posts through the background script instead of making direct API calls
      // This bypasses Content Security Policy restrictions
      if (posts.length > 0) {
        // Use our standardized sendPostsToAPI function with improved logging and error handling
        sendPostsToAPI(posts, 'instagram')
          .then(response => {
            console.log(`Successfully sent ${posts.length} Instagram posts:`, response);
            resolve(posts);
          })
          .catch(error => {
            console.error("Error sending Instagram posts:", error);
            // Still resolve with posts since we collected them successfully
            resolve(posts);
          });
      } else {
        console.log("No posts collected from Instagram");
        resolve([]);
      }
    } catch (error) {
      console.error("Error in collectInstagramPostElements:", error);
      reject(error);
    }
  });
}

/**
 * Helper function to get the best image source from srcset
 * @param {string} srcset - The srcset attribute value
 * @returns {string} - The best image source URL
 */
function getBestImageSrc(srcset) {
  if (!srcset) return null;
  
  try {
    // Parse the srcset into an array of {url, width} objects
    const sources = srcset.split(',').map(src => {
      const [url, width] = src.trim().split(' ');
      return {
        url: url,
        width: width ? parseInt(width.replace('w', '')) : 0
      };
    });
    
    // Sort by width descending and take the highest resolution
    sources.sort((a, b) => b.width - a.width);
    return sources.length > 0 ? sources[0].url : null;
  } catch (error) {
    console.error("Error parsing srcset:", error);
    return null;
  }
}

// Detect Instagram page type
function detectInstagramPageType() {
  const url = window.location.href;
  if (url.includes('/explore/')) {
    return 'explore';
  } else if (url.includes('/stories/')) {
    return 'stories';
  } else if (url.match(/\/p\/[^\/]+\/?$/)) {
    return 'single-post';
  } else if (url.includes('/reels/')) {
    return 'reels';
  }
  return 'feed';
}

// Helper function to parse social media counts (e.g., "1.2K likes")
function parseSocialCount(text) {
  if (!text) return 0;
  
  // Remove non-numeric parts
  const numericPart = text.replace(/[^0-9.KkMm]/g, '');
  
  if (!numericPart) return 0;
  
  // Parse K/M suffixes
  if (numericPart.includes('K') || numericPart.includes('k')) {
    return Math.round(parseFloat(numericPart) * 1000);
  } else if (numericPart.includes('M') || numericPart.includes('m')) {
    return Math.round(parseFloat(numericPart) * 1000000);
    } else {
    return parseInt(numericPart, 10) || 0;
  }
}

/**
 * Collects Facebook posts from the current page
 * @returns {Promise<Array>} - Promise resolving to array of posts
 */
async function collectFacebookPosts() {
  try {
    console.log('[Authentic] Starting Facebook post collection');
    
    // Use the standardized infinite scroll for Facebook
    const postsFound = await simulateInfiniteScroll({
      maxScrollTime: 20000,  // 20 seconds max for Facebook
      postSelector: '[role="article"]',
      noNewPostsThreshold: 3
    });
    
    console.log(`[Authentic] Found ${postsFound} posts after scrolling, starting extraction`);
    
    const posts = [];
    const processedIds = new Set();
    
    // Use the adaptive selector system for resilience
    const postElements = findElements('facebook', 'posts');
    
    console.log(`[Authentic] Processing ${postElements.length} Facebook posts`);
    
    for (const postElement of postElements) {
      try {
        // Generate a stable ID for the post to prevent duplicates
        const contentHash = generateContentHash(postElement.textContent);
        
        if (processedIds.has(contentHash)) {
          continue; // Skip duplicate posts
        }
        processedIds.add(contentHash);
        
        // Extract post content
        const contentElements = postElement.querySelectorAll('[data-ad-comet-preview="message"], [data-ad-preview="message"], [dir="auto"]');
        let content = '';
        
        for (const el of contentElements) {
          // Skip elements that are too small or likely to be UI elements
          if (el.textContent.length < 5) continue;
          if (el.textContent.includes('Like') && el.textContent.includes('Comment') && el.textContent.length < 30) continue;
          
          content += el.textContent + ' ';
        }
        
        content = content.trim();
        
        // Skip posts with no meaningful content
        if (content.length < 5) continue;
        
        // Extract image URLs if present
        const imageElements = postElement.querySelectorAll('img[src*="scontent"]');
        const imageUrls = Array.from(imageElements).map(img => img.src).filter(Boolean);
        
        // Detect if the post is an ad/sponsored content
        const isSponsored = detectSponsoredPost(postElement, 'facebook');
        
        // Create the post object
        posts.push({
          platform: 'facebook',
          content: content,
          timestamp: new Date().toISOString(),
          images: imageUrls,
          isSponsored: isSponsored,
          url: window.location.href,
          metadata: {
            contentHash,
            hasReactions: postElement.querySelector('[aria-label*="reaction"]') !== null,
            hasComments: postElement.querySelector('[aria-label*="comment"]') !== null
          }
        });
        
      } catch (error) {
        console.error('[Authentic] Error processing Facebook post:', error);
      }
    }
    
    console.log(`[Authentic] Successfully collected ${posts.length} Facebook posts`);
    
    // Use standardized function to send posts to API
    if (posts.length > 0) {
      return sendPostsToAPI(posts, 'facebook')
        .then(response => {
          console.log(`Successfully sent ${posts.length} Facebook posts:`, response);
          return posts;
        })
        .catch(error => {
          console.error("Error sending Facebook posts:", error);
          // Still return posts even if sending failed
          return posts;
        });
    }
    
    return posts;
  } catch (error) {
    console.error('[Authentic] Error collecting Facebook posts:', error);
    return [];
  }
}

/**
 * Collects LinkedIn posts from the current page
 * @returns {Promise<Array>} - Promise resolving to array of posts
 */
async function collectLinkedInPosts() {
  try {
    console.log('[Authentic] Starting LinkedIn post collection');
    
    // Use the standardized infinite scroll for LinkedIn
    const postsFound = await simulateInfiniteScroll({
      maxScrollTime: 25000,  // 25 seconds max for LinkedIn
      postSelector: '.feed-shared-update-v2, .occludable-update, .update-components-actor',
      noNewPostsThreshold: 3,
      pauseInterval: 4000,  // LinkedIn needs more time to load content
      pauseDuration: 2000
    });
    
    console.log(`[Authentic] Found ${postsFound} posts after scrolling, starting extraction`);
    
    const posts = [];
    const processedIds = new Set();
    
    // Enhanced LinkedIn selectors
    const postSelectors = [
      '.feed-shared-update-v2',
      '.occludable-update',
      '.update-components-actor',
      '.scaffold-finite-scroll__content > div > div',
      '.feed-shared-card',
      '.feed-shared-update'
    ];
    
    let postElements = [];
    
    // Try each selector until we find posts
    for (const selector of postSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements && elements.length > 0) {
        console.log(`[Authentic] Found ${elements.length} LinkedIn posts with selector: ${selector}`);
        postElements = Array.from(elements);
        break;
      }
    }
    
    // If no posts found with standard selectors, try fallback approach
    if (postElements.length === 0) {
      console.warn("[Authentic] No LinkedIn posts found with standard selectors, trying alternative approach");
      
      // Look for content elements that are likely posts
      const contentElements = document.querySelectorAll('.feed-shared-text, .update-components-text');
      
      contentElements.forEach(el => {
        // Find potential post container parent
        let postContainer = el;
        for (let i = 0; i < 5; i++) { // Check up to 5 levels up
          postContainer = postContainer.parentElement;
          if (!postContainer) break;
          
          // If this container has characteristics of a post
          const rect = postContainer.getBoundingClientRect();
          if (rect.width > 300 && rect.height > 150) {
            postElements.push(postContainer);
            break;
          }
        }
      });
      
      console.log(`[Authentic] Found ${postElements.length} LinkedIn posts using fallback detection`);
    }
    
    console.log(`[Authentic] Processing ${postElements.length} LinkedIn posts`);
    
    // Process each post element
    for (const postElement of postElements) {
      try {
        // Generate a stable ID for the post to prevent duplicates
        const contentHash = generateContentHash(postElement.textContent);
        
        if (processedIds.has(contentHash)) {
          continue; // Skip duplicate posts
        }
        processedIds.add(contentHash);
        
        // Extract post content - using multiple possible content selectors
        const contentSelectors = [
          '.feed-shared-update-v2__description',
          '.feed-shared-text',
          '.break-words',
          '.update-components-text',
          '.feed-shared-update__description',
          '.feed-shared-text__text-view'
        ];
        
        let content = '';
        
        // Try each content selector
        for (const selector of contentSelectors) {
          const contentElements = postElement.querySelectorAll(selector);
          if (contentElements && contentElements.length > 0) {
            for (const el of contentElements) {
              // Skip elements that are too small or likely to be UI elements
              if (el.textContent.length < 5) continue;
              
              content += el.textContent.trim() + ' ';
            }
            if (content.length > 0) break;
          }
        }
        
        // If no content found with selectors, try getting inner text directly
        if (!content || content.length < 5) {
          // Find text nodes that might contain post content
          const textElements = Array.from(postElement.querySelectorAll('p, span'))
            .filter(el => el.textContent.length > 10 && !el.querySelector('button, a[role="button"]'));
          
          for (const el of textElements) {
            content += el.textContent.trim() + ' ';
          }
        }
        
        content = content.trim();
        
        // Skip posts with no meaningful content
        if (content.length < 5) {
          console.log('[Authentic] Skipping LinkedIn post with insufficient content');
          continue;
        }
        
        // Extract author/username
        let author = 'unknown';
        const authorSelectors = [
          '.feed-shared-actor__name',
          '.update-components-actor__name',
          '.feed-shared-actor__title',
          '.update-components-actor__meta a[data-control-name="actor"]',
          'a[data-control-name="actor_container"] span'
        ];
        
        for (const selector of authorSelectors) {
          const authorEl = postElement.querySelector(selector);
          if (authorEl && authorEl.textContent.trim().length > 0) {
            author = authorEl.textContent.trim();
            break;
          }
        }
        
        // Extract hashtags from content
        const hashtags = [];
        const hashtagMatches = content.match(/#[a-zA-Z0-9_]+/g);
        if (hashtagMatches) {
          hashtagMatches.forEach(tag => {
            hashtags.push(tag.substring(1)); // Remove the # symbol
          });
        }
        
        // Extract image URLs if present
        const imageSelectors = [
          'img[src*="media.licdn.com"]',
          '.feed-shared-image__container img',
          '.feed-shared-article__preview-image',
          '.update-components-image img',
          '.feed-shared-carousel__slide img',
          '.ivm-image-view-model img'
        ];
        
        const imageUrls = [];
        
        for (const selector of imageSelectors) {
          const imageElements = postElement.querySelectorAll(selector);
          if (imageElements && imageElements.length > 0) {
            Array.from(imageElements).forEach(img => {
              if (img.src && !img.src.includes('ghost-person') && !img.src.includes('profile-pic') && img.width > 50) {
                imageUrls.push(img.src);
              }
            });
          }
        }
        
        // Extract engagement metrics if possible
        let likes = 0;
        let comments = 0;
        let shares = 0;
        
        // Extract likes
        const likeSelectors = [
          '.social-details-social-counts__reactions-count',
          '.social-details-social-counts__count-value',
          '.feed-shared-social-action-bar__action-button[aria-label*="like"] span',
          '.update-components-social-activity-count span'
        ];
        
        for (const selector of likeSelectors) {
          const likeEl = postElement.querySelector(selector);
          if (likeEl && likeEl.textContent) {
            const likeText = likeEl.textContent.trim();
            if (likeText.match(/\d+/)) {
              likes = parseSocialCount(likeText);
              break;
            }
          }
        }
        
        // Extract comments
        const commentSelectors = [
          '.social-details-social-counts__comments-count',
          '.feed-shared-social-action-bar__action-button[aria-label*="comment"] span',
          '.update-components-social-activity-count--has-comments'
        ];
        
        for (const selector of commentSelectors) {
          const commentEl = postElement.querySelector(selector);
          if (commentEl && commentEl.textContent) {
            const commentText = commentEl.textContent.trim();
            if (commentText.match(/\d+/)) {
              comments = parseSocialCount(commentText);
              break;
            }
          }
        }
        
        // Detect if the post is an ad/sponsored content
        const isSponsored = detectSponsoredPost(postElement, 'linkedin');
        
        // Detect if it's a job post
        const isJobPost = content.toLowerCase().includes('hiring') || 
                         content.toLowerCase().includes('job opening') ||
                         content.toLowerCase().includes('apply now') ||
                         content.toLowerCase().includes('we are looking for') ||
                         postElement.querySelector('.job-card') !== null;
                         
        // Get post URL if possible
        let postUrl = window.location.href;
        const contentLinks = postElement.querySelectorAll('a[data-control-name="detail_page_url"]');
        if (contentLinks && contentLinks.length > 0 && contentLinks[0].href) {
          postUrl = contentLinks[0].href;
        }
        
        // Create the post object
        const post = {
          platform: 'linkedin',
          content: content,
          original_user: author,
          timestamp: new Date().toISOString(),
          collected_at: new Date().toISOString(),
          image_urls: imageUrls.join(','),
          url: postUrl,
          likes: likes,
          comments: comments,
          shares: shares,
          is_sponsored: isSponsored,
          is_job_post: isJobPost,
          verified: false, // LinkedIn doesn't have verified badges like other platforms
          is_friend: false,
          is_family: false,
          content_length: content.length,
          hashtags: hashtags.join(','),
          metadata: {
            contentHash,
            hasComments: comments > 0 || postElement.querySelector('.feed-shared-comments-list') !== null,
            hasReactions: likes > 0
          }
        };
        
        console.log(`[Authentic] Added LinkedIn post from ${author}${content ? ': "' + content.substring(0, 30) + '..."' : ''}`);
        posts.push(post);
        
      } catch (error) {
        console.error('[Authentic] Error processing LinkedIn post:', error);
      }
    }
    
    console.log(`[Authentic] Successfully collected ${posts.length} LinkedIn posts`);
    
    // Use standardized function to send posts to API
    if (posts.length > 0) {
      return sendPostsToAPI(posts, 'linkedin')
        .then(response => {
          console.log(`Successfully sent ${posts.length} LinkedIn posts:`, response);
          // Show in-page notification of success
          showInPageNotification(
            `LinkedIn Data Collected`,
            `Successfully collected ${posts.length} posts from LinkedIn.`
          );
          return posts;
        })
        .catch(error => {
          console.error("Error sending LinkedIn posts:", error);
          // Show error notification
          showInPageNotification(
            `Error Collecting LinkedIn Data`,
            `Failed to send ${posts.length} posts: ${error}`,
            'error'
          );
          // Still return posts even if sending failed
          return posts;
        });
    }
    
    return posts;
  } catch (error) {
    console.error('[Authentic] Error collecting LinkedIn posts:', error);
    return [];
  }
}

/**
 * Utility function to detect sponsored/ad posts
 * @param {Element} postElement - DOM element of the post
 * @param {string} platform - Social media platform (facebook, instagram, linkedin)
 * @returns {boolean} - Whether the post is likely sponsored content
 */
function detectSponsoredPost(postElement, platform) {
  try {
    switch (platform) {
      case 'facebook':
        // Check for sponsored text
        const fbSponsoredTexts = ['Sponsored', 'Suggested for you', 'Recommended', 'Suggested Page'];
        const fbText = postElement.textContent;
        return fbSponsoredTexts.some(text => fbText.includes(text)) || 
               !!postElement.querySelector('a[href*="ads"]') ||
               !!postElement.querySelector('[aria-label*="sponsor"]');
      
      case 'instagram':
        // Check for sponsored text
        const igSponsoredTexts = ['Sponsored', 'Paid partnership'];
        const igText = postElement.textContent;
        return igSponsoredTexts.some(text => igText.includes(text)) ||
               !!postElement.querySelector('a[href*="ads"]');
      
      case 'linkedin':
        // Check for sponsored text or elements
        const liSponsoredTexts = ['Promoted', 'Sponsored', 'Ad'];
        const liText = postElement.textContent;
        return liSponsoredTexts.some(text => liText.includes(text)) ||
               !!postElement.querySelector('.feed-shared-actor__sub-description') &&
               postElement.querySelector('.feed-shared-actor__sub-description').textContent.includes('Promoted');
      
      default:
        return false;
    }
  } catch (error) {
    console.error(`[Authentic] Error detecting sponsored content for ${platform}:`, error);
    return false;
  }
}

/**
 * Generate a content hash to uniquely identify posts
 * @param {string} content - Post content to hash
 * @returns {string} - Hash of the content
 */
function generateContentHash(content) {
  // Simple hash function for content fingerprinting
  let hash = 0;
  if (!content || content.length === 0) return hash.toString();
  
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  return hash.toString();
}

/**
 * Set up Instagram MutationObserver to detect new posts being loaded
 * This helps capture posts as they are dynamically loaded into the feed
 */
function setupInstagramMutationObserver() {
  // Only run on Instagram
  if (!window.location.href.includes('instagram.com')) {
    return;
  }
  
  console.log('[Authentic] Setting up MutationObserver for Instagram post loading');
  
  // Keep track of the last time we processed posts to avoid processing too frequently
  let lastProcessTime = 0;
  const THROTTLE_TIME = 2000; // Only process at most once every 2 seconds
  
  // Track processed posts to avoid duplicates
  const processedPostIds = new Set();
  
  // Define a function to handle changes
  const handleMutations = (mutations) => {
    // Check if we need to throttle
    const now = Date.now();
    if (now - lastProcessTime < THROTTLE_TIME) {
      return;
    }
    
    // Check if any mutations added new posts
    let newPostsFound = false;
    const postSelectors = SELECTORS.instagram.posts;
    
    for (const mutation of mutations) {
      // Check if nodes were added
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        // Check each added node
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // First, check if the node itself is a post
            const isPost = postSelectors.some(selector => node.matches && node.matches(selector));
            
            // Then check if it contains posts
            const hasPosts = postSelectors.some(selector => 
              node.querySelectorAll && node.querySelectorAll(selector).length > 0
            );
            
            if (isPost || hasPosts) {
              newPostsFound = true;
              break;
            }
          }
        }
        
        if (newPostsFound) {
          break;
        }
      }
    }
    
    if (newPostsFound) {
      console.log('[Authentic] MutationObserver detected new Instagram posts');
      lastProcessTime = now;
      
      // Only collect newly detected posts
      collectNewInstagramPosts(processedPostIds);
    }
  };
  
  // Create and configure the observer
  const observer = new MutationObserver(handleMutations);
  
  // Start observing the document with the configured parameters
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: false
  });
  
  console.log('[Authentic] Instagram MutationObserver started');
  
  return observer;
}

/**
 * Collect newly loaded Instagram posts and avoid processing duplicates
 * @param {Set} processedIds - Set of already processed post IDs
 */
function collectNewInstagramPosts(processedIds) {
  // Find all Instagram posts currently in the DOM
  const postElements = [];
  
  for (const selector of SELECTORS.instagram.posts) {
    const elements = document.querySelectorAll(selector);
    if (elements && elements.length > 0) {
      console.log(`[Authentic] Found ${elements.length} Instagram posts with ${selector}`);
      elements.forEach(el => {
        // Generate a simple hash to identify this post element
        const rect = el.getBoundingClientRect();
        const positionData = `${rect.top.toFixed(0)}_${rect.left.toFixed(0)}_${rect.width.toFixed(0)}_${rect.height.toFixed(0)}`;
        const contentHash = el.innerText ? generateContentHash(el.innerText.substring(0, 100)) : '';
        const postId = `${positionData}_${contentHash}`;
        
        // Only process posts we haven't seen before
        if (!processedIds.has(postId)) {
          processedIds.add(postId);
          postElements.push(el);
        }
      });
      break;
    }
  }
  
  if (postElements.length === 0) {
    console.log('[Authentic] No new Instagram posts found to process');
    return;
  }
  
  console.log(`[Authentic] Processing ${postElements.length} new Instagram posts`);
  
  // Process these elements into post data
  const pageType = detectInstagramPageType();
  
  try {
    // Extract data from the post elements
    const posts = [];
    
    // Process each post element
    postElements.forEach((el, index) => {
      try {
        // Extract content/caption (reusing the existing extraction logic)
        let content = "";
        
        // Try various selectors for content
        const contentSelectors = [
          'div._a9zs', 'div._a9zr', 'span._aacl', 'div._a9zr div',
          'span[class*="x193iq5w"]', 'div[dir="auto"] span', 
          'div.x1lliihq', 'h1 + div',
          'div[role="button"] + div span', // New pattern
          'span[dir="auto"]', // For alt text/captions
          'div[style*="padding-bottom"] + div', // For some layouts
          'a[role="link"] + div' // Feed captions
        ];
        
        for (const selector of contentSelectors) {
          const contentEl = el.querySelector(selector) || document.querySelector(selector);
          if (contentEl && contentEl.innerText) {
            content = contentEl.innerText.trim();
            if (content.length > 0) break;
          }
        }
        
        // Extract username (reusing the existing extraction logic)
        let username = "unknown";
        const usernameSelectors = [
          'a.notranslate', 'a.x1i10hfl', 'div._aaqt', 'h2',
          'span.x1lliihq', 'a[role="link"]', 'header a',
          'a[tabindex="0"]', 
          'div[style*="flex-direction: row"] a',
          'h2 + div a',
          'a[href*="/"]'
        ];
        
        for (const selector of usernameSelectors) {
          const usernameEl = el.querySelector(selector) || document.querySelector(selector);
          if (usernameEl && usernameEl.innerText) {
            const potentialUser = usernameEl.innerText.trim();
            if (potentialUser.length > 0 && 
                potentialUser.length < 40 && 
                !potentialUser.includes("\n") && 
                usernameEl.href && 
                usernameEl.href.includes("/")) {
              username = potentialUser;
              break;
            }
          }
        }
        
        // Other extraction logic (reusing existing)
        // Extract image URLs, likes, etc...
        const imageUrls = [];
        const imgElements = el.querySelectorAll('img') || document.querySelectorAll('img');
        imgElements.forEach(img => {
          if (img.src && !img.src.includes('profile_pic') && 
              img.width > 100 && img.height > 100) {
            if (img.srcset) {
              const bestSrc = getBestImageSrc(img.srcset);
              if (bestSrc) {
                imageUrls.push(bestSrc);
              } else {
                imageUrls.push(img.src);
              }
            } else {
              imageUrls.push(img.src);
            }
          }
        });
        
        // Extract hashtags
        const hashtags = [];
        if (content) {
          const hashtagMatches = content.match(/#[a-zA-Z0-9_]+/g);
          if (hashtagMatches) {
            hashtagMatches.forEach(tag => {
              hashtags.push(tag.substring(1)); // Remove the # symbol
            });
          }
        }
        
        // Skip if content is too short and not on a single post page
        if ((!content || content.length < 3) && pageType !== 'post') {
          return;
        }
        
        // Create post object
        const post = {
          content: content || "",
          platform: 'instagram',
          original_user: username,
          verified: false,
          is_friend: false,
          is_family: false,
          likes: 0,
          comments: 0,
          shares: 0,
          image_urls: imageUrls.join(','),
          collected_at: new Date().toISOString(),
          is_sponsored: content.toLowerCase().includes('paid partnership') || 
                       el.innerText.toLowerCase().includes('sponsored'),
          is_job_post: content.toLowerCase().includes('hiring') || 
                       content.toLowerCase().includes('job opening'),
          content_length: content ? content.length : 0,
          hashtags: hashtags.join(',')
        };
        
        posts.push(post);
        console.log(`[Authentic] Added Instagram post from ${username}${content ? ': "' + content.substring(0, 30) + '..."' : ''}`);
      } catch (error) {
        console.error(`[Authentic] Error processing Instagram post ${index}:`, error);
      }
    });
    
    console.log(`[Authentic] Collected ${posts.length} Instagram posts using MutationObserver`);
    
    // Send posts through the background script
    if (posts.length > 0) {
      sendPostsToAPI(posts, 'instagram')
        .then(response => {
          console.log(`[Authentic] Successfully sent ${posts.length} Instagram posts:`, response);
        })
        .catch(error => {
          console.error("[Authentic] Error sending Instagram posts:", error);
        });
    }
  } catch (error) {
    console.error("[Authentic] Error in collectNewInstagramPosts:", error);
  }
}

// Initialize the MutationObserver when on Instagram
if (window.location.href.includes('instagram.com')) {
  setTimeout(() => {
    setupInstagramMutationObserver();
  }, 2000); // Wait for page to load before setting up observer
}

// Set up Chrome message listener if not already done elsewhere
if (typeof messageListenerInitialized === 'undefined') {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[Authentic] Content script received message:', request.action);
    
    if (request.action === 'collectPosts') {
      const platform = request.platform || detectCurrentPlatform();
      console.log(`[Authentic] Starting post collection for ${platform}`);
      
      // Call the appropriate collection function based on platform
      let collectionPromise;
      
      switch (platform) {
        case 'instagram':
          collectionPromise = collectInstagramPosts();
          break;
        case 'facebook':
          collectionPromise = collectFacebookPosts();
          break;
        case 'linkedin':
          collectionPromise = collectLinkedInPosts();
          break;
        default:
          sendResponse({ success: false, error: 'Unsupported platform' });
          return true;
      }
      
      // Process and return the result
      collectionPromise
        .then(posts => {
          console.log(`[Authentic] Successfully collected ${posts.length} posts from ${platform}`);
          sendResponse({ success: true, postsCount: posts.length, platform });
        })
        .catch(error => {
          console.error(`[Authentic] Error collecting ${platform} posts:`, error);
          sendResponse({ success: false, error: error.toString() });
        });
      
      return true; // Keep the message channel open for the async response
    }
    
    return false; // Let other handlers process the message
  });
  
  // Mark that we've initialized the listener to avoid duplicates
  window.messageListenerInitialized = true;
}

/**
 * Toggle between different display modes for social media feeds
 * Applies filters based on user preferences and provides visual feedback
 * 
 * @param {string} mode - The display mode to enable ('friends-only', 'interest-only', 'minimal-feed', 'default')
 * @param {Object} options - Additional options for the display mode
 * @returns {Promise} - Promise that resolves with the result of the operation
 */
function displayModeToggle(mode, options = {}) {
  console.log(`Toggling display mode to: ${mode}`);
  
  // Check if we have a valid platform
  const platform = detectCurrentPlatform();
  if (!platform) {
    return Promise.reject("Could not detect current platform");
  }
  
  const toggleId = generateRequestId();
  console.log(`[Toggle:${toggleId}] Applying ${mode} mode on ${platform}`);
  
  // Store the current mode in session storage
  try {
    sessionStorage.setItem('current_display_mode', mode);
  } catch (e) {
    // Session storage might not be available
  }
  
  return new Promise((resolve, reject) => {
    // First, get the user preferences from the background script
    chrome.runtime.sendMessage({ action: 'getUserPreferences' }, (response) => {
      if (chrome.runtime.lastError) {
        const error = chrome.runtime.lastError.message;
        console.error(`[Toggle:${toggleId}] Error getting preferences: ${error}`);
        showInPageNotification('Error', `Failed to apply display mode: ${error}`, 'error');
        reject(error);
        return;
      }
      
      if (!response || !response.success) {
        const error = response?.error || 'Failed to get user preferences';
        console.error(`[Toggle:${toggleId}] ${error}`);
        showInPageNotification('Error', `Failed to apply display mode: ${error}`, 'error');
        reject(error);
        return;
      }
      
      const preferences = response.data || {};
      console.log(`[Toggle:${toggleId}] Retrieved user preferences`, preferences);
      
      // Create a filter function based on the selected mode
      let filterFn = null;
      let modeTitle = '';
      let modeDescription = '';
      
      switch (mode) {
        case 'friends-only':
          modeTitle = 'Friends Only Mode';
          modeDescription = 'Showing only posts from friends';
          filterFn = (post) => post.is_friend === true;
          break;
          
        case 'interest-only':
          const interests = preferences.interest_filter ? 
                           preferences.interest_filter.split(',').map(i => i.trim().toLowerCase()) : 
                           [];
          const hashtags = preferences.favorite_hashtags ? 
                          preferences.favorite_hashtags.split(',').map(h => h.trim().toLowerCase()) : 
                          [];
                          
          modeTitle = 'Interests Only Mode';
          modeDescription = `Showing posts matching your interests: ${interests.join(', ')}`;
          
          if (interests.length === 0 && hashtags.length === 0) {
            showInPageNotification('Warning', 'No interests configured. Please update your preferences.', 'warning');
            reject('No interests configured');
            return;
          }
          
          filterFn = (post) => {
            // Check if the post content matches any interest
            const content = post.content?.toLowerCase() || '';
            const postHashtags = post.hashtags?.toLowerCase() || '';
            
            // Check for matching interests in content
            for (const interest of interests) {
              if (content.includes(interest)) {
                return true;
              }
            }
            
            // Check for matching hashtags in content
            for (const hashtag of hashtags) {
              if (postHashtags.includes(hashtag)) {
                return true;
              }
            }
            
            return false;
          };
          break;
          
        case 'minimal-feed':
          modeTitle = 'Minimal Feed Mode';
          modeDescription = 'Showing only the most relevant posts';
          filterFn = (post) => {
            // This is a placeholder filter for Minimal Feed mode
            // You can implement your own logic here
            return true;
          };
          break;
          
        default:
          modeTitle = 'Default Mode';
          modeDescription = 'Showing all posts';
          filterFn = (post) => true;
          break;
      }
      
      // Create a filter function based on the selected mode
      let filterFn = null;
      let modeTitle = '';
      let modeDescription = '';
      
      switch (mode) {
        case 'friends-only':
          modeTitle = 'Friends Only Mode';
          modeDescription = 'Showing only posts from friends';
          filterFn = (post) => post.is_friend === true;
          break;
          
        case 'interest-only':
          const interests = preferences.interest_filter ? 
                           preferences.interest_filter.split(',').map(i => i.trim().toLowerCase()) : 
                           [];
          const hashtags = preferences.favorite_hashtags ? 
                          preferences.favorite_hashtags.split(',').map(h => h.trim().toLowerCase()) : 
                          [];
                          
          modeTitle = 'Interests Only Mode';
          modeDescription = `Showing posts matching your interests: ${interests.join(', ')}`;
          
          if (interests.length === 0 && hashtags.length === 0) {
            showInPageNotification('Warning', 'No interests configured. Please update your preferences.', 'warning');
            reject('No interests configured');
            return;
          }
          
          filterFn = (post) => {
            // Check if the post content matches any interest
            const content = post.content?.toLowerCase() || '';
            const postHashtags = post.hashtags?.toLowerCase() || '';
            
            // Check for matching interests in content
            for (const interest of interests) {
              if (content.includes(interest)) {
                return true;
              }
            }
            
            // Check for matching hashtags in content
            for (const hashtag of hashtags) {
              if (postHashtags.includes(hashtag)) {
                return true;
              }
            }
            
            return false;
          };
          break;
          
        case 'minimal-feed':
          modeTitle = 'Minimal Feed Mode';
          modeDescription = 'Showing only the most relevant posts';
          filterFn = (post) => {
            // This is a placeholder filter for Minimal Feed mode
            // You can implement your own logic here
            return true;
          };
          break;
          
        default:
          modeTitle = 'Default Mode';
          modeDescription = 'Showing all posts';
          filterFn = (post) => true;
          break;
      }
      
      // Create a filter function based on the selected mode
      let filterFn = null;
      let modeTitle = '';
      let modeDescription = '';
      
      switch (mode) {
        case 'friends-only':
          modeTitle = 'Friends Only Mode';
          modeDescription = 'Showing only posts from friends';
          filterFn = (post) => post.is_friend === true;
          break;
          
        case 'interest-only':
          const interests = preferences.interest_filter ? 
                           preferences.interest_filter.split(',').map(i => i.trim().toLowerCase()) : 
                           [];
          const hashtags = preferences.favorite_hashtags ? 
                          preferences.favorite_hashtags.split(',').map(h => h.trim().toLowerCase()) : 
                          [];
                          
          modeTitle = 'Interests Only Mode';
          modeDescription = `Showing posts matching your interests: ${interests.join(', ')}`;
          
          if (interests.length === 0 && hashtags.length === 0) {
            showInPageNotification('Warning', 'No interests configured. Please update your preferences.', 'warning');
            reject('No interests configured');
            return;
          }
          
          filterFn = (post) => {
            // Check if the post content matches any interest
            const content = post.content?.toLowerCase() || '';
            const postHashtags = post.hashtags?.toLowerCase() || '';
            
            // Check for matching interests in content
            for (const interest of interests) {
              if (content.includes(interest)) {
                return true;
              }
            }
            
            // Check for matching hashtags in content
            for (const hashtag of hashtags) {
              if (postHashtags.includes(hashtag)) {
                return true;
              }
            }
            
            return false;
          };
          break;
          
        case 'minimal-feed':
          modeTitle = 'Minimal Feed Mode';
          modeDescription = 'Showing only the most relevant posts';
          filterFn = (post) => {
            // This is a placeholder filter for Minimal Feed mode
            // You can implement your own logic here
            return true;
          };
          break;
          
        default:
          modeTitle = 'Default Mode';
          modeDescription = 'Showing all posts';
          filterFn = (post) => true;
          break;
      }
      
      // Create a filter function based on the selected mode
      let filterFn = null;
      let modeTitle = '';
      let modeDescription = '';
      
      switch (mode) {
        case 'friends-only':
          modeTitle = 'Friends Only Mode';
          modeDescription = 'Showing only posts from friends';
          filterFn = (post) => post.is_friend === true;
          break;
          
        case 'interest-only':
          const interests = preferences.interest_filter ? 
                           preferences.interest_filter.split(',').map(i => i.trim().toLowerCase()) : 
                           [];
          const hashtags = preferences.favorite_hashtags ? 
                          preferences.favorite_hashtags.split(',').map(h => h.trim().toLowerCase()) : 
                          [];
                          
          modeTitle = 'Interests Only Mode';
          modeDescription = `Showing posts matching your interests: ${interests.join(', ')}`;
          
          if (interests.length === 0 && hashtags.length === 0) {
            showInPageNotification('Warning', 'No interests configured. Please update your preferences.', 'warning');
            reject('No interests configured');
            return;
          }
          
          filterFn = (post) => {
            // Check if the post content matches any interest
            const content = post.content?.toLowerCase() || '';
            const postHashtags = post.hashtags?.toLowerCase() || '';
            
            // Check for matching interests in content
            for (const interest of interests) {
              if (content.includes(interest)) {
                return true;
              }
            }
            
            // Check for matching hashtags in content
            for (const hashtag of hashtags) {
              if (postHashtags.includes(hashtag)) {
                return true;
              }
            }
            
            return false;
          };
          break;
          
        case 'minimal-feed':
          modeTitle = 'Minimal Feed Mode';
          modeDescription = 'Showing only the most relevant posts';
          filterFn = (post) => {
            // This is a placeholder filter for Minimal Feed mode
            // You can implement your own logic here
            return true;
          };
          break;
          
        default:
          modeTitle = 'Default Mode';
          modeDescription = 'Showing all posts';
          filterFn = (post) => true;
          break;
      }
      
      // Create a filter function based on the selected mode
      let filterFn = null;
      let modeTitle = '';
      let modeDescription = '';
      
      switch (mode) {
        case 'friends-only':
          modeTitle = 'Friends Only Mode';
          modeDescription = 'Showing only posts from friends';
          filterFn = (post) => post.is_friend === true;
          break;
          
        case 'interest-only':
          const interests = preferences.interest_filter ? 
                           preferences.interest_filter.split(',').map(i => i.trim().toLowerCase()) : 
                           [];
          const hashtags = preferences.favorite_hashtags ? 
                          preferences.favorite_hashtags.split(',').map(h => h.trim().toLowerCase()) : 
                          [];
                          
          modeTitle = 'Interests Only Mode';
          modeDescription = `Showing posts matching your interests: ${interests.join(', ')}`;
          
          if (interests.length === 0 && hashtags.length === 0) {
            showInPageNotification('Warning', 'No interests configured. Please update your preferences.', 'warning');
            reject('No interests configured');
            return;
          }
          
          filterFn = (post) => {
            // Check if the post content matches any interest
            const content = post.content?.toLowerCase() || '';
            const postHashtags = post.hashtags?.toLowerCase() || '';
            
            // Check for matching interests in content
            for (const interest of interests) {
              if (content.includes(interest)) {
                return true;
              }
            }
            
            // Check for matching hashtags in content
            for (const hashtag of hashtags) {
              if (postHashtags.includes(hashtag)) {
                return true;
              }
            }
            
            return false;
          };
          break;
          
        case 'minimal-feed':
          modeTitle = 'Minimal Feed Mode';
          modeDescription = 'Showing only the most relevant posts';
          filterFn = (post) => {
            // This is a placeholder filter for Minimal Feed mode
            // You can implement your own logic here
            return true;
          };
          break;
          
        default:
          modeTitle = 'Default Mode';
          modeDescription = 'Showing all posts';
          filterFn = (post) => true;
          break;
      }
      
      // Create a filter function based on the selected mode
      let filterFn = null;
      let modeTitle = '';
      let modeDescription = '';
      
      switch (mode) {
        case 'friends-only':
          modeTitle = 'Friends Only Mode';
          modeDescription = 'Showing only posts from friends';
          filterFn = (post) => post.is_friend === true;
          break;
          
        case 'interest-only':
          const interests = preferences.interest_filter ? 
                           preferences.interest_filter.split(',').map(i => i.trim().toLowerCase()) : 
                           [];
          const hashtags = preferences.favorite_hashtags ? 
                          preferences.favorite_hashtags.split(',').map(h => h.trim().toLowerCase()) : 
                          [];
                          
          modeTitle = 'Interests Only Mode';
          modeDescription = `Showing posts matching your interests: ${interests.join(', ')}`;
          
          if (interests.length === 0 && hashtags.length === 0) {
            showInPageNotification('Warning', 'No interests configured. Please update your preferences.', 'warning');
            reject('No interests configured');
            return;
          }
          
          filterFn = (post) => {
            // Check if the post content matches any interest
            const content = post.content?.toLowerCase() || '';
            const postHashtags = post.hashtags?.toLowerCase() || '';
            
            // Check for matching interests in content
            for (const interest of interests) {
              if (content.includes(interest)) {
                return true;
              }
            }
            
            // Check for matching hashtags in content
            for (const hashtag of hashtags) {
              if (postHashtags.includes(hashtag)) {
                return true;
              }
            }
            
            return false;
          };
          break;
          
        case 'minimal-feed':
          modeTitle = 'Minimal Feed Mode';
          modeDescription = 'Showing only the most relevant posts';
          filterFn = (post) => {
            // This is a placeholder filter for Minimal Feed mode
            // You can implement your own logic here
            return true;
          };
          break;
          
        default:
          modeTitle = 'Default Mode';
          modeDescription = 'Showing all posts';
          filterFn = (post) => true;
          break;
      }
      
      // Create a filter function based on the selected mode
      let filterFn = null;
      let modeTitle = '';
      let modeDescription = '';
      
      switch (mode) {
        case 'friends-only':
          modeTitle = 'Friends Only Mode';
          modeDescription = 'Showing only posts from friends';
          filterFn = (post) => post.is_friend === true;
          break;
          
        case 'interest-only':
          const interests = preferences.interest_filter ? 
                           preferences.interest_filter.split(',').map(i => i.trim().toLowerCase()) : 
                           [];
          const hashtags = preferences.favorite_hashtags ? 
                          preferences.favorite_hashtags.split(',').map(h => h.trim().toLowerCase()) : 
                          [];
                          
          modeTitle = 'Interests Only Mode';
          modeDescription = `Showing posts matching your interests: ${interests.join(', ')}`;
          
          if (interests.length === 0 && hashtags.length === 0) {
            showInPageNotification('Warning', 'No interests configured. Please update your preferences.', 'warning');
            reject('No interests configured');
            return;
          }
          
          filterFn = (post) => {
            // Check if the post content matches any interest
            const content = post.content?.toLowerCase() || '';
            const postHashtags = post.hashtags?.toLowerCase() || '';
            
            // Check for matching interests in content
            for (const interest of interests) {
              if (content.includes(interest)) {
                return true;
              }
            }
            
            // Check for matching hashtags in content
            for (const hashtag of hashtags) {
              if (postHashtags.includes(hashtag)) {
                return true;
              }
            }
            
            return false;
          };
          break;
          
        case 'minimal-feed':
          modeTitle = 'Minimal Feed Mode';
          modeDescription = 'Showing only the most relevant posts';
          filterFn = (post) => {
            // This is a placeholder filter for Minimal Feed mode
            // You can implement your own logic here
            return true;
          };
          break;
          
        default:
          modeTitle = 'Default Mode';
          modeDescription = 'Showing all posts';
          filterFn = (post) => true;
          break;
      }
      
      // Create a filter function based on the selected mode
      let filterFn = null;
      let modeTitle = '';
      let modeDescription = '';
      
      switch (mode) {
        case 'friends-only':
          modeTitle = 'Friends Only Mode';
          modeDescription = 'Showing only posts from friends';
          filterFn = (post) => post.is_friend === true;
          break;
          
        case 'interest-only':
          const interests = preferences.interest_filter ? 
                           preferences.interest_filter.split(',').map(i => i.trim().toLowerCase()) : 
                           [];
          const hashtags = preferences.favorite_hashtags ? 
                          preferences.favorite_hashtags.split(',').map(h => h.trim().toLowerCase()) : 
                          [];
                          
          modeTitle = 'Interests Only Mode';
          modeDescription = `Showing posts matching your interests: ${interests.join(', ')}`;
          
          if (interests.length === 0 && hashtags.length === 0) {
            showInPageNotification('Warning', 'No interests configured. Please update your preferences.', 'warning');
            reject('No interests configured');
            return;
          }
          
          filterFn = (post) => {
            // Check if the post content matches any interest
            const content = post.content?.toLowerCase() || '';
            const postHashtags = post.hashtags?.toLowerCase() || '';
            
            // Check for matching interests in content
            for (const interest of interests) {
              if (content.includes(interest)) {
                return true;
              }
            }
            
            // Check for matching hashtags in content
            for (const hashtag of hashtags) {
              if (postHashtags.includes(hashtag)) {
                return true;
              }
            }
            
            return false;
          };
          break;
          
        case 'minimal-feed':
          modeTitle = 'Minimal Feed Mode';
          modeDescription = 'Showing only the most relevant posts';
          filterFn = (post) => {
            // This is a placeholder filter for Minimal Feed mode
            // You can implement your own logic here
            return true;
          };
          break;
          
        default:
          modeTitle = 'Default Mode';
          modeDescription = 'Showing all posts';
          filterFn = (post) => true;
          break;
      }
      
      // Create a filter function based on the selected mode
      let filterFn = null;
      let modeTitle = '';
      let modeDescription = '';
      
      switch (mode) {
        case 'friends-only':
          modeTitle = 'Friends Only Mode';
          modeDescription = 'Showing only posts from friends';
          filterFn = (post) => post.is_friend === true;
          break;
          
        case 'interest-only':
          const interests = preferences.interest_filter ? 
                           preferences.interest_filter.split(',').map(i => i.trim().toLowerCase()) : 
                           [];
          const hashtags = preferences.favorite_hashtags ? 
                          preferences.favorite_hashtags.split(',').map(h => h.trim().toLowerCase()) : 
                          [];
                          
          modeTitle = 'Interests Only Mode';
          modeDescription = `Showing posts matching your interests: ${interests.join(', ')}`;
          
          if (interests.length === 0 && hashtags.length === 0) {
            showInPageNotification('Warning', 'No interests configured. Please update your preferences.', 'warning');
            reject('No interests configured');
            return;
          }
          
          filterFn = (post) => {
            // Check if the post content matches any interest
            const content = post.content?.toLowerCase() || '';
            const postHashtags = post.hashtags?.toLowerCase() || '';
            
            // Check for matching interests in content
            for (const interest of interests) {
              if (content.includes(interest)) {
                return true;
              }
            }
            
            // Check for matching hashtags in content
            for (const hashtag of hashtags) {
              if (postHashtags.includes(hashtag)) {
                return true;
              }
            }
            
            return false;
          };
          break;
          
        case 'minimal-feed':
          modeTitle = 'Minimal Feed Mode';
          modeDescription = 'Showing only the most relevant posts';
          filterFn = (post) => {
            // This is a placeholder filter for Minimal Feed mode
            // You can implement your own logic here
            return true;
          };
          break;
          
        default:
          modeTitle = 'Default Mode';
          modeDescription = 'Showing all posts';
          filterFn = (post) => true;
          break;
      }
      
      // Create a filter function based on the selected mode
      let filterFn = null;
      let modeTitle = '';
      let modeDescription = '';
      
      switch (mode) {
        case 'friends-only':
          modeTitle = 'Friends Only Mode';
          modeDescription = 'Showing only posts from friends';
          filterFn = (post) => post.is_friend === true;
          break;
          
        case 'interest-only':
          const interests = preferences.interest_filter ? 
                           preferences.interest_filter.split(',').map(i => i.trim().toLowerCase()) : 
                           [];
          const hashtags = preferences.favorite_hashtags ? 
                          preferences.favorite_hashtags.split(',').map(h => h.trim().toLowerCase()) : 
                          [];
                          
          modeTitle = 'Interests Only Mode';
          modeDescription = `Showing posts matching your interests: ${interests.join(', ')}`;
          
          if (interests.length === 0 && hashtags.length === 0) {
            showInPageNotification('Warning', 'No interests configured. Please update your preferences.', 'warning');
            reject('No interests configured');
            return;
          }
          
          filterFn = (post) => {
            // Check if the post content matches any interest
            const content = post.content?.toLowerCase() || '';
            const postHashtags = post.hashtags?.toLowerCase() || '';
            
            // Check for matching interests in content
            for (const interest of interests) {
              if (content.includes(interest)) {
                return true;
              }
            }
            
            // Check for matching hashtags in content
            for (const hashtag of hashtags) {
              if (postHashtags.includes(hashtag)) {
                return true;
              }
            }
            
            return false;
          };
          break;
          
        case 'minimal-feed':
          modeTitle = 'Minimal Feed Mode';
          modeDescription = 'Showing only the most relevant posts';
          filterFn = (post) => {
            // This is a placeholder filter for Minimal Feed mode
            // You can implement your own logic here
            return true;
          };
          break;
          
        default:
          modeTitle = 'Default Mode';
          modeDescription = 'Showing all posts';
          filterFn = (post) => true;
          break;
      }
      
      // Create a filter function based on the selected mode
      let filterFn = null;
      let modeTitle = '';
      let modeDescription = '';
      
      switch (mode) {
        case 'friends-only':
          modeTitle = 'Friends Only Mode';
          modeDescription = 'Showing only posts from friends';
          filterFn = (post) => post.is_friend === true;
          break;
          
        case 'interest-only':
          const interests = preferences.interest_filter ? 
                           preferences.interest_filter.split(',').map(i => i.trim().toLowerCase()) : 
                           [];
          const hashtags = preferences.favorite_hashtags ? 
                          preferences.favorite_hashtags.split(',').map(h => h.trim().toLowerCase()) : 
                          [];
                          
          modeTitle = 'Interests Only Mode';
          modeDescription = `Showing posts matching your interests: ${interests.join(', ')}`;
          
          if (interests.length === 0 && hashtags.length === 0) {
            showInPageNotification('Warning', 'No interests configured. Please update your preferences.', 'warning');
            reject('No interests configured');
            return;
          }
          
          filterFn = (post) => {
            // Check if the post content matches any interest
            const content = post.content?.toLowerCase() || '';
            const postHashtags = post.hashtags?.toLowerCase() || '';
            
            // Check for matching interests in content
            for (const interest of interests) {
              if (content.includes(interest)) {
                return true;
              }
            }
            
            // Check for matching hashtags in content
            for (const hashtag of hashtags) {
              if (postHashtags.includes(hashtag)) {
                return true;
              }
            }
            
            return false;
          };
          break;
          
        case 'minimal-feed':
          modeTitle = 'Minimal Feed Mode';
          modeDescription = 'Showing only the most relevant posts';
          filterFn = (post) => {
            // This is a placeholder filter for Minimal Feed mode
            // You can implement your own logic here
            return true;
          };
          break;
          
        default:
          modeTitle = 'Default Mode';
          modeDescription = 'Showing all posts';
          filterFn = (post) => true;
          break;
      }
      
      // Create a filter function based on the selected mode
      let filterFn = null;
      let modeTitle = '';
      let modeDescription = '';
      
      switch (mode) {
        case 'friends-only':
          modeTitle = 'Friends Only Mode';
          modeDescription = 'Showing only posts from friends';
          filterFn = (post) => post.is_friend === true;
          break;
          
        case 'interest-only':
          const interests = preferences.interest_filter ? 
                           preferences.interest_filter.split(',').map(i => i.trim().toLowerCase()) : 
                           [];
          const hashtags = preferences.favorite_hashtags ? 
                          preferences.favorite_hashtags.split(',').map(h => h.trim().toLowerCase()) : 
                          [];
                          
          modeTitle = 'Interests Only Mode';
          modeDescription = `Showing posts matching your interests: ${interests.join(', ')}`;
          
          if (interests.length === 0 && hashtags.length === 0) {
            showInPageNotification('Warning', 'No interests configured. Please update your preferences.', 'warning');
            reject('No interests configured');
            return;
          }
          
          filterFn = (post) => {
            // Check if the post content matches any interest
            const content = post.content?.toLowerCase() || '';
            const postHashtags = post.hashtags?.toLowerCase() || '';
            
            // Check for matching interests in content
            for (const interest of interests) {
              if (content.includes(interest)) {
                return true;
              }
            }
            
            // Check for matching hashtags in content
            for (const hashtag of hashtags) {
              if (postHashtags.includes(hashtag)) {
                return true;
              }
            }
            
            return false;
          };
          break;
          
        case 'minimal-feed':
          modeTitle = 'Minimal Feed Mode';
          modeDescription = 'Showing only the most relevant posts';
          filterFn = (post) => {
            // This is a placeholder filter for Minimal Feed mode
            // You can implement your own logic here
            return true;
          };
          break;
          
        default:
          modeTitle = 'Default Mode';
          modeDescription = 'Showing all posts';
          filterFn = (post) => true;
          break;
      }
      
      // Create a filter function based on the selected mode
      let filterFn = null;
      let modeTitle = '';
      let modeDescription = '';
      
      switch (mode) {
        case 'friends-only':
          modeTitle = 'Friends Only Mode';
          modeDescription = 'Showing only posts from friends';
          filterFn = (post) => post.is_friend === true;
          break;
          
        case 'interest-only':
          const interests = preferences.interest_filter ? 
                           preferences.interest_filter.split(',').map(i => i.trim().toLowerCase()) : 
                           [];
          const hashtags = preferences.favorite_hashtags ? 
                          preferences.favorite_hashtags.split(',').map(h => h.trim().toLowerCase()) : 
                          [];
                          
          modeTitle = 'Interests Only Mode';
          modeDescription = `Showing posts matching your interests: ${interests.join(', ')}`;
          
          if (interests.length === 0 && hashtags.length === 0) {
            showInPageNotification('Warning', 'No interests configured. Please update your preferences.', 'warning');
            reject('No interests configured');
            return;
          }
          
          filterFn = (post) => {
            // Check if the post content matches any interest
            const content = post.content?.toLowerCase() || '';
            const postHashtags = post.hashtags?.toLowerCase() || '';
            
            // Check for matching interests in content
            for (const interest of interests) {
              if (content.includes(interest)) {
                return true;
              }
            }
            
            // Check for matching hashtags in content
            for (const hashtag of hashtags) {
              if (postHashtags.includes(hashtag)) {
                return true;
              }
            }
            
            return false;
          };
          break;
          
        case 'minimal-feed':
          modeTitle = 'Minimal Feed Mode';
          modeDescription = 'Showing only the most relevant posts';
          filterFn = (post) => {
            // This is a placeholder filter for Minimal Feed mode
            // You can implement your own logic here
            return true;
          };
          break;
          
        default:
          modeTitle = 'Default Mode';
          modeDescription = 'Showing all posts';
          filterFn = (post) => true;
          break;
      }
      
      // Create a filter function based on the selected mode
      let filterFn = null;
      let modeTitle = '';
      let modeDescription = '';
      
      switch (mode) {
        case 'friends-only':
          modeTitle = 'Friends Only Mode';
          modeDescription = 'Showing only posts from friends';
          filterFn = (post) => post.is_friend === true;
          break;
          
        case 'interest-only':
          const interests = preferences.interest_filter ? 
                           preferences.interest_filter.split(',').map(i => i.trim().toLowerCase()) : 
                           [];
          const hashtags = preferences.favorite_hashtags ? 
                          preferences.favorite_hashtags.split(',').map(h => h.trim().toLowerCase()) : 
                          [];
                          
          modeTitle = 'Interests Only Mode';
          modeDescription = `Showing posts matching your interests: ${interests.join(', ')}`;
          
          if (interests.length === 0 && hashtags.length === 0) {
            showInPageNotification('Warning', 'No interests configured. Please update your preferences.', 'warning');
            reject('No interests configured');
            return;
          }
          
          filterFn = (post) => {
            // Check if the post content matches any interest
            const content = post.content?.toLowerCase() || '';
            const postHashtags = post.hashtags?.toLowerCase() || '';
            
            // Check for matching interests in content
            for (const interest of interests) {
              if (content.includes(interest)) {
                return true;
              }
            }
            
            // Check for matching hashtags in content
            for (const hashtag of hashtags) {
              if (postHashtags.includes(hashtag)) {
                return true;
              }
            }
            
            return false;
          };
          break;
          
        case 'minimal-feed':
          modeTitle = 'Minimal Feed Mode';
          modeDescription = 'Showing only the most relevant posts';
          filterFn = (post) => {
            // This is a placeholder filter for Minimal Feed mode
            // You can implement your own logic here
            return true;
          };
          break;
          
        default:
          modeTitle = 'Default Mode';
          modeDescription = 'Showing all posts';
          filterFn = (post) => true;
          break;
      }
      
      // Create a filter function based on the selected mode
      let filterFn = null;
      let modeTitle = '';
      let modeDescription = '';
      
      switch (mode) {
        case 'friends-only':
          modeTitle = 'Friends Only Mode';
          modeDescription = 'Showing only posts from friends';
          filterFn = (post) => post.is_friend === true;
          break;
          
        case 'interest-only':
          const interests = preferences.interest_filter ? 
                           preferences.interest_filter.split(',').map(i => i.trim().toLowerCase()) : 
                           [];
          const hashtags = preferences.favorite_hashtags ? 
                          preferences.favorite_hashtags.split(',').map(h => h.trim().toLowerCase()) : 
                          [];
                          
          modeTitle = 'Interests Only Mode';
          modeDescription = `Showing posts matching your interests: ${interests.join(', ')}`;
          
          if (interests.length === 0 && hashtags.length === 0) {
            showInPageNotification('Warning', 'No interests configured. Please update your preferences.', 'warning');
            reject('No interests configured');
            return;
          }
          
          filterFn = (post) => {
            // Check if the post content matches any interest
            const content = post.content?.toLowerCase() || '';
            const postHashtags = post.hashtags?.toLowerCase() || '';
            
            // Check for matching interests in content
            for (const interest of interests) {
              if (content.includes(interest)) {
                return true;
              }
            }
            
            // Check for matching hashtags in content
            for (const hashtag of hashtags) {
              if (postHashtags.includes(hashtag)) {
                return true;
              }
            }
            
            return false;
          };
          break;
          
        case 'minimal-feed':
          modeTitle = 'Minimal Feed Mode';
          modeDescription = 'Showing only the most relevant posts';
          filterFn = (post) => {
            // This is a placeholder filter for Minimal Feed mode
            // You can implement your own logic here
            return true;
          };
          break;
          
        default:
          modeTitle = 'Default Mode';
          modeDescription = 'Showing all posts';
          filterFn = (post) => true;
          break;
      }
      
      // Create a filter function based on the selected mode
      let filterFn = null;
      let modeTitle = '';
      let modeDescription = '';
      
      switch (mode) {
        case 'friends-only':
          modeTitle = 'Friends Only Mode';
          modeDescription = 'Showing only posts from friends';
          filterFn = (post) => post.is_friend === true;
          break;
          
        case 'interest-only':
          const interests = preferences.interest_filter ? 
                           preferences.interest_filter.split(',').map(i => i.trim().toLowerCase()) : 
                           [];
          const hashtags = preferences.favorite_hashtags ? 
                          preferences.favorite_hashtags.split(',').map(h => h.trim().toLowerCase()) : 
                          [];
                          
          modeTitle = 'Interests Only Mode';
          modeDescription = `Showing posts matching your interests: ${interests.join(', ')}`;
          
          if (interests.length === 0 && hashtags.length === 0) {
            showInPageNotification('Warning', 'No interests configured. Please update your preferences.', 'warning');
            reject('No interests configured');
            return;
          }
          
          filterFn = (post) => {
            // Check if the post content matches any interest
            const content = post.content?.toLowerCase() || '';
            const postHashtags = post.hashtags?.toLowerCase() || '';
            
            // Check for matching interests in content
            for (const interest of interests) {
              if (content.includes(interest)) {
                return true;
              }
            }
            
            // Check for matching hashtags in content
            for (const hashtag of hashtags) {
              if (postHashtags.includes(hashtag)) {
                return true;
              }
            }
            
            return false;
          };
          break;
          
        case 'minimal-feed':
          modeTitle = 'Minimal Feed Mode';
          modeDescription = 'Showing only the most relevant posts';
          filterFn = (post) => {
            // This is a placeholder filter for Minimal Feed mode
            // You can implement your own logic here
            return true;
          };
          break;
          
        default:
          modeTitle = 'Default Mode';
          modeDescription = 'Showing all posts';
          filterFn = (post) => true;
          break;
      }
      
      // Create a filter function based on the selected mode
      let filterFn = null;
      let modeTitle = '';
      let modeDescription = '';
      
      switch (mode) {
        case 'friends-only':
          modeTitle = 'Friends Only Mode';
          modeDescription = 'Showing only posts from friends';
          filterFn = (post) => post.is_friend === true;
          break;
          
        case 'interest-only':
          const interests = preferences.interest_filter ? 
                           preferences.interest_filter.split(',').map(i => i.trim().toLowerCase()) : 
                           [];
          const hashtags = preferences.favorite_hashtags ? 
                          preferences.favorite_hashtags.split(',').map(h => h.trim().toLowerCase()) : 
                          [];
                          
          modeTitle = 'Interests Only Mode';
          modeDescription = `Showing posts matching your interests: ${interests.join(', ')}`;
          
          if (interests.length === 0 && hashtags.length === 0) {
            showInPageNotification('Warning', 'No interests configured. Please update your preferences.', 'warning');
            reject('No interests configured');
            return;
          }
          
          filterFn = (post) => {
            // Check if the post content matches any interest
            const content = post.content?.toLowerCase() || '';
            const postHashtags = post.hashtags?.toLowerCase() || '';
            
            // Check for matching interests in content
            for (const interest of interests) {
              if (content.includes(interest)) {
                return true;
              }
            }
            
            // Check for matching hashtags in content
            for (const hashtag of hashtags) {
              if (postHashtags.includes(hashtag)) {
                return true;
              }
            }
            
            return false;
          };
          break;
          
        case 'minimal-feed':
          modeTitle = 'Minimal Feed Mode';
          modeDescription = 'Showing only the most relevant posts';
          filterFn = (post) => {
            // This is a placeholder filter for Minimal Feed mode
            // You can implement your own logic here
            return true;
          };
          break;
          
        default:
          modeTitle = 'Default Mode';
          modeDescription = 'Showing all posts';
          filterFn = (post) => true;
          break;
      }
      
      // Create a filter function based on the selected mode
      let filterFn = null;
      let modeTitle = '';
      let modeDescription = '';
      
      switch (mode) {
        case 'friends-only':
          modeTitle = 'Friends Only Mode';
          modeDescription = 'Showing only posts from friends';
          filterFn = (post) => post.is_friend === true;
          break;
          
        case 'interest-only':
          const interests = preferences.interest_filter ? 
                           preferences.interest_filter.split(',').map(i => i.trim().toLowerCase()) : 
                           [];
          const hashtags = preferences.favorite_hashtags ? 
                          preferences.favorite_hashtags.split(',').map(h => h.trim().toLowerCase()) : 
                          [];
                          
          modeTitle = 'Interests Only Mode';
          modeDescription = `Showing posts matching your interests: ${interests.join(', ')}`;
          
          if (interests.length === 0 && hashtags.length === 0) {
            showInPageNotification('Warning', 'No interests configured. Please update your preferences.', 'warning');
            reject('No interests configured');
            return;
          }
          
          filterFn = (post) => {
            // Check if the post content matches any interest
            const content = post.content?.toLowerCase() || '';
            const postHashtags = post.hashtags?.toLowerCase() || '';
            
            // Check for matching interests in content
            for (const interest of interests) {
              if (content.includes(interest)) {
                return true;
              }
            }
            
            // Check for matching hashtags in content
            for (const hashtag of hashtags) {
              if (postHashtags.includes(hashtag)) {
                return true;
              }
            }
            
            return false;
          };
          break;
          
        case 'minimal-feed':
          modeTitle = 'Minimal Feed Mode';
          modeDescription = 'Showing only the most relevant posts';
          filterFn = (post) => {
            // This is a placeholder filter for Minimal Feed mode
            // You can implement your own logic here
            return true;
          };
          break;
          
        default:
          modeTitle = 'Default Mode';
          modeDescription = 'Showing all posts';
          filterFn = (post) => true;
          break;
      }
      
      // Create a filter function based on the selected mode
      let filterFn = null;
      let modeTitle = '';
      let modeDescription = '';
      
      switch (mode) {
        case 'friends-only':
          modeTitle = 'Friends Only Mode';
          modeDescription = 'Showing only posts from friends';
          filterFn = (post) => post.is_friend === true;
          break;
          
        case 'interest-only':
          const interests = preferences.interest_filter ? 
                           preferences.interest_filter.split(',').map(i => i.trim().toLowerCase()) : 
                           [];
          const hashtags = preferences.favorite_hashtags ? 
                          preferences.favorite_hashtags.split(',').map(h => h.trim().toLowerCase()) : 
                          [];
                          
          modeTitle = 'Interests Only Mode';
          modeDescription = `Showing posts matching your interests: ${interests.join(', ')}`;
          
          if (interests.length === 0 && hashtags.length === 0) {
            showInPageNotification('Warning', 'No interests configured. Please update your preferences.', 'warning');
            reject('No interests configured');
            return;
          }
          
          filterFn = (post) => {
            // Check if the post content matches any interest
            const content = post.content?.toLowerCase() || '';
            const postHashtags = post.hashtags?.toLowerCase() || '';
            
            // Check for matching interests in content
            for (const interest of interests) {
              if (content.includes(interest)) {
                return true;
              }
            }
            
            // Check for matching hashtags in content
            for (const hashtag of hashtags) {
              if (postHashtags.includes(hashtag)) {
                return true;
              }
            }
            
            return false;
          };
          break;
          
        case 'minimal-feed':
          modeTitle = 'Minimal Feed Mode';
          modeDescription = 'Showing only the most relevant posts';
          filterFn = (post) => {
            // This is a placeholder filter for Minimal Feed mode
            // You can implement your own logic here
            return true;
          };
          break;
          
        default:
          modeTitle = 'Default Mode';
          modeDescription = 'Showing all posts';
          filterFn = (post) => true;
          break;
      }
      
      // Create a filter function based on the selected mode
      let filterFn = null;
      let modeTitle = '';
      let modeDescription = '';
      
      switch (mode) {
        case 'friends-only':
          modeTitle = 'Friends Only Mode';
          modeDescription = 'Showing only posts from friends';
          filterFn = (post) => post.is_friend === true;
          break;
          
        case 'interest-only':
          const interests = preferences.interest_filter ? 
                           preferences.interest_filter.split(',').map(i => i.trim().toLowerCase()) : 
                           [];
          const hashtags = preferences.favorite_hashtags ? 
                          preferences.favorite_hashtags.split(',').map(h => h.trim().toLowerCase()) : 
                          [];
                          
          modeTitle = 'Interests Only Mode';
          modeDescription = `Showing posts matching your interests: ${interests.join(', ')}`;
          
          if (interests.length === 0 && hashtags.length === 0) {
            showInPageNotification('Warning', 'No interests configured. Please update your preferences.', 'warning');
            reject('No interests configured');
            return;
          }
          
          filterFn = (post) => {
            // Check if the post content matches any interest
            const content = post.content?.toLowerCase() || '';
            const postHashtags = post.hashtags?.toLowerCase() || '';
            
            // Check for matching interests in content
            for (const interest of interests) {
              if (content.includes(interest)) {
                return true;
              }
            }
            
            // Check for matching hashtags in content
            for (const hashtag of hashtags) {
              if (postHashtags.includes(hashtag)) {
                return true;
              }
            }
            
            return false;
          };
          break;
          
        case 'minimal-feed':
          modeTitle = 'Minimal Feed Mode';
          modeDescription = 'Showing only the most relevant posts';
          filterFn = (post) => {
            // This is a placeholder filter for Minimal Feed mode
            // You can implement your own logic here
            return true;
          };
          break;
          
        default:
          modeTitle = 'Default Mode';
          modeDescription = 'Showing all posts';
          filterFn = (post) => true;
          break;
      }
      
      // Create a filter function based on the selected mode
      let filterFn = null;
      let modeTitle = '';
      let modeDescription = '';
      
      switch (mode) {
        case 'friends-only':
          modeTitle = 'Friends Only Mode';
          modeDescription = 'Showing only posts from friends';
          filterFn = (post) => post.is_friend === true;
          break;
          
        case 'interest-only':
          const interests = preferences.interest_filter ? 
                           preferences.interest_filter.split(',').map(i => i.trim().toLowerCase()) : 
                           [];
          const hashtags = preferences.favorite_hashtags ? 
                          preferences.favorite_hashtags.split(',').map(h => h.trim().toLowerCase()) : 
                          [];
                          
          modeTitle = 'Interests Only Mode';
          modeDescription = `Showing posts matching your interests: ${interests.join(', ')}`;
          
          if (interests.length === 0 && hashtags.length === 0) {
            showInPageNotification('Warning', 'No interests configured. Please update your preferences.', 'warning');
            reject('No interests configured');
            return;
          }
          
          filterFn = (post) => {
            // Check if the post content matches any interest
            const content = post.content?.toLowerCase() || '';
            const postHashtags = post.hashtags?.toLowerCase() || '';
            
            // Check for matching interests in content
            for (const interest of interests) {
              if (content.includes(interest)) {
                return true;
              }
            }
            
            // Check for matching hashtags in content
            for (const hashtag of hashtags) {
              if (postHashtags.includes(hashtag)) {
                return true;
              }
            }
            
            return false;
          };
          break;
          
        case 'minimal-feed':
          modeTitle = 'Minimal Feed Mode';
          modeDescription = 'Showing only the most relevant posts';
          filterFn = (post) => {
            // This is a placeholder filter for Minimal Feed mode
            // You can implement your own logic here
            return true;
          };
          break;
          
        default:
          modeTitle = 'Default Mode';
          modeDescription = 'Showing all posts';
          filterFn = (post) => true;
          break;
      }
      
      // Create a filter function based on the selected mode
      let filterFn = null;
      let modeTitle = '';
      let modeDescription = '';
      
      switch (mode) {
        case 'friends-only':
          modeTitle = 'Friends Only Mode';
          modeDescription = 'Showing only posts from friends';
          filterFn = (post) => post.is_friend === true;
          break;
          
        case 'interest-only':
          const interests = preferences.interest_filter ? 
                           preferences.interest_filter.split(',').map(i => i.trim().toLowerCase()) : 
                           [];
          const hashtags = preferences.favorite_hashtags ? 
                          preferences.favorite_hashtags.split(',').map(h => h.trim().toLowerCase()) : 
                          [];
                          
          modeTitle = 'Interests Only Mode';
          modeDescription = `Showing posts matching your interests: ${interests.join(', ')}`;
          
          if (interests.length === 0 && hashtags.length === 0) {
            showInPageNotification('Warning', 'No interests configured. Please update your preferences.', 'warning');
            reject('No interests configured');
            return;
          }
          
          filterFn = (post) => {
            // Check if the post content matches any interest
            const content = post.content?.toLowerCase() || '';
            const postHashtags = post.hashtags?.toLowerCase() || '';
            
            // Check for matching interests in content
            for (const interest of interests) {
              if (content.includes(interest)) {
                return true;
              }
            }
            
            // Check for matching hashtags in content
            for (const hashtag of hashtags) {
              if (postHashtags.includes(hashtag)) {
                return true;
              }
            }
            
            return false;
          };
          break;
          
        case 'minimal-feed':
          modeTitle = 'Minimal Feed Mode';
          modeDescription = 'Showing only the most relevant posts';
          filterFn = (post) => {
            // This is a placeholder filter for Minimal Feed mode
            // You can implement your own logic here
            return true;
          };
          break;
          
        default:
          modeTitle = 'Default Mode';
          modeDescription = 'Showing all posts';
          filterFn = (post) => true;
          break;
      }
      
      // Create a filter function based on the selected mode
      let filterFn = null;
      let modeTitle = '';
      let modeDescription = '';
      
      switch (mode) {
        case 'friends-only':
          modeTitle = 'Friends Only Mode';
          modeDescription = 'Showing only posts from friends';
          filterFn = (post) => post.is_friend === true;
          break;
          
        case 'interest-only':
          const interests = preferences.interest_filter ? 
                           preferences.interest_filter.split(',').map(i => i.trim().toLowerCase()) : 
                           [];
          const hashtags = preferences.favorite_hashtags ? 
                          preferences.favorite_hashtags.split(',').map(h => h.trim().toLowerCase()) : 
                          [];
                          
          modeTitle = 'Interests Only Mode';
          modeDescription = `Showing posts matching your interests: ${interests.join(', ')}`;
          
          if (interests.length === 0 && hashtags.length === 0) {
            showInPageNotification('Warning', 'No interests configured. Please update your preferences.', 'warning');
            reject('No interests configured');
            return;
          }
          
          filterFn = (post) => {
            // Check if the post content matches any interest
            const content = post.content?.toLowerCase() || '';
            const postHashtags = post.hashtags?.toLowerCase() || '';
            
            // Check for matching interests in content
            for (const interest of interests) {
              if (content.includes(interest)) {
                return true;
              }
            }
            
            // Check for matching hashtags in content
            for (const hashtag of hashtags) {
              if (postHashtags.includes(hashtag)) {
                return true;
              }
            }
            
            return false;
          };
          break;
          
        case 'minimal-feed':
          modeTitle = 'Minimal Feed Mode';
          modeDescription = 'Showing only the most relevant posts';
          filterFn = (post) => {
            // This is a placeholder filter for Minimal Feed mode
            // You can implement your own logic here
            return true;
          };
          break;
          
        default:
          modeTitle = 'Default Mode';
          modeDescription = 'Showing all posts';
          filterFn = (post) => true;
          break;
      }
      
      // Create a filter function based on the selected mode
      let filterFn = null;
      let modeTitle = '';
      let modeDescription = '';
      
      switch (mode) {
        case 'friends-only':
          modeTitle = 'Friends Only Mode';
          modeDescription = 'Showing only posts from friends';
          filterFn = (post) => post.is_friend === true;
          break;
          
        case 'interest-only':
          const interests = preferences.interest_filter ? 
                           preferences.interest_filter.split(',').map(i => i.trim().toLowerCase()) : 
                           [];
          const hashtags = preferences.favorite_hashtags ? 
                          preferences.favorite_hashtags.split(',').map(h => h.trim().toLowerCase()) : 
                          [];
                          
          modeTitle = 'Interests Only Mode';
          modeDescription = `Showing posts matching your interests: ${interests.join(', ')}`;
          
          if (interests.length === 0 && hashtags.length === 0) {
            showInPageNotification('Warning', 'No interests configured. Please update your preferences.', 'warning');
            reject('No interests configured');
            return;
          }
          
          filterFn = (post) => {
            // Check if the post content matches any interest
            const content = post.content?.toLowerCase() || '';
            const postHashtags = post.hashtags?.toLowerCase() || '';
            
            // Check for matching interests in content
            for (const interest of interests) {
              if (content.includes(interest)) {
                return true;
              }
            }
            
            // Check for matching hashtags in content
            for (const hashtag of hashtags) {
              if (postHashtags.includes(hashtag)) {
                return true;
              }
            }
            
            return false;
          };
          break;
          
        case 'minimal-feed':
          modeTitle = 'Minimal Feed Mode';
          modeDescription = 'Showing only the most relevant posts';
          filterFn = (post) => {
            // This is a placeholder filter for Minimal Feed mode
            // You can implement your own logic here
            return true;
          };
          break;
          
        default:
          modeTitle = 'Default Mode';
          modeDescription = 'Showing all posts';
          filterFn = (post) => true;
          break;
      }
      
      // Create a filter function based on the selected mode
      let filterFn = null;
      let modeTitle = '';
      let modeDescription = '';
      
      switch (mode) {
        case 'friends-only':
          modeTitle = 'Friends Only Mode';
          modeDescription = 'Showing only posts from friends';
          filterFn = (post) => post.is_friend === true;
          break;
          
        case 'interest-only':
          const interests = preferences.interest_filter ? 
                           preferences.interest_filter.split(',').map(i => i.trim().toLowerCase()) : 
                           [];
          const hashtags = preferences.favorite_hashtags ? 
                          preferences.favorite_hashtags.split(',').map(h => h.trim().toLowerCase()) : 
                          [];
                          
          modeTitle = 'Interests Only Mode';
          modeDescription = `Showing posts matching your interests: ${interests.join(', ')}`;
          
          if (interests.length === 0 && hashtags.length === 0) {
            showInPageNotification('Warning', 'No interests configured. Please update your preferences.', 'warning');
            reject('No interests configured');
            return;
          }
          
          filterFn = (post) => {
            // Check if the post content matches any interest
            const content = post.content?.toLowerCase() || '';
            const postHashtags = post.hashtags?.toLowerCase() || '';
            
            // Check for matching interests in content
            for (const interest of interests) {
              if (content.includes(interest)) {
                return true;
              }
            }
            
            // Check for matching hashtags in content
            for (const hashtag of hashtags) {
              if (postHashtags.includes(hashtag)) {
                return true;
              }
            }
            
            return false;
          };
          break;
          
        case 'minimal-feed':
          modeTitle = 'Minimal Feed Mode';
          modeDescription = 'Showing only the most relevant posts';
          filterFn = (post) => {
            // This is a placeholder filter for Minimal Feed mode
            // You can implement your own logic here
            return true;
          };
          break;
          
        default:
          modeTitle = 'Default Mode';
          modeDescription = 'Showing all posts';
          filterFn = (post) => true;
          break;
      }
      
      // Create a filter function based on the selected mode
      let filterFn = null;
      let modeTitle = '';
      let modeDescription = '';
      
      switch (mode) {
        case 'friends-only':
          modeTitle = 'Friends Only Mode';
          modeDescription = 'Showing only posts from friends';
          filterFn = (post) => post.is_friend === true;
          break;
          
        case 'interest-only':
          const interests = preferences.interest_filter ? 
                           preferences.interest_filter.split(',').map(i => i.trim().toLowerCase()) : 
                           [];
          const hashtags = preferences.favorite_hashtags ? 
                          preferences.favorite_hashtags.split(',').map(h => h.trim().toLowerCase()) : 
                          [];
                          
          modeTitle = 'Interests Only Mode';
          modeDescription = `Showing posts matching your interests: ${interests.join(', ')}`;
          
          if (interests.length === 0 && hashtags.length === 0) {
            showInPageNotification('Warning', 'No interests configured. Please update your preferences.', 'warning');
            reject('No interests configured');
            return;
          }
          
          filterFn = (post) => {
            // Check if the post content matches any interest
            const content = post.content?.toLowerCase() || '';
            const postHashtags = post.hashtags?.toLowerCase() || '';
            
            // Check for matching interests in content
            for (const interest of interests) {
              if (content.includes(interest)) {
                return true;
              }
            }
            
            // Check for matching hashtags in content
            for (const hashtag of hashtags) {
              if (postHashtags.includes(hashtag)) {
                return true;
              }
            }
            
            return false;
          };
          break;
          
        case 'minimal-feed':
          modeTitle = 'Minimal Feed Mode';
          modeDescription = 'Showing only the most relevant posts';
          filterFn = (post) => {
            // This is a placeholder filter for Minimal Feed mode
            // You can implement your own logic here
            return true;
          };
          break;
          
        default:
          modeTitle = 'Default Mode';
          modeDescription = 'Showing all posts';
          filterFn = (post) => true;
          break;
      }
      
      // Create a filter function based on the selected mode
      let filterFn = null;
      let modeTitle = '';
      let modeDescription = '';
      
      switch (mode) {
        case 'friends-only':
          modeTitle = 'Friends Only Mode';
          modeDescription = 'Showing only posts from friends';
          filterFn = (post) => post.is_friend === true;
          break;
          
        case 'interest-only':
          const interests = preferences.interest_filter ? 
                           preferences.interest_filter.split(',').map(i => i.trim().toLowerCase()) : 
                           [];
          const hashtags = preferences.favorite_hashtags ? 
                          preferences.favorite_hashtags.split(',').map(h => h.trim().toLowerCase()) : 
                          [];
                          
          modeTitle = 'Interests Only Mode';
          modeDescription = `Showing posts matching your interests: ${interests.join(', ')}`;
          
          if (interests.length === 0 && hashtags.length === 0) {
            showInPageNotification('Warning', 'No interests configured. Please update your preferences.', 'warning');
            reject('No interests configured');
            return;
          }
          
          filterFn = (post) => {
            // Check if the post content matches any interest
            const content = post.content?.toLowerCase() || '';
            const postHashtags = post.hashtags?.toLowerCase() || '';
            
            // Check for matching interests in content
            for (const interest of interests) {
              if (content.includes(interest)) {
                return true;
              }
            }
            
            // Check for matching hashtags in content
            for (const hashtag of hashtags) {
              if (postHashtags.includes(hashtag)) {
                return true;
              }
            }
            
            return false;
          };
          break;
          
        case 'minimal-feed':
          modeTitle = 'Minimal Feed Mode';
          modeDescription = 'Showing only the most relevant posts';
          filterFn = (post) => {
            // This is a placeholder filter for Minimal Feed mode
            // You can implement your own logic here
            return true;
          };
          break;
          
        default:
          modeTitle = 'Default Mode';
          modeDescription = 'Showing all posts';
          filterFn = (post) => true;
          break;
      }
      
      // Create a filter function based on the selected mode
      let filterFn = null;
      let modeTitle = '';
      let modeDescription = '';
      
      switch (mode) {
        case 'friends-only':
          modeTitle = 'Friends Only Mode';
          modeDescription = 'Showing only posts from friends';
          filterFn = (post) => post.is_friend === true;
          break;
          
        case 'interest-only':
          const interests = preferences.interest_filter ? 
                           preferences.interest_filter.split(',').map(i => i.trim().toLowerCase()) : 
                           [];
          const hashtags = preferences.favorite_hashtags ? 
                          preferences.favorite_hashtags.split(',').map(h => h.trim().toLowerCase()) : 
                          [];
                          
          modeTitle = 'Interests Only Mode';
          modeDescription = `Showing posts matching your interests: ${interests.join(', ')}`;
          
          if (interests.length === 0 && hashtags.length === 0) {
            showInPageNotification('Warning', 'No interests configured. Please update your preferences.', 'warning');
            reject('No interests configured');
            return;
          }
          
          filterFn = (post) => {
            // Check if the post content matches any interest
            const content = post.content?.toLowerCase() || '';
            const postHashtags = post.hashtags?.toLowerCase() || '';
            
            // Check for matching interests in content
            for (const interest of interests) {
              if (content.includes(interest)) {
                return true;
              }
            }
            
            // Check for matching hashtags in content
            for (const hashtag of hashtags) {
              if (postHashtags.includes(hashtag)) {
                return true;
              }
            }
            
            return false;
          };
          break;
          
        case 'minimal-feed':
          modeTitle = 'Minimal Feed Mode';
          modeDescription = 'Showing only the most relevant posts';
          filterFn = (post) => {
            // This is a placeholder filter for Minimal Feed mode
            // You can implement your own logic here
            return true;
          };
          break;
          
        default:
          modeTitle = 'Default Mode';
          modeDescription = 'Showing all posts';
          filterFn = (post) => true;
          break;
      }
      
      // Create a filter function based on the selected mode
      let filterFn = null;
      let modeTitle = '';
      let modeDescription = '';
      
      switch (mode) {
        case 'friends-only':
          modeTitle = 'Friends Only Mode';
          modeDescription = 'Showing only posts from friends';
          filterFn = (post) => post.is_friend === true;
          break;
          
        case 'interest-only':
          const interests = preferences.interest_filter ? 
                           preferences.interest_filter.split(',').map(i => i.trim().toLowerCase()) : 
                           [];
          const hashtags = preferences.favorite_hashtags ? 
                          preferences.favorite_hashtags.split(',').map(h => h.trim().toLowerCase()) : 
                          [];
                          
          modeTitle = 'Interests Only Mode';
          modeDescription = `Showing posts matching your interests: ${interests.join(', ')}`;
          
          if (interests.length === 0 && hashtags.length === 0) {
            showInPageNotification('Warning', 'No interests configured. Please update your preferences.', 'warning');
            reject('No interests configured');
            return;
          }
          
          filterFn = (post) => {
            // Check if the post content matches any interest
            const content = post.content?.toLowerCase() || '';
            const postHashtags = post.hashtags?.toLowerCase() || '';
            
            // Check for matching interests in content
            for (const interest of interests) {
              if (content.includes(interest)) {
                return true;
              }
            }
            
            // Check for matching hashtags in content
            for (const hashtag of hashtags) {
              if (postHashtags.includes(hashtag)) {
                return true;
              }
            }
            
            return false;
          };
          break;
          
        case 'minimal-feed':
          modeTitle = 'Minimal Feed Mode';
          modeDescription = 'Showing only the most relevant posts';
          filterFn = (post) => {
            // This is a placeholder filter for Minimal Feed mode
            // You can implement your own logic here
            return true;
          };
          break;
          
        default:
          modeTitle = 'Default Mode';
          modeDescription = 'Showing all posts';
          filterFn = (post) => true;
          break;
      }
      
      // Create a filter function based on the selected mode
      let filterFn = null;
      let modeTitle = '';
      let modeDescription = '';
      
      switch (mode) {
        case 'friends-only':
          modeTitle = 'Friends Only Mode';
          modeDescription = 'Showing only posts from friends';
          filterFn = (post) => post.is_friend === true;
          break;
          
        case 'interest-only':
          const interests = preferences.interest_filter ? 
                           preferences.interest_filter.split(',').map(i => i.trim().toLowerCase()) : 
                           [];
          const hashtags = preferences.favorite_hashtags ? 
                          preferences.favorite_hashtags.split(',').map(h => h.trim().toLowerCase()) : 
                          [];
                          
          modeTitle = 'Interests Only Mode';
          modeDescription = `Showing posts matching your interests: ${interests.join(', ')}`;
          
          if (interests.length === 0 && hashtags.length === 0) {
            showInPageNotification('Warning', 'No interests configured. Please update your preferences.', 'warning');
            reject('No interests configured');
            return;
          }
          
          filterFn = (post) => {
            // Check if the post content matches any interest
            const content = post.content?.toLowerCase() || '';
            const postHashtags = post.hashtags?.toLowerCase() || '';
            
            // Check for matching interests in content
            for (const interest of interests) {
              if (content.includes(interest)) {
                return true;
              }
            }
            
            // Check for matching hashtags in content
            for (const hashtag of hashtags) {
              if (postHashtags.includes(hashtag)) {
                return true;
              }
            }
            
            return false;
          };
          break;
          
        case 'minimal-feed':
          modeTitle = 'Minimal Feed Mode';
          modeDescription = 'Showing only the most relevant posts';
          filterFn = (post) => {
            // This is a placeholder filter for Minimal Feed mode
            // You can implement your own logic here
            return true;
          };
          break;
          
        default:
          modeTitle = 'Default Mode';
          modeDescription = 'Showing all posts';
          filterFn = (post) => true;
          break;
      }
      
      // Create a filter function based on the selected mode
      let filterFn = null;
      let modeTitle = '';
      let modeDescription = '';
      
      switch (mode) {
        case 'friends-only':
          modeTitle = 'Friends Only Mode';
          modeDescription = 'Showing only posts from friends';
          filterFn = (post) => post.is_friend === true;
          break;
          
        case 'interest-only':
          const interests = preferences.interest_filter ? 
                           preferences.interest_filter.split(',').map(i => i.trim().toLowerCase()) : 
                           [];
          const hashtags = preferences.favorite_hashtags ? 
                          preferences.favorite_hashtags.split(',').map(h => h.trim().toLowerCase()) : 
                          [];
                          
          modeTitle = 'Interests Only Mode';
          modeDescription = `Showing posts matching your interests: ${interests.join(', ')}`;
          
          if (interests.length === 0 && hashtags.length === 0) {
            showInPageNotification('Warning', 'No interests configured. Please update your preferences.', 'warning');
            reject('No interests configured');
            return;
          }
          
          filterFn = (post) => {
            // Check if the post content matches any interest
            const content = post.content?.toLowerCase() || '';
            const postHashtags = post.hashtags?.toLowerCase() || '';
            
            // Check for matching interests in content
            for (const interest of interests) {
              if (content.includes(interest)) {
                return true;
              }
            }
            
            // Check for matching hashtags in content
            for (const hashtag of hashtags) {
              if (postHashtags.includes(hashtag)) {
                return true;
              }
            }
            
            return false;
          };
          break;
          
        case 'minimal-feed':
          modeTitle = 'Minimal Feed Mode';
          modeDescription = 'Showing only the most relevant posts';
          filterFn = (post) => {
            // This is a placeholder filter for Minimal Feed mode
            // You can implement your own logic here
            return true;
          };
          break;
          
        default:
          modeTitle = 'Default Mode';
          modeDescription = 'Showing all posts';
          filterFn = (post) => true;
          break;
      }
      
      // Create a filter function based on the selected mode
      let filterFn = null;
      let modeTitle = '';
      let modeDescription = '';
      
      switch (mode) {
        case 'friends-only':
          modeTitle = 'Friends Only Mode';
          modeDescription = 'Showing only posts from friends';
          filterFn = (post) => post.is_friend === true;
          break;
          
        case 'interest-only':
          const interests = preferences.interest_filter ? 
                           preferences.interest_filter.split(',').map(i => i.trim().toLowerCase()) : 
                           [];
          const hashtags = preferences.favorite_hashtags ? 
                          preferences.favorite_hashtags.split(',').map(h => h.trim().toLowerCase()) : 
                          [];
                          
          modeTitle = 'Interests Only Mode';
          modeDescription = `Showing posts matching your interests: ${interests.join(', ')}`;
          
          if (interests.length === 0 && hashtags.length === 0) {
            showInPageNotification('Warning', 'No interests configured. Please update your preferences.', 'warning');
            reject('No interests configured');
            return;
          }
          
          filterFn = (post) => {
            // Check if the post content matches any interest
            const content = post.content?.toLowerCase() || '';
            const postHashtags = post.hashtags?.toLowerCase() || '';
            
            // Check for matching interests in content
            for (const interest of interests) {
              if (content.includes(interest)) {
                return true;
              }
            }
            
            // Check for matching hashtags in content
            for (const hashtag of hashtags) {
              if (postHashtags.includes(hashtag)) {
                return true;
              }
            }
            
            return false;
          };
          break;
          
        case 'minimal-feed':
          modeTitle = 'Minimal Feed Mode';
          modeDescription = 'Showing only the most relevant posts';
          filterFn = (post) => {
            // This is a placeholder filter for Minimal Feed mode
            // You can implement your own logic here
            return true;
          };
          break;
          
        default:
          modeTitle = 'Default Mode';
          modeDescription = 'Showing all posts';
          filterFn = (post) => true;
          break;
      }
      
      // Create a filter function based on the selected mode
      let filterFn = null;
      let modeTitle = '';
      let modeDescription = '';
      
      switch (mode) {
        case 'friends-only':
          modeTitle = 'Friends Only Mode';
          modeDescription = 'Showing only posts from friends';
          filterFn = (post) => post.is_friend === true;
          break;
          
        case 'interest-only':
          const interests = preferences.interest_filter ? 
                           preferences.interest_filter.split(',').map(i => i.trim().toLowerCase()) : 
                           [];
          const hashtags = preferences.favorite_hashtags ? 
                          preferences.favorite_hashtags.split(',').map(h => h.trim().toLowerCase()) : 
                          [];
                          
          modeTitle = 'Interests Only Mode';
          modeDescription = `Showing posts matching your interests: ${interests.join(', ')}`;
          
          if (interests.length === 0 && hashtags.length === 0) {
            showInPageNotification('Warning', 'No interests configured. Please update your preferences.', 'warning');
            reject('No interests configured');
            return;
          }
          
          filterFn = (post) => {
            // Check if the post content matches any interest
            const content = post.content?.toLowerCase() || '';
            const postHashtags = post.hashtags?.toLowerCase() || '';
            
            // Check for matching interests in content
            for (const interest of interests) {
              if (content.includes(interest)) {
                return true;
              }
            }
            
            // Check for matching hashtags in content
            for (const hashtag of hashtags) {
              if (postHashtags.includes(hashtag)) {
                return true;
              }
            }
            
            return false;
          };
          break;
          
        case 'minimal-feed':
          modeTitle = 'Minimal Feed Mode';
          modeDescription = 'Showing only the most relevant posts';
          filterFn = (post) => {
            // This is a placeholder filter for Minimal Feed mode
            // You can implement your own logic here
            return true;
          };
          break;
          
        default:
          modeTitle = 'Default Mode';
          modeDescription = 'Showing all posts';
          filterFn = (post) => true;
          break;
      }
      
      // Create a filter function based on the selected mode
      let filterFn = null;
      let modeTitle = '';
      let modeDescription = '';
      
      switch (mode) {
        case 'friends-only':
          modeTitle = 'Friends Only Mode';
          modeDescription = 'Showing only posts from friends';
          filterFn = (post) => post.is_friend === true;
          break;
          
        case 'interest-only':
          const interests = preferences.interest_filter ? 
                           preferences.interest_filter.split(',').map(i => i.trim().toLowerCase()) : 
                           [];
          const hashtags = preferences.favorite_hashtags ? 
                          preferences.favorite_hashtags.split(',').map(h => h.trim().toLowerCase()) : 
                          [];
                          
          modeTitle = 'Interests Only Mode';
          modeDescription = `Showing posts matching your interests: ${interests.join(', ')}`;
          
          if (interests.length === 0 && hashtags.length === 0) {
            showInPageNotification('Warning', 'No interests configured. Please update your preferences.', 'warning');
            reject('No interests configured');
            return;
          }
          
          filterFn = (post) => {
            // Check if the post content matches any interest
            const content = post.content?.toLowerCase() || '';
            const postHashtags = post.hashtags?.toLowerCase() || '';
            
            // Check for matching interests in content
            for (const interest of interests) {
              if (content.includes(interest)) {
                return true;
              }
            }
            
            // Check for matching hashtags in content
            for (const hashtag of hashtags) {
              if (postHashtags.includes(hashtag)) {
                return true;
              }
            }
            
            return false;
          };
          break;
          
        case 'minimal-feed':
          modeTitle = 'Minimal Feed Mode';
          modeDescription = 'Showing only the most relevant posts';
          filterFn = (post) => {
            // This is a placeholder filter for Minimal Feed mode
            // You can implement your own logic here
            return true;
          };
          break;
          
        default:
          modeTitle = 'Default Mode';
          modeDescription = 'Showing all posts';
          filterFn = (post) => true;
          break;
      }
      
      // Create a filter function based on the selected mode
      let filterFn = null;
      let modeTitle = '';
      let modeDescription = '';
      
      switch (mode) {
        case 'friends-only':
          modeTitle = 'Friends Only Mode';
          modeDescription = 'Showing only posts from friends';
          filterFn = (post) => post.is_friend === true;
          break;
          
        case 'interest-only':
          const interests = preferences.interest_filter ? 
                           preferences.interest_filter.split(',').map(i => i.trim().toLowerCase()) : 
                           [];
          const hashtags = preferences.favorite_hashtags ? 
                          preferences.favorite_hashtags.split(',').map(h => h.trim().toLowerCase()) : 
                          [];
                          
          modeTitle = 'Interests Only Mode';
          modeDescription = `Showing posts matching your interests: ${interests.join(', ')}`;
          
          if (interests.length === 0 && hashtags.length === 0) {
            showInPageNotification('Warning', 'No interests configured. Please update your preferences.', 'warning');
            reject('No interests configured');
            return;
          }
          
          filterFn = (post) => {
            // Check if the post content matches any interest
            const content = post.content?.toLowerCase() || '';
            const postHashtags = post.hashtags?.toLowerCase() || '';
            
            // Check for matching interests in content
            for (const interest of interests) {
              if (content.includes(interest)) {
                return true;
              }
            }
            
            // Check for matching hashtags in content
            for (const hashtag of hashtags) {
