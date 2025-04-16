/**
 * api-client.js - API client utilities for background processing
 */

import { recordError } from './error_handling.js';

/**
 * Check if the API is available
 * @returns {Promise<boolean>} - Promise resolving to API availability
 */
export async function checkApiAvailability() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['settings'], async (result) => {
      const settings = result.settings || {};
      const apiKey = settings.apiKey || '';
      let apiBaseUrl = settings.apiUrl || 'http://localhost:8000';
      
      if (!apiBaseUrl.endsWith('/')) {
        apiBaseUrl += '/';
      }
      
      console.log(`Checking API availability at ${apiBaseUrl}`);
      
      try {
        // Try multiple potential endpoints that might exist on the server
        let response = null;
        // Prioritize the known working endpoints
        const endpoints = [
          'api/health-check/',
          'health-check/',
          'ping/',
          'api/ping/',
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
                'X-API-Key': apiKey
              }
            });
            
            if (response.ok) {
              console.log(`API endpoint found at ${apiBaseUrl}${endpoint}`);
              break; // Found a working endpoint
            }
          } catch (err) {
            // Continue trying other endpoints
            console.log(`Endpoint ${endpoint} not available, trying next...`);
          }
        }
        
        const isAvailable = response && response.ok;
        
        // Store availability status
        chrome.storage.local.set({ apiAvailable: isAvailable });
        
        resolve(isAvailable);
      } catch (error) {
        console.error('API availability check failed:', error);
        recordError('api', error, { component: 'api_check' });
        
        // Store availability status
        chrome.storage.local.set({ apiAvailable: false });
        
        resolve(false);
      }
    });
  });
}

/**
 * Send data to the API
 * @param {string} endpoint - API endpoint
 * @param {Object} data - Data to send
 * @returns {Promise<Object>} - Promise resolving to API response
 */
export async function sendToApi(endpoint, data) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(['settings'], async (result) => {
      const settings = result.settings || {};
      const apiKey = settings.apiKey || '';
      let apiBaseUrl = settings.apiUrl || 'http://localhost:8000';
      
      if (!apiBaseUrl.endsWith('/')) {
        apiBaseUrl += '/';
      }
      
      try {
        const response = await fetch(`${apiBaseUrl}${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey
          },
          body: JSON.stringify(data)
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API error (${response.status}): ${errorText}`);
        }
        
        const responseData = await response.json();
        resolve(responseData);
      } catch (error) {
        console.error(`Error sending data to API (${endpoint}):`, error);
        recordError('api', error, { component: 'api_send' });
        reject(error);
      }
    });
  });
} 