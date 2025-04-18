/**
 * content_fb.js - Facebook-specific content script
 * 
 * Handles post collection and processing specifically for Facebook
 */

// Access utils from the global scope instead of using import
// The functions we need are exposed through window.authenticDashboard

// Get references to shared functionality from authenticDashboard global object
// Note: reportError is already defined in content.js and attached to window.authenticDashboard

// Define utility functions or load them from global context
function extractPostData(element) {
  // Implementation for Facebook posts
  console.log("[Authentic] Extracting data from Facebook post", element);
  // Custom implementation for Facebook...
  return {
    platform: 'facebook',
    content: element.textContent || '',
    // Additional fields as needed
  };
}

function findElements(platform, elementType) {
  // Implementation for finding elements on Facebook
  if (platform !== 'facebook') return [];
  
  if (elementType === 'posts') {
    // Facebook-specific selectors for posts
    return Array.from(document.querySelectorAll('div[data-pagelet^="FeedUnit"]'));
  }
  
  return [];
}

function simulateInfiniteScroll(duration) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let scrollCount = 0;
    
    const scroll = () => {
      window.scrollBy(0, 500);
      scrollCount++;
      
      if (Date.now() - startTime < duration) {
        setTimeout(scroll, 500);
      } else {
        console.log(`[Authentic] Scrolled ${scrollCount} times`);
        resolve(scrollCount);
      }
    };
    
    scroll();
  });
}

// Track processed posts to avoid duplicates
const processedPosts = new Set();
let observer = null;
let intersectionObserver = null;
let isCollecting = false;
let lastCollectionTime = 0;
const COLLECTION_COOLDOWN = 5000; // 5 seconds between collections
const MAX_POSTS_PER_BATCH = 25;

// Network request states and retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 3000, 5000];
let connectionErrors = 0;

// Facebook selectors and extraction logic
const FB_SELECTORS = {
  // ... existing code ...
};

/**
 * Initialize the Facebook content script
 */
function initFacebookObserver() {
  console.log('[Authentic] Initializing Facebook observer');
  
  // Set up mutation observer to detect new posts
  observer = new MutationObserver(debounce(checkForNewPosts, 500));
  
  // Start observing the main content container
  const mainContainer = getFacebookContentContainer();
  
  if (mainContainer) {
    observer.observe(mainContainer, { 
      childList: true, 
      subtree: true 
    });
    console.log('[Authentic] Observing Facebook content for changes');
  } else {
    console.warn('[Authentic] Could not find Facebook main container');
    
    // Retry after a delay since Facebook loads content dynamically
    setTimeout(() => {
      const retryContainer = getFacebookContentContainer();
      if (retryContainer) {
        observer.observe(retryContainer, { 
          childList: true, 
          subtree: true 
        });
        console.log('[Authentic] Observing Facebook content for changes (retry successful)');
      } else {
        console.error('[Authentic] Failed to find Facebook main container after retry');
      }
    }, 5000);
  }
  
  // Set up intersection observer for viewport tracking
  setupIntersectionObserver();
  
  // Initial scan for posts
  collectFacebookPosts();
}

/**
 * Get the appropriate container to observe based on the current Facebook page
 */
function getFacebookContentContainer() {
  // Main feed
  const mainFeed = document.querySelector('div[role="feed"]');
  if (mainFeed) return mainFeed;
  
  // Profile page timeline
  const profileTimeline = document.querySelector('div[data-pagelet="ProfileTimeline"]');
  if (profileTimeline) return profileTimeline;
  
  // Group feed
  const groupFeed = document.querySelector('div[data-pagelet="GroupFeed"]');
  if (groupFeed) return groupFeed;
  
  // Single post view
  const singlePost = document.querySelector('div[data-pagelet="Story"]');
  if (singlePost) return singlePost;
  
  // Watch feed
  const watchFeed = document.querySelector('div[data-pagelet="VideoHomeFinch"]');
  if (watchFeed) return watchFeed;
  
  // Marketplace feed
  const marketplaceFeed = document.querySelector('div[data-pagelet="Marketplace"]');
  if (marketplaceFeed) return marketplaceFeed;
  
  // Default to main content or document body
  return document.querySelector('div[role="main"]') || document.body;
}

/**
 * Determine what type of Facebook page we're on
 */
function getFacebookPageType() {
  const url = window.location.href;
  
  if (url.match(/facebook\.com\/?$/) || url.match(/facebook\.com\/home/) || url.match(/facebook\.com\/\?/)) {
    return 'feed';
  } else if (url.match(/facebook\.com\/profile\.php\?id=/) || url.match(/facebook\.com\/[^\/]+\/?$/) && !url.includes('/posts/')) {
    return 'profile';
  } else if (url.match(/facebook\.com\/groups\/[^\/]+\/?$/)) {
    return 'group';
  } else if (url.match(/facebook\.com\/[^\/]+\/posts\//) || url.match(/facebook\.com\/photo/) || url.match(/facebook\.com\/permalink/)) {
    return 'post';
  } else if (url.match(/facebook\.com\/watch\/?/)) {
    return 'watch';
  } else if (url.match(/facebook\.com\/marketplace\/?/)) {
    return 'marketplace';
  } else if (url.match(/facebook\.com\/events\/?/)) {
    return 'events';
  } else if (url.match(/facebook\.com\/bookmarks\/?/)) {
    return 'bookmarks';
  } else if (url.match(/facebook\.com\/gaming\/?/)) {
    return 'gaming';
  } else {
    return 'other';
  }
}

/**
 * Setup an intersection observer to detect when posts enter/exit the viewport
 */
function setupIntersectionObserver() {
  // Configuration for intersection observer
  const options = {
    root: null, // Use viewport as root
    rootMargin: '0px',
    threshold: 0.1 // Trigger when 10% of element is visible
  };
  
  // Create observer instance
  intersectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const postElement = entry.target;
        const postId = postElement.dataset.authenticId;
        
        // Mark this post as seen in viewport
        if (postId && !processedPosts.has(postId)) {
          postElement.dataset.authenticSeen = 'true';
          // Could use this to only collect posts that were actually seen
        }
      }
    });
  }, options);
  
  // Apply to all posts
  applyIntersectionObserverToCurrentPosts();
}

/**
 * Apply the intersection observer to all current posts
 */
function applyIntersectionObserverToCurrentPosts() {
  const posts = findElements('facebook', 'posts');
  posts.forEach(post => {
    // Generate a unique ID for this post if it doesn't have one
    if (!post.dataset.authenticId) {
      post.dataset.authenticId = `fb_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
    
    // Start observing this post
    intersectionObserver.observe(post);
  });
}

/**
 * Check for and process new posts when mutations are detected
 */
function checkForNewPosts() {
  const now = Date.now();
  // Don't run collection too frequently
  if (now - lastCollectionTime < COLLECTION_COOLDOWN) {
    return;
  }
  
  collectFacebookPosts();
}

/**
 * Collect Facebook posts from the current page
 */
function collectFacebookPosts() {
  // Prevent concurrent collection
  if (isCollecting) return;
  isCollecting = true;
  lastCollectionTime = Date.now();
  
  console.log('[Authentic] Collecting Facebook posts...');
  
  try {
    // Get page type to help with context-specific selectors
    const pageType = getFacebookPageType();
    
    // Find all post elements
    const posts = findElements('facebook', 'posts', pageType);
    console.log(`[Authentic] Found ${posts.length} post elements on ${pageType} page`);
    
    // Apply intersection observer to these posts
    applyIntersectionObserverToCurrentPosts();
    
    // Extract data from posts
    const newPosts = [];
    
    posts.forEach(post => {
      // Skip already processed posts
      if (post.dataset.authenticProcessed === 'true' || processedPosts.has(post.dataset.authenticId)) {
        return;
      }
      
      // Extract post data with page type context
      const postData = extractPostData('facebook', post, pageType);
      
      // Skip if no valid data could be extracted
      if (!postData) {
        return;
      }
      
      // Mark post as processed
      post.dataset.authenticProcessed = 'true';
      processedPosts.add(post.dataset.authenticId);
      
      // Add to new posts list
      newPosts.push(postData);
      
      // Limit batch size
      if (newPosts.length >= MAX_POSTS_PER_BATCH) {
        return;
      }
    });
    
    console.log(`[Authentic] Extracted ${newPosts.length} new Facebook posts`);
    
    // Send posts to API if we have any
    if (newPosts.length > 0) {
      sendPostsToAPI(newPosts, 'facebook')
        .then(response => {
          console.log(`[Authentic] Successfully uploaded ${newPosts.length} Facebook posts`);
        })
        .catch(error => {
          console.error('[Authentic] Error uploading Facebook posts:', error);
        });
    }
  } catch (error) {
    console.error('[Authentic] Error collecting Facebook posts:', error);
  } finally {
    isCollecting = false;
  }
}

/**
 * Throttle/debounce function to avoid excessive processing
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Respond to messages from background script or popup
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'collectPosts') {
    console.log('[Authentic] Received collectPosts message');
    
    // Force collection of posts
    collectFacebookPosts();
    
    // Respond immediately then collect
    sendResponse({ success: true, message: 'Collection started' });
    return true;
  }
  
  if (request.action === 'scrollAndCollect') {
    console.log('[Authentic] Received scrollAndCollect message');
    
    // Target selector depends on page type
    const pageType = getFacebookPageType();
    let targetSelector;
    
    if (pageType === 'feed') {
      targetSelector = 'div[role="article"]:not([data-authentic-processed])';
    } else if (pageType === 'profile') {
      targetSelector = 'div[role="article"]:not([data-authentic-processed])';
    } else if (pageType === 'group') {
      targetSelector = 'div[role="article"]:not([data-authentic-processed])';
    } else if (pageType === 'post') {
      targetSelector = 'div[data-pagelet="Story"]:not([data-authentic-processed])';
    } else if (pageType === 'watch') {
      targetSelector = 'div[data-pagelet^="FeedUnit"]:not([data-authentic-processed])';
    } else if (pageType === 'marketplace') {
      targetSelector = 'div[data-pagelet^="BrowseFeedUpsell"]:not([data-authentic-processed])';
    } else {
      targetSelector = 'div[role="article"]:not([data-authentic-processed])';
    }
    
    // Start infinite scroll simulation
    simulateInfiniteScroll({
      targetSelector: targetSelector,
      maxScrollTime: request.maxScrollTime || 30000,
      noNewElementsThreshold: 3
    })
    .then(postCount => {
      console.log(`[Authentic] Scroll complete, found ${postCount} posts total`);
      
      // Collect posts after scrolling
      collectFacebookPosts();
      
      sendResponse({ success: true, postCount: postCount });
    })
    .catch(error => {
      console.error('[Authentic] Error in scroll and collect:', error);
      sendResponse({ success: false, error: error.message });
    });
    
    // Keep the message channel open
    return true;
  }
});

// Initialize when the document is fully loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFacebookObserver);
} else {
  // If DOMContentLoaded already fired
  initFacebookObserver();
}

// Also run collection after 5 seconds to catch any posts loaded after initial page load
setTimeout(collectFacebookPosts, 5000);

/**
 * Initialize the content script with error handling
 */
function initializeContentScript() {
  try {
    console.log('Facebook content script initialized with improved error handling');
    
    // Setup message listener
    setupMessageListener();
    
    // Notify background script that we're ready
    notifyBackgroundScriptReady()
      .then(response => {
        console.log('Background script acknowledged content script:', response);
      })
      .catch(error => {
        console.warn('Failed to notify background script:', error);
        // Continue anyway - this is not critical
      });
    
    // Setup periodic connection checking
    setupConnectionChecking();
    
  } catch (error) {
    console.error('Error initializing content script:', error);
    reportError('initialization', error);
  }
}

/**
 * Set up message listener with error handling
 */
function setupMessageListener() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Message received in Facebook content script:', message);
    
    // Handle different message types
    try {
      if (message.action === 'scrollAndCollect') {
        // Prevent concurrent collection
        if (isCollecting) {
          sendResponse({ success: false, error: 'Collection already in progress' });
          return false;
        }
        
        isCollecting = true;
        
        // Start collection with timeout protection
        collectFacebookPostsWithTimeout(message.maxScrollTime || 30000)
          .then(result => {
            isCollecting = false;
            sendSafeResponse(sendResponse, result);
          })
          .catch(error => {
            isCollecting = false;
            console.error('Error during collection:', error);
            sendSafeResponse(sendResponse, { 
              success: false, 
              error: error.message || 'Unknown collection error'
            });
          });
        
        // Return true to indicate we'll respond asynchronously
        return true;
      }
      
      // Handle other message types as needed
      return false;
    } catch (error) {
      console.error('Error processing message:', error);
      sendSafeResponse(sendResponse, { success: false, error: error.message });
      reportError('message_processing', error);
      return false;
    }
  });
}

/**
 * Safely send a response, handling exceptions if the message channel closed
 */
function sendSafeResponse(sendResponse, data) {
  try {
    sendResponse(data);
  } catch (error) {
    console.warn('Error sending response (channel may be closed):', error);
  }
}

/**
 * Notifies the background script that the content script is ready
 */
async function notifyBackgroundScriptReady() {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(
        { action: 'contentScriptReady', platform: 'facebook' },
        response => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        }
      );
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Set up periodic connection checking
 */
function setupConnectionChecking() {
  // Check connection every 2 minutes
  setInterval(() => {
    checkConnectionWithRetry()
      .then(connected => {
        if (connected) {
          console.log('Background connection is healthy');
          connectionErrors = 0;
        } else {
          connectionErrors++;
          console.warn(`Background connection check failed (${connectionErrors} consecutive failures)`);
          
          if (connectionErrors > 3) {
            console.error('Multiple connection failures detected, attempting recovery');
            attemptConnectionRecovery();
          }
        }
      })
      .catch(error => {
        connectionErrors++;
        console.error('Connection check error:', error);
        
        if (connectionErrors > 3) {
          attemptConnectionRecovery();
        }
      });
  }, 120000); // Every 2 minutes
}

/**
 * Check connection to background script with retry logic
 */
async function checkConnectionWithRetry() {
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const connected = await checkConnection();
      return connected;
    } catch (error) {
      console.warn(`Connection check attempt ${i+1} failed:`, error);
      
      if (i < MAX_RETRIES - 1) {
        // Wait before next retry
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[i]));
      }
    }
  }
  
  return false;
}

/**
 * Check connection to background script
 */
async function checkConnection() {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(
        { action: 'ping' },
        response => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else if (response && response.status === 'alive') {
            resolve(true);
          } else {
            resolve(false);
          }
        }
      );
      
      // Add timeout for response
      setTimeout(() => resolve(false), 5000);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Attempt to recover from connection issues
 */
function attemptConnectionRecovery() {
  console.log('Attempting connection recovery');
  
  // Notify the user if possible
  try {
    // Create a notification element
    const notificationDiv = document.createElement('div');
    notificationDiv.style.position = 'fixed';
    notificationDiv.style.top = '10px';
    notificationDiv.style.right = '10px';
    notificationDiv.style.backgroundColor = '#f44336';
    notificationDiv.style.color = 'white';
    notificationDiv.style.padding = '10px';
    notificationDiv.style.borderRadius = '5px';
    notificationDiv.style.zIndex = '9999';
    notificationDiv.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';
    notificationDiv.textContent = 'Authentic Dashboard: Connection issues detected. Try reloading the page.';
    
    // Add a close button
    const closeButton = document.createElement('span');
    closeButton.textContent = '×';
    closeButton.style.marginLeft = '10px';
    closeButton.style.cursor = 'pointer';
    closeButton.onclick = () => notificationDiv.remove();
    notificationDiv.appendChild(closeButton);
    
    // Add to the page
    document.body.appendChild(notificationDiv);
    
    // Auto-remove after 30 seconds
    setTimeout(() => {
      if (document.body.contains(notificationDiv)) {
        notificationDiv.remove();
      }
    }, 30000);
  } catch (error) {
    console.error('Error showing notification:', error);
  }
  
  // Try to wake up the background script
  try {
    chrome.runtime.sendMessage({ action: 'wake' });
  } catch (error) {
    console.error('Error waking background script:', error);
  }
}

/**
 * Collect Facebook posts with timeout protection
 * @param {number} maxTimeMs - Maximum time to spend scrolling
 */
async function collectFacebookPostsWithTimeout(maxTimeMs) {
  return new Promise((resolve, reject) => {
    let timeout;
    let posts = [];
    
    // Set a timeout to prevent hanging
    timeout = setTimeout(() => {
      if (posts.length > 0) {
        resolve({ success: true, postCount: posts.length, posts });
      } else {
        reject(new Error('Collection timed out without finding any posts'));
      }
    }, maxTimeMs);
    
    // Start collection
    collectFacebookPosts()
      .then(result => {
        clearTimeout(timeout);
        resolve(result);
      })
      .catch(error => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

/**
 * Collect Facebook posts by scrolling and analyzing the page
 */
async function collectFacebookPosts() {
  try {
    console.log('Starting Facebook post collection');
    
    // Simulate scrolling to load more content
    await simulateScroll(10); // Scroll 10 times
    
    // Find and process posts
    const posts = findAndProcessPosts();
    
    // Send posts to background script
    if (posts.length > 0) {
      await sendPostsToBackground(posts);
    }
    
    return { 
      success: true, 
      postCount: posts.length,
      message: `Found ${posts.length} posts on Facebook`
    };
  } catch (error) {
    console.error('Error collecting Facebook posts:', error);
    reportError('collection', error);
    throw error;
  }
}

/**
 * Simulate scrolling to load more content
 * @param {number} scrollCount - Number of scrolls to perform
 */
async function simulateScroll(scrollCount) {
  return new Promise((resolve) => {
    let scrollsDone = 0;
    
    const scroll = () => {
      window.scrollBy(0, 800);
      scrollsDone++;
      
      if (scrollsDone >= scrollCount) {
        // Wait a bit after last scroll to let content load
        setTimeout(resolve, 1500);
      } else {
        // Random delay between scrolls (500-1500ms)
        setTimeout(scroll, 500 + Math.random() * 1000);
      }
    };
    
    scroll();
  });
}

/**
 * Find and process Facebook posts
 * @returns {Array} - Array of processed post objects
 */
function findAndProcessPosts() {
  // This is a placeholder implementation - you would need to adapt this
  // to match Facebook's actual DOM structure which changes frequently
  
  // Example selector for post elements
  const postElements = document.querySelectorAll('[data-pagelet^="FeedUnit"]');
  const posts = [];
  
  postElements.forEach(element => {
    try {
      // Extract post data
      const post = extractPostData(element);
      if (post) {
        posts.push(post);
      }
    } catch (error) {
      console.warn('Error processing post element:', error);
    }
  });
  
  return posts;
}

/**
 * Detect if a post is sponsored (paid content)
 * @param {Element} element - The post DOM element
 * @returns {boolean} - Whether the post is sponsored
 */
function detectSponsoredPost(element) {
  // Facebook hides this in various ways, often changing techniques
  // This is a simplistic approach that would need to be updated regularly
  
  try {
    // Look for sponsored text
    const sponsoredTexts = ['Sponsored', 'Gesponsert', 'Sponsorisé', 'Patrocinado'];
    
    // Check for text content including any of the sponsored indicators
    const text = element.textContent;
    return sponsoredTexts.some(sponsoredText => text.includes(sponsoredText));
  } catch (error) {
    console.warn('Error detecting sponsored post:', error);
    return false;
  }
}

/**
 * Send collected posts to the background script
 * @param {Array} posts - Array of post objects
 */
async function sendPostsToBackground(posts) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(
        { 
          action: 'sendPosts', 
          platform: 'facebook',
          posts,
          timestamp: Date.now()
        },
        response => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else if (response && response.success) {
            resolve(response);
          } else {
            reject(new Error(response?.error || 'Unknown error sending posts'));
          }
        }
      );
    } catch (error) {
      reject(error);
    }
  });
}

// Export functions for use by content.js
window.collectFacebookPosts = collectFacebookPosts;
window.scrollAndCollectFacebook = scrollAndCollectFacebook; 