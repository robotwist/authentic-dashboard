/**
 * error_handling.js - Error handling utilities
 */

// Global error recorder function
function recordError(component, error, context = {}) {
  // Make sure error is an error object
  if (!(error instanceof Error)) {
    if (typeof error === 'string') {
      error = new Error(error);
    } else {
      try {
        error = new Error(JSON.stringify(error));
      } catch (e) {
        error = new Error('Unknown error');
      }
    }
  }

  // Add context to the error
  error.context = {
    component,
    timestamp: Date.now(),
    ...context
  };

  // Log the error to console
  console.error(`[${component}] Error:`, error.message, error.context, error.stack);

  // Store in local storage for later reporting
  try {
    chrome.storage.local.get(['errors'], (result) => {
      const errors = result.errors || [];
      
      // Add the new error
      errors.push({
        component,
        message: error.message,
        stack: error.stack,
        context: error.context,
        timestamp: Date.now()
      });
      
      // Keep only the last 50 errors
      if (errors.length > 50) {
        errors.shift();
      }
      
      // Save back to storage
      chrome.storage.local.set({ errors });
    });
  } catch (storageError) {
    console.error('Error storing error:', storageError);
  }

  // Return the error for chaining
  return error;
}

// Reset error statistics
function resetErrorStats() {
  chrome.storage.local.set({ 
    errors: [],
    lastError: null
  });
}

// Make functions available globally
window.recordError = recordError;
window.resetErrorStats = resetErrorStats; 