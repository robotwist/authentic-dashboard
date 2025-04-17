/**
 * api-client.js - API client utilities for background processing
 */

// Define recordError if not imported
function recordError(context, error) {
  console.error(`API Error (${context}):`, error);
}

class AuthenticDashboardAPI {
  constructor() {
    this.apiBaseUrl = 'http://localhost:8000';
    this.apiKey = '';
    this.isAvailable = false;
    this.lastCheck = 0;
    this.dashboardUrl = 'http://localhost:8000/dashboard/';
    
    // Define multiple possible endpoints to try
    this.endpoints = [
      'health-check/',  // Default endpoint
      'api/health/',    // Alternative endpoint
      'api/status/',    // Another alternative
      'status/',        // Simple alternative
      ''                // Try root as last resort
    ];
    
    this.workingEndpoint = this.endpoints[0];  // Start with the first endpoint
    
    // Load API key and URL from storage
    this.loadConfig();
    
    console.log('API client initialized with base URL:', this.apiBaseUrl);
  }
  
  /**
   * Load API configuration from storage
   */
  async loadConfig() {
    return new Promise((resolve) => {
      console.log('Loading API configuration from storage');
      chrome.storage.sync.get(['settings'], (result) => {
        if (result.settings) {
          if (result.settings.apiKey) {
            this.apiKey = result.settings.apiKey;
            console.log('API key loaded from storage');
          }
          
          if (result.settings.apiUrl) {
            this.apiBaseUrl = result.settings.apiUrl;
            if (!this.apiBaseUrl.endsWith('/')) {
              this.apiBaseUrl += '/';
            }
            
            // Update dashboard URL to match the same base domain
            this.dashboardUrl = `${this.apiBaseUrl}dashboard/`;
            console.log('API URL configured:', this.apiBaseUrl);
            console.log('Dashboard URL set to:', this.dashboardUrl);
          }
        }
        
        // Store the working endpoint
        chrome.storage.local.set({ 
          workingEndpoint: this.workingEndpoint 
        });
        
        console.log('Using working endpoint:', this.workingEndpoint);
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
    console.log('API key updated');
  }
  
  /**
   * Set the API base URL
   * @param {string} apiUrl - The API base URL
   */
  setApiUrl(apiUrl) {
    if (apiUrl) {
      this.apiBaseUrl = apiUrl;
      if (!this.apiBaseUrl.endsWith('/')) {
        this.apiBaseUrl += '/';
      }
      
      // Update dashboard URL to match
      this.dashboardUrl = `${this.apiBaseUrl}dashboard/`;
      console.log('API URL updated:', this.apiBaseUrl);
      console.log('Dashboard URL updated:', this.dashboardUrl);
    }
  }
  
  /**
   * Get dashboard URL
   * @returns {string} - Dashboard URL
   */
  getDashboardUrl() {
    // Ensure the URL is properly formed
    if (!this.dashboardUrl || !this.dashboardUrl.startsWith('http')) {
      console.warn('Invalid dashboard URL, using fallback');
      return 'http://localhost:8000/dashboard/';
    }
    
    console.log('Returning dashboard URL:', this.dashboardUrl);
    return this.dashboardUrl;
  }
  
  /**
   * Try all available API endpoints until one works
   * @returns {Promise<boolean>} - Promise resolving to true if any endpoint works
   */
  async tryEndpoints() {
    // List of endpoints to try (health endpoint should be first)
    const endpointsToTry = ['health', 'status', 'ping', 'api/health', 'api/status'];
    
    console.log('Trying all endpoints:', endpointsToTry);
    
    // Try each endpoint with a short timeout
    for (const endpoint of endpointsToTry) {
      try {
        const url = `${this.apiBaseUrl}/${endpoint}`;
        console.log(`Trying endpoint: ${url}`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
        
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'X-API-Key': this.apiKey,
            'Accept': 'application/json',
            'Cache-Control': 'no-cache' // Prevent caching
          },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          console.log(`Found working endpoint: ${endpoint}`);
          this.workingEndpoint = endpoint; // Remember working endpoint
          return true;
        }
        
        console.log(`Endpoint ${endpoint} failed with status: ${response.status}`);
      } catch (error) {
        if (error.name === 'AbortError') {
          console.log(`Endpoint ${endpoint} timed out after 5 seconds`);
        } else {
          console.log(`Error trying endpoint ${endpoint}:`, error.message);
        }
        // Continue trying other endpoints
      }
    }
    
    // If we reach here, all endpoints failed
    console.warn('All API endpoints failed to respond');
    return false;
  }
  
  /**
   * Check API connection status
   * @param {boolean} force - Force check even if recently checked
   * @returns {Promise<boolean>} - Promise resolving to API availability
   */
  async checkAvailability(force = false) {
    const now = Date.now();
    const CACHE_TIME = 30 * 1000; // 30 seconds (reduced from 60)
    
    console.log('Checking API availability. Last check:', new Date(this.lastCheck).toLocaleTimeString());
    
    // Don't check too frequently unless forced
    if (!force && now - this.lastCheck < CACHE_TIME && this.lastCheck > 0) {
      console.log('Using cached availability:', this.isAvailable);
      return this.isAvailable;
    }
    
    try {
      this.lastCheck = now;
      
      // Try all endpoints one by one until one works
      console.log('Testing all endpoints for availability');
      const isAvailable = await this.tryEndpoints();
      
      // Store availability status
      this.isAvailable = isAvailable;
      chrome.storage.local.set({ 
        apiAvailable: isAvailable,
        lastCheck: now,
        connectionError: isAvailable ? null : 'All endpoints failed'
      });
      
      console.log('API availability check result:', isAvailable);
      return isAvailable;
    } catch (error) {
      console.error('Error in API availability check:', error);
      
      this.isAvailable = false;
      
      // Store error information
      chrome.storage.local.set({ 
        apiAvailable: false,
        lastCheck: now,
        connectionError: error.message || 'Unknown error'
      });
      
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
      // Use the proper API endpoint structure that matches our health-check endpoint pattern
      const url = `${this.apiBaseUrl}dashboard-api/posts/`;
      console.log(`Sending ${posts.length} ${platform} posts to ${url}`);
      
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
      console.log(`Successfully sent posts. Response:`, data);
      
      // Update collection stats
      this.updateCollectionStats(platform, posts.length, data.newPosts || posts.length);
      
      return data;
    } catch (error) {
      console.error('Error sending posts to API:', error);
      // Store the error for later reporting
      chrome.storage.local.set({
        lastPostError: {
          message: error.message,
          timestamp: Date.now(),
          platform: platform
        }
      });
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

// Export to window for global availability
window.authDashboardAPI = authDashboardAPI;

/**
 * Check if the API is available
 * @returns {Promise<boolean>} - Promise resolving to API availability
 */
async function checkApiAvailability() {
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
        if (typeof recordError === 'function') {
          recordError('api', error, { component: 'api_check' });
        }
        
        // Store availability status
        chrome.storage.local.set({ apiAvailable: false });
        
        resolve(false);
      }
    });
  });
}

// Export to window for global availability
window.checkApiAvailability = checkApiAvailability; 