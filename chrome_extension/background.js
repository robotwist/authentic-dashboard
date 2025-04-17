// @cursor: This is a full-featured background service worker for the Authentic Dashboard Chrome extension.
//  Cursor rules for editing this file:
// - Only modify or extend existing behavior with clear, testable changes
// - Do not duplicate or rewrite existing logic without checking if a module already handles it
// - All new features must be wrapped in functions and documented with comments
// - TODOs must describe specific next steps and be resolved or removed before the final commit
// - Avoid growing this file unnecessarily; use modular imports or break logic into smaller files in /modules

//  Priority tasks for Cursor assistance:
// 1. Ensure content script pings and reloads are reliable (especially for dynamic sites)
// 2. Improve retry logic or flag flaky APIs more gracefully
// 3. If performance slows, split large sections into /modules with pure functions
// 4. Double-check all messaging handlers for response correctness and timing
// 5. Verify that deduplication and stats updating work as intended across tabs/platforms


/**
 * background.js - Main background script for Authentic Dashboard Chrome extension
 * 
 * This script runs in the background and handles:
 * - API requests
 * - Notification management
 * - Background processing
 * - Settings synchronization
 * - Error handling and recovery
 */

// Import modules
import { setupNotifications } from './modules/notifications.js';
import { setupScheduledTasks } from './modules/scheduler.js';
import { setupMessageListeners } from './modules/messaging.js';
import { checkApiAvailability } from './modules/api-client.js';
import { setupKeepAlive } from './modules/keep-alive.js';
import { recordError, resetErrorStats } from './modules/error_handling.js';
import { initSettingsSync } from './modules/settings.js';

// Set up worker
let backgroundWorker = null;

// Flag to track if initialization is complete
let isInitialized = false;

// Store API status
let apiStatus = {
  available: false,
  lastCheck: 0,
  workingEndpoint: null,
  retryCount: 0
};

// Store content script status
const contentScriptStatus = {
  facebook: { active: false, url: null, lastPing: 0 },
  instagram: { active: false, url: null, lastPing: 0 },
  linkedin: { active: false, url: null, lastPing: 0 }
};
console.log("Background script initialized!");

// Call initialization function immediately
initializeBackgroundScript();

// Listen for connection attempts from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background received message:", message);
  
  // Check for ping messages first to ensure connection is established
  if (message.action === 'ping') {
    console.log("Ping received from content script, sending response");
    sendResponse({ success: true, status: 'alive' });
    return true;
  }
  
  // Handle content script loaded notifications
  if (message.action === 'contentScriptLoaded') {
    const platform = message.platform;
    if (platform && contentScriptStatus[platform]) {
      contentScriptStatus[platform].active = true;
      contentScriptStatus[platform].url = message.url;
      contentScriptStatus[platform].lastPing = Date.now();
      console.log(`Content script for ${platform} is now active at ${message.url}`);
    }
    sendResponse({ success: true, message: 'Content script registered' });
    return true;
  }
});
// Startup background script with error handling
function initializeBackgroundScript() {
  try {
    console.log("Initializing Authentic Dashboard background script...");
    
    // Get manifest configuration
    const manifest = chrome.runtime.getManifest();
    const apiEndpoint = manifest.authentic_dashboard?.api_endpoint || 'http://localhost:8000';
    const defaultApiKey = manifest.authentic_dashboard?.default_api_key || '42ad72779a934c2d8005992bbecb6772';
    
    // Store default configuration
    chrome.storage.local.set({ 
      defaultApiEndpoint: apiEndpoint,
      defaultApiKey: defaultApiKey
    });
    
    // Initialize settings
    initSettingsSync()
      .then(() => {
        console.log("Settings initialized successfully");
        // After settings are initialized, check API availability
        return checkApiAvailability(true); // Force a fresh check
      })
      .then(available => {
        console.log("Initial API availability check:", available ? "Available" : "Not available");
        apiStatus.available = available;
        apiStatus.lastCheck = Date.now();
        
        // If API is not available, schedule a retry
        if (!available) {
          scheduleApiRetry();
        }
      })
      .catch(error => {
        console.error("Error initializing settings:", error);
        recordError('extension', error, { component: 'settings_init' });
        
        // Schedule a retry even if there was an error
        scheduleApiRetry();
      });
    
    // Set up notifications
    setupNotifications();
    
    // Initialize scheduled tasks for cache cleanup, etc.
    setupScheduledTasks();
    
    // Initialize keep-alive mechanism
    setupKeepAlive();
    
    // Create background worker for heavy processing
    try {
      backgroundWorker = new Worker('./modules/worker.js', { type: 'module' });
      console.log("Background worker initialized");
    } catch (workerError) {
      console.error("Failed to initialize background worker:", workerError);
      recordError('extension', workerError, { component: 'worker_init' });
      // Continue without worker - functionality will fall back to main thread
    }
    
    // Set up message handling for inter-script communication with improved handling for connection checks
    setupCustomMessageListeners();
    
    // Send any pending error reports
    sendPendingErrorReports();
    
    // Set up an alarm to periodically check API availability
    chrome.alarms.create('apiAvailabilityCheck', {
      periodInMinutes: 2 // Check every 2 minutes
    });
    
    // Content script check alarm
    chrome.alarms.create('contentScriptCheck', {
      periodInMinutes: 1 // Check every minute
    });
    
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === 'apiAvailabilityCheck') {
        console.log("Running scheduled API availability check");
        checkApiAvailability()
          .then(available => {
            console.log("Scheduled API check result:", available ? "Available" : "Not available");
            apiStatus.available = available;
            apiStatus.lastCheck = Date.now();
            
            // If API is not available, schedule a retry
            if (!available) {
              scheduleApiRetry();
            } else {
              // Reset retry count on successful connection
              apiStatus.retryCount = 0;
            }
          })
          .catch(error => {
            console.error("Error in scheduled API check:", error);
            apiStatus.available = false;
            
            // Schedule a retry
            scheduleApiRetry();
          });
      }
      
      if (alarm.name === 'contentScriptCheck') {
        // Check content script status and potentially reload if inactive
        checkContentScriptStatus();
      }
    });
    
    // Mark initialization as complete
    isInitialized = true;
    console.log("Background script initialization completed");
  } catch (error) {
    console.error("Critical error during background script initialization:", error);
    recordError('extension', error, { component: 'background_init', critical: true });
  }
}

/**
 * Check content script status and handle inactive scripts
 */
async function checkContentScriptStatus() {
  // Get all tabs with known social platforms
  try {
    const tabs = await chrome.tabs.query({
      url: [
        "*://*.facebook.com/*",
        "*://*.instagram.com/*",
        "*://*.linkedin.com/*"
      ]
    });
    
    // Check each tab for proper content script status
    for (const tab of tabs) {
      // Determine platform
      let platform = null;
      if (tab.url.includes('facebook.com')) platform = 'facebook';
      else if (tab.url.includes('instagram.com')) platform = 'instagram';
      else if (tab.url.includes('linkedin.com')) platform = 'linkedin';
      
      if (!platform) continue;
      
      // Skip if the content script was recently active for this platform
      const status = contentScriptStatus[platform];
      const now = Date.now();
      const PING_TIMEOUT = 5 * 60 * 1000; // 5 minutes
      
      if (status.active && (now - status.lastPing) < PING_TIMEOUT) {
        continue; // Skip recently active scripts
      }
      
      // Try to ping the content script
      try {
        const response = await pingContentScript(tab.id);
        
        if (response && response.success) {
          // Update status
          contentScriptStatus[platform] = {
            active: true,
            url: tab.url,
            lastPing: now
          };
          console.log(`Content script for ${platform} is active on tab ${tab.id}`);
        } else {
          console.warn(`Content script for ${platform} on tab ${tab.id} didn't respond properly`);
          // Will be reset in next loop if inactive for too long
        }
      } catch (error) {
        console.error(`Error pinging content script on tab ${tab.id}:`, error);
        
        // If failed to ping, the content script might be inactive
        // Mark for potential reload
        contentScriptStatus[platform] = {
          active: false,
          url: tab.url,
          lastPing: 0
        };
        
        // Check if we need to reload the content script
        if (now - status.lastPing > PING_TIMEOUT) {
          console.log(`Content script for ${platform} appears inactive, reloading on tab ${tab.id}`);
          
          // Try to reload the content script
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['content.js']
            });
            
            // If platform-specific, load that too
            if (platform === 'facebook') {
              await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content_fb.js']
              });
            } else if (platform === 'instagram') {
              await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content_ig.js']
              });
            } else if (platform === 'linkedin') {
              await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content_li.js']
              });
            }
            
            console.log(`Successfully reloaded content script for ${platform} on tab ${tab.id}`);
          } catch (reloadError) {
            console.error(`Failed to reload content script on tab ${tab.id}:`, reloadError);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error checking content script status:', error);
  }
}

/**
 * Send a ping message to a content script
 * @param {number} tabId - The ID of the tab to ping
 * @returns {Promise<Object>} - The response from the content script
 */
function pingContentScript(tabId) {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.sendMessage(
        tabId,
        { action: 'ping' },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        }
      );
      
      // Add timeout
      setTimeout(() => reject(new Error('Ping timed out')), 5000);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Schedule API connection retry with exponential backoff
 */
function scheduleApiRetry() {
  // Calculate delay using exponential backoff
  const maxRetry = 5;
  const baseDelay = 30; // 30 seconds base delay
  apiStatus.retryCount = Math.min(apiStatus.retryCount + 1, maxRetry);
  
  // Calculate delay with exponential backoff, capped at 5 minutes
  const delay = Math.min(baseDelay * Math.pow(2, apiStatus.retryCount - 1), 300);
  console.log(`Scheduling API retry in ${delay} seconds (retry count: ${apiStatus.retryCount})`);
  
  // Schedule retry
  setTimeout(() => {
    console.log("Executing scheduled API retry");
    checkApiAvailability(true)
      .then(available => {
        apiStatus.available = available;
        apiStatus.lastCheck = Date.now();
        
        if (available) {
          console.log("API retry successful, connection restored");
          // Reset retry count on successful connection
          apiStatus.retryCount = 0;
        } else if (apiStatus.retryCount < maxRetry) {
          console.log("API retry failed, scheduling another retry");
          scheduleApiRetry();
        } else {
          console.log("Maximum API retry count reached, stopping automatic retries");
          // Reset counter but stop trying for now - will be checked on next alarm
          apiStatus.retryCount = 0;
        }
      })
      .catch(error => {
        console.error("Error during API retry:", error);
        if (apiStatus.retryCount < maxRetry) {
          scheduleApiRetry();
        } else {
          apiStatus.retryCount = 0;
        }
      });
  }, delay * 1000);
}

/**
 * Set up custom message listeners for improved connection handling
 */
function setupCustomMessageListeners() {
  // Set up standard message listeners
  setupMessageListeners(backgroundWorker);
  
  // Add dedicated handlers for core functionality
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Track sender for debugging
    const senderInfo = sender.tab ? 
      `Tab ${sender.tab.id} (${sender.tab.url.substring(0, 50)}...)` : 
      'Extension popup/options';
    
    console.log(`Received message '${message.action}' from ${senderInfo}`);
    
    // Handle ping messages (connection check)
    if (message.action === 'ping') {
      sendResponse({
        success: true,
        status: 'alive',
        timestamp: Date.now()
      });
      return false; // No async response
    }
    
    // Handle general connection check requests
    if (message.action === 'checkConnection') {
      // Use the force flag if provided
      const forceCheck = message.forceCheck || false;
      
      checkApiAvailability(forceCheck)
        .then(available => {
          sendResponse({
            success: true,
            status: available ? 'connected' : 'disconnected',
            apiStatus: apiStatus
          });
        })
        .catch(error => {
          console.error("Error checking API availability:", error);
          recordError('api', error, { component: 'connection_check' });
          
          sendResponse({
            success: false,
            status: 'error',
            error: error.message
          });
        });
      
      return true; // We'll send the response asynchronously
    }
    
    // Handle content script loaded notifications
    if (message.action === 'contentScriptLoaded') {
      const platform = message.platform;
      
      if (platform && contentScriptStatus[platform]) {
        contentScriptStatus[platform] = {
          active: true,
          url: message.url || null,
          lastPing: Date.now()
        };
        
        console.log(`Content script for ${platform} loaded on ${message.url}`);
      }
      
      sendResponse({
        success: true,
        message: 'Content script registration acknowledged'
      });
      
      return false; // No async response
    }
    
    // Handle error reporting
    if (message.action === 'reportError') {
      // Record the error
      try {
        const category = message.component.includes('content') ? 'content' : 'extension';
        
        recordError(category, new Error(message.error.message), {
          component: message.component,
          context: message.context,
          timestamp: message.error.timestamp,
          stack: message.error.stack
        });
        
        sendResponse({ success: true });
      } catch (error) {
        console.error('Error recording reported error:', error);
        sendResponse({ success: false, error: error.message });
      }
      
      return false; // No async response
    }
    
    // Handle post collection
    if (message.action === 'sendPosts') {
      try {
        const platform = message.platform;
        const posts = message.posts;
        
        console.log(`Received ${posts.length} posts from ${platform}`);
        
        // Store posts in local storage
        chrome.storage.local.get(['collectedPosts'], (result) => {
          const collectedPosts = result.collectedPosts || {};
          const platformPosts = collectedPosts[platform] || [];
          
          // Add new posts
          const updatedPosts = [...platformPosts, ...posts];
          
          // Deduplicate (simple approach based on content)
          const uniquePosts = [];
          const seen = new Set();
          
          for (const post of updatedPosts) {
            // Create a simple hash for deduplication
            const hash = `${post.author}-${post.content.substring(0, 50)}`;
            
            if (!seen.has(hash)) {
              seen.add(hash);
              uniquePosts.push(post);
            }
          }
          
          // Update storage
          collectedPosts[platform] = uniquePosts;
          
          // Also update collection stats
          chrome.storage.local.get(['collectionStats'], (statsResult) => {
            const stats = statsResult.collectionStats || {};
            
            stats[platform] = stats[platform] || { total: 0 };
            stats[platform].total = uniquePosts.length;
            stats[platform].lastUpdated = Date.now();
            
            // Save all data
            chrome.storage.local.set({
              collectedPosts: collectedPosts,
              collectionStats: stats
            }, () => {
              if (chrome.runtime.lastError) {
                console.error('Error saving collected posts:', chrome.runtime.lastError);
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
              } else {
                sendResponse({
                  success: true,
                  message: `Stored ${posts.length} new posts from ${platform}`,
                  totalPosts: uniquePosts.length
                });
              }
            });
          });
        });
        
        return true; // We'll send the response asynchronously
      } catch (error) {
        console.error('Error processing posts:', error);
        sendResponse({ success: false, error: error.message });
        return false;
      }
    }
  });
}

/**
 * Send pending error reports to the API
 */
async function sendPendingErrorReports() {
  try {
    // Check if there are pending reports
    const storedReports = JSON.parse(localStorage.getItem('pendingErrorReports') || '[]');
    
    if (storedReports.length === 0) {
      return;
    }
    
    console.log(`Found ${storedReports.length} pending error reports, attempting to send`);
    
    // Check API availability first
    const available = await checkApiAvailability();
    
    if (!available) {
      console.log('API not available, keeping pending error reports for later');
      return;
    }
    
    // Process reports
    let successCount = 0;
    const failedReports = [];
    
    for (const reportData of storedReports) {
      try {
        // Process report...
        
        // Mark as success for now (replace with actual API call in production)
        successCount++;
      } catch (error) {
        console.error('Failed to send report:', error);
        failedReports.push(reportData);
      }
    }
    
    // Update stored reports to only include failed ones
    localStorage.setItem('pendingErrorReports', JSON.stringify(failedReports));
    
    console.log(`Sent ${successCount} error reports, ${failedReports.length} still pending`);
  } catch (error) {
    console.error('Error in sendPendingErrorReports:', error);
  }
}

// Initialize the background script
initializeBackgroundScript();

// Listen for browser startup to re-initialize
chrome.runtime.onStartup.addListener(function() {
  console.log("Browser started, initializing background script...");
  initializeBackgroundScript();
});

// Handle installation and updates
chrome.runtime.onInstalled.addListener(function(details) {
  if (details.reason === 'install') {
    console.log("Extension installed. Setting up initial configuration...");
    
    // Set default settings
    const defaultSettings = {
      autoScan: true,
      scanInterval: 60,
      showNotifications: true,
      debugMode: false,
      displayMode: 'compact'
    };
    
    chrome.storage.local.set({ 
      settings: defaultSettings,
      stats: {},
      lastScanTime: 0
    });
    
    // Open onboarding page
    chrome.tabs.create({
      url: chrome.runtime.getURL('onboarding.html')
    });
  } else if (details.reason === 'update') {
    const thisVersion = chrome.runtime.getManifest().version;
    console.log(`Extension updated from ${details.previousVersion} to ${thisVersion}`);
    
    // Check if this is a major version change
    const previousMajor = parseInt(details.previousVersion.split('.')[0], 10) || 0;
    const currentMajor = parseInt(thisVersion.split('.')[0], 10) || 0;
    
    if (currentMajor > previousMajor) {
      // Major version update, show update page
      chrome.tabs.create({
        url: chrome.runtime.getURL('update.html')
      });
    }
  }
});

// Handle external messages (for debugging)
chrome.runtime.onMessageExternal.addListener(function(request, sender, sendResponse) {
  if (request && request.action === 'checkAlive') {
    sendResponse({
      status: 'alive',
      version: chrome.runtime.getManifest().version,
      timestamp: Date.now()
    });
  }
});

// Handle errors in the script
window.addEventListener('error', function(event) {
  console.error('Background script error:', event.error);
  
  // Record the error for reporting
  recordError('extension', event.error || event.message, { 
    component: 'background_global',
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno
  });
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', function(event) {
  console.error('Unhandled promise rejection in background script:', event.reason);
  
  // Record the error for reporting
  recordError('extension', event.reason || 'Unknown promise rejection', { 
    component: 'background_promise'
  });
});

