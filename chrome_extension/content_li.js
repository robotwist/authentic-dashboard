/**
 * content_li.js - LinkedIn-specific content script
 * 
 * This script handles LinkedIn post extraction and monitoring
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
  if (isCollecting) return;
  isCollecting = true;
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