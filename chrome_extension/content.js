/**
 * Authentic Dashboard Content Script
 * Runs on Facebook, LinkedIn, and Instagram to collect post data
 */

// Test function to diagnose CSP issues
function testApiConnections() {
  console.log("=== TESTING API CONNECTIONS ===");
  
  // First attempt: Direct fetch (will likely fail due to CSP)
  console.log("Testing direct fetch API call (likely to fail due to CSP)...");
  fetch('http://localhost:8000/api/health-check/')
    .then(response => response.json())
    .then(data => {
      console.log("✅ DIRECT FETCH SUCCEEDED:", data);
    })
    .catch(error => {
      console.error("❌ DIRECT FETCH FAILED:", error.message);
      
      // Second attempt: Using background script (should work)
      console.log("Testing background script API call...");
      safeApiCall('/api/health-check/')
        .then(data => {
          console.log("✅ SAFE API CALL SUCCEEDED:", data);
        })
        .catch(error => {
          console.error("❌ SAFE API CALL FAILED:", error);
        });
    });
    
  console.log("=== TEST COMPLETE (check console for results) ===");
}

/**
 * Unified API communication function that sends requests through the background script
 * to bypass Content Security Policy restrictions
 * 
 * @param {string} endpoint - API endpoint path (with or without domain)
 * @param {Object} options - Request options (method, body, headers)
 * @returns {Promise} - Promise that resolves with the API response
 */
function communicateWithAPI(endpoint, options = {}) {
  return new Promise((resolve, reject) => {
    // Ensure endpoint starts with a slash if not provided
    if (!endpoint.startsWith('/') && !endpoint.startsWith('http')) {
      endpoint = '/' + endpoint;
    }
    
    // Extract API domain from endpoint if it's a full URL
    let apiPath = endpoint;
    let domain = 'http://localhost:8000';
    
    if (endpoint.startsWith('http')) {
      const url = new URL(endpoint);
      domain = url.origin;
      apiPath = url.pathname + url.search;
    }
    
    // Send message to background script to make the API call
    chrome.runtime.sendMessage({
      action: 'proxyApiCall',
      endpoint: domain + apiPath,
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body || null
    }, function(response) {
      if (chrome.runtime.lastError) {
        console.error("Error communicating with background script:", chrome.runtime.lastError);
        reject(chrome.runtime.lastError);
      } else if (response && response.success) {
        resolve(response.data);
      } else {
        reject(response?.error || 'Unknown error');
      }
    });
  });
}

// Replace the safeApiCall function with our new unified function
// This function is now just an alias for backward compatibility
function safeApiCall(endpoint, options = {}) {
  console.log("Using safeApiCall (via communicateWithAPI) for:", endpoint);
  return communicateWithAPI(endpoint, options);
}

// Run the test immediately when the script loads
setTimeout(testApiConnections, 3000);

// Ultimate Directive
// I think the ultimate directive that should guide development could be:
// > "Restore user sovereignty over the digital experience by creating transparent tools that prioritize genuine human satisfaction rather than engagement metrics."
// This directive emphasizes:
// User control ("sovereignty")
// Transparency in how content is filtered
// Human-centered design (satisfaction vs engagement)
// Ethical technology principles

// Load Pure Feed module for post ranking and classification
loadPureFeedModule();

// Global throttling variables
let lastCollectionTime = 0;
const COLLECTION_COOLDOWN = 5000; // 5 seconds minimum between collections
const RATE_LIMIT_BACKOFF = 60000; // 1 minute backoff if rate limited
let isRateLimited = false;
let rateLimitResetTime = 0;

// Add connection error handling
let connectionErrorCount = 0;
const MAX_CONNECTION_ERRORS = 3;
let lastConnectionError = null;

// Deduplication system - store content fingerprints
const FINGERPRINT_EXPIRATION = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHED_FINGERPRINTS = 500; // Maximum number of fingerprints to store

// Global variables for auto-scanning functionality
let autoScanEnabled = true;
let autoScanInterval = 5 * 60 * 1000; // 5 minutes by default
let autoScanTimer = null;
let lastAutoScanTime = 0;
let autoScanningActive = false;
let consecutiveScanFailures = 0;
const MAX_SCAN_FAILURES = 3;

// Adaptive selectors system for resilience against UI changes
const SELECTORS = {
  facebook: {
    posts: [
      '[data-pagelet^="FeedUnit"]',
      '[role="feed"] > div',
      '.x1lliihq',
      '.x1qjc9v5',
      'div[data-pagelet^="Feed"]'
    ],
    content: [
      '[data-ad-comet-preview="message"]',
      '[data-ad-preview="message"]',
      '[dir="auto"]',
      '.xdj266r',
      '.x11i5rnm'
    ]
  },
  instagram: {
    posts: [
      'article',
      '.x1qjc9v5',
      '._aac4',
      '._aabd'
    ],
    content: [
      'h1 + div',
      'div._a9zr > div',
      '.x1lliihq',
      '._aacl'
    ]
  },
  linkedin: {
    posts: [
      '.feed-shared-update-v2',
      '.occludable-update',
      '.jobs-home-recommended-job',
      '.discover-entity-card'
    ],
    content: [
      '.feed-shared-update-v2__description',
      '.feed-shared-text',
      '.break-words'
    ]
  }
};

// Try multiple selectors until one works
function findElements(platform, selectorType) {
  if (!SELECTORS[platform] || !SELECTORS[platform][selectorType]) {
    console.warn(`No selectors defined for ${platform}.${selectorType}`);
    return [];
  }
  
  for (const selector of SELECTORS[platform][selectorType]) {
    const elements = document.querySelectorAll(selector);
    if (elements && elements.length > 0) {
      console.log(`Found ${elements.length} elements with ${selector}`);
      return elements;
    }
  }
  return [];
}

// Function to simulate infinite scroll to capture more posts
function simulateInfiniteScroll(duration = 30000, scrollStep = 800) {
  return new Promise((resolve) => {
    console.log("Starting infinite scroll simulation");
    const startTime = Date.now();
    let lastHeight = document.body.scrollHeight;
    let postsFound = 0;
    let stuckCount = 0;
    
    const scrollInterval = setInterval(() => {
      window.scrollBy(0, scrollStep);
      
      // Check if we've found new posts
      const platform = detectCurrentPlatform();
      const currentPostElements = findElements(platform, 'posts');
      
      if (currentPostElements.length > postsFound) {
        postsFound = currentPostElements.length;
        console.log(`Found ${postsFound} posts while scrolling`);
        stuckCount = 0; // Reset stuck counter when we find new posts
      } else {
        stuckCount++;
      }
      
      // Check if we're stuck (no new posts in several attempts)
      const isStuck = stuckCount > 5;
      
      // Check if we've scrolled to the bottom
      const currentHeight = document.body.scrollHeight;
      const reachedBottom = currentHeight === lastHeight;
      lastHeight = currentHeight;
      
      // Stop conditions: time elapsed, reached bottom, or stuck
      if (Date.now() - startTime > duration || 
          (reachedBottom && stuckCount > 2) || 
          isStuck || 
          postsFound > 100) { // Cap at 100 posts for performance
        clearInterval(scrollInterval);
        console.log(`Scroll complete: Scrolled for ${(Date.now() - startTime)/1000}s, found ${postsFound} posts`);
        resolve(postsFound);
      }
    }, 1000); // Scroll every second
  });
}

// Detect current platform
function detectCurrentPlatform() {
  const url = window.location.href;
  if (url.includes('facebook.com')) {
    return 'facebook';
  } else if (url.includes('instagram.com')) {
    return 'instagram';
  } else if (url.includes('linkedin.com')) {
    return 'linkedin';
  }
  return 'unknown';
}

// Function to generate a content fingerprint
function generateFingerprint(platform, user, content) {
  // Create a fingerprint using platform, user, and first 50 chars of content
  // This helps identify the same post even if some details change
  const contentSnippet = (content || "").substring(0, 50).trim();
  return `${platform}:${user}:${contentSnippet}`;
}

// Function to check if content has already been processed
function isContentDuplicate(platform, user, content) {
  // Get the stored fingerprints
  const fingerprintKey = `${platform}_fingerprints`;
  let existingFingerprints = JSON.parse(localStorage.getItem(fingerprintKey) || '[]');
  
  // Generate fingerprint for the new content
  const newFingerprint = generateFingerprint(platform, user, content);
  
  // Always allow collection by returning false
  console.log(`${platform}: Allowing collection for all content`);
  return false;
}

// Function to record a fingerprint
function recordFingerprint(platform, user, content) {
  const fingerprint = generateFingerprint(platform, user, content);
  
  chrome.storage.local.get(['processedFingerprints'], function(result) {
    const now = Date.now();
    const expirationTime = now + FINGERPRINT_EXPIRATION;
    let fingerprints = result.processedFingerprints || {};
    
    // Add or update this fingerprint
    fingerprints[fingerprint] = expirationTime;
    
    // Clean up old fingerprints to avoid unlimited storage growth
    const fingerprintEntries = Object.entries(fingerprints);
    if (fingerprintEntries.length > MAX_CACHED_FINGERPRINTS) {
      // Sort by expiration time, remove oldest ones
      const sortedEntries = fingerprintEntries.sort((a, b) => a[1] - b[1]);
      const entriesToKeep = sortedEntries.slice(-MAX_CACHED_FINGERPRINTS);
      fingerprints = Object.fromEntries(entriesToKeep);
    }
    
    // Store updated fingerprints
    chrome.storage.local.set({processedFingerprints: fingerprints});
  });
}

// Function to check if the server is available
function checkServerAvailability(callback) {
    console.log("Checking server availability...");
    
    // Use the centralized API client if available
    if (window.authDashboardAPI) {
        // Always force a fresh check when called directly from content scripts
        window.authDashboardAPI.checkAvailability(true)
            .then(status => {
                console.log("API availability check result:", status);
                callback(status.available, status.endpoint, status.apiKey);
            })
            .catch(error => {
                console.error("Error checking server with API client:", error);
                callback(false, null, null);
            });
        return;
    }
    
    // Use message passing to communicate with background script for server availability check
    chrome.runtime.sendMessage({
        action: 'checkAPIEndpoint',
        forceCheck: true
    }, response => {
        if (chrome.runtime.lastError) {
            console.error("Error communicating with background script:", chrome.runtime.lastError);
            callback(false, null, null);
            return;
        }
        
        if (response && response.success) {
            console.log("Server availability check via background script:", response);
            callback(response.available, response.endpoint, response.apiKey);
        } else {
            console.error("Background script returned error:", response?.error || "Unknown error");
            callback(false, null, null);
        }
    });
}

// Modified collectWithRateLimitProtection to collect more aggressively
async function collectWithRateLimitProtection(platform, collectionFunction) {
  console.log(`Starting ${platform} collection with minimal rate limit protection`);
  
  // Check when we last collected from this platform
  const lastCollectionKey = `last_${platform}_collection`;
  const lastCollection = localStorage.getItem(lastCollectionKey);
  const now = Date.now();
  
  // Always allow collection during testing/development
  const debugMode = true;  // Set to true for testing
  
  if (lastCollection && !debugMode) {
    // Minimum wait time between collections (in milliseconds)
    // Using a very short interval (5 seconds) to collect more posts
    const MIN_COLLECTION_INTERVAL = 5000; // 5 seconds for aggressive collection
    
    const elapsed = now - parseInt(lastCollection);
    if (elapsed < MIN_COLLECTION_INTERVAL) {
      console.log(`Collection attempted after ${elapsed}ms. Allowing collection anyway.`);
      // Continue with collection always
    }
  }
  
  // Store last collection time
  localStorage.setItem(lastCollectionKey, now.toString());
  
  // Call the actual collection function with error handling
  let allPosts = [];
  try {
    // Use Promise with timeout to prevent hanging
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Collection timed out')), 10000); // 10 second timeout
    });
    
    const collectionPromise = new Promise(resolve => {
      try {
        const result = collectionFunction();
        resolve(result);
      } catch (e) {
        console.error(`Error in ${platform} collection function:`, e);
        resolve([]);
      }
    });
    
    // Race the collection against the timeout
    allPosts = await Promise.race([collectionPromise, timeoutPromise]);
  } catch (e) {
    console.error(`Error in ${platform} collection:`, e);
    return [];
  }
  
  // No posts collected
  if (!allPosts || allPosts.length === 0) {
    console.log(`No posts collected from ${platform}`);
    return [];
  }
  
  // Include all posts without filtering duplicates
  console.log(`Collected ${allPosts.length} posts, including all in results.`);
  return allPosts;
}

// Add a function at the top of the file to handle post fingerprinting
function generatePostFingerprint(platform, user, contentSnippet, timestamp) {
  // Create a fingerprint based on platform, user, first 50 chars of content, and timestamp if available
  const contentPart = contentSnippet ? contentSnippet.substring(0, 50).trim() : '';
  return `${platform}_${user}_${contentPart}_${timestamp || ''}`;
}

function isPostAlreadyProcessed(fingerprint) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['processedPosts'], function(result) {
      const processedPosts = result.processedPosts || {};
      resolve(processedPosts[fingerprint] === true);
    });
  });
}

function markPostAsProcessed(fingerprint) {
  chrome.storage.local.get(['processedPosts'], function(result) {
    const processedPosts = result.processedPosts || {};
    
    // Add the new fingerprint
    processedPosts[fingerprint] = true;
    
    // Keep the size manageable by removing old entries if we have too many
    const keys = Object.keys(processedPosts);
    if (keys.length > 500) {
      // Remove the oldest 100 entries
      const keysToRemove = keys.slice(0, 100);
      keysToRemove.forEach(key => {
        delete processedPosts[key];
      });
    }
    
    // Save back to storage
    chrome.storage.local.set({ processedPosts: processedPosts });
  });
}

// Enhanced Instagram post collector
function collectInstagramPosts() {
  console.log("Starting enhanced Instagram post collection...");
  
  return new Promise(async (resolve) => {
    try {
      // Detect Instagram page type for specialized collection
      const pageType = detectInstagramPageType();
      console.log(`Detected Instagram page type: ${pageType}`);
      
      // Scroll to get more posts depending on page type
      const scrollDuration = pageType === 'explore' ? 40000 : 30000;
      await simulateInfiniteScroll(scrollDuration, 800);
      
      // Use the adaptive selector system to find posts
      const articleElements = findElements('instagram', 'posts');
      
      console.log(`Found ${articleElements.length} potential Instagram posts`);
      
      if (!articleElements || articleElements.length === 0) {
        console.log("No Instagram posts found on page");
        resolve([]);
        return;
      }
      
      const posts = [];
      const processedContents = new Set(); // For deduplication by content
      
      articleElements.forEach((article, index) => {
        try {
          // Get the content text with reliable selectors
          let content = "";
          for (const selector of SELECTORS.instagram.content) {
            const contentElement = article.querySelector(selector);
            if (contentElement && contentElement.innerText) {
              content = contentElement.innerText.trim();
              if (content.length > 0) break;
            }
          }
          
          // If single post view, try looking for content in comments section
          if (pageType === 'single-post' && (!content || content.length < 5)) {
            const commentSelectors = ['.C4VMK span:not(.gElp9)', '._a9zr > div', '.x1lliihq'];
            for (const selector of commentSelectors) {
              const commentElement = article.querySelector(selector);
      if (commentElement && commentElement.innerText) {
                content = commentElement.innerText.trim();
                if (content.length > 0) break;
              }
            }
          }
          
          // Skip if content is too short or duplicate
          if (!content || content.length < 5) {
            return;
          }
          
          // Create a fingerprint of the content for deduplication
          const contentFingerprint = generateFingerprint('instagram', '', content);
          if (processedContents.has(contentFingerprint)) {
            return; // Skip duplicate content
          }
          processedContents.add(contentFingerprint);
          
          // Extract user information with multiple selector options
          let user = "unknown";
          const userSelectors = [
            'header span > a', 
            'header h2 a', 
            '.zw3Ow a', 
            '._aaqt',
            'article header div > a',
            '.x1i10hfl > div > span'
          ];
          
          for (const selector of userSelectors) {
            const userElement = article.querySelector(selector);
            if (userElement && userElement.innerText) {
              user = userElement.innerText.trim();
              if (user.length > 0) break;
            }
          }
          
          // Check if verified with multiple badge selectors
          const verifiedSelectors = [
            'header span.coreSpriteVerifiedBadge', 
            'svg[aria-label="Verified"]',
            '.NYNLo'
          ];
          const isVerified = verifiedSelectors.some(selector => 
            article.querySelector(selector) !== null
          );
          
          // Check friendship status with multiple button selectors
          const followButtonSelectors = [
            'button:not(.following)',
            'button._acan',
            '.x1i10hfl:not([aria-disabled])'
          ];
          let isFriend = true; // Default to true, set to false if "Follow" button found
          
          for (const selector of followButtonSelectors) {
            const followButton = article.querySelector(selector);
            if (followButton && followButton.innerText === 'Follow') {
              isFriend = false;
              break;
            }
          }
          
          // Check for sponsored content with multiple indicators
          const sponsoredTexts = ['Sponsored', 'Paid partnership with', 'Paid partnership'];
          const isSponsored = sponsoredTexts.some(text => 
            article.innerText.includes(text)
          );
          
          // Get engagement metrics with reliable parsing
          let likes = 0;
          const likeSelectors = [
            'section span > div:first-child',
            'article section span',
            '.zV_Nj span',
            '._aacl._aaco'
          ];
          
          for (const selector of likeSelectors) {
            const likeElement = article.querySelector(selector);
            if (likeElement && likeElement.innerText) {
              likes = parseSocialCount(likeElement.innerText.trim());
              if (likes > 0) break;
            }
          }
          
          // Extract images with improved selectors
          const imageUrls = [];
          const imageSelectors = [
            'img[srcset]', 
            'img[src*="instagram"]',
            '.KL4Bh img',
            '._aagt img'
          ];
          
          for (const selector of imageSelectors) {
            article.querySelectorAll(selector).forEach(img => {
              if (img.src && !imageUrls.includes(img.src)) {
                // Use srcset if available for better quality images
                if (img.srcset) {
                  const srcSetEntries = img.srcset.split(',');
                  const largestImage = srcSetEntries[srcSetEntries.length - 1].trim().split(' ')[0];
                  imageUrls.push(largestImage);
                } else {
                  imageUrls.push(img.src);
                }
              }
            });
          }
          
          // Extract hashtags and mentions
          const hashtags = extractHashtags(content);
          
          const mentions = [];
          const mentionMatches = content.match(/@[\w.]+/g);
          if (mentionMatches) {
            mentionMatches.forEach(mention => {
              if (!mentions.includes(mention)) mentions.push(mention);
            });
          }
          
          // Create post object
          posts.push({
            content: content,
            platform: 'instagram',
            user: user,
            is_friend: isFriend,
            is_family: false,
            verified: isVerified,
            image_urls: imageUrls.slice(0, 3).join(','),
            collected_at: new Date().toISOString(),
            likes: likes,
            comments: 0, // Instagram doesn't show comment counts reliably
            hashtags: hashtags.join(','),
            mentions: mentions.join(','),
            is_sponsored: isSponsored,
            content_length: content.length
          });
          
          console.log(`Added Instagram post from ${user}`);
        } catch (err) {
          console.error(`Error processing Instagram post ${index}:`, err);
        }
      });
      
      console.log(`Collected ${posts.length} Instagram posts from ${pageType} page`);
      
      // Send posts via background script if we collected any
      if (posts.length > 0) {
        // Rank and classify posts before sending
        try {
          if (window.pureFeed) {
            console.log("Ranking and classifying posts with Pure Feed module...");
            window.pureFeed.rankPosts(posts);
          }
        } catch (error) {
          console.error("Error ranking posts:", error);
        }
        
        console.log(`Sending ${posts.length} Instagram posts via background script`);
        
        // Get API settings from storage
        chrome.storage.local.get(['apiKey', 'apiEndpoint'], function(result) {
          const apiKey = result.apiKey;
          const apiEndpoint = result.apiEndpoint || 'http://localhost:8000';
          
          // Use the standardized communicateWithAPI function
          communicateWithAPI(`${apiEndpoint}/api/collect-posts/`, {
            method: 'POST',
            headers: { 'X-API-Key': apiKey },
            body: {
              platform: 'instagram',
              posts: posts
            }
          })
          .then(response => {
            console.log("Successfully sent Instagram posts:", response);
            resolve(posts);
          })
          .catch(error => {
            console.error("Error sending Instagram posts:", error);
            // Update connection error counters
            connectionErrorCount++;
            lastConnectionError = "Error communicating with background script";
            
            if (connectionErrorCount >= MAX_CONNECTION_ERRORS) {
              console.error(`Too many connection errors (${connectionErrorCount}). Last error: ${lastConnectionError}`);
            }
            resolve(posts);
          });
        });
      } else {
        resolve([]);
      }
    } catch (err) {
      console.error("Fatal error in Instagram collection:", err);
      resolve([]);
    }
  });
}

// Detect Instagram page type
function detectInstagramPageType() {
  const url = window.location.href;
  if (url.includes('/explore/')) {
    return 'explore';
  } else if (url.includes('/stories/')) {
    return 'stories';
  } else if (url.match(/\/p\/[^\/]+\/?$/)) {
    return 'single-post';
  } else if (url.includes('/reels/')) {
    return 'reels';
  }
  return 'feed';
}

// Helper function to parse social media counts (e.g., "1.2K likes")
function parseSocialCount(text) {
  if (!text) return 0;
  
  // Remove non-numeric parts
  const numericPart = text.replace(/[^0-9.KkMm]/g, '');
  
  if (!numericPart) return 0;
  
  // Parse K/M suffixes
  if (numericPart.includes('K') || numericPart.includes('k')) {
    return Math.round(parseFloat(numericPart) * 1000);
  } else if (numericPart.includes('M') || numericPart.includes('m')) {
    return Math.round(parseFloat(numericPart) * 1000000);
  } else {
    return parseInt(numericPart, 10) || 0;
  }
}

// Enhanced Facebook post collector
function collectFacebookPosts() {
  return new Promise((resolve, reject) => {
    console.log("Starting Facebook post collection");
    try {
      const posts = [];
      const processedUrls = new Set();
      
      // Try to find Facebook post elements - use the new selector system
      const postElements = findElements('facebook', 'posts');
      
      console.log(`Found ${postElements.length} Facebook post elements`);
      
      // Process each post element
      Array.from(postElements).forEach((el, index) => {
        // Facebook post processing code (existing) 
        // ...
  });

  console.log(`Collected ${posts.length} Facebook posts`);
  
      // Send posts through the background script instead of making direct API calls
      // This bypasses Content Security Policy restrictions
    if (posts.length > 0) {
        // Rank and classify posts before sending
        try {
          if (window.pureFeed) {
            console.log("Ranking and classifying Facebook posts with Pure Feed module...");
            window.pureFeed.rankPosts(posts);
          }
        } catch (error) {
          console.error("Error ranking Facebook posts:", error);
        }
        
        // Get API settings from storage
        chrome.storage.local.get(['apiKey', 'apiEndpoint'], function(result) {
          const apiKey = result.apiKey;
          const apiEndpoint = result.apiEndpoint || 'http://localhost:8000';
          
          console.log("Sending Facebook posts via background script");
          
          // Use the standardized communicateWithAPI function
          communicateWithAPI(`${apiEndpoint}/api/collect-posts/`, {
            method: 'POST',
            headers: { 'X-API-Key': apiKey },
            body: {
              platform: 'facebook',
              posts: posts
            }
          })
          .then(response => {
            console.log("Successfully sent Facebook posts:", response);
            resolve(posts);
          })
          .catch(error => {
            console.error("Error sending Facebook posts:", error);
            // Still resolve with posts since we collected them successfully
            resolve(posts);
          });
        });
        return;
      }

      resolve(posts);
    } catch (error) {
      console.error("Error collecting Facebook posts:", error);
      reject(error);
    }
  });
}

// Enhanced LinkedIn collector
function collectLinkedInPosts() {
  console.log("Starting LinkedIn post collection...");
  const posts = [];
  
  try {
  // LinkedIn post containers
  const postElements = document.querySelectorAll('.feed-shared-update-v2');
    
    console.log(`Found ${postElements.length} potential LinkedIn posts`);
    
    if (!postElements || postElements.length === 0) {
      console.log("No LinkedIn posts found on page");
      return [];
    }
  
  postElements.forEach((el) => {
      try {
        if (!el) return; // Skip invalid elements
        
    const content = el.querySelector('.feed-shared-update-v2__description')?.innerText || "";
    
        // Skip posts with insufficient content
        if (!content || content.length < 20) {
          return;
        }
        
        // Extract user information safely
        let user = "unknown";
        try {
    const userElement = el.querySelector('.feed-shared-actor__name');
          user = userElement?.innerText?.trim() || "unknown";
        } catch (err) {
          console.warn("Error getting LinkedIn user:", err);
        }
        
        // Check for verified badge (Premium) safely
        let isVerified = false;
        try {
          isVerified = el.querySelector('.premium-icon') !== null;
        } catch (err) {
          console.warn("Error detecting verified status:", err);
        }
    
    // Enhanced connection status detection (1st, 2nd, 3rd)
    let connectionDegree = 0;
    let isFriend = false;
    
        try {
    const connectionElement = el.querySelector('.feed-shared-actor__sub-description');
    if (connectionElement) {
      const connectionText = connectionElement.innerText;
      
      // Check for 1st-degree connection indicators
      if (connectionText.includes('1st')) {
        connectionDegree = 1;
        isFriend = true;
      } else if (connectionText.includes('2nd')) {
        connectionDegree = 2;
      } else if (connectionText.includes('3rd')) {
        connectionDegree = 3;
      }
      
      // Additional check for connections you follow
      if (!isFriend && (
          connectionText.includes('Following') || 
          connectionText.includes('You follow') ||
          el.querySelector('.feed-shared-actor__follow-button') !== null
      )) {
        isFriend = true;
      }
    }
    
    // Fallback check for connected status
    if (!isFriend) {
      const followButton = el.querySelector('.feed-shared-actor__follow-button');
      if (followButton && (
        followButton.innerText.includes('Following') || 
        followButton.innerText.includes('Connected')
      )) {
        isFriend = true;
      }
          }
        } catch (err) {
          console.warn("Error detecting connection status:", err);
    }
    
        // Process remaining post data with error handling...
    let timestamp = '';
        let likes = 0;
        let comments = 0;
        let imageUrls = [];
        let hashtags = [];
        let mentions = [];
        let bizfluencerScore = 0;
        let sentimentScore = 0;
        let isJobPost = false;
        
        try {
          // Extract timestamp
    const timeElement = el.querySelector('.feed-shared-actor__sub-description time');
    if (timeElement && timeElement.dateTime) {
      timestamp = timeElement.dateTime;
    }
    
    // Get engagement metrics
    const reactionElement = el.querySelector('.social-details-social-counts__reactions-count');
    if (reactionElement && reactionElement.innerText) {
      const match = reactionElement.innerText.match(/\d+/);
      if (match) likes = parseInt(match[0]);
    }
    
    const commentElement = el.querySelector('.social-details-social-counts__comments-count');
    if (commentElement && commentElement.innerText) {
      const match = commentElement.innerText.match(/\d+/);
      if (match) comments = parseInt(match[0]);
    }
    
    // Extract image URLs
    el.querySelectorAll('img').forEach(img => {
      if (img.src && 
          img.width > 100 && 
          !img.src.includes('profile-pic') && 
          !img.src.includes('profile-display-pic') && 
          !imageUrls.includes(img.src)) {
        imageUrls.push(img.src);
      }
    });
    
          // Extract hashtags and mentions
    const hashtagMatches = content.match(/#[\w]+/g);
    if (hashtagMatches) {
      hashtagMatches.forEach(tag => {
        if (!hashtags.includes(tag)) hashtags.push(tag);
      });
    }
    
    const mentionMatches = content.match(/@[\w.]+/g);
    if (mentionMatches) {
      mentionMatches.forEach(mention => {
        if (!mentions.includes(mention)) mentions.push(mention);
      });
    }
    
    // Check for bizfluencer language
    const bizfluencerWords = [
      'synergy', 'disrupt', 'innovate', 'leverage', 'pivot', 'growth hacking', 
      'thought leader', 'paradigm shift', 'bleeding edge', 'best practices', 'scalable', 
      'next-level', 'move the needle', 'value add', 'actionable insights', 'ecosystem',
      'drill down', 'low hanging fruit', 'empower', 'bandwidth', 'deliverable'
    ];
    
    const lowerContent = content.toLowerCase();
    
    bizfluencerWords.forEach(word => {
      const regex = new RegExp('\\b' + word + '\\b', 'gi');
      const matches = lowerContent.match(regex);
      if (matches) bizfluencerScore += matches.length;
    });
    
    // Simple sentiment analysis
          const positiveWords = ['good', 'great', 'excellent', 'amazing', 'love', 'best', 'happy'];
          const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'worst', 'sad', 'disappointed'];
    
    let positiveCount = 0;
    let negativeCount = 0;
    
          positiveWords.forEach(word => {
            const regex = new RegExp('\\b' + word + '\\b', 'gi');
      const matches = lowerContent.match(regex);
      if (matches) positiveCount += matches.length;
    });
    
          negativeWords.forEach(word => {
            const regex = new RegExp('\\b' + word + '\\b', 'gi');
      const matches = lowerContent.match(regex);
      if (matches) negativeCount += matches.length;
    });
    
    // Calculate simple sentiment score (-1.0 to 1.0)
    if (positiveCount > 0 || negativeCount > 0) {
      sentimentScore = (positiveCount - negativeCount) / (positiveCount + negativeCount);
    }
    
    // Check if it's a job posting
          isJobPost = lowerContent.includes('hiring') || 
                      lowerContent.includes('job opening') || 
                      lowerContent.includes('apply now') ||
                      lowerContent.includes('we are looking for') ||
                      lowerContent.includes('job opportunity');
        } catch (err) {
          console.warn("Error processing LinkedIn post data:", err);
        }
    
        // Create the post object
        const formattedPost = {
          content: content,
        platform: 'linkedin',
          original_user: user,
        verified: isVerified,
          is_friend: isFriend,
          is_family: false,
          content_length: content.length,
        likes: likes,
        comments: comments,
          timestamp: timestamp || '',
        connection_degree: connectionDegree,
        bizfluencer_score: bizfluencerScore,
          sentiment_score: sentimentScore,
          image_urls: imageUrls.join(','),
          hashtags: hashtags.join(','),
          mentions: mentions.join(','),
          is_sponsored: false,
          is_job_post: Boolean(isJobPost)
        };
        
        posts.push(formattedPost);
      } catch (err) {
        console.error("Error processing LinkedIn post:", err);
      }
    });
    
    console.log(`Collected ${posts.length} LinkedIn posts`);
    
    // Send posts via background script instead of direct fetch
    if (posts.length > 0) {
      // Rank and classify posts before sending
      try {
        if (window.pureFeed) {
          console.log("Ranking and classifying posts with Pure Feed module...");
          window.pureFeed.rankPosts(posts);
        }
      } catch (error) {
        console.error("Error ranking posts:", error);
      }
      
      // Get API settings from storage
      chrome.storage.local.get(['apiKey', 'apiEndpoint'], function(result) {
        const apiKey = result.apiKey;
        const apiEndpoint = result.apiEndpoint || 'http://localhost:8000';
        
        console.log("Sending LinkedIn posts via background script");
        
        // Use the standardized communicateWithAPI function
        communicateWithAPI(`${apiEndpoint}/api/collect-posts/`, {
          method: 'POST',
          headers: { 'X-API-Key': apiKey },
          body: {
            platform: 'linkedin',
            posts: posts
          }
        })
        .then(response => {
          console.log("Successfully sent LinkedIn posts:", response);
        })
        .catch(error => {
          console.error("Error sending LinkedIn posts:", error);
        });
      });
    }
    
  return posts;
  } catch (err) {
    console.error("Fatal error in LinkedIn collection:", err);
    return [];
  }
}

// Add manual scan button functionality
function injectScanButton() {
  // Don't add multiple buttons
  if (document.getElementById('authentic-scan-btn')) return;
  
  const buttonContainer = document.createElement('div');
  buttonContainer.style.position = 'fixed';
  buttonContainer.style.bottom = '20px';
  buttonContainer.style.right = '20px';
  buttonContainer.style.zIndex = '9999';
  
  const scanButton = document.createElement('button');
  scanButton.id = 'authentic-scan-btn';
  scanButton.innerText = 'Scan Feed';
  scanButton.style.backgroundColor = '#4CAF50';
  scanButton.style.color = 'white';
  scanButton.style.border = 'none';
  scanButton.style.padding = '10px 15px';
  scanButton.style.borderRadius = '4px';
  scanButton.style.cursor = 'pointer';
  scanButton.style.fontWeight = 'bold';
  
  scanButton.addEventListener('click', () => {
    // Detect which platform we're on and run the appropriate collector
    const url = window.location.href;
    let posts = [];
    
    if (url.includes('instagram.com')) {
      posts = collectWithRateLimitProtection('Instagram', () => collectInstagramPosts());
      alert(`Scanned ${posts.length} Instagram posts!`);
    } else if (url.includes('facebook.com')) {
      posts = collectWithRateLimitProtection('Facebook', () => collectFacebookPosts());
      alert(`Scanned ${posts.length} Facebook posts!`);
    } else if (url.includes('linkedin.com')) {
      posts = collectWithRateLimitProtection('LinkedIn', () => collectLinkedInPosts());
      alert(`Scanned ${posts.length} LinkedIn posts!`);
    } else {
      alert('Not on a supported social platform.');
    }
  });
  
  buttonContainer.appendChild(scanButton);
  document.body.appendChild(buttonContainer);
}

// Send a message to background script on load to check connection
// Use the retry-enabled sendMessage function
sendMessageWithRetry({ action: 'checkConnection' })
  .then(response => {
    if (response && response.status === 'connected') {
      console.log('Connection to background script established');
      
      // Auto-detect platform and run appropriate collector with try-catch protection
  const url = window.location.href;
    setTimeout(() => {
        try {
          if (url.includes('instagram.com')) {
      collectWithRateLimitProtection('Instagram', () => collectInstagramPosts());
  } else if (url.includes('facebook.com')) {
      collectWithRateLimitProtection('Facebook', () => collectFacebookPosts());
  } else if (url.includes('linkedin.com')) {
      collectWithRateLimitProtection('LinkedIn', () => collectLinkedInPosts());
          }
        } catch (e) {
          console.error('Error running initial collection:', e);
        }
      }, 2000);  // Increased delay to ensure page is fully loaded
    } else {
      console.warn('Background connection check returned unexpected result:', response);
    }
  })
  .catch(error => {
    console.error('Failed to establish connection to background script:', error);
  })
  .finally(() => {
    // Always try to inject the scan button, regardless of connection status
    try {
  injectScanButton();
    } catch (e) {
      console.error('Error injecting scan button:', e);
    }
});

// Also run scan when scrolling stops to capture new content
let isScrolling;
window.addEventListener('scroll', function() {
  // Clear our timeout throughout the scroll
  window.clearTimeout(isScrolling);

  // Set a timeout to run after scrolling ends
  isScrolling = setTimeout(function() {
    const url = window.location.href;
    // Use try-catch to prevent context invalidation errors
    try {
    if (url.includes('instagram.com')) {
      collectWithRateLimitProtection('Instagram', () => collectInstagramPosts());
    } else if (url.includes('facebook.com')) {
      collectWithRateLimitProtection('Facebook', () => collectFacebookPosts());
    } else if (url.includes('linkedin.com')) {
      collectWithRateLimitProtection('LinkedIn', () => collectLinkedInPosts());
      }
    } catch (e) {
      console.error('Error initiating collection after scroll:', e);
    }
  }, 300);
}, false);

// Educational component for manipulative patterns
const MANIPULATIVE_PATTERNS = {
  'urgency': {
    description: 'Creates artificial time pressure to drive quick decisions',
    examples: ['Limited time only', 'Ending soon', 'Last chance', 'Don\'t miss out', 'Act now'],
    impact: 'Bypasses rational decision-making, creates anxiety'
  },
  'scarcity': {
    description: 'Suggests limited availability to increase perceived value',
    examples: ['Only 3 left', 'Limited stock', 'While supplies last', 'Exclusive offer', 'Rare opportunity'],
    impact: 'Triggers fear of missing out (FOMO), creates competitive urgency'
  },
  'social_proof': {
    description: 'Uses popularity to validate choices and encourage conformity',
    examples: ['Thousands of satisfied customers', 'Best-selling', 'Join millions', 'Everyone\'s talking about'],
    impact: 'Creates herd mentality, outsources critical thinking to the crowd'
  },
  'authority': {
    description: 'Uses perceived expertise or status to establish credibility',
    examples: ['Expert approved', 'Doctor recommended', 'Scientifically proven', 'Official partner'],
    impact: 'Bypasses skepticism, borrows trustworthiness'
  },
  'emotional_manipulation': {
    description: 'Triggers strong emotions to override rational thinking',
    examples: ['Heartbreaking', 'Shocking', 'Outrageous', 'You won\'t believe', 'Faith in humanity restored'],
    impact: 'Hijacks emotional responses, creates engagement through outrage or sentimentality'
  },
  'false_dichotomy': {
    description: 'Presents only two options when more exist',
    examples: ['Either you\'re with us or against us', 'The only solution', 'There is no alternative'],
    impact: 'Eliminates nuance, forces black-and-white thinking'
  },
  'information_gap': {
    description: 'Creates curiosity by promising unknown information',
    examples: ['You won\'t believe what happens next', 'The secret to', 'What they don\'t want you to know'],
    impact: 'Exploits curiosity, often delivers disappointing content'
  },
  'bizfluencer': {
    description: 'Corporate jargon that signals belonging but lacks substance',
    examples: ['Synergy', 'Leverage', 'Paradigm shift', 'Disrupt', 'Circle back', 'Deep dive'],
    impact: 'Creates illusion of expertise, masks lack of specific information'
  }
};

// Function to detect manipulative patterns in content
function detectManipulativePatterns(text) {
  if (!text) return [];
  
  const detectedPatterns = [];
  const lowerText = text.toLowerCase();
  
  // Check for each pattern
  Object.entries(MANIPULATIVE_PATTERNS).forEach(([patternKey, patternData]) => {
    let found = false;
    
    // Check each example phrase
    patternData.examples.forEach(example => {
      if (lowerText.includes(example.toLowerCase())) {
        found = true;
      }
    });
    
    // For bizfluencer, check more thoroughly
    if (patternKey === 'bizfluencer' && !found) {
      const bizfluencerWords = ['synergy', 'disrupt', 'innovate', 'leverage', 'pivot', 'growth hacking', 
        'thought leader', 'paradigm shift', 'bleeding edge', 'best practices', 'scalable'];
      
      bizfluencerWords.forEach(word => {
        if (lowerText.includes(word.toLowerCase())) {
          found = true;
        }
      });
    }
    
    if (found) {
      detectedPatterns.push({
        type: patternKey,
        info: patternData
      });
    }
  });
  
  return detectedPatterns;
}

// Function to get educational insights for detected patterns
function getEducationalInsights(patterns) {
  if (!patterns || patterns.length === 0) {
    return {
      html: '<p>No manipulative patterns detected in this content.</p>',
      count: 0
    };
  }
  
  let html = `<div class="manipulation-insights">
    <h4>Detected Patterns (${patterns.length})</h4>
    <ul>`;
  
  patterns.forEach(pattern => {
    html += `
      <li>
        <strong>${pattern.type.replace('_', ' ').toUpperCase()}</strong>
        <p>${pattern.info.description}</p>
        <p><em>Impact: ${pattern.info.impact}</em></p>
      </li>
    `;
  });
  
  html += '</ul></div>';
  
  return {
    html: html,
    count: patterns.length
  };
}

// Add educational insights to the ML analysis
function analyzeContentWithML(text, platform) {
    const result = {
        sentiment_score: 0,
        sentiment_indicators: { positive: 0, negative: 0 },
        toxicity_score: 0,
        engagement_prediction: 0,
        automated_category: '',
        bizfluencer_score: 0,
        manipulative_patterns: []
    };
    
    if (!text || text.length < 3) {
        return result;
    }
    
    // Detect manipulative patterns
    result.manipulative_patterns = detectManipulativePatterns(text);
    
    // Simplified sentiment analysis
    const positiveWords = [
        'good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'terrific',
        'outstanding', 'exceptional', 'impressive', 'remarkable', 'splendid', 'perfect',
        'happy', 'glad', 'joy', 'delighted', 'pleased', 'satisfied', 'content',
        'love', 'adore', 'like', 'enjoy', 'appreciate', 'admire', 'praise'
    ];
    
    const negativeWords = [
        'bad', 'terrible', 'horrible', 'awful', 'dreadful', 'poor', 'inferior',
        'disappointing', 'unpleasant', 'unsatisfactory', 'inadequate', 'substandard',
        'sad', 'unhappy', 'depressed', 'miserable', 'gloomy', 'heartbroken',
        'hate', 'dislike', 'despise', 'detest', 'loathe', 'abhor'
    ];
    
    // Business buzzwords for LinkedIn content
    const bizfluencerWords = [
        'synergy', 'leverage', 'paradigm', 'disrupt', 'innovative', 'transform',
        'strategic', 'empower', 'optimize', 'seamless', 'scalable', 'mindset',
        'actionable', 'deliverable', 'thought leader', 'circle back', 'deep dive',
        'best practice', 'ecosystem', 'value add', 'touch base', 'low-hanging fruit',
        'agile', 'lean', 'pivot', 'bandwidth', 'incentivize'
    ];

    // Toxicity indicators
    const toxicityWords = [
        'offensive', 'inappropriate', 'rude', 'vulgar', 'explicit',
        'dangerous', 'harmful', 'unsafe', 'risky',
        'scam', 'fake', 'fraud', 'hoax', 'misleading', 'deceptive'
    ];
    
    // Category detection - simplified topic classification
    const categories = {
        'travel': ['travel', 'vacation', 'trip', 'beach', 'destination', 'hotel', 'flight'],
        'food': ['food', 'recipe', 'cooking', 'meal', 'restaurant', 'delicious', 'eat'],
        'health': ['health', 'wellness', 'medical', 'doctor', 'hospital', 'medicine'],
        'technology': ['tech', 'technology', 'computer', 'software', 'hardware', 'app'],
        'business': ['business', 'company', 'startup', 'entrepreneur', 'industry', 'work'],
        'personal': ['life', 'personal', 'reflection', 'journey', 'experience', 'story']
    };
    
    // Clean and normalize the text
    const normalizedText = text.toLowerCase();
    const words = normalizedText.split(/\s+/);
    
    // Calculate sentiment score
    let positiveCount = 0;
    let negativeCount = 0;
    
    words.forEach(word => {
        if (positiveWords.some(pw => word.includes(pw))) {
            positiveCount++;
        }
        if (negativeWords.some(nw => word.includes(nw))) {
            negativeCount++;
        }
    });
    
    // Calculate overall sentiment
    const sentimentCount = positiveCount + negativeCount;
    if (sentimentCount > 0) {
        result.sentiment_score = (positiveCount - negativeCount) / sentimentCount;
    }
    
    result.sentiment_indicators.positive = positiveCount;
    result.sentiment_indicators.negative = negativeCount;
    
    // Calculate bizfluencer score (particularly for LinkedIn)
    if (platform === 'linkedin') {
        let buzzwordCount = 0;
        words.forEach(word => {
            if (bizfluencerWords.some(bw => normalizedText.includes(bw))) {
                buzzwordCount++;
            }
        });
        
        // Normalize bizfluencer score (0-10)
        result.bizfluencer_score = Math.min(10, Math.round((buzzwordCount / words.length) * 100));
    }
    
    // Calculate toxicity score
    let toxicityCount = 0;
    toxicityWords.forEach(toxic => {
        if (normalizedText.includes(toxic)) {
            toxicityCount++;
        }
    });
    
    // Normalize toxicity score (0-1)
    result.toxicity_score = Math.min(1, toxicityCount / 10);
    
    // Determine the primary category
    let topCategory = '';
    let topCategoryScore = 0;
    
    Object.entries(categories).forEach(([category, keywords]) => {
        let categoryScore = 0;
        keywords.forEach(keyword => {
            if (normalizedText.includes(keyword)) {
                categoryScore++;
            }
        });
        
        if (categoryScore > topCategoryScore) {
            topCategoryScore = categoryScore;
            topCategory = category;
        }
    });
    
    if (topCategoryScore > 0) {
        result.automated_category = topCategory;
    }
    
    // Predict engagement based on length, sentiment, and other factors
    const lengthFactor = Math.min(1, 1000 / Math.max(100, text.length));
    const sentimentFactor = (result.sentiment_score + 1) / 2; // normalize to 0-1
    const engagementBase = (platform === 'instagram') ? 0.7 : (platform === 'facebook' ? 0.6 : 0.5);
    
    result.engagement_prediction = engagementBase * lengthFactor * sentimentFactor;
    
    return result;
}

// Helper functions

// Extract hashtags from content
function extractHashtags(content) {
  if (!content) return [];
    
  const hashtagMatches = content.match(/#[\w\u0590-\u05fe\u0600-\u06ff\u0750-\u077f\u1100-\u11ff\u3130-\u3185\uac00-\ud7af\u3040-\u30ff\u4e00-\u9fff]+/g);
    
  if (hashtagMatches) {
    return Array.from(new Set(hashtagMatches));
    }
    
  return [];
}

// Parse Facebook counts like "1K" or "1.5K"
function parseFacebookCount(countText) {
    if (!countText) return 0;
    
    try {
        if (countText.includes('K')) {
            return Math.round(parseFloat(countText.replace('K', '')) * 1000);
        } else if (countText.includes('M')) {
            return Math.round(parseFloat(countText.replace('M', '')) * 1000000);
        } else {
            return parseInt(countText) || 0;
        }
    } catch (e) {
        return 0;
    }
}

// Modified message listener to respond with success: true
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'collectPosts') {
    try {
      // Check server first
      checkServerAvailability(function(available, apiEndpoint, apiKey) {
        if (!available) {
          sendResponse({ 
            success: false, 
            message: 'Server unavailable. Cannot collect posts.' 
          });
          return;
        }
        
        const platform = request.platform;
        
        // Apply data preferences to collection
        const dataPreferences = request.settings && request.settings.dataPreferences ? 
          request.settings.dataPreferences : {
            collectContent: true,
            collectEngagement: true,
            collectUsers: true,
            collectHashtags: true,
            collectLocalML: true
          };
        
        // Collect posts based on platform - handle async/promise based collection
        let postsPromise;
        
        if (platform === 'instagram') {
          postsPromise = collectInstagramPosts(dataPreferences);
        } else if (platform === 'facebook') {
          postsPromise = collectFacebookPosts(dataPreferences);
        } else if (platform === 'linkedin') {
          postsPromise = collectLinkedInPosts(dataPreferences);
        } else {
          postsPromise = Promise.resolve([]);
        }
        
        // Handle the promise to get posts
        Promise.resolve(postsPromise).then(posts => {
          sendResponse({ 
            success: true, 
            posts: posts,
            count: posts.length
          });
        }).catch(error => {
          console.error('Error collecting posts:', error);
          sendResponse({ 
            success: false, 
            error: error.message 
          });
        });
      });
    } catch (error) {
      console.error('Error in collect posts handler:', error);
      sendResponse({ 
        success: false, 
        error: error.message 
      });
    }
    
    // Return true to indicate we'll send a response asynchronously
    return true;
  }
});

// Function to send a message to the background script with retry capability
function sendMessageWithRetry(message, maxRetries = 3, retryDelay = 1000) {
  // Special handling for sendPosts action to use our CSP-friendly function
  if (message.action === 'sendPosts' && message.posts && message.platform) {
    console.log(`Using sendPostsViaBackgroundScript for ${message.posts.length} ${message.platform} posts`);
    return sendPostsViaBackgroundScript(message.posts, message.platform);
  }
  
  // For all other message types, use the original implementation
  return new Promise((resolve, reject) => {
    let retryCount = 0;
    
    const sendMessage = () => {
      console.log(`Sending message to background script (attempt ${retryCount + 1}/${maxRetries + 1}):`, message.action);
      
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          const error = chrome.runtime.lastError;
          console.error(`Error sending message (attempt ${retryCount + 1}):`, error);
          
          if (retryCount < maxRetries) {
            retryCount++;
            console.log(`Retrying in ${retryDelay}ms...`);
            setTimeout(sendMessage, retryDelay);
          } else {
            reject(error);
          }
        } else {
          console.log(`Message sent successfully after ${retryCount + 1} attempt(s):`, message.action);
          resolve(response);
        }
      });
    };
    
    sendMessage();
  });
}

// Function to start the auto-scanning process
function startAutoScanning() {
  // Check if auto-scanning is already active
  if (autoScanningActive) {
    console.log("Auto-scanning is already active");
    return;
  }
  
  // Clear any existing timer just in case
  if (autoScanTimer) {
    clearInterval(autoScanTimer);
  }
  
  console.log(`Starting auto-scanning with interval of ${autoScanInterval/1000} seconds`);
  
  autoScanningActive = true;
  
  // Run initial scan immediately
  performAutoScan();
  
  // Set up recurring timer for scanning
  autoScanTimer = setInterval(performAutoScan, autoScanInterval);
  
  // Add visual indicator for auto-scanning
  showAutoScanIndicator();
}

// Function to stop auto-scanning
function stopAutoScanning() {
  if (autoScanTimer) {
    clearInterval(autoScanTimer);
    autoScanTimer = null;
  }
  
  autoScanningActive = false;
  console.log("Auto-scanning stopped");
  
  // Remove visual indicator
  const indicator = document.getElementById('authentic-autoscan-indicator');
  if (indicator) {
    indicator.remove();
  }
}

// Function to actually perform the auto-scan
function performAutoScan() {
  // Don't scan if disabled
  if (!autoScanEnabled) {
    console.log("Auto-scanning is disabled, skipping scan");
    return;
  }
  
  // Don't scan if the user is inactive (tab not visible)
  if (document.hidden) {
    console.log("Page not visible, skipping auto-scan");
    return;
  }
  
  // Check cooldown period
  const currentTime = Date.now();
  if (currentTime - lastAutoScanTime < autoScanInterval * 0.5) {
    console.log("Auto-scan cooldown period active, skipping scan");
    return;
  }
  
  console.log("Performing auto-scan...");
  lastAutoScanTime = currentTime;
  
  // Detect which platform we're on
  const url = window.location.href;
  
  // Store the scroll position so we can restore it later
  const scrollPosition = window.scrollY;
  
  // Add a flashing effect to the indicator to show scanning is in progress
  const indicator = document.getElementById('authentic-autoscan-indicator');
  if (indicator) {
    indicator.classList.add('scanning');
  }
  
  // Helper function to restore state after scanning
  const finishScan = (success, posts = []) => {
    // Restore scroll position
    window.scrollTo(0, scrollPosition);
    
    // Update indicator
    if (indicator) {
      indicator.classList.remove('scanning');
      
      if (success) {
        indicator.classList.add('success');
        setTimeout(() => {
          indicator.classList.remove('success');
        }, 2000);
        
        // Reset failure counter on success
        consecutiveScanFailures = 0;
        
        // Notify background script if posts were found
        if (posts.length > 0) {
          let platform = 'Unknown';
          if (url.includes('instagram.com')) platform = 'Instagram';
          else if (url.includes('facebook.com')) platform = 'Facebook';
          else if (url.includes('linkedin.com')) platform = 'LinkedIn';
          
          chrome.runtime.sendMessage({
            action: 'autoScanComplete',
            postsFound: posts.length,
            platform: platform
          });
        }
      } else {
        indicator.classList.add('failure');
        setTimeout(() => {
          indicator.classList.remove('failure');
        }, 2000);
        
        // Increment failure counter
        consecutiveScanFailures++;
        
        // If too many consecutive failures, stop auto-scanning
        if (consecutiveScanFailures >= MAX_SCAN_FAILURES) {
          console.error("Too many auto-scan failures, disabling auto-scan");
          stopAutoScanning();
          
          // Show notification to user
          chrome.runtime.sendMessage({
            action: 'showNotification',
            title: 'Auto-Scanning Disabled',
            message: 'Auto-scanning has been disabled due to multiple failures. You can re-enable it from the extension popup.'
          });
        }
      }
    }
  };
  
  // First check if server is available
  checkServerAvailability(function(available, apiEndpoint, apiKey) {
    if (!available) {
      console.error("Server not available, skipping auto-scan");
      finishScan(false);
      return;
    }
    
    // Perform platform-specific scan
    let scanPromise;
    
    try {
      if (url.includes('instagram.com')) {
        // Scroll down a bit to load more content
        window.scrollTo(0, window.innerHeight * 2);
        
        setTimeout(() => {
          scanPromise = collectWithRateLimitProtection('Instagram', () => collectInstagramPosts());
          scanPromise.then(posts => {
            console.log(`Auto-scanned ${posts.length} Instagram posts`);
            finishScan(true, posts);
          }).catch(error => {
            console.error("Error during Instagram auto-scan:", error);
            finishScan(false);
          });
        }, 1000); // Wait for content to load after scrolling
      } 
      else if (url.includes('facebook.com')) {
        // Scroll down a bit to load more content
        window.scrollTo(0, window.innerHeight * 2);
        
        setTimeout(() => {
          scanPromise = collectWithRateLimitProtection('Facebook', () => collectFacebookPosts());
          scanPromise.then(posts => {
            console.log(`Auto-scanned ${posts.length} Facebook posts`);
            finishScan(true, posts);
          }).catch(error => {
            console.error("Error during Facebook auto-scan:", error);
            finishScan(false);
          });
        }, 1000); // Wait for content to load after scrolling
      } 
      else if (url.includes('linkedin.com')) {
        // Scroll down a bit to load more content
        window.scrollTo(0, window.innerHeight * 2);
        
        setTimeout(() => {
          scanPromise = collectWithRateLimitProtection('LinkedIn', () => collectLinkedInPosts());
          scanPromise.then(posts => {
            console.log(`Auto-scanned ${posts.length} LinkedIn posts`);
            finishScan(true, posts);
          }).catch(error => {
            console.error("Error during LinkedIn auto-scan:", error);
            finishScan(false);
          });
        }, 1000); // Wait for content to load after scrolling
      }
      else {
        console.log("Not on a supported social platform for auto-scanning");
        finishScan(false);
      }
    } catch (error) {
      console.error("Error during auto-scan:", error);
      finishScan(false);
    }
  });
}

// Function to show a visual indicator for auto-scanning
function showAutoScanIndicator() {
  // Don't add multiple indicators
  if (document.getElementById('authentic-autoscan-indicator')) return;
  
  const indicatorContainer = document.createElement('div');
  indicatorContainer.id = 'authentic-autoscan-indicator';
  indicatorContainer.style.position = 'fixed';
  indicatorContainer.style.bottom = '80px';
  indicatorContainer.style.right = '20px';
  indicatorContainer.style.zIndex = '9999';
  indicatorContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  indicatorContainer.style.color = 'white';
  indicatorContainer.style.padding = '5px 10px';
  indicatorContainer.style.borderRadius = '4px';
  indicatorContainer.style.fontSize = '12px';
  indicatorContainer.style.transition = 'background-color 0.3s';
  indicatorContainer.style.cursor = 'pointer';
  indicatorContainer.style.display = 'flex';
  indicatorContainer.style.alignItems = 'center';
  indicatorContainer.style.gap = '5px';
  
  // Add a small icon
  const icon = document.createElement('div');
  icon.innerHTML = '🔄';
  icon.style.display = 'inline-block';
  
  // Add text
  const text = document.createElement('span');
  text.innerText = 'Auto-Scanning Active';
  
  // Add a toggle switch
  const toggleSwitch = document.createElement('div');
  toggleSwitch.style.width = '30px';
  toggleSwitch.style.height = '16px';
  toggleSwitch.style.backgroundColor = '#4CAF50';
  toggleSwitch.style.borderRadius = '8px';
  toggleSwitch.style.position = 'relative';
  toggleSwitch.style.marginLeft = '10px';
  toggleSwitch.style.cursor = 'pointer';
  
  const toggleSlider = document.createElement('div');
  toggleSlider.style.width = '12px';
  toggleSlider.style.height = '12px';
  toggleSlider.style.backgroundColor = 'white';
  toggleSlider.style.borderRadius = '50%';
  toggleSlider.style.position = 'absolute';
  toggleSlider.style.top = '2px';
  toggleSlider.style.right = '2px';
  toggleSlider.style.transition = 'all 0.3s';
  
  toggleSwitch.appendChild(toggleSlider);
  
  // Add click event to toggle auto-scanning
  toggleSwitch.addEventListener('click', function() {
    autoScanEnabled = !autoScanEnabled;
    
    if (autoScanEnabled) {
      toggleSwitch.style.backgroundColor = '#4CAF50';
      toggleSlider.style.right = '2px';
      toggleSlider.style.left = 'auto';
      text.innerText = 'Auto-Scanning Active';
    } else {
      toggleSwitch.style.backgroundColor = '#ccc';
      toggleSlider.style.right = 'auto';
      toggleSlider.style.left = '2px';
      text.innerText = 'Auto-Scanning Paused';
    }
  });
  
  // Add a close button
  const closeButton = document.createElement('div');
  closeButton.innerHTML = '✕';
  closeButton.style.marginLeft = '10px';
  closeButton.style.cursor = 'pointer';
  closeButton.style.fontSize = '14px';
  closeButton.style.opacity = '0.7';
  closeButton.style.transition = 'opacity 0.3s';
  
  closeButton.addEventListener('mouseover', function() {
    closeButton.style.opacity = '1';
  });
  
  closeButton.addEventListener('mouseout', function() {
    closeButton.style.opacity = '0.7';
  });
  
  closeButton.addEventListener('click', function(e) {
    e.stopPropagation();
    stopAutoScanning();
  });
  
  indicatorContainer.appendChild(icon);
  indicatorContainer.appendChild(text);
  indicatorContainer.appendChild(toggleSwitch);
  indicatorContainer.appendChild(closeButton);
  
  // Add styles for scanning animation
  const style = document.createElement('style');
  style.textContent = `
    #authentic-autoscan-indicator.scanning {
      animation: authentic-pulse 1s infinite;
    }
    #authentic-autoscan-indicator.success {
      background-color: rgba(76, 175, 80, 0.8) !important;
    }
    #authentic-autoscan-indicator.failure {
      background-color: rgba(255, 76, 76, 0.8) !important;
    }
    @keyframes authentic-pulse {
      0% { opacity: 0.7; }
      50% { opacity: 1; }
      100% { opacity: 0.7; }
    }
  `;
  document.head.appendChild(style);
  
  document.body.appendChild(indicatorContainer);
}

// Modify the existing functionality to include auto-scanning
document.addEventListener('DOMContentLoaded', function() {
  // Check if auto-scanning is enabled in settings
  chrome.storage.local.get(['autoScanEnabled', 'autoScanInterval'], function(result) {
    // Default to enabled if not set
    autoScanEnabled = result.autoScanEnabled !== false;
    
    // Use custom interval if set, otherwise default to 5 minutes
    if (result.autoScanInterval) {
      autoScanInterval = result.autoScanInterval * 1000; // Convert to milliseconds
    }
    
    // Start auto-scanning if enabled
    if (autoScanEnabled) {
      // Delay the first scan to allow page to fully load
      setTimeout(startAutoScanning, 5000);
    }
  });
});

// Add message listener for auto-scanning controls
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  // Handle auto-scanning messages
  if (message.action === 'startAutoScanning') {
    if (!autoScanningActive) {
      startAutoScanning();
      sendResponse({ success: true, message: 'Auto-scanning started' });
    } else {
      sendResponse({ success: false, message: 'Auto-scanning already active' });
    }
    return true;
  }
  
  if (message.action === 'stopAutoScanning') {
    if (autoScanningActive) {
      stopAutoScanning();
      sendResponse({ success: true, message: 'Auto-scanning stopped' });
    } else {
      sendResponse({ success: false, message: 'Auto-scanning not active' });
    }
    return true;
  }
  
  if (message.action === 'updateAutoScanInterval') {
    if (message.interval) {
      // Update interval setting
      autoScanInterval = message.interval * 1000; // Convert to milliseconds
      
      // If auto-scanning is active, restart with new interval
      if (autoScanningActive) {
        stopAutoScanning();
        startAutoScanning();
      }
      
      sendResponse({ success: true, message: `Interval updated to ${message.interval} minutes` });
    } else {
      sendResponse({ success: false, message: 'Invalid interval' });
    }
    return true;
  }
  
  if (message.action === 'getAutoScanStatus') {
    // Return information about auto-scanning status
    const url = window.location.href;
    let platformSupported = false;
    
    if (url.includes('instagram.com') || url.includes('facebook.com') || url.includes('linkedin.com')) {
      platformSupported = true;
    }
    
    let status = '';
    
    if (!platformSupported) {
      status = 'Auto-scanning not supported on this site';
    } else if (autoScanningActive) {
      const nextScan = lastAutoScanTime + autoScanInterval - Date.now();
      const minutesRemaining = Math.max(0, Math.floor(nextScan / 60000));
      const secondsRemaining = Math.max(0, Math.floor((nextScan % 60000) / 1000));
      
      status = `Active - Next scan in ${minutesRemaining}m ${secondsRemaining}s`;
      
      if (!autoScanEnabled) {
        status = 'Paused - Toggle enabled to resume';
      }
    } else {
      status = 'Inactive - Enable in settings to start';
    }
    
    sendResponse({
      status: status,
      active: autoScanningActive,
      enabled: autoScanEnabled,
      platformSupported: platformSupported,
      interval: autoScanInterval / 1000,
      nextScan: lastAutoScanTime + autoScanInterval
    });
    
    return true;
  }
  
  if (message.action === 'performManualScan') {
    // Manually trigger a scan
    performAutoScan();
    sendResponse({ success: true, message: 'Manual scan initiated' });
    return true;
  }
});

// Update the auto-scan indicator status every second
function updateAutoScanIndicator() {
  const indicator = document.getElementById('authentic-autoscan-indicator');
  if (!indicator || !autoScanningActive) return;
  
  const textElement = indicator.querySelector('span');
  if (!textElement) return;
  
  // Calculate time until next scan
  const nextScan = lastAutoScanTime + autoScanInterval - Date.now();
  const minutesRemaining = Math.max(0, Math.floor(nextScan / 60000));
  const secondsRemaining = Math.max(0, Math.floor((nextScan % 60000) / 1000));
  
  if (autoScanEnabled) {
    textElement.innerText = `Auto-Scanning: Next in ${minutesRemaining}m ${secondsRemaining}s`;
  } else {
    textElement.innerText = 'Auto-Scanning Paused';
  }
  
  // Schedule the next update
  setTimeout(updateAutoScanIndicator, 1000);
}

// Start the indicator updater when the indicator is shown
const originalShowAutoScanIndicator = showAutoScanIndicator;
showAutoScanIndicator = function() {
  originalShowAutoScanIndicator();
  updateAutoScanIndicator();
};

// Function to load Pure Feed module
function loadPureFeedModule() {
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('pure_feed.js');
    script.onload = () => console.log('Pure Feed module loaded');
    script.onerror = (e) => console.error('Failed to load Pure Feed module:', e);
    (document.head || document.documentElement).appendChild(script);
  } catch (error) {
    console.error('Error loading Pure Feed module:', error);
  }
}

