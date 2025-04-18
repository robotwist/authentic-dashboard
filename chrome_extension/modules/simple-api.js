/**
 * simple-api.js - Simplified API client without dependencies
 */

/**
 * Check if the API is available by making a request to the health endpoint
 * @param {boolean} forceCheck - Whether to force a fresh check
 * @returns {Promise<boolean>} - Promise that resolves to whether the API is available
 */
export async function checkApiAvailability(forceCheck = false) {
  console.log("Checking API availability");
  
  try {
    // Get API endpoint from storage
    const result = await chrome.storage.local.get(['apiEndpoint']);
    const apiEndpoint = result.apiEndpoint || 'http://localhost:8000';
    
    // Add a timestamp to prevent caching
    const url = `${apiEndpoint}/api/health/?t=${Date.now()}`;
    
    // Make request with timeout
    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    }, 5000);
    
    // Check if response is OK
    if (response.ok) {
      const data = await response.json();
      return data.status === 'ok';
    }
    
    return false;
  } catch (error) {
    console.error("API availability check failed:", error);
    return false;
  }
}

/**
 * Make a fetch request with a timeout
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<Response>} - Response promise
 */
async function fetchWithTimeout(url, options, timeout = 5000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
} 