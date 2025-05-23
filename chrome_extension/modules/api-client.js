/**
 * api-client.js - API client utilities for background processing
 */

import { recordError } from './error_handling.js';
import { showNotification } from './notifications.js';
import { updateStats } from './stats.js';

/**
 * Get configuration from the manifest
 * @returns {Object} - Configuration object
 */
async function getManifestConfig() {
  // Try to get the manifest configuration
  const manifest = chrome.runtime.getManifest();
  const defaultConfig = {
    apiEndpoint: 'http://localhost:8000',
    defaultApiKey: '42ad72779a934c2d8005992bbecb6772'
  };

  // Check if the manifest has our custom configuration
  if (manifest && manifest.authentic_dashboard) {
    return {
      apiEndpoint: manifest.authentic_dashboard.api_endpoint || defaultConfig.apiEndpoint,
      defaultApiKey: manifest.authentic_dashboard.default_api_key || defaultConfig.defaultApiKey
    };
  }

  return defaultConfig;
}

/**
 * Check if the API is available
 * @param {boolean} forceCheck - Force a fresh check even if cached
 * @returns {Promise<boolean>} - Promise resolving to API availability
 */
export async function checkApiAvailability(forceCheck = false) {
  return new Promise(async (resolve) => {
    // Check cache first if not forcing a check
    if (!forceCheck) {
      const cached = await getCachedApiStatus();
      if (cached.hasStatus) {
        console.log('Using cached API status:', cached.isAvailable);
        return resolve(cached.isAvailable);
      }
    }

    // Get settings
    const [settings, config] = await Promise.all([
      new Promise(resolve => {
        chrome.storage.sync.get(['settings'], (result) => {
          resolve(result.settings || {});
        });
      }),
      getManifestConfig()
    ]);

    // Get API details
    const apiKey = settings.apiKey || config.defaultApiKey;
    let apiBaseUrl = settings.apiUrl || config.apiEndpoint;
      
    if (!apiBaseUrl.endsWith('/')) {
      apiBaseUrl += '/';
    }
    
    console.log(`Checking API availability at ${apiBaseUrl} with ${forceCheck ? 'forced' : 'regular'} check`);
    
    try {
      // Try multiple potential endpoints that might exist on the server
      let response = null;
      let workingEndpoint = null;
      // Prioritize the known working endpoints, checking both root and dashboard-api prefixes
      const endpoints = [
        'health-check/',
        'api/health-check/',
        'dashboard-api/health-check/',
        'dashboard/health-check/',
        'ping/',
        'api/ping/',
        'dashboard-api/ping/',
        'dashboard/ping/',
        'health/',
        'api/health/',
        ''
      ];
      
      for (const endpoint of endpoints) {
        try {
          console.log(`Trying endpoint: ${apiBaseUrl}${endpoint}`);
          response = await fetch(`${apiBaseUrl}${endpoint}`, {
            method: 'GET',
            headers: {
              'X-API-Key': apiKey,
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache'
            },
            // Add a timeout to prevent hanging on unavailable servers
            signal: AbortSignal.timeout(5000)
          });
          
          if (response.ok) {
            console.log(`API endpoint found at ${apiBaseUrl}${endpoint}`);
            workingEndpoint = endpoint;
            break; // Found a working endpoint
          }
        } catch (err) {
          // Continue trying other endpoints
          console.log(`Endpoint ${endpoint} not available (${err.message}), trying next...`);
        }
      }
      
      const isAvailable = response && response.ok;
      const timestamp = Date.now();
      
      // Store availability status and working endpoint for future use
      chrome.storage.local.set({ 
        apiAvailable: isAvailable,
        workingEndpoint: workingEndpoint,
        apiLastCheck: timestamp,
        apiBaseUrl: apiBaseUrl,
        connectionError: isAvailable ? null : 'Failed to connect to API server'
      });
      
      console.log('API connection check result:', isAvailable ? 'Connected' : 'Failed');
      resolve(isAvailable);
    } catch (error) {
      console.error('API availability check failed:', error);
      recordError('api', error, { component: 'api_check' });
      
      // Store availability status
      chrome.storage.local.set({ 
        apiAvailable: false,
        apiLastCheck: Date.now(),
        connectionError: error.message || 'Unknown connection error'
      });
      
      resolve(false);
    }
  });
}

/**
 * Get cached API status
 * @returns {Promise<Object>} Status object {hasStatus, isAvailable}
 */
async function getCachedApiStatus() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['apiAvailable', 'apiLastCheck'], (result) => {
      const now = Date.now();
      const lastCheck = result.apiLastCheck || 0;
      const CACHE_TIME = 120000; // 2 minutes
      
      // If we have a recent check, use it
      if (now - lastCheck < CACHE_TIME && typeof result.apiAvailable === 'boolean') {
        return resolve({
          hasStatus: true,
          isAvailable: result.apiAvailable
        });
      }
      
      // No recent check
      resolve({
        hasStatus: false,
        isAvailable: false
      });
    });
  });
}

/**
 * Send data to the API
 * @param {string} endpoint - API endpoint
 * @param {Object} data - Data to send
 * @param {Object} options - Request options
 * @returns {Promise<Object>} - Promise resolving to API response
 */
export async function sendToApi(endpoint, data, options = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      // Check connectivity first
      const isAvailable = await checkApiAvailability();
      if (!isAvailable && !options.ignoreAvailability) {
        throw new Error('API server is not available');
      }
      
      // Get stored settings and working endpoint
      const [settings, config, storage] = await Promise.all([
        new Promise(resolve => {
          chrome.storage.sync.get(['settings'], (result) => {
            resolve(result.settings || {});
          });
        }),
        getManifestConfig(),
        new Promise(resolve => {
          chrome.storage.local.get(['workingEndpoint', 'apiBaseUrl'], (result) => {
            resolve(result);
          });
        })
      ]);
      
      const apiKey = settings.apiKey || config.defaultApiKey;
      let apiBaseUrl = settings.apiUrl || storage.apiBaseUrl || config.apiEndpoint;
      
      if (!apiBaseUrl.endsWith('/')) {
        apiBaseUrl += '/';
      }
      
      // If the endpoint doesn't include the working endpoint prefix and we have one saved
      if (storage.workingEndpoint && !endpoint.startsWith(storage.workingEndpoint)) {
        console.log(`Using known working endpoint prefix: ${storage.workingEndpoint}`);
        // If the endpoint already has api/ or similar in it, don't add the working endpoint
        if (!endpoint.match(/^(api|dashboard|health)/) && 
            storage.workingEndpoint.match(/^(api|dashboard|health)/)) {
          endpoint = `${storage.workingEndpoint}${endpoint}`;
        }
      }
      
      console.log(`Sending ${options.method || 'POST'} request to ${apiBaseUrl}${endpoint}`);
      
      const fetchOptions = {
        method: options.method || 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        body: data ? JSON.stringify(data) : undefined
      };
      
      if (options.headers) {
        fetchOptions.headers = { ...fetchOptions.headers, ...options.headers };
      }
      
      if (options.timeout) {
        fetchOptions.signal = AbortSignal.timeout(options.timeout);
      }
      
      const response = await fetch(`${apiBaseUrl}${endpoint}`, fetchOptions);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error (${response.status}): ${errorText}`);
      }
      
      // Handle both JSON and non-JSON responses
      let responseData;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = { success: true, text: await response.text() };
      }
      
      resolve(responseData);
    } catch (error) {
      console.error(`Error sending data to API (${endpoint}):`, error);
      recordError('api', error, { component: 'api_send' });
      reject(error);
    }
  });
}

/**
 * Send collected posts to the API
 * @param {Array} posts - Array of posts to send
 * @param {string} platform - Platform name (facebook, instagram, linkedin)
 * @param {Object} options - Additional options
 * @returns {Promise} - Resolves with API response
 */
export async function sendPostsToAPI(posts, platform, options = {}) {
  return new Promise((resolve, reject) => {
    if (!posts || !Array.isArray(posts) || posts.length === 0) {
      console.log('[Authentic] No posts to send');
      resolve({ success: true, message: 'No posts to send' });
      return;
    }

    // Generate a batch ID for this upload
    const batchId = `batch_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
    
    console.log(`[Authentic] Sending ${posts.length} ${platform} posts to API (batch: ${batchId})`);

    // Send message to background script to forward to API
    chrome.runtime.sendMessage({
      action: 'sendPosts',
      platform: platform,
      posts: posts,
      batchId: batchId,
      options: options
    }, response => {
      if (chrome.runtime.lastError) {
        console.error('[Authentic] Error communicating with background script:', chrome.runtime.lastError);
        
        if (options.showNotifications) {
          showNotification(
            'Error',
            `Failed to send posts: ${chrome.runtime.lastError.message}`,
            'error'
          );
        }
        
        reject(chrome.runtime.lastError);
        return;
      }

      if (response && response.success) {
        console.log(`[Authentic] Successfully sent ${posts.length} posts to API`);
        
        // Update stats if successful
        updateStats(platform, posts.length);

        // Show success notification if enabled
        if (options.showNotifications) {
          showNotification(
            'Authentic Dashboard',
            `Successfully sent ${posts.length} posts from ${platform}.`
          );
        }

        resolve(response);
      } else {
        const error = response?.error || 'Unknown error sending posts to API';
        console.error('[Authentic] Failed to send posts to API:', error);
        
        if (options.showNotifications) {
          showNotification(
            'Error',
            `Failed to send posts: ${error}`,
            'error'
          );
        }
        
        reject(new Error(error));
      }
    });
  });
}

/**
 * Make a safe API call with error handling and retries
 * @param {string} url - API endpoint
 * @param {Object} options - Fetch options
 * @param {number} retries - Number of retries (default: 3)
 * @returns {Promise} - Resolves with API response
 */
export async function safeApiFetch(url, options, retries = 3) {
  try {
    const response = await fetch(url, options);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    if (retries > 0) {
      console.log(`[Authentic] Retrying API call, ${retries} attempts remaining`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return safeApiFetch(url, options, retries - 1);
    }
    throw error;
  }
}

/**
 * Get the API settings from storage
 * @returns {Promise<Object>} - Resolves with API settings
 */
export function getApiSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['apiKey', 'apiEndpoint'], function(result) {
      resolve({
        apiKey: result.apiKey,
        apiEndpoint: result.apiEndpoint || 'http://127.0.0.1:8000'
      });
    });
  });
} 