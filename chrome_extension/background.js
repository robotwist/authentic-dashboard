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

// Startup background script with error handling
function initializeBackgroundScript() {
  try {
    console.log("Initializing Authentic Dashboard background script...");
    
    // Initialize settings
    initSettingsSync()
      .then(() => console.log("Settings initialized successfully"))
      .catch(error => {
        console.error("Error initializing settings:", error);
        recordError('extension', error, { component: 'settings_init' });
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
    
    // Set up message handling for inter-script communication
    setupMessageListeners(backgroundWorker);
    
    // Check API availability on startup
    checkApiAvailability()
      .then(available => {
        if (available) {
          console.log("API is available and responding");
          
          // Reset error stats as we have a successful connection
          resetErrorStats('api');
        } else {
          console.warn("API is not responding correctly");
          recordError('api', "API is not responding correctly on startup", { component: 'api_check' });
        }
      })
      .catch(error => {
        console.error("Error checking API availability:", error);
        recordError('api', error, { component: 'api_check' });
      });
    
    // Send any pending error reports
    sendPendingErrorReports();
    
    console.log("Background script initialization completed");
  } catch (error) {
    console.error("Critical error during background script initialization:", error);
    recordError('extension', error, { component: 'background_init', critical: true });
  }
}

/**
 * Attempt to send any pending error reports that weren't sent previously
 */
function sendPendingErrorReports() {
  chrome.storage.local.get(['pendingErrorReports', 'apiKey', 'apiEndpoint'], function(result) {
    const pendingReports = result.pendingErrorReports || [];
    const apiKey = result.apiKey;
    const apiEndpoint = result.apiEndpoint || 'http://localhost:8000';
    
    if (pendingReports.length === 0) {
      console.log("No pending error reports to send");
      return;
    }
    
    console.log(`Attempting to send ${pendingReports.length} pending error reports`);
    
    // Clone reports array so we can modify it
    const reports = [...pendingReports];
    let successCount = 0;
    
    // Process reports sequentially
    function processNextReport(index) {
      if (index >= reports.length) {
        // All reports processed
        console.log(`Successfully sent ${successCount} of ${reports.length} pending error reports`);
        
        // Update storage with remaining reports
        chrome.storage.local.set({ pendingErrorReports: pendingReports.filter(r => 
          !reports.find(sent => sent.timestamp === r.timestamp)) 
        });
        return;
      }
      
      const reportData = reports[index];
      
      fetch(`${apiEndpoint}/api/error-report/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        body: JSON.stringify({
          report: reportData.report,
          extension_version: chrome.runtime.getManifest().version,
          browser: navigator.userAgent,
          timestamp: reportData.timestamp || Date.now()
        })
      })
      .then(response => {
        if (!response.ok) {
          throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        return response.json();
      })
      .then(data => {
        console.log(`Successfully sent report from ${new Date(reportData.timestamp).toLocaleString()}`);
        successCount++;
        
        // Process next report
        processNextReport(index + 1);
      })
      .catch(error => {
        console.error(`Failed to send report ${index + 1}/${reports.length}:`, error);
        
        // Continue with next report
        processNextReport(index + 1);
      });
    }
    
    // Start processing reports
    processNextReport(0);
  });
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