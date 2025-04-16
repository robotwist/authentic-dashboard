/**
 * content_fb.js - Facebook-specific content script
 * 
 * This script handles Facebook post extraction and monitoring
 * for dynamically loaded content.
 */

import { extractPostData, findElements, sendPostsToAPI, simulateInfiniteScroll } from './modules/utils.js';

// Track processed posts to avoid duplicates
const processedPosts = new Set();
let observer = null;
let intersectionObserver = null;
let isCollecting = false;
let lastCollectionTime = 0;
const COLLECTION_COOLDOWN = 5000; // 5 seconds between collections
const MAX_POSTS_PER_BATCH = 25;

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