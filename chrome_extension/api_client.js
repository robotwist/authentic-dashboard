/**
 * api_client.js - Centralized API client for Authentic Dashboard Chrome Extension
 * 
 * This module handles all API interactions with the backend server,
 * providing a consistent interface and centralized error handling.
 */

class AuthenticDashboardAPI {
  constructor() {
    // Default configuration
    this.config = {
      baseEndpoints: [
        'http://localhost:8000',
        'http://127.0.0.1:8000',
        'http://0.0.0.0:8000'
      ],
      currentEndpoint: 'http://localhost:8000',
      apiKey: '',
      available: false,
      lastCheck: 0,
      retryCount: 3,
      backoffDelay: 1000, // Initial retry delay in ms
      maxBackoffDelay: 30000 // Maximum retry delay in ms
    };
    
    // Initialize the client
    this.initialize();
  }
  
  /**
   * Initialize the API client by loading stored configuration
   */
  initialize() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['apiEndpoint', 'apiKey', 'apiAvailable', 'apiLastCheck'], (result) => {
        if (result.apiEndpoint) {
          this.config.currentEndpoint = result.apiEndpoint;
        }
        
        if (result.apiKey) {
          this.config.apiKey = result.apiKey;
        }
        
        if (result.apiAvailable !== undefined) {
          this.config.available = result.apiAvailable;
        }
        
        if (result.apiLastCheck) {
          this.config.lastCheck = result.apiLastCheck;
        }
        
        console.log('API Client initialized with endpoint:', this.config.currentEndpoint);
        resolve(this.config);
      });
    });
  }
  
  /**
   * Get the current API configuration
   */
  getConfig() {
    return this.config;
  }
  
  /**
   * Set a new API endpoint
   */
  setEndpoint(endpoint) {
    this.config.currentEndpoint = endpoint;
    
    return new Promise((resolve) => {
      chrome.storage.local.set({ apiEndpoint: endpoint }, () => {
        console.log('API Endpoint updated to:', endpoint);
        resolve(endpoint);
      });
    });
  }
  
  /**
   * Set a new API key
   */
  setApiKey(apiKey) {
    this.config.apiKey = apiKey;
    
    return new Promise((resolve) => {
      chrome.storage.local.set({ apiKey: apiKey }, () => {
        console.log('API Key updated');
        resolve(apiKey);
      });
    });
  }
  
  /**
   * Check if the API server is available
   * @param {boolean} forceCheck - Force a new check regardless of cached status
   */
  checkAvailability(forceCheck = false) {
    return new Promise((resolve) => {
      const now = Date.now();
      const fiveMinutesAgo = now - (5 * 60 * 1000);
      
      // Use cached result if available and recent
      if (!forceCheck && this.config.lastCheck > fiveMinutesAgo && this.config.available !== undefined) {
        console.log("Using cached API availability result:", this.config.available);
        resolve({
          available: this.config.available,
          endpoint: this.config.currentEndpoint,
          apiKey: this.config.apiKey,
          fromCache: true
        });
        return;
      }
      
      // Check the current endpoint
      this.healthCheck(this.config.currentEndpoint)
        .then(available => {
          // If current endpoint is available, update status and return
          if (available) {
            this.updateAvailabilityStatus(true, this.config.currentEndpoint);
            resolve({
              available: true,
              endpoint: this.config.currentEndpoint,
              apiKey: this.config.apiKey,
              fromCache: false
            });
            return;
          }
          
          // Try alternative endpoints if the current one fails
          this.tryAlternativeEndpoints()
            .then(result => {
              resolve({
                available: result.available,
                endpoint: result.endpoint || this.config.currentEndpoint,
                apiKey: this.config.apiKey,
                fromCache: false
              });
            });
        });
    });
  }
  
  /**
   * Try all alternative endpoints if the primary one fails
   */
  tryAlternativeEndpoints() {
    return new Promise((resolve) => {
      const currentEndpoint = this.config.currentEndpoint;
      const alternatives = this.config.baseEndpoints.filter(endpoint => endpoint !== currentEndpoint);
      
      // Function to try each endpoint sequentially
      const tryEndpoint = async (index) => {
        if (index >= alternatives.length) {
          // All alternatives failed
          this.updateAvailabilityStatus(false);
          resolve({ available: false });
          return;
        }
        
        const endpoint = alternatives[index];
        const available = await this.healthCheck(endpoint);
        
        if (available) {
          // We found a working alternative
          this.updateAvailabilityStatus(true, endpoint);
          
          // Notify that we switched endpoints
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon48.png',
            title: 'API Endpoint Changed',
            message: `Connected to alternative endpoint: ${endpoint}`
          });
          
          resolve({ available: true, endpoint });
        } else {
          // Try next alternative
          tryEndpoint(index + 1);
        }
      };
      
      // Start the sequential check
      tryEndpoint(0);
    });
  }
  
  /**
   * Update the availability status in memory and storage
   */
  updateAvailabilityStatus(available, endpoint = null) {
    const now = Date.now();
    
    this.config.available = available;
    this.config.lastCheck = now;
    
    if (endpoint) {
      this.config.currentEndpoint = endpoint;
    }
    
    // Update storage
    chrome.storage.local.set({
      apiAvailable: available,
      apiLastCheck: now,
      apiEndpoint: endpoint || this.config.currentEndpoint
    });
    
    // Update badge
    if (available) {
      chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
      chrome.action.setBadgeText({ text: '✓' });
      
      setTimeout(() => {
        chrome.action.setBadgeText({ text: '' });
      }, 5000);
    } else {
      chrome.action.setBadgeBackgroundColor({ color: '#F44336' });
      chrome.action.setBadgeText({ text: '!' });
    }
  }
  
  /**
   * Perform a health check on a specific endpoint
   */
  healthCheck(endpoint) {
    return new Promise((resolve) => {
      console.log(`Testing API endpoint: ${endpoint}`);
      
      fetch(`${endpoint}/api/health-check/`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.config.apiKey || ''
        }
      })
      .then(response => {
        resolve(response.ok);
      })
      .catch(() => {
        resolve(false);
      });
    });
  }
  
  /**
   * Verify an API key with the server
   */
  verifyApiKey(apiKey) {
    return this.request('/api/verify-key/', {
      method: 'GET',
      headers: {
        'X-API-Key': apiKey
      }
    });
  }
  
  /**
   * Send posts to the server
   */
  sendPosts(posts, platform) {
    if (!posts || posts.length === 0) {
      return Promise.resolve({
        success: false,
        message: 'No posts provided'
      });
    }
    
    const promises = posts.map(post => this.sendPost(post));
    
    return Promise.allSettled(promises)
      .then(results => {
        const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
        const failed = results.length - successful;
        
        return {
          success: successful > 0,
          successCount: successful,
          failedCount: failed,
          total: results.length
        };
      });
  }
  
  /**
   * Send a single post to the server
   */
  sendPost(post) {
    return this.request('/api/post/', {
      method: 'POST',
      body: JSON.stringify(post)
    });
  }
  
  /**
   * Process a post with ML
   */
  processML(post) {
    return this.request('/api/process-ml/', {
      method: 'POST',
      body: JSON.stringify(post)
    });
  }
  
  /**
   * Log user behavior
   */
  logBehavior(behavior) {
    return this.request('/api/log/behavior/', {
      method: 'POST',
      body: JSON.stringify(behavior)
    });
  }
  
  /**
   * Get post statistics
   */
  getPostStats() {
    return this.request('/api/post-stats/');
  }
  
  /**
   * Generic request method with retries and error handling
   */
  request(path, options = {}, retryCount = 0) {
    return new Promise((resolve, reject) => {
      // First check if API is available
      this.checkAvailability().then(status => {
        if (!status.available) {
          reject({
            success: false,
            message: 'API server is not available'
          });
          return;
        }
        
        // Prepare the request
        const url = `${this.config.currentEndpoint}${path}`;
        
        // Set default headers
        const headers = options.headers || {};
        headers['Content-Type'] = headers['Content-Type'] || 'application/json';
        
        // Always include API key if available
        if (this.config.apiKey && !headers['X-API-Key']) {
          headers['X-API-Key'] = this.config.apiKey;
        }
        
        // Merge options
        const fetchOptions = {
          ...options,
          headers
        };
        
        // Make the request
        fetch(url, fetchOptions)
          .then(async response => {
            // Try to parse JSON response
            let data;
            try {
              data = await response.json();
            } catch (e) {
              data = { success: false, message: 'Invalid JSON response' };
            }
            
            // Handle response based on status code
            if (response.ok) {
              resolve({
                success: true,
                ...data
              });
            } else if (response.status === 401) {
              // Authentication error
              reject({
                success: false,
                message: 'Authentication failed. Please check your API key.',
                statusCode: 401,
                ...data
              });
            } else if (response.status === 429) {
              // Rate limiting
              if (retryCount < this.config.retryCount) {
                // Calculate backoff delay with exponential increase
                const delay = Math.min(
                  this.config.backoffDelay * Math.pow(2, retryCount),
                  this.config.maxBackoffDelay
                );
                
                console.log(`Rate limited. Retrying in ${delay}ms (attempt ${retryCount + 1}/${this.config.retryCount})`);
                
                // Wait and retry
                setTimeout(() => {
                  this.request(path, options, retryCount + 1)
                    .then(resolve)
                    .catch(reject);
                }, delay);
              } else {
                reject({
                  success: false,
                  message: 'Rate limit exceeded. Try again later.',
                  statusCode: 429,
                  ...data
                });
              }
            } else if (response.status >= 500) {
              // Server error
              if (retryCount < this.config.retryCount) {
                // Calculate backoff delay with exponential increase
                const delay = Math.min(
                  this.config.backoffDelay * Math.pow(2, retryCount),
                  this.config.maxBackoffDelay
                );
                
                console.log(`Server error. Retrying in ${delay}ms (attempt ${retryCount + 1}/${this.config.retryCount})`);
                
                // Wait and retry
                setTimeout(() => {
                  this.request(path, options, retryCount + 1)
                    .then(resolve)
                    .catch(reject);
                }, delay);
              } else {
                reject({
                  success: false,
                  message: 'Server error. Please try again later.',
                  statusCode: response.status,
                  ...data
                });
              }
            } else {
              // Other errors
              reject({
                success: false,
                message: data.message || `Error: ${response.status}`,
                statusCode: response.status,
                ...data
              });
            }
          })
          .catch(error => {
            console.error('Fetch error:', error);
            
            // Network error or other exception
            if (retryCount < this.config.retryCount) {
              // Calculate backoff delay with exponential increase
              const delay = Math.min(
                this.config.backoffDelay * Math.pow(2, retryCount),
                this.config.maxBackoffDelay
              );
              
              console.log(`Network error. Retrying in ${delay}ms (attempt ${retryCount + 1}/${this.config.retryCount})`);
              
              // Wait and retry
              setTimeout(() => {
                this.request(path, options, retryCount + 1)
                  .then(resolve)
                  .catch(reject);
              }, delay);
            } else {
              // Check if we should try an alternative endpoint
              this.tryAlternativeEndpoints()
                .then(result => {
                  if (result.available) {
                    // Retry with new endpoint
                    this.request(path, options, 0)
                      .then(resolve)
                      .catch(reject);
                  } else {
                    reject({
                      success: false,
                      message: 'Network error. Could not connect to any server.',
                      error: error.message
                    });
                  }
                });
            }
          });
      });
    });
  }
}

// Create a singleton instance
const apiClient = new AuthenticDashboardAPI();

// Export the singleton
window.authDashboardAPI = apiClient; 