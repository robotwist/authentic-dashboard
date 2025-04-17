/**
 * content_ig.js - Instagram-specific content script
 * 
 * This script handles Instagram post extraction and monitoring
 * for dynamically loaded content.
 */

// Access utils from the global scope instead of using import
// The functions we need are exposed through window.authenticDashboard

// Get references to shared functionality from authenticDashboard global object
const { reportError } = window.authenticDashboard || {};

// Define utility functions or load them from global context
function extractPostData(element) {
  // Implementation for Instagram posts
  console.log("[Authentic] Extracting data from Instagram post", element);
  // Custom implementation for Instagram...
  return {
    platform: 'instagram',
    content: element.textContent || '',
    // Additional fields as needed
  };
}

function findElements(platform, elementType, pageType) {
  // Implementation for finding elements on Instagram
  if (platform !== 'instagram') return [];
  
  if (elementType === 'posts') {
    // Instagram-specific selectors for posts based on page type
    if (pageType === 'profile') {
      return Array.from(document.querySelectorAll('article._aayp'));
    } else if (pageType === 'post') {
      return Array.from(document.querySelectorAll('article[role="presentation"]'));
    } else {
      // Main feed and other pages
      return Array.from(document.querySelectorAll('article._ab6k'));
    }
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

/**
 * Initialize the Instagram content script
 */
function initInstagramObserver() {
  console.log('[Authentic] Initializing Instagram observer');
  
  // Set up mutation observer to detect new posts
  observer = new MutationObserver(debounce(checkForNewPosts, 500));
  
  // Start observing the main content container
  const mainContainer = getInstagramContentContainer();
  
  if (mainContainer) {
    observer.observe(mainContainer, { 
      childList: true, 
      subtree: true 
    });
    console.log('[Authentic] Observing Instagram content for changes');
  } else {
    console.warn('[Authentic] Could not find Instagram main container');
    
    // Retry after a delay since Instagram loads content dynamically
    setTimeout(() => {
      const retryContainer = getInstagramContentContainer();
      if (retryContainer) {
        observer.observe(retryContainer, { 
          childList: true, 
          subtree: true 
        });
        console.log('[Authentic] Observing Instagram content for changes (retry successful)');
      } else {
        console.error('[Authentic] Failed to find Instagram main container after retry');
      }
    }, 5000);
  }
  
  // Set up intersection observer for viewport tracking
  setupIntersectionObserver();
  
  // Initial scan for posts
  collectInstagramPosts();
}

/**
 * Get the appropriate container to observe based on the current Instagram page
 */
function getInstagramContentContainer() {
  // Main feed
  const mainFeed = document.querySelector('main[role="main"] section');
  if (mainFeed) return mainFeed;
  
  // Profile page
  const profileFeed = document.querySelector('main[role="main"] article');
  if (profileFeed) return profileFeed.parentElement;
  
  // Explore page
  const exploreFeed = document.querySelector('main[role="main"] div._aaq-');
  if (exploreFeed) return exploreFeed;
  
  // Single post view
  const singlePost = document.querySelector('article[role="presentation"]');
  if (singlePost) return singlePost.parentElement;
  
  // Stories view
  const storiesView = document.querySelector('section[role="dialog"]');
  if (storiesView) return storiesView;
  
  // Default to main content or document body
  return document.querySelector('main[role="main"]') || document.body;
}

/**
 * Determine what type of Instagram page we're on
 */
function getInstagramPageType() {
  const url = window.location.href;
  
  if (url.match(/instagram\.com\/?$/) || url.match(/instagram\.com\/$/)) {
    return 'feed';
  } else if (url.match(/instagram\.com\/p\/[^\/]+\/?$/)) {
    return 'post';
  } else if (url.match(/instagram\.com\/stories\/[^\/]+\/?/)) {
    return 'story';
  } else if (url.match(/instagram\.com\/reels\/[^\/]+\/?/)) {
    return 'reel';
  } else if (url.match(/instagram\.com\/explore\/?/)) {
    return 'explore';
  } else if (url.match(/instagram\.com\/[^\/]+\/?$/) && !url.includes('/p/') && !url.includes('/reels/')) {
    return 'profile';
  } else if (url.match(/instagram\.com\/direct\/?/)) {
    return 'direct';
  } else if (url.match(/instagram\.com\/explore\/tags\//)) {
    return 'tag';
  } else if (url.match(/instagram\.com\/explore\/locations\//)) {
    return 'location';
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
  const posts = findElements('instagram', 'posts');
  posts.forEach(post => {
    // Generate a unique ID for this post if it doesn't have one
    if (!post.dataset.authenticId) {
      post.dataset.authenticId = `ig_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
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
  
  collectInstagramPosts();
}

/**
 * Collect Instagram posts from the current page
 */
function collectInstagramPosts() {
  // Prevent concurrent collection
  if (isCollecting) return;
  isCollecting = true;
  lastCollectionTime = Date.now();
  
  console.log('[Authentic] Collecting Instagram posts...');
  
  try {
    // Get page type to help with context-specific selectors
    const pageType = getInstagramPageType();
    
    // Find all post elements
    const posts = findElements('instagram', 'posts', pageType);
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
      const postData = extractPostData('instagram', post, pageType);
      
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
    
    console.log(`[Authentic] Extracted ${newPosts.length} new Instagram posts`);
    
    // Send posts to API if we have any
    if (newPosts.length > 0) {
      sendPostsToAPI(newPosts, 'instagram')
        .then(response => {
          console.log(`[Authentic] Successfully uploaded ${newPosts.length} Instagram posts`);
        })
        .catch(error => {
          console.error('[Authentic] Error uploading Instagram posts:', error);
        });
    }
  } catch (error) {
    console.error('[Authentic] Error collecting Instagram posts:', error);
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
    collectInstagramPosts();
    
    // Respond immediately then collect
    sendResponse({ success: true, message: 'Collection started' });
    return true;
  }
  
  if (request.action === 'scrollAndCollect') {
    console.log('[Authentic] Received scrollAndCollect message');
    
    // Target selector depends on page type
    const pageType = getInstagramPageType();
    let targetSelector;
    
    if (pageType === 'feed') {
      targetSelector = 'article[role="presentation"]:not([data-authentic-processed])';
    } else if (pageType === 'profile') {
      targetSelector = 'article div a[href*="/p/"]:not([data-authentic-processed])';
    } else if (pageType === 'explore') {
      targetSelector = 'div._aaq- a[href*="/p/"]:not([data-authentic-processed])';
    } else if (pageType === 'tag' || pageType === 'location') {
      targetSelector = 'article div a[href*="/p/"]:not([data-authentic-processed])';
    } else if (pageType === 'post') {
      targetSelector = 'article[role="presentation"]:not([data-authentic-processed])';
    } else if (pageType === 'reel') {
      targetSelector = 'section[role="dialog"] div[role="dialog"]:not([data-authentic-processed])';
    } else {
      targetSelector = 'article[role="presentation"]:not([data-authentic-processed])';
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
      collectInstagramPosts();
      
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
  document.addEventListener('DOMContentLoaded', initInstagramObserver);
} else {
  // If DOMContentLoaded already fired
  initInstagramObserver();
}

// Also run collection after 5 seconds to catch any posts loaded after initial page load
setTimeout(collectInstagramPosts, 5000); 