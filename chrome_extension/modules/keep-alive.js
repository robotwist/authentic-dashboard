/**
 * keep-alive.js - Service worker keep-alive functionality for Authentic Dashboard
 * 
 * Keeps the service worker active to prevent it from being terminated.
 */

let keepAliveInterval;
let pendingOperations = 0;
let isProcessingMessages = false;

/**
 * Start the keep-alive mechanism to prevent the service worker from becoming inactive
 * @param {Object} apiClient - API client for periodic status checks
 */
function startKeepAlive(apiClient) {
  if (!keepAliveInterval) {
    console.log("Starting background script keep-alive interval");
    keepAliveInterval = setInterval(() => {
      console.log("Background service worker keep-alive ping");
      
      // Check for stuck operations
      if (isProcessingMessages && pendingOperations > 0) {
        console.log(`Still processing ${pendingOperations} pending operations`);
      }
      
      // Check API connection status periodically
      if (apiClient && typeof apiClient.checkAvailability === 'function') {
        apiClient.checkAvailability(false);
      }
    }, 20000); // Every 20 seconds
  }
}

/**
 * Stop the keep-alive mechanism
 */
function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
    console.log("Stopped background script keep-alive interval");
  }
}

/**
 * Track active operations to prevent premature termination
 * @param {boolean} increment - Whether to increment (true) or decrement (false) the counter
 */
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

/**
 * Get the current status of operations
 * @returns {Object} - Status object with active operation count
 */
function getOperationStatus() {
  return {
    pendingOperations,
    isProcessingMessages,
    keepAliveActive: !!keepAliveInterval
  };
}

export {
  startKeepAlive,
  stopKeepAlive,
  trackOperation,
  getOperationStatus
}; 