/**
 * initializer.js - Central initialization module for content script features
 * 
 * This module handles setup and initialization of various content script features,
 * including display modes and error handling.
 */

import { recordError } from './error_handling.js';
import { initDisplayModeUI } from '../displayModeToggle.js';

/**
 * Initialize all content script functionality when the page is ready
 * 
 * @param {string} platform - The detected social media platform
 * @param {Function} setupMutationObserver - Function to set up platform-specific mutation observers
 * @param {Function} checkServerAvailability - Function to check API server availability 
 */
function initializeContentFeatures(platform, setupMutationObserver, checkServerAvailability) {
  console.log(`Initializing Authentic Dashboard features on ${platform}`);
  
  // Initialize error tracking
  window.addEventListener('error', function(event) {
    recordError('dom', event.error || event.message, {
      component: 'content_script',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      platform: platform
    });
  });
  
  // Check server availability
  if (typeof checkServerAvailability === 'function') {
    checkServerAvailability(function(available) {
      if (available) {
        console.log('API server is available');
      } else {
        console.warn('API server is not available, some features may not work');
        recordError('api', 'API server is not available', { 
          component: 'server_check',
          platform: platform
        });
      }
    });
  }
  
  // Initialize display mode UI if the module is available
  try {
    initDisplayModeUI();
    console.log('Display mode UI initialized');
  } catch (error) {
    console.error('Failed to initialize display mode UI:', error);
    recordError('extension', error, {
      component: 'display_mode_init',
      platform: platform
    });
  }
  
  // Set up platform-specific observers
  if (typeof setupMutationObserver === 'function') {
    try {
      setupMutationObserver();
      console.log('Mutation observer initialized');
    } catch (error) {
      console.error('Failed to initialize mutation observer:', error);
      recordError('dom', error, {
        component: 'mutation_observer_init',
        platform: platform
      });
    }
  }
  
  console.log('Authentic Dashboard initialization complete');
}

/**
 * Run initialization when document is ready
 * 
 * @param {Function} detectPlatform - Function to detect the current platform
 * @param {Function} setupMutationObserver - Function to set up platform-specific mutation observers
 * @param {Function} checkServerAvailability - Function to check API server availability
 */
function initWhenReady(detectPlatform, setupMutationObserver, checkServerAvailability) {
  const initialize = () => {
    // Detect current platform
    const platform = detectPlatform();
    if (!platform) {
      console.log('Not on a supported platform');
      return;
    }
    
    // Initialize all content features
    initializeContentFeatures(platform, setupMutationObserver, checkServerAvailability);
  };
  
  // Execute initialization when the page is fully loaded
  if (document.readyState === 'complete') {
    initialize();
  } else {
    window.addEventListener('load', initialize);
  }
}

export {
  initWhenReady,
  initializeContentFeatures
}; 