/**
 * stats.js - Statistics tracking for Authentic Dashboard
 * 
 * Handles tracking and management of usage statistics.
 */

/**
 * Track statistics for post collection
 * @param {string} platform - Platform name (instagram, facebook, linkedin)
 * @param {number} count - Number of posts collected
 */
function updateStats(platform, count) {
  const today = new Date().toISOString().split('T')[0];
  
  chrome.storage.local.get(['stats'], function(result) {
    let stats = result.stats || {};
    
    if (!stats[today]) {
      stats[today] = {
        totalPosts: 0,
        platforms: {}
      };
    }
    
    if (!stats[today].platforms[platform]) {
      stats[today].platforms[platform] = 0;
    }
    
    stats[today].totalPosts += count;
    stats[today].platforms[platform] += count;
    
    // Limit stats to last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
    
    for (const day in stats) {
      if (day < thirtyDaysAgoStr) {
        delete stats[day];
      }
    }
    
    chrome.storage.local.set({ stats: stats });
  });
}

/**
 * Get all statistics
 * @returns {Promise} - Resolves with stats object
 */
function getStats() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['stats'], function(result) {
      resolve(result.stats || {});
    });
  });
}

/**
 * Scheduled cache cleanup to prevent excessive storage use
 */
function scheduledCacheCleanup() {
  console.log("Starting scheduled cache cleanup...");
  
  chrome.storage.local.get(
    ['processedFingerprints', 'processedPosts', 'stats', 'apiTelemetry'], 
    function(result) {
      const now = Date.now();
      const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;  // One week in milliseconds
      const ONE_MONTH = 30 * 24 * 60 * 60 * 1000; // One month in milliseconds
      let cleanupStats = {
        fingerprintsRemoved: 0,
        postsRemoved: 0,
        statsDaysRemoved: 0,
        telemetryEntriesRemoved: 0
      };
      
      // Clean up fingerprints older than a week
      if (result.processedFingerprints) {
        const updatedFingerprints = {};
        let count = 0;
        
        // Keep only fingerprints from the last week
        Object.entries(result.processedFingerprints).forEach(([fingerprint, timestamp]) => {
          if (now - timestamp < ONE_WEEK) {
            updatedFingerprints[fingerprint] = timestamp;
            count++;
          } else {
            cleanupStats.fingerprintsRemoved++;
          }
        });
        
        chrome.storage.local.set({processedFingerprints: updatedFingerprints});
        console.log(`Cleaned up fingerprints: kept ${count}, removed ${cleanupStats.fingerprintsRemoved}`);
      }
      
      // Clean up processed posts
      if (result.processedPosts) {
        // Keep only the most recent 1000 posts
        const MAX_POSTS = 1000;
        const posts = Object.entries(result.processedPosts);
        
        if (posts.length > MAX_POSTS) {
          // Sort by recency if we have timestamps, otherwise just take the last 1000
          const updatedPosts = {};
          const postsToKeep = posts.slice(-MAX_POSTS);
          
          postsToKeep.forEach(([id, value]) => {
            updatedPosts[id] = value;
          });
          
          cleanupStats.postsRemoved = posts.length - postsToKeep.length;
          chrome.storage.local.set({processedPosts: updatedPosts});
          console.log(`Cleaned up processed posts: kept ${postsToKeep.length}, removed ${cleanupStats.postsRemoved}`);
        } else {
          console.log(`Processed posts (${posts.length}) under threshold, no cleanup needed`);
        }
      }
      
      // Clean up old stats data (keep only last month)
      if (result.stats) {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
        
        const updatedStats = {...result.stats};
        
        for (const day in updatedStats) {
          if (day < thirtyDaysAgoStr) {
            delete updatedStats[day];
            cleanupStats.statsDaysRemoved++;
          }
        }
        
        if (cleanupStats.statsDaysRemoved > 0) {
          chrome.storage.local.set({stats: updatedStats});
          console.log(`Cleaned up stats: removed ${cleanupStats.statsDaysRemoved} days older than ${thirtyDaysAgoStr}`);
        }
      }
      
      // Clean up API telemetry data
      if (result.apiTelemetry && result.apiTelemetry.recentCalls) {
        const MAX_TELEMETRY = 50;
        const calls = result.apiTelemetry.recentCalls;
        
        if (calls.length > MAX_TELEMETRY) {
          const updatedTelemetry = {...result.apiTelemetry};
          updatedTelemetry.recentCalls = calls.slice(-MAX_TELEMETRY);
          
          cleanupStats.telemetryEntriesRemoved = calls.length - MAX_TELEMETRY;
          chrome.storage.local.set({apiTelemetry: updatedTelemetry});
          console.log(`Cleaned up API telemetry: kept ${MAX_TELEMETRY}, removed ${cleanupStats.telemetryEntriesRemoved}`);
        }
      }
      
      // Log summary of cleanup
      console.log("Cache cleanup completed:", cleanupStats);
      
      // Check storage usage after cleanup
      chrome.storage.local.getBytesInUse(null, function(bytesInUse) {
        const kilobytes = Math.round(bytesInUse / 1024);
        console.log(`Current storage usage: ${kilobytes} KB`);
      });
    }
  );
}

/**
 * Log API telemetry data
 * @param {Object} telemetry - Telemetry data to log
 * @returns {Promise} - Resolves when telemetry is logged
 */
function logApiTelemetry(telemetry) {
  return new Promise((resolve, reject) => {
    try {
      // Validate the telemetry data
      if (!telemetry || !telemetry.requestId) {
        reject(new Error("Invalid telemetry data"));
        return;
      }
      
      // Log summary of the API call
      console.log(`API Telemetry [${telemetry.requestId}]: ${telemetry.method} ${telemetry.endpoint} - ${telemetry.success ? 'Success' : 'Failed'} (${telemetry.duration.toFixed(2)}ms)`);
      
      // Store telemetry data in local storage
      chrome.storage.local.get(['apiTelemetry'], function(result) {
        let apiTelemetry = result.apiTelemetry || {
          recentCalls: [],
          stats: {
            totalCalls: 0,
            successCalls: 0,
            failureCalls: 0,
            totalDuration: 0,
            lastUpdated: new Date().toISOString()
          }
        };
        
        // Add this call to recent calls
        apiTelemetry.recentCalls.unshift({
          id: telemetry.requestId,
          endpoint: telemetry.endpoint,
          method: telemetry.method,
          duration: telemetry.duration,
          success: telemetry.success,
          error: telemetry.error,
          timestamp: telemetry.timestamp || new Date().toISOString(),
          retries: telemetry.retryCount || 0
        });
        
        // Keep only the most recent 100 calls
        if (apiTelemetry.recentCalls.length > 100) {
          apiTelemetry.recentCalls = apiTelemetry.recentCalls.slice(0, 100);
        }
        
        // Update statistics
        apiTelemetry.stats.totalCalls++;
        if (telemetry.success) {
          apiTelemetry.stats.successCalls++;
        } else {
          apiTelemetry.stats.failureCalls++;
        }
        apiTelemetry.stats.totalDuration += telemetry.duration;
        apiTelemetry.stats.lastUpdated = new Date().toISOString();
        
        // Calculate aggregate statistics
        const successRate = (apiTelemetry.stats.successCalls / apiTelemetry.stats.totalCalls) * 100;
        const avgDuration = apiTelemetry.stats.totalDuration / apiTelemetry.stats.totalCalls;
        
        // Add computed statistics
        apiTelemetry.stats.successRate = successRate.toFixed(2) + '%';
        apiTelemetry.stats.avgDuration = avgDuration.toFixed(2) + 'ms';
        
        // Organize calls by endpoint for analysis
        const endpointStats = {};
        apiTelemetry.recentCalls.forEach(call => {
          // Extract base endpoint path
          const urlObj = new URL(call.endpoint);
          const baseEndpoint = urlObj.pathname;
          
          if (!endpointStats[baseEndpoint]) {
            endpointStats[baseEndpoint] = {
              calls: 0,
              successes: 0,
              failures: 0,
              totalDuration: 0
            };
          }
          
          endpointStats[baseEndpoint].calls++;
          if (call.success) endpointStats[baseEndpoint].successes++;
          else endpointStats[baseEndpoint].failures++;
          endpointStats[baseEndpoint].totalDuration += call.duration;
        });
        
        // Add endpoint statistics
        apiTelemetry.stats.endpoints = endpointStats;
        
        // Store updated telemetry
        chrome.storage.local.set({ apiTelemetry: apiTelemetry }, function() {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve({ stored: true });
          }
        });
      });
    } catch (error) {
      reject(error);
    }
  });
}

export {
  updateStats,
  getStats,
  scheduledCacheCleanup,
  logApiTelemetry
}; 