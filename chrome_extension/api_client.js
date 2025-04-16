/**
 * api-client.js - API client utilities for background processing
 */

import { recordError } from './error_handling.js';

class AuthenticDashboardAPI {
  constructor() {
    this.apiBaseUrl = 'https://api.authenticdashboard.com/v1';
    this.apiKey = '';
    this.isAvailable = false;
    this.lastCheck = 0;
    this.dashboardUrl = 'http://localhost:8000/dashboard/';
    
    // Load API key and URL from storage
    this.loadConfig();
  }
  
  /**
   * Load API configuration from storage
   */
  async loadConfig() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['settings'], (result) => {
        if (result.settings) {
          if (result.settings.apiKey) {
            this.apiKey = result.settings.apiKey;
          }
          
          if (result.settings.apiUrl) {
            this.apiBaseUrl = result.settings.apiUrl;
            // Update dashboard URL to match the same base domain
            this.dashboardUrl = `${this.apiBaseUrl}/dashboard/`;
          }
        }
        resolve();
      });
    });
  }
  
  /**
   * Set the API key
   * @param {string} apiKey - The API key
   */
  setApiKey(apiKey) {
    this.apiKey = apiKey;
  }
  
  /**
   * Set the API base URL
   * @param {string} apiUrl - The API base URL
   */
  setApiUrl(apiUrl) {
    if (apiUrl) {
      this.apiBaseUrl = apiUrl;
      // Update dashboard URL to match
      this.dashboardUrl = `${this.apiBaseUrl}/dashboard/`;
    }
  }
  
  /**
   * Get dashboard URL
   * @returns {string} - Dashboard URL
   */
  getDashboardUrl() {
    return this.dashboardUrl || 'http://localhost:8000/dashboard/';
  }
  
  /**
   * Check if the API is available
   * @param {boolean} force - Force check even if recently checked
   * @returns {Promise<boolean>} - Promise resolving to API availability
   */
  async checkAvailability(force = false) {
    const now = Date.now();
    const CACHE_TIME = 5 * 60 * 1000; // 5 minutes
    
    // Don't check too frequently unless forced
    if (!force && now - this.lastCheck < CACHE_TIME) {
      return this.isAvailable;
    }
    
    try {
      this.lastCheck = now;
      
      // Try multiple potential endpoints that might exist on the server
      let response;
      const endpoints = ['/ping', '/api/ping', '/health', '/api/health', '/'];
      
      for (const endpoint of endpoints) {
        try {
          response = await fetch(`${this.apiBaseUrl}${endpoint}`, {
            method: 'GET',
            headers: {
              'X-API-Key': this.apiKey
            }
          });
          
          if (response.ok) {
            break; // Found a working endpoint
          }
        } catch (err) {
          // Continue trying other endpoints
          console.log(`Endpoint ${endpoint} not available, trying next...`);
        }
      }
      
      this.isAvailable = response && response.ok;
      
      // Store availability status
      chrome.storage.local.set({ apiAvailable: this.isAvailable });
      
      return this.isAvailable;
    } catch (error) {
      console.error('API availability check failed:', error);
      this.isAvailable = false;
      
      // Store availability status
      chrome.storage.local.set({ apiAvailable: false });
      
      return false;
    }
  }
  
  /**
   * Send collected posts to the API
   * @param {Array} posts - Array of post objects
   * @param {string} platform - Platform name (facebook, instagram, linkedin)
   * @param {string} batchId - Batch ID for this upload
   * @returns {Promise} - Promise resolving to API response
   */
  async sendPosts(posts, platform, batchId) {
    if (!this.apiKey) {
      await this.loadConfig();
      if (!this.apiKey) {
        throw new Error('API key not configured');
      }
    }
    
    try {
      const url = `${this.apiBaseUrl}/posts`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
          'X-Platform': platform,
          'X-Batch-ID': batchId
        },
        body: JSON.stringify({ posts })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error (${response.status}): ${errorText}`);
      }
      
      const data = await response.json();
      
      // Update collection stats
      this.updateCollectionStats(platform, posts.length, data.newPosts || 0);
      
      return data;
    } catch (error) {
      console.error('Error sending posts to API:', error);
      throw error;
    }
  }
  
  /**
   * Make a generic API call
   * @param {string} endpoint - API endpoint (without base URL)
   * @param {Object} options - Request options
   * @returns {Promise} - Promise resolving to API response
   */
  async callApi(endpoint, options = {}) {
    if (!this.apiKey) {
      await this.loadConfig();
      if (!this.apiKey) {
        throw new Error('API key not configured');
      }
    }
    
    const url = `${this.apiBaseUrl}/${endpoint.replace(/^\//, '')}`;
    
    const headers = {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
      ...options.headers
    };
    
    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error (${response.status}): ${errorText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error(`Error calling API (${endpoint}):`, error);
      throw error;
    }
  }
  
  /**
   * Update collection statistics
   * @param {string} platform - Platform name
   * @param {number} totalCount - Total posts processed
   * @param {number} newCount - New posts added
   */
  updateCollectionStats(platform, totalCount, newCount) {
    chrome.storage.local.get(['collectionStats'], (result) => {
      const stats = result.collectionStats || {};
      
      // Initialize platform stats if not exist
      if (!stats[platform]) {
        stats[platform] = {
          total: 0,
          today: 0,
          lastCollection: null
        };
      }
      
      // Update stats
      stats[platform].total += newCount;
      stats[platform].today += newCount;
      stats[platform].lastCollection = new Date().toISOString();
      
      // Store updated stats
      chrome.storage.local.set({ collectionStats: stats });
    });
  }
}

// Create and export a singleton instance
const authDashboardAPI = new AuthenticDashboardAPI();
export default authDashboardAPI;

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