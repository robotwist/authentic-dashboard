/**
 * content_li.js - LinkedIn-specific content script
 * 
 * This script handles LinkedIn post extraction and monitoring
 * for dynamically loaded content.
 */

// Access utils from the global scope instead of using import
// The functions we need are exposed through window.authenticDashboard
// or through the modules loaded separately

// Get references to shared functionality from authenticDashboard global object
// Avoid redeclaration of reportError since it's already defined in content.js
let reportErrorFunction;
try {
  reportErrorFunction = window.authenticDashboard?.reportError || function(context, error) {
    console.error(`LinkedIn Error (${context}):`, error);
  };
} catch (e) {
  reportErrorFunction = function(context, error) {
    console.error(`LinkedIn Error (${context}):`, error);
  };
}

// Define utility functions or load them from global context
function extractPostData(platform, element, pageType = 'feed') {
  if (platform !== 'linkedin') {
    console.error('This function is specific to LinkedIn');
    return null;
  }
  
  console.log("[Authentic] Extracting data from LinkedIn post", element);
  
  try {
    // Get basic post data
    const postId = element.dataset.authenticId || `li_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Get author details
    let authorName = '';
    let authorProfile = '';
    let isSponsored = false;
    
    // Try to find author name
    const authorElement = element.querySelector('.feed-shared-actor__name');
    if (authorElement) {
      authorName = authorElement.textContent.trim();
      
      // Get profile link if available
      const profileLink = authorElement.closest('a');
      if (profileLink && profileLink.href) {
        authorProfile = profileLink.href;
      }
    }
    
    // Check if post is sponsored
    isSponsored = !!element.querySelector('[data-test-sponsored-flag]') || 
                 element.textContent.includes('Sponsored') || 
                 element.textContent.includes('Promoted');
    
    // Get post content text
    let content = '';
    const contentElement = element.querySelector('.feed-shared-update-v2__description');
    if (contentElement) {
      content = contentElement.textContent.trim();
    }
    
    // Get engagement stats if available
    let likes = 0;
    let comments = 0;
    let shares = 0;
    
    const socialCounts = element.querySelectorAll('.social-details-social-counts__reactions-count');
    if (socialCounts.length > 0) {
      // First is usually likes
      const likesText = socialCounts[0]?.textContent.trim();
      if (likesText) {
        likes = parseEngagementCount(likesText);
      }
      
      // Comments count
      const commentsElement = element.querySelector('.social-details-social-counts__comments');
      if (commentsElement) {
        const commentsText = commentsElement.textContent.trim();
        comments = parseEngagementCount(commentsText);
      }
    }
    
    // Timestamp
    let timestamp = null;
    const timeElement = element.querySelector('.feed-shared-actor__sub-description');
    if (timeElement) {
      const timeText = timeElement.textContent.trim();
      timestamp = extractTimestamp(timeText);
    }
    
    // Assemble the post data
    return {
      platform: 'linkedin',
      postId: postId,
      author: authorName,
      authorProfile: authorProfile,
      content: content,
      timestamp: timestamp,
      sponsored: isSponsored,
      engagement: {
        likes: likes,
        comments: comments,
        shares: shares
      },
      metadata: {
        pageType: pageType,
        collectedAt: new Date().toISOString(),
        seen: element.dataset.authenticSeen === 'true'
      }
    };
  } catch (error) {
    console.error('Error extracting LinkedIn post data:', error);
    return null;
  }
}

/**
 * Parse engagement count text to number
 * @param {string} text - Text like "1K" or "2,345"
 * @returns {number} - Number value
 */
function parseEngagementCount(text) {
  if (!text) return 0;
  
  text = text.trim().toLowerCase();
  
  // Handle abbreviations like "1k"
  if (text.endsWith('k')) {
    return parseFloat(text.replace('k', '')) * 1000;
  }
  
  // Handle abbreviations like "1m"
  if (text.endsWith('m')) {
    return parseFloat(text.replace('m', '')) * 1000000;
  }
  
  // Remove commas and convert to number
  return parseInt(text.replace(/,/g, ''), 10) || 0;
}

/**
 * Extract timestamp from LinkedIn time text
 * @param {string} timeText - Text like "3h" or "2d"
 * @returns {string} - ISO timestamp
 */
function extractTimestamp(timeText) {
  if (!timeText) return new Date().toISOString();
  
  const now = new Date();
  
  // Simple heuristic for recent posts
  if (timeText.includes('now') || timeText.includes('just')) {
    return now.toISOString();
  }
  
  // Handle hours
  if (timeText.includes('h')) {
    const hours = parseInt(timeText, 10) || 0;
    now.setHours(now.getHours() - hours);
    return now.toISOString();
  }
  
  // Handle days
  if (timeText.includes('d')) {
    const days = parseInt(timeText, 10) || 0;
    now.setDate(now.getDate() - days);
    return now.toISOString();
  }
  
  // Handle weeks
  if (timeText.includes('w')) {
    const weeks = parseInt(timeText, 10) || 0;
    now.setDate(now.getDate() - (weeks * 7));
    return now.toISOString();
  }
  
  // Handle months
  if (timeText.includes('mo')) {
    const months = parseInt(timeText, 10) || 0;
    now.setMonth(now.getMonth() - months);
    return now.toISOString();
  }
  
  // Default to current time if format not recognized
  return now.toISOString();
}

function findElements(platform, elementType) {
  // Implementation for finding elements on LinkedIn
  if (platform !== 'linkedin') return [];
  
  if (elementType === 'posts') {
    // LinkedIn-specific selectors for posts
    return Array.from(document.querySelectorAll('.feed-shared-update-v2'));
  }
  
  return [];
}

function simulateInfiniteScroll(options = {}) {
  // Default options
  const defaults = {
    maxScrollTime: 30000, // 30 seconds
    scrollInterval: 1000, // 1 second
    pauseInterval: 3000,  // Pause every 3 seconds
    pauseDuration: 1500,  // Pause for 1.5 seconds
    targetSelector: null, // Selector to count
    noNewElementsThreshold: 3 // Stop after 3 attempts with no new elements
  };
  
  // Merge defaults with provided options
  const settings = { ...defaults, ...options };
  
  return new Promise((resolve, reject) => {
    console.log('[Authentic] Starting infinite scroll simulation');
    
    let lastElementCount = 0;
    if (settings.targetSelector) {
      lastElementCount = document.querySelectorAll(settings.targetSelector).length;
      console.log(`[Authentic] Initial element count: ${lastElementCount}`);
    }
    
    const scrollStartTime = Date.now();
    let noNewElementsCount = 0;
    let scrollAttempts = 0;
    let scrollInterval;
    
    // Define the scroll function so it can be reused
    const performScroll = () => {
      // Check if we've been scrolling for too long
      if (Date.now() - scrollStartTime > settings.maxScrollTime) {
        console.log(`[Authentic] Reached maximum scroll time (${settings.maxScrollTime}ms)`);
        clearInterval(scrollInterval);
        resolve(settings.targetSelector ? document.querySelectorAll(settings.targetSelector).length : scrollAttempts);
        return;
      }
      
      scrollAttempts++;
      
      // Scroll down
      window.scrollTo(0, document.body.scrollHeight);
      
      // Pause periodically to let content load
      if (scrollAttempts % Math.floor(settings.pauseInterval / settings.scrollInterval) === 0) {
        clearInterval(scrollInterval);
        
        // After a pause, check for new elements
        setTimeout(() => {
          let currentElementCount = scrollAttempts;
          
          if (settings.targetSelector) {
            currentElementCount = document.querySelectorAll(settings.targetSelector).length;
            console.log(`[Authentic] Element count after pause: ${currentElementCount} (previously: ${lastElementCount})`);
            
            // Check if we found new elements
            if (currentElementCount <= lastElementCount) {
              noNewElementsCount++;
              console.log(`[Authentic] No new elements found (${noNewElementsCount}/${settings.noNewElementsThreshold})`);
              
              // If we haven't found new elements for several attempts, stop scrolling
              if (noNewElementsCount >= settings.noNewElementsThreshold) {
                console.log('[Authentic] Stopping scroll - no new elements after multiple attempts');
                resolve(currentElementCount);
                return;
              }
            } else {
              // Reset counter if we found new elements
              noNewElementsCount = 0;
            }
            
            lastElementCount = currentElementCount;
          }
          
          // Resume scrolling with a new interval
          scrollInterval = setInterval(performScroll, settings.scrollInterval);
        }, settings.pauseDuration);
      }
    };
    
    // Start the scrolling process
    scrollInterval = setInterval(performScroll, settings.scrollInterval);
  });
}

// Track processed posts to avoid duplicates
const processedPosts = new Set();
let observer = null;
let intersectionObserver = null;
// Avoid redeclaration of isCollecting since it's already defined in content.js
// Access the variable from content.js instead of redeclaring it
let lastCollectionTime = 0;
const COLLECTION_COOLDOWN = 5000; // 5 seconds between collections
const MAX_POSTS_PER_BATCH = 25;

/**
 * Send collected posts to the API via the background script
 * @param {Array} posts - Array of post objects 
 * @param {string} platform - Platform name ('linkedin', 'facebook', 'instagram')
 * @returns {Promise} - Promise resolving to the API response
 */
function sendPostsToAPI(posts, platform) {
  return new Promise((resolve, reject) => {
    if (!posts || posts.length === 0) {
      console.log('No posts to send');
      resolve({ success: true, message: 'No posts to send' });
      return;
    }

    console.log(`Sending ${posts.length} ${platform} posts to background script`);
    
    // Send posts to background script
    chrome.runtime.sendMessage({
      action: 'sendPosts',
      platform: platform,
      posts: posts
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error sending posts to background script:', chrome.runtime.lastError);
        reject(chrome.runtime.lastError);
      } else if (response && response.success) {
        console.log('Successfully sent posts to background script:', response);
        resolve(response);
      } else {
        console.error('Failed to send posts to background script:', response);
        reject(new Error(response?.message || 'Unknown error'));
      }
    });
  });
}

/**
 * Initialize the LinkedIn content script
 */
function initLinkedInObserver() {
  console.log('[Authentic] Initializing LinkedIn observer');
  
  // Set up mutation observer to detect new posts
  observer = new MutationObserver(debounce(checkForNewPosts, 500));
  
  // Start observing the main content container
  const mainContainer = getLinkedInContentContainer();
  
  if (mainContainer) {
    observer.observe(mainContainer, { 
      childList: true, 
      subtree: true 
    });
    console.log('[Authentic] Observing LinkedIn content for changes');
  } else {
    console.warn('[Authentic] Could not find LinkedIn main container');
    
    // Retry after a delay since LinkedIn loads content dynamically
    setTimeout(() => {
      const retryContainer = getLinkedInContentContainer();
      if (retryContainer) {
        observer.observe(retryContainer, { 
          childList: true, 
          subtree: true 
        });
        console.log('[Authentic] Observing LinkedIn content for changes (retry successful)');
      } else {
        console.error('[Authentic] Failed to find LinkedIn main container after retry');
      }
    }, 5000);
  }
  
  // Set up intersection observer for viewport tracking
  setupIntersectionObserver();
  
  // Initial scan for posts
  collectLinkedInPosts();
}

/**
 * Get the appropriate container to observe based on the current LinkedIn page
 */
function getLinkedInContentContainer() {
  // Main feed
  const mainFeed = document.querySelector('div.scaffold-finite-scroll__content');
  if (mainFeed) return mainFeed;
  
  // Profile page 
  const profileActivity = document.querySelector('div.pvs-profile-section div.pvs-list__container');
  if (profileActivity) return profileActivity;
  
  // Company page
  const companyPage = document.querySelector('div.org-grid__content-height-enforcer');
  if (companyPage) return companyPage;
  
  // Single post page
  const singlePost = document.querySelector('div.feed-shared-update-v2');
  if (singlePost) return singlePost.parentElement;
  
  // Search results page
  const searchResults = document.querySelector('div.search-results-container');
  if (searchResults) return searchResults;
  
  // Notifications page
  const notificationsPage = document.querySelector('div.notifications-container');
  if (notificationsPage) return notificationsPage;
  
  // Default to main content or document body
  return document.querySelector('main.scaffold-layout__main') || document.body;
}

/**
 * Determine what type of LinkedIn page we're on
 */
function getLinkedInPageType() {
  const url = window.location.href;
  
  if (url.match(/linkedin\.com\/feed\/?/) || url.match(/linkedin\.com\/?$/)) {
    return 'feed';
  } else if (url.match(/linkedin\.com\/in\/[^\/]+\/?$/)) {
    return 'profile';
  } else if (url.match(/linkedin\.com\/company\/[^\/]+\/?$/)) {
    return 'company';
  } else if (url.match(/linkedin\.com\/posts\/[^\/]+/)) {
    return 'post';
  } else if (url.match(/linkedin\.com\/jobs\/?/)) {
    return 'jobs';
  } else if (url.match(/linkedin\.com\/search\//)) {
    return 'search';
  } else if (url.match(/linkedin\.com\/groups\//)) {
    return 'group';
  } else if (url.match(/linkedin\.com\/notifications\//)) {
    return 'notifications';
  } else if (url.match(/linkedin\.com\/messaging\//)) {
    return 'messaging';
  } else if (url.match(/linkedin\.com\/events\//)) {
    return 'event';
  } else if (url.match(/linkedin\.com\/learning\//)) {
    return 'learning';
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
  const posts = findElements('linkedin', 'posts');
  posts.forEach(post => {
    // Generate a unique ID for this post if it doesn't have one
    if (!post.dataset.authenticId) {
      post.dataset.authenticId = `li_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
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
  
  collectLinkedInPosts();
}

/**
 * Collect LinkedIn posts from the current page
 */
function collectLinkedInPosts() {
  // Prevent concurrent collection
  // Access isCollecting from content.js via window
  if (window.isCollecting === true) return;
  window.isCollecting = true;
  lastCollectionTime = Date.now();
  
  console.log('[Authentic] Collecting LinkedIn posts...');
  
  try {
    // Get page type to help with context-specific selectors
    const pageType = getLinkedInPageType();
    
    // Find all post elements
    const posts = findElements('linkedin', 'posts', pageType);
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
      const postData = extractPostData('linkedin', post, pageType);
      
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
    
    console.log(`[Authentic] Extracted ${newPosts.length} new LinkedIn posts`);
    
    // Send posts to API if we have any
    if (newPosts.length > 0) {
      sendPostsToAPI(newPosts, 'linkedin')
        .then(response => {
          console.log(`[Authentic] Successfully uploaded ${newPosts.length} LinkedIn posts`);
        })
        .catch(error => {
          console.error('[Authentic] Error uploading LinkedIn posts:', error);
        });
    }
  } catch (error) {
    console.error('[Authentic] Error collecting LinkedIn posts:', error);
  } finally {
    window.isCollecting = false;
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
    collectLinkedInPosts();
    
    // Respond immediately then collect
    sendResponse({ success: true, message: 'Collection started' });
    return true;
  }
  
  if (request.action === 'scrollAndCollect') {
    console.log('[Authentic] Received scrollAndCollect message');
    
    // Target selector depends on page type
    const pageType = getLinkedInPageType();
    let targetSelector;
    
    if (pageType === 'feed') {
      targetSelector = 'div.feed-shared-update-v2:not([data-authentic-processed])';
    } else if (pageType === 'profile') {
      targetSelector = 'div.pvs-list__item--line-separated:not([data-authentic-processed])';
    } else if (pageType === 'company') {
      targetSelector = 'div.org-updates-content-module__update-item:not([data-authentic-processed])';
    } else if (pageType === 'post') {
      targetSelector = 'div.feed-shared-update-v2:not([data-authentic-processed])';
    } else if (pageType === 'search') {
      targetSelector = 'div.search-results__cluster-content > li:not([data-authentic-processed])';
    } else if (pageType === 'group') {
      targetSelector = 'div.feed-shared-update-v2:not([data-authentic-processed])';
    } else {
      targetSelector = 'div.feed-shared-update-v2:not([data-authentic-processed])';
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
      collectLinkedInPosts();
      
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
  document.addEventListener('DOMContentLoaded', initLinkedInObserver);
} else {
  // If DOMContentLoaded already fired
  initLinkedInObserver();
}

// Also run collection after 5 seconds to catch any posts loaded after initial page load
setTimeout(collectLinkedInPosts, 5000); 