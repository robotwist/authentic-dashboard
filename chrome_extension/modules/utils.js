/**
 * utils.js - Shared utilities for content scripts
 * 
 * This module provides common functions used across all platforms
 * for processing and extracting social media content.
 */

import SELECTORS from './selectors.js';

/**
 * Find elements using multiple selectors until one works
 * @param {string} platform - Platform name (facebook, instagram, linkedin)
 * @param {string} selectorType - Type of element to find (posts, content, etc.)
 * @param {Element} rootElement - Optional root element to search within (default: document)
 * @returns {Array} - Array of matching elements
 */
export function findElements(platform, selectorType, rootElement = document) {
  if (!SELECTORS[platform] || !SELECTORS[platform][selectorType]) {
    console.warn(`No selectors defined for ${platform}.${selectorType}`);
    return [];
  }
  
  let elements = [];
  const selectors = SELECTORS[platform][selectorType];
  
  for (const selector of selectors) {
    const foundElements = rootElement.querySelectorAll(selector);
    if (foundElements && foundElements.length > 0) {
      console.log(`[Authentic] Found ${foundElements.length} ${selectorType} elements with selector: ${selector}`);
      elements = Array.from(foundElements);
      break;
    }
  }
  
  return elements;
}

/**
 * Extract text content from an element using multiple possible selectors
 * @param {string} platform - Platform name
 * @param {Element} element - Element to extract from
 * @param {string} selectorType - Type of content to extract (e.g., 'content', 'user')
 * @returns {string} - Extracted text content
 */
export function extractText(platform, element, selectorType) {
  if (!SELECTORS[platform] || !SELECTORS[platform][selectorType]) {
    return '';
  }
  
  const selectors = SELECTORS[platform][selectorType];
  
  for (const selector of selectors) {
    const contentElements = element.querySelectorAll(selector);
    if (contentElements && contentElements.length > 0) {
      for (const el of contentElements) {
        if (el.textContent && el.textContent.trim().length > 0) {
          return el.textContent.trim();
        }
      }
    }
  }
  
  // Fallback: try to get direct text content if it has a reasonable length
  if (element.textContent && element.textContent.trim().length > 0 && 
      element.textContent.trim().length < 1000) {
    return element.textContent.trim();
  }
  
  return '';
}

/**
 * Extract image URLs from a post element
 * @param {string} platform - Platform name
 * @param {Element} element - Element to extract from
 * @returns {Array} - Array of image URLs
 */
export function extractImages(platform, element) {
  const imageUrls = [];
  const imageElements = findElements(platform, 'images', element);
  
  for (const img of imageElements) {
    // Use srcset if available for better quality
    if (img.srcset) {
      const bestSrc = getBestImageSrc(img.srcset);
      if (bestSrc) {
        imageUrls.push(bestSrc);
      } else if (img.src) {
        imageUrls.push(img.src);
      }
    } else if (img.src) {
      // Skip profile pictures and icons
      if ((platform === 'facebook' && !img.src.includes('profile-pic')) ||
          (platform === 'instagram' && !img.src.includes('profile_pic')) ||
          (platform === 'linkedin' && !img.src.includes('ghost-person'))) {
        imageUrls.push(img.src);
      }
    }
  }
  
  return imageUrls;
}

/**
 * Extract engagement data (likes, comments, shares) from a post
 * @param {string} platform - Platform name
 * @param {Element} element - Element to extract from
 * @returns {Object} - Engagement counts
 */
export function extractEngagement(platform, element) {
  const engagement = {
    likes: 0,
    comments: 0,
    shares: 0
  };
  
  // Process each engagement type
  for (const type of Object.keys(engagement)) {
    // Skip if this platform doesn't have this engagement type
    if (!SELECTORS[platform].engagement[type]) continue;
    
    // Try each selector for this engagement type
    for (const selector of SELECTORS[platform].engagement[type]) {
      const engagementElements = element.querySelectorAll(selector);
      if (engagementElements && engagementElements.length > 0) {
        for (const el of engagementElements) {
          if (el.textContent) {
            const count = parseSocialCount(el.textContent);
            if (count > 0) {
              engagement[type] = count;
              break;
            }
          }
        }
      }
      if (engagement[type] > 0) break; // Found a valid count, stop trying more selectors
    }
  }
  
  return engagement;
}

/**
 * Check if post is sponsored/ad content
 * @param {string} platform - Platform name
 * @param {Element} element - Element to check
 * @returns {boolean} - True if post is sponsored
 */
export function isSponsored(platform, element) {
  if (!SELECTORS[platform].sponsored) return false;
  
  // Check text content for sponsored indicators
  const text = element.textContent.toLowerCase();
  if ((platform === 'facebook' && (text.includes('sponsored') || text.includes('suggested for you'))) ||
      (platform === 'instagram' && (text.includes('sponsored') || text.includes('paid partnership'))) ||
      (platform === 'linkedin' && (text.includes('promoted') || text.includes('sponsored')))) {
    return true;
  }
  
  // Check for sponsored elements
  for (const selector of SELECTORS[platform].sponsored) {
    const sponsoredElements = element.querySelectorAll(selector);
    if (sponsoredElements && sponsoredElements.length > 0) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if post is a job listing (LinkedIn specific, but safely returns false for other platforms)
 * @param {string} platform - Platform name
 * @param {Element} element - Element to check
 * @returns {boolean} - True if post is a job listing
 */
export function isJobPost(platform, element) {
  if (platform !== 'linkedin' || !SELECTORS[platform].jobPost) return false;
  
  // Check text content for job indicators
  const text = element.textContent.toLowerCase();
  if (text.includes('hiring') || 
      text.includes('job opening') || 
      text.includes('apply now') ||
      text.includes('we are looking for')) {
    return true;
  }
  
  // Check for job post elements
  for (const selector of SELECTORS[platform].jobPost) {
    const jobElements = element.querySelectorAll(selector);
    if (jobElements && jobElements.length > 0) {
      return true;
    }
  }
  
  return false;
}

/**
 * Extract full post data from an element
 * @param {string} platform - Platform name (facebook, instagram, linkedin)
 * @param {Element} element - Post element
 * @returns {Object} - Structured post data
 */
export function extractPostData(platform, element) {
  try {
    // Extract basic data
    const content = extractText(platform, element, 'content');
    const username = extractText(platform, element, 'user');
    const imageUrls = extractImages(platform, element);
    const engagement = extractEngagement(platform, element);
    
    // Skip posts without meaningful content
    if ((!content || content.length < 5) && imageUrls.length === 0) {
      return null;
    }
    
    // Extract hashtags
    const hashtags = [];
    const hashtagMatches = content.match(/#[a-zA-Z0-9_]+/g);
    if (hashtagMatches) {
      hashtagMatches.forEach(tag => {
        hashtags.push(tag.substring(1)); // Remove the # symbol
      });
    }
    
    // Generate a content hash for deduplication
    const contentHash = generateContentHash(content);
    
    // Create post object with standardized structure
    const post = {
      platform: platform,
      content: content,
      original_user: username || 'unknown',
      timestamp: new Date().toISOString(),
      collected_at: new Date().toISOString(),
      image_urls: imageUrls.join(','),
      url: window.location.href,
      likes: engagement.likes,
      comments: engagement.comments,
      shares: engagement.shares,
      is_sponsored: isSponsored(platform, element),
      is_job_post: isJobPost(platform, element),
      verified: false, // This is difficult to detect reliably across platforms
      is_friend: false, // Not reliable without additional API calls
      is_family: false, // Not reliable without additional API calls
      content_length: content ? content.length : 0,
      hashtags: hashtags.join(','),
      metadata: {
        contentHash: contentHash,
        hasComments: engagement.comments > 0,
        hasReactions: engagement.likes > 0
      }
    };
    
    return post;
  } catch (error) {
    console.error(`[Authentic] Error extracting post data:`, error);
    return null;
  }
}

/**
 * Parse social media counts that include K/M suffixes
 * @param {string} text - The count text (e.g., "1.2K likes")
 * @returns {number} - Parsed count
 */
export function parseSocialCount(text) {
  if (!text) return 0;
  
  // Extract the number part
  const match = text.match(/(\d+(?:\.\d+)?)\s*([KkMm])?/);
  if (!match) return 0;
  
  const [_, num, suffix] = match;
  let count = parseFloat(num);
  
  // Apply multiplier for K/M suffixes
  if (suffix && (suffix === 'K' || suffix === 'k')) {
    count *= 1000;
  } else if (suffix && (suffix === 'M' || suffix === 'm')) {
    count *= 1000000;
  }
  
  return Math.round(count);
}

/**
 * Generate a content hash for deduplication
 * @param {string} content - Content to hash
 * @returns {string} - Hash string
 */
export function generateContentHash(content) {
  if (!content) return '0';
  
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  return hash.toString();
}

/**
 * Get best image source from srcset attribute
 * @param {string} srcset - Value of the srcset attribute
 * @returns {string|null} - Best image URL
 */
export function getBestImageSrc(srcset) {
  if (!srcset) return null;
  
  try {
    // Parse the srcset into an array of {url, width} objects
    const sources = srcset.split(',').map(src => {
      const [url, width] = src.trim().split(' ');
      return {
        url: url,
        width: width ? parseInt(width.replace('w', '')) : 0
      };
    });
    
    // Sort by width descending and take the highest resolution
    sources.sort((a, b) => b.width - a.width);
    return sources.length > 0 ? sources[0].url : null;
  } catch (error) {
    console.error("Error parsing srcset:", error);
    return null;
  }
}

/**
 * Simulates infinite scrolling to load more content
 * @param {Object} options - Configuration options
 * @returns {Promise<number>} - Number of new elements found
 */
export function simulateInfiniteScroll(options = {}) {
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
    
    let lastElementCount = document.querySelectorAll(settings.targetSelector).length;
    console.log(`[Authentic] Initial element count: ${lastElementCount}`);
    
    const scrollStartTime = Date.now();
    let noNewElementsCount = 0;
    let scrollAttempts = 0;
    
    // Start the scrolling process
    const scrollInterval = setInterval(() => {
      // Check if we've been scrolling for too long
      if (Date.now() - scrollStartTime > settings.maxScrollTime) {
        console.log(`[Authentic] Reached maximum scroll time (${settings.maxScrollTime}ms)`);
        clearInterval(scrollInterval);
        resolve(document.querySelectorAll(settings.targetSelector).length);
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
          const currentElementCount = document.querySelectorAll(settings.targetSelector).length;
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
          
          // Resume scrolling
          scrollInterval = setInterval(/* Same scroll logic */);
        }, settings.pauseDuration);
      }
    }, settings.scrollInterval);
  });
}

/**
 * Create and send data to the background script to be forwarded to the API
 * @param {Array} posts - Array of post objects to send
 * @param {string} platform - Platform name
 * @returns {Promise} - Promise that resolves with API response
 */
export function sendPostsToAPI(posts, platform) {
  return new Promise((resolve, reject) => {
    if (!posts || !Array.isArray(posts) || posts.length === 0) {
      return reject(new Error('No valid posts to send'));
    }
    
    // Generate a batch ID for this upload
    const batchId = `batch_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
    
    console.log(`[Authentic] Sending ${posts.length} ${platform} posts to API (batch: ${batchId})`);
    
    // Send message to background script to forward to API
    chrome.runtime.sendMessage({
      action: 'sendPosts',
      platform: platform,
      posts: posts,
      batchId: batchId
    }, response => {
      if (chrome.runtime.lastError) {
        console.error('[Authentic] Error communicating with background script:', chrome.runtime.lastError);
        reject(chrome.runtime.lastError);
        return;
      }
      
      if (response && response.success) {
        console.log(`[Authentic] Successfully sent ${posts.length} posts to API`);
        resolve(response);
      } else {
        console.error('[Authentic] Failed to send posts to API:', response?.error || 'Unknown error');
        reject(new Error(response?.error || 'Unknown error sending posts to API'));
      }
    });
  });
} 