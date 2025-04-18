/**
 * extension_helper.js - Helper functions for extension resource access
 */

// Store the extension ID for proper resource access
let currentExtensionId = '';

/**
 * Initialize the extension helper
 * This should be called as early as possible in content scripts
 */
function initExtensionHelper() {
  // Try to get extension ID from runtime
  try {
    chrome.runtime.sendMessage({ action: 'ping' }, response => {
      if (chrome.runtime.lastError) {
        console.warn('Extension helper initialization error:', chrome.runtime.lastError);
        return;
      }
      
      if (response && response.extensionId) {
        currentExtensionId = response.extensionId;
        console.log('Extension helper initialized with ID:', currentExtensionId);
      }
    });
  } catch (error) {
    console.error('Error initializing extension helper:', error);
  }
}

/**
 * Get the proper URL for an extension resource
 * This fixes the "chrome-extension://invalid/" errors
 * 
 * @param {string} resourcePath - Path to the resource within the extension
 * @returns {string} - Full URL to the resource
 */
function getExtensionResourceUrl(resourcePath) {
  try {
    // Always prefer the chrome.runtime.getURL method if available
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
      return chrome.runtime.getURL(resourcePath);
    }
    
    // Fallback to manually constructed URL if we have the extension ID
    if (currentExtensionId) {
      return `chrome-extension://${currentExtensionId}/${resourcePath}`;
    }
    
    // If all else fails, return the relative path and hope for the best
    console.warn('Unable to construct extension URL, missing extension ID');
    return resourcePath;
  } catch (error) {
    console.error('Error getting extension resource URL:', error);
    return resourcePath;
  }
}

/**
 * Fix any existing invalid extension URLs in the DOM
 * Useful for cleaning up after errors have occurred
 */
function fixInvalidExtensionUrls() {
  if (!currentExtensionId) {
    console.warn('Cannot fix invalid URLs: Extension ID not available');
    return;
  }
  
  try {
    // Find all elements with chrome-extension://invalid/ in their attributes
    const elements = document.querySelectorAll('[src*="chrome-extension://invalid/"], [href*="chrome-extension://invalid/"]');
    console.log(`Found ${elements.length} elements with invalid extension URLs`);
    
    elements.forEach(element => {
      // Fix src attributes
      if (element.src && element.src.includes('chrome-extension://invalid/')) {
        const path = element.src.split('chrome-extension://invalid/')[1];
        element.src = `chrome-extension://${currentExtensionId}/${path}`;
        console.log('Fixed invalid src URL:', element.src);
      }
      
      // Fix href attributes
      if (element.href && element.href.includes('chrome-extension://invalid/')) {
        const path = element.href.split('chrome-extension://invalid/')[1];
        element.href = `chrome-extension://${currentExtensionId}/${path}`;
        console.log('Fixed invalid href URL:', element.href);
      }
    });
    
    console.log('Finished fixing invalid extension URLs');
  } catch (error) {
    console.error('Error fixing invalid extension URLs:', error);
  }
}

// Initialize the helper when this script is loaded
initExtensionHelper();

// Export functions for use in content scripts
window.authenticDashboardHelper = {
  getExtensionResourceUrl,
  fixInvalidExtensionUrls,
  initExtensionHelper
}; 