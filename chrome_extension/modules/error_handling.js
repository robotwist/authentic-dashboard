/**
 * Authentic Dashboard - Error Handling Module
 * 
 * Provides robust error handling, tracking, and recovery mechanisms for the extension.
 */

// Store errors for monitoring and reporting
const errorRegistry = {
  // Server communication errors
  api: {
    count: 0,
    lastError: null,
    lastTimestamp: null,
    retries: 0,
    recoveries: 0,
    rateLimited: 0
  },
  // Background script messaging errors
  messaging: {
    count: 0,
    lastError: null,
    lastTimestamp: null,
    disconnects: 0,
    reconnects: 0
  },
  // DOM operations and content script errors
  dom: {
    count: 0,
    lastError: null,
    lastTimestamp: null,
    selectors: {}
  },
  // Permissions related errors
  permissions: {
    count: 0,
    lastError: null,
    lastTimestamp: null
  },
  // Authentication errors
  auth: {
    count: 0,
    lastError: null,
    lastTimestamp: null
  },
  // General extension errors
  extension: {
    count: 0,
    lastError: null,
    lastTimestamp: null,
    crashes: 0
  }
};

/**
 * Record an error to the registry
 * 
 * @param {string} category - Error category (api, messaging, dom, etc.)
 * @param {Error|string} error - The error object or message
 * @param {Object} metadata - Additional data to record with the error
 * @returns {Object} - The updated error registry entry
 */
function recordError(category, error, metadata = {}) {
  if (!errorRegistry[category]) {
    errorRegistry[category] = {
      count: 0,
      lastError: null,
      lastTimestamp: null
    };
  }
  
  const entry = errorRegistry[category];
  entry.count++;
  entry.lastError = error instanceof Error ? error.message : error;
  entry.lastTimestamp = Date.now();
  
  // Add any additional metadata properties
  Object.keys(metadata).forEach(key => {
    if (key !== 'count' && key !== 'lastError' && key !== 'lastTimestamp') {
      if (typeof metadata[key] === 'number' && typeof entry[key] === 'number') {
        entry[key] += metadata[key];
      } else {
        entry[key] = metadata[key];
      }
    }
  });
  
  // Log the error
  console.error(`[${category}] Error:`, error, metadata);
  
  // If we have too many errors in a short time, trigger recovery
  const THRESHOLD = 5;
  const TIME_WINDOW = 60 * 1000; // 1 minute
  
  if (entry.count >= THRESHOLD && 
      (entry.lastRecoveryTimestamp === undefined || 
       (entry.lastTimestamp - entry.lastRecoveryTimestamp) > TIME_WINDOW)) {
    entry.lastRecoveryTimestamp = entry.lastTimestamp;
    triggerRecovery(category, entry);
  }
  
  // Return the updated entry
  return entry;
}

/**
 * Trigger recovery actions for persistent errors
 * 
 * @param {string} category - Error category
 * @param {Object} entry - The error registry entry
 */
function triggerRecovery(category, entry) {
  console.warn(`Triggering recovery for persistent ${category} errors`);
  
  switch (category) {
    case 'api':
      // Reset API connection state
      try {
        chrome.runtime.sendMessage({
          action: 'resetApiConnection'
        });
        entry.recoveryAttempted = true;
      } catch (e) {
        console.error('Failed to trigger API recovery:', e);
      }
      break;
      
    case 'messaging':
      // Try to restart the background script
      try {
        console.warn('Attempting to wake service worker due to persistent messaging errors');
        chrome.runtime.sendMessage({ action: 'ping' });
        entry.recoveryAttempted = true;
      } catch (e) {
        console.error('Failed to trigger messaging recovery:', e);
      }
      break;
      
    case 'dom':
      // Clear any cached selectors and force refresh
      try {
        entry.selectors = {};
        entry.recoveryAttempted = true;
        console.warn('DOM selectors reset due to persistent errors');
      } catch (e) {
        console.error('Failed to trigger DOM recovery:', e);
      }
      break;
      
    case 'auth':
      // Trigger re-authentication
      try {
        chrome.runtime.sendMessage({
          action: 'requireReauthentication',
          reason: 'Persistent authentication errors'
        });
        entry.recoveryAttempted = true;
      } catch (e) {
        console.error('Failed to trigger auth recovery:', e);
      }
      break;
      
    default:
      // Generic recovery - send diagnostic info
      try {
        sendErrorReport(category, entry);
        entry.recoveryAttempted = true;
      } catch (e) {
        console.error('Failed to send error report:', e);
      }
  }
}

/**
 * Create a structured error report
 * 
 * @param {string} category - Error category
 * @param {Object} entry - The error registry entry
 * @returns {Object} - Structured error report
 */
function createErrorReport(category, entry) {
  return {
    category,
    count: entry.count,
    lastError: entry.lastError,
    lastTimestamp: entry.lastTimestamp,
    browserInfo: navigator.userAgent,
    url: window.location.href,
    extensionVersion: chrome.runtime.getManifest().version,
    errorRegistry: JSON.parse(JSON.stringify(errorRegistry))
  };
}

/**
 * Send error report to the backend
 * 
 * @param {string} category - Error category
 * @param {Object} entry - The error registry entry
 */
function sendErrorReport(category, entry) {
  const report = createErrorReport(category, entry);
  
  try {
    // Use a direct fetch to avoid circular dependencies with the error handling system
    chrome.runtime.sendMessage({
      action: 'sendErrorReport',
      report
    });
    
    console.log(`Error report sent for ${category} errors`);
  } catch (e) {
    console.error('Failed to send error report:', e);
    
    // Store locally if we can't send immediately
    try {
      const storedReports = JSON.parse(localStorage.getItem('pendingErrorReports') || '[]');
      storedReports.push({
        timestamp: Date.now(),
        report
      });
      
      // Keep only the last 10 reports to avoid excessive storage
      if (storedReports.length > 10) {
        storedReports.splice(0, storedReports.length - 10);
      }
      
      localStorage.setItem('pendingErrorReports', JSON.stringify(storedReports));
    } catch (storageError) {
      console.error('Failed to store error report locally:', storageError);
    }
  }
}

/**
 * Create an error handler function for async operations
 * 
 * @param {string} category - Error category
 * @param {string} operation - The operation name
 * @param {Function} fallback - Optional fallback function to call on error
 * @returns {Function} - Error handler function
 */
function createErrorHandler(category, operation, fallback = null) {
  return (error) => {
    const metadata = { operation };
    
    recordError(category, error, metadata);
    
    if (typeof fallback === 'function') {
      try {
        return fallback(error);
      } catch (fallbackError) {
        console.error('Error in fallback handler:', fallbackError);
      }
    }
    
    // Return a consistent error structure
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      errorCategory: category,
      errorOperation: operation,
      timestamp: Date.now()
    };
  };
}

/**
 * Get the current error registry state
 * 
 * @returns {Object} - Copy of the error registry
 */
function getErrorStats() {
  return JSON.parse(JSON.stringify(errorRegistry));
}

/**
 * Reset error counters for a category or all categories
 * 
 * @param {string} category - Optional category to reset, or null for all
 */
function resetErrorStats(category = null) {
  if (category && errorRegistry[category]) {
    errorRegistry[category].count = 0;
    errorRegistry[category].lastRecoveryTimestamp = null;
  } else if (!category) {
    // Reset all categories
    Object.keys(errorRegistry).forEach(cat => {
      errorRegistry[cat].count = 0;
      errorRegistry[cat].lastRecoveryTimestamp = null;
    });
  }
}

/**
 * Check if we're experiencing a specific category of errors
 * 
 * @param {string} category - Error category to check
 * @param {number} threshold - Number of errors that constitutes a problem
 * @param {number} timeWindow - Time window in milliseconds to check
 * @returns {boolean} - True if we're having problems with this category
 */
function isExperiencingErrors(category, threshold = 3, timeWindow = 5 * 60 * 1000) {
  if (!errorRegistry[category]) return false;
  
  const entry = errorRegistry[category];
  const now = Date.now();
  
  return entry.count >= threshold && 
         entry.lastTimestamp && 
         (now - entry.lastTimestamp) < timeWindow;
}

// Export functions
export {
  recordError,
  createErrorHandler,
  getErrorStats,
  resetErrorStats,
  isExperiencingErrors,
  sendErrorReport,
  errorRegistry
}; 