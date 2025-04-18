/**
 * content.js - Main content script for Authentic Dashboard Chrome extension
 * 
 * This script runs in the context of web pages matching the manifest patterns
 * and handles:
 * - Post collection from social media platforms
 * - Communication with the popup and background script
 * - UI interactions on the page
 */

// Global variables - made accessible to other content scripts via window
window.isCollecting = false;
window.authenticDashboard = {}; // Initialize early so it's available to other scripts
let connectionCheckTimer = null;
let retryCount = 0;
const MAX_RETRIES = 5;
const RETRY_DELAYS = [1000, 3000, 5000, 10000, 30000]; // ms

// Immediately log when the content script loads
console.log('🔍 Authentic Dashboard content script loaded!', window.location.href);

// Detect which platform we're on
const currentPlatform = detectCurrentPlatform();
console.log('📱 Detected platform:', currentPlatform);

// Try to fix any invalid extension URLs periodically
setupInvalidUrlFixer();

// Initialize the content script
initialize();

/**
 * Initialize the content script
 * Sets up event listeners and notifies the background script
 */
async function initialize() {
  try {
    // Set up message listeners
    setupMessageListeners();
    
    // Check for connection to background script
    const isConnected = await checkBackgroundConnection();
    
    if (isConnected) {
      console.log('Successfully connected to background script');
      
      // Notify background script that content script is loaded
      notifyBackgroundScriptReady();
      
      // Set up periodic connection checks
      setupConnectionChecks();
    } else {
      console.error('Failed to connect to background script, will retry...');
      
      // Retry connection
      retryBackgroundConnection();
    }
  } catch (error) {
    console.error('Error initializing content script:', error);
    
    // Simplified error reporting to avoid issues
    console.error('Initialization error:', error.message);
    
    // Retry connection
    retryBackgroundConnection();
  }
}

/**
 * Notify the background script that the content script is ready
 */
function notifyBackgroundScriptReady() {
  try {
    chrome.runtime.sendMessage({
      action: 'contentScriptLoaded',
      platform: currentPlatform,
      url: window.location.href,
      timestamp: Date.now()
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error notifying background script:', chrome.runtime.lastError);
      } else if (response) {
        console.log('Background script acknowledged content script:', response);
      }
    });
  } catch (error) {
    console.error('Failed to notify background script:', error);
  }
}

/**
 * Set up periodic connection checks
 */
function setupConnectionChecks() {
  // Clear any existing timer
  if (connectionCheckTimer) {
    clearInterval(connectionCheckTimer);
  }
  
  // Check connection every 2 minutes
  connectionCheckTimer = setInterval(async () => {
    try {
      const isConnected = await checkBackgroundConnection();
      
      if (!isConnected) {
        console.warn('Background connection lost, attempting to reconnect...');
        retryBackgroundConnection();
      }
    } catch (error) {
      console.error('Error during periodic connection check:', error);
    }
  }, 2 * 60 * 1000); // Every 2 minutes
}

/**
 * Retry connecting to the background script with exponential backoff
 */
async function retryBackgroundConnection() {
  if (retryCount >= MAX_RETRIES) {
    console.error('Maximum retry attempts reached, giving up');
    return;
  }
  
  const delay = RETRY_DELAYS[retryCount];
  console.log(`Retrying background connection in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
  
  setTimeout(async () => {
    retryCount++;
    
    try {
      const isConnected = await checkBackgroundConnection();
      
      if (isConnected) {
        console.log('Successfully reconnected to background script');
        
        // Reset retry count
        retryCount = 0;
        
        // Notify background script
        notifyBackgroundScriptReady();
        
        // Set up connection checks
        setupConnectionChecks();
      } else {
        // Try again
        retryBackgroundConnection();
      }
    } catch (error) {
      console.error('Error during connection retry:', error);
      
      // Try again
      retryBackgroundConnection();
    }
  }, delay);
}

/**
 * Check if we're connected to the background script
 * @returns {Promise<boolean>} - Whether we're connected
 */
async function checkBackgroundConnection() {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ action: 'ping' }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('Connection check failed:', chrome.runtime.lastError);
          resolve(false);
        } else if (response && response.success) {
          resolve(true);
        } else {
          console.warn('Unexpected response from background script:', response);
          resolve(false);
        }
      });
      
      // Add timeout for the response
      setTimeout(() => resolve(false), 5000);
    } catch (error) {
      console.error('Error checking connection:', error);
      resolve(false);
    }
  });
}

/**
 * Detect which social media platform the current page belongs to
 * @returns {string} - The detected platform or 'unknown'
 */
function detectCurrentPlatform() {
  const url = window.location.href.toLowerCase();
  
  if (url.includes('facebook.com')) {
    return 'facebook';
  } else if (url.includes('instagram.com')) {
    return 'instagram';
  } else if (url.includes('linkedin.com')) {
    return 'linkedin';
  }
  
  return 'unknown';
}

/**
 * Set up listeners for messages from popup and background script
 */
function setupMessageListeners() {
  console.log('Setting up message listeners in content script');
  
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
      console.log('Content script received message:', message);
      
      // Ensure we don't run multiple collection operations simultaneously
      if ((message.action === 'collectPosts' || message.action === 'scrollAndCollect') && window.isCollecting) {
        console.warn('Already collecting posts, ignoring request');
        sendResponse({
          success: false,
          message: 'Another collection operation is already in progress.'
        });
        return false;
      }
      
      // Handle post collection request
      if (message.action === 'collectPosts') {
        const platform = message.platform || currentPlatform;
        console.log(`Received request to collect ${platform} posts`);
        
        // Set collecting flag
        window.isCollecting = true;
        
        // Call platform-specific collection function
        collectPostsFromPlatform(platform, message.settings)
          .then(result => {
            window.isCollecting = false;
            console.log(`Successfully collected ${result.posts?.length || 0} posts from ${platform}`);
            sendResponse(result);
          })
          .catch(error => {
            window.isCollecting = false;
            console.error(`Error collecting posts from ${platform}:`, error);
            reportError('collect_posts', error);
            sendResponse({ success: false, message: error.message });
          });
        
        // Return true to indicate async response
        return true;
      }
      
      // Handle scroll and collect request
      if (message.action === 'scrollAndCollect') {
        console.log('Received request to scroll and collect posts');
        
        // Set collecting flag
        window.isCollecting = true;
        
        // Get max scroll time from message or use default (30 seconds)
        const maxScrollTime = message.maxScrollTime || 30000;
        
        // Call the platform-specific collection function with scrolling
        collectPostsWithScrolling(currentPlatform, maxScrollTime, message.settings)
          .then(result => {
            window.isCollecting = false;
            console.log(`Successfully collected ${result.postCount} posts after scrolling`);
            sendResponse(result);
          })
          .catch(error => {
            window.isCollecting = false;
            console.error('Error during scroll and collect:', error);
            reportError('scroll_and_collect', error);
            sendResponse({ success: false, message: error.message });
          });
        
        // Return true to indicate async response
        return true;
      }
      
      // Handle ping request (used to check if content script is running)
      if (message.action === 'ping') {
        console.log('Received ping request');
        sendResponse({ 
          success: true, 
          platform: currentPlatform,
          url: window.location.href,
          timestamp: Date.now()
        });
        return false; // No async response
      }
      
      // Handle auto-scan requests
      if (message.action === 'startAutoScanning' || 
          message.action === 'stopAutoScanning' || 
          message.action === 'updateAutoScanInterval') {
        // These will be implemented by platform-specific scripts
        // Just acknowledge receipt
        sendResponse({ success: true, received: true });
        return false;
      }
      
      // If we get here, the message action wasn't recognized
      console.warn('Unknown message action:', message.action);
      sendResponse({ success: false, message: 'Unknown action' });
      return false;
    } catch (error) {
      // Handle any errors in the message listener
      console.error('Error processing message:', error);
      reportError('message_processing', error);
      
      // Return a response if we haven't already
      try {
        sendResponse({ success: false, message: 'Error processing message: ' + error.message });
      } catch (sendError) {
        console.error('Error sending response:', sendError);
      }
      
      return false;
    }
  });
}

/**
 * Collect posts with scrolling for the specified platform
 * @param {string} platform - The platform to collect from (facebook, instagram, linkedin)
 * @param {number} maxScrollTime - Maximum time to spend scrolling (ms)
 * @param {Object} settings - Collection settings
 * @returns {Promise<Object>} - Collection results
 */
async function collectPostsWithScrolling(platform, maxScrollTime, settings = {}) {
  console.log(`Collecting posts from ${platform} with scrolling (max time: ${maxScrollTime}ms)`);
  
  // Perform scrolling based on the platform
  switch (platform) {
    case 'facebook':
      if (typeof scrollAndCollectFacebook === 'function') {
        return await scrollAndCollectFacebook(maxScrollTime, settings);
      }
      break;
    
    case 'instagram':
      if (typeof scrollAndCollectInstagram === 'function') {
        return await scrollAndCollectInstagram(maxScrollTime, settings);
      }
      break;
    
    case 'linkedin':
      if (typeof scrollAndCollectLinkedIn === 'function') {
        return await scrollAndCollectLinkedIn(maxScrollTime, settings);
      }
      break;
  }
  
  // If we get here, there's no platform-specific scrolling function
  // Fall back to standard collection
  return await collectPostsFromPlatform(platform, settings);
}

/**
 * Collect posts from the specified platform
 * @param {string} platform - The platform to collect from (facebook, instagram, linkedin)
 * @param {Object} settings - Collection settings
 * @returns {Promise<Object>} - Collection results
 */
async function collectPostsFromPlatform(platform, settings = {}) {
  console.log(`Collecting posts from ${platform} with settings:`, settings);
  
  // Default response
  const defaultResponse = { 
    success: false, 
    posts: [], 
    message: 'Collection not implemented for this platform' 
  };
  
  try {
    switch (platform) {
      case 'facebook':
        // This is expected to be handled by content_fb.js
        if (typeof collectFacebookPosts === 'function') {
          return await collectFacebookPosts(settings);
        }
        return { ...defaultResponse, message: 'Facebook collection function not found' };
        
      case 'instagram':
        // This is expected to be handled by content_ig.js
        if (typeof collectInstagramPosts === 'function') {
          return await collectInstagramPosts(settings);
        }
        return { ...defaultResponse, message: 'Instagram collection function not found' };
        
      case 'linkedin':
        // This is expected to be handled by content_li.js
        if (typeof collectLinkedInPosts === 'function') {
          return await collectLinkedInPosts(settings);
        }
        return { ...defaultResponse, message: 'LinkedIn collection function not found' };
        
      default:
        return { ...defaultResponse };
    }
  } catch (error) {
    console.error(`Error in collectPostsFromPlatform(${platform}):`, error);
    reportError('collect_posts', error);
    
    return { 
      success: false, 
      posts: [], 
      message: `Error: ${error.message || 'Unknown error occurred'}` 
    };
  }
}

/**
 * Report an error to the background script
 * @param {string} context - The context in which the error occurred
 * @param {Error} error - The error object
 */
function reportError(context, error) {
  try {
    chrome.runtime.sendMessage({
      action: 'reportError',
      component: 'content_script',
      context,
      error: {
        message: error.message,
        stack: error.stack,
        timestamp: Date.now()
      }
    });
  } catch (e) {
    console.error('Failed to report error:', e);
  }
}

// Export functions for use by platform-specific scripts
window.authenticDashboard = {
  collectPostsFromPlatform,
  collectPostsWithScrolling,
  detectCurrentPlatform,
  setupMessageListeners,
  reportError,
  // Add the current platform so platform-specific scripts can access it
  currentPlatform: currentPlatform
};

// Make sure content scripts can find this information
console.log("Content script functions exposed to window.authenticDashboard");

/**
 * Set up periodic fixing of invalid extension URLs
 */
function setupInvalidUrlFixer() {
  // Check if the helper is available
  if (window.authenticDashboardHelper) {
    // Run immediately
    try {
      window.authenticDashboardHelper.fixInvalidExtensionUrls();
    } catch (error) {
      console.error('Error fixing invalid URLs:', error);
    }
    
    // Then set up a periodic check
    setInterval(() => {
      try {
        window.authenticDashboardHelper.fixInvalidExtensionUrls();
      } catch (error) {
        console.error('Error in periodic URL fixing:', error);
      }
    }, 30000); // Check every 30 seconds
  } else {
    console.warn('Extension helper not available for fixing invalid URLs');
  }
}

// End of content.js


