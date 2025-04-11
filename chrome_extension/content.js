// Ultimate Directive
// I think the ultimate directive that should guide development could be:
// > "Restore user sovereignty over the digital experience by creating transparent tools that prioritize genuine human satisfaction rather than engagement metrics."
// This directive emphasizes:
// User control ("sovereignty")
// Transparency in how content is filtered
// Human-centered design (satisfaction vs engagement)
// Ethical technology principles

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
  console.log("Starting Instagram post collection...");
  const posts = [];
  
  try {
    // Find all post containers
    const articleElements = document.querySelectorAll('article');
    
    console.log(`Found ${articleElements.length} potential Instagram posts`);
    
    if (!articleElements || articleElements.length === 0) {
      console.log("No Instagram posts found on page");
      return [];
    }
    
    articleElements.forEach((article, index) => {
      try {
        // Get the content text
        let content = "";
        const contentElement = article.querySelector('h1 + div, div._a9zr > div');
        
        if (contentElement) {
          content = contentElement.innerText || "";
        }
        
        // Skip if content is too short (likely not a real post)
        if (!content || content.length < 5) {
          return;
        }
        
        // Extract user information
        let user = "unknown";
        const userElement = article.querySelector('header span > a, header h2 a');
        if (userElement) {
          user = userElement.innerText.trim();
        }
        
        // Check if verified
        const verifiedBadge = article.querySelector('header span.coreSpriteVerifiedBadge, svg[aria-label="Verified"]');
        const isVerified = verifiedBadge !== null;
        
        // Check friendship status (look for "Follow" button)
        const followButton = article.querySelector('button:not(.following)');
        const isFriend = followButton === null || followButton.innerText !== 'Follow';
        
        // Check for sponsored content
        const isSponsored = article.innerText.includes('Sponsored') || 
                          article.innerText.includes('Paid partnership');
        
        // Get engagement metrics
        let likes = 0;
        const likeElement = article.querySelector('section span > div:first-child');
        if (likeElement) {
          const likeText = likeElement.innerText.trim();
          likes = parseSocialCount(likeText);
        }
        
        // Extract images
        const imageUrls = [];
        article.querySelectorAll('img[srcset], img[src*="instagram"]').forEach(img => {
          if (img.src && !imageUrls.includes(img.src)) {
            imageUrls.push(img.src);
          }
        });
        
        // Extract hashtags and mentions
        const hashtags = extractHashtags(content);
        
        const mentions = [];
        const mentionMatches = content.match(/@[\w.]+/g);
        if (mentionMatches) {
          mentionMatches.forEach(mention => {
            if (!mentions.includes(mention)) mentions.push(mention);
          });
        }
        
        // Simple sentiment analysis
        let sentimentScore = 0;
        let positiveCount = 0;
        let negativeCount = 0;
        
        const lowerContent = content.toLowerCase();
        
        // Check positive words
        const positiveWords = ['love', 'happy', 'beautiful', 'amazing', 'great', 'awesome', 'perfect'];
        positiveWords.forEach(word => {
          const regex = new RegExp('\\b' + word + '\\b', 'gi');
          const matches = lowerContent.match(regex);
          if (matches) positiveCount += matches.length;
        });
        
        // Check negative words
        const negativeWords = ['hate', 'sad', 'angry', 'terrible', 'awful', 'worst', 'disappointed'];
        negativeWords.forEach(word => {
          const regex = new RegExp('\\b' + word + '\\b', 'gi');
          const matches = lowerContent.match(regex);
          if (matches) negativeCount += matches.length;
        });
        
        // Calculate sentiment score
        const totalSentiment = positiveCount + negativeCount;
        if (totalSentiment > 0) {
          sentimentScore = (positiveCount - negativeCount) / totalSentiment;
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
          sentiment_score: sentimentScore,
          sentiment_indicators: {
            positive: positiveCount,
            negative: negativeCount
          },
          is_sponsored: isSponsored,
          content_length: content.length
        });
        
        console.log(`Added Instagram post from ${user}`);
      } catch (err) {
        console.error(`Error processing Instagram post ${index}:`, err);
      }
    });
    
    console.log(`Collected ${posts.length} Instagram posts`);
    
    // Send posts via background script if we collected any
    if (posts.length > 0) {
      // Get API key and endpoint from storage
      chrome.storage.local.get(['apiKey', 'apiEndpoint'], function(result) {
        const apiKey = result.apiKey || '42ad72779a934c2d8005992bbecb6772'; // Default fallback API key
        const apiEndpoint = result.apiEndpoint || 'http://localhost:8000';
        
        try {
          console.log(`Sending ${posts.length} Instagram posts to background script`);
          sendMessageWithRetry({
            action: 'sendPosts',
            platform: 'instagram',
            posts: posts,
            apiKey: apiKey,
            apiEndpoint: apiEndpoint
          }, 3)
          .then(response => {
            console.log("Instagram posts processed successfully:", response);
          })
          .catch(error => {
            console.error("Error sending Instagram posts:", error);
            // Update connection error counter
            connectionErrorCount++;
            lastConnectionError = error.message || "Error sending posts";
            
            if (connectionErrorCount >= MAX_CONNECTION_ERRORS) {
              console.error(`Too many connection errors (${connectionErrorCount}). Last error: ${lastConnectionError}`);
            }
          });
        } catch (err) {
          console.error("Exception when sending Instagram posts:", err);
        }
      });
    }
    
    return posts;
  } catch (err) {
    console.error("Fatal error in Instagram collection:", err);
    return [];
  }
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
  console.log("Starting Facebook post collection...");
  const posts = [];
  
  try {
    // Find all post containers
    const postElements = document.querySelectorAll('[data-pagelet^="FeedUnit"]');
    
    console.log(`Found ${postElements.length} potential Facebook posts`);
    
    if (!postElements || postElements.length === 0) {
      console.log("No Facebook posts found on page");
      return [];
    }

    // Process each post with proper error handling
    postElements.forEach((el, index) => {
      try {
        if (!el) return; // Skip invalid elements
        
        // Get the content safely
        let content = "";
        try {
          // Try different content container selectors
          const contentContainer = 
            el.querySelector('[data-ad-comet-preview="message"]') || 
            el.querySelector('[data-ad-preview="message"]') ||
            el.querySelector('[dir="auto"]');
          
          if (contentContainer) {
            content = contentContainer.innerText || "";
          }
        } catch (err) {
          console.warn(`Error getting FB post content for post ${index}:`, err);
        }
        
        // Skip if content is too short
        if (!content || content.length < 10) {
          return;
        }
        
        console.log(`Collecting Facebook post ${index} from user , length: ${content.length} chars`);
        
        // Extract other post attributes safely
        let user = "unknown";
        let isVerified = false;
        let isFamily = false;
        let isSponsored = false;
        let likes = 0;
        let comments = 0;
        let shares = 0;
        let timestamp = '';
        let imageUrls = [];
        let hashtags = [];
        let mentions = [];
        let externalLinks = [];
        
        try {
          // Extract user name
          const nameElement = el.querySelector('a[role="link"] > strong') ||
                             el.querySelector('span[dir="auto"] > span.xt0psk2');
          
          if (nameElement) {
            user = nameElement.innerText.trim();
          }
          
          // Check for verified badge
          isVerified = el.querySelector('svg.n00je7tq.arfg74bv.qs9ysxi8.k77z8yql.bi6gxh9e') !== null;
          
          // Check for sponsored content
          isSponsored = content.includes('#ad') || 
                        content.includes('#sponsored') ||
                        el.innerText.includes('Sponsored');
          
          // Check for family status (look for family-related text)
          isFamily = content.toLowerCase().includes('my family') || 
                    content.toLowerCase().includes('our family');
                    
          // Get likes count
          const likeCountElement = el.querySelector('span.gpro0wi8');
          if (likeCountElement) {
            likes = parseFacebookCount(likeCountElement.innerText);
          }
          
          // Get comments and shares
          const engagementRow = el.querySelector('span.d2edcug0.hpfvmrgz');
          if (engagementRow) {
            const engagementText = engagementRow.innerText;
            
            if (engagementText.includes('comment')) {
              const commentMatch = engagementText.match(/(\d+)\s*comment/);
              if (commentMatch) comments = parseInt(commentMatch[1]);
            }
            
            if (engagementText.includes('share')) {
              const shareMatch = engagementText.match(/(\d+)\s*share/);
              if (shareMatch) shares = parseInt(shareMatch[1]);
            }
          }
          
          // Get timestamp
          const timeElement = el.querySelector('a.qi72231t > span.gvxzyvdx.aeinzg81.t7p7dqev.gh25dzvf');
          if (timeElement) {
            timestamp = timeElement.innerText;
          }
          
          // Extract image URLs
          el.querySelectorAll('img.i09qtzwb').forEach(img => {
            if (img.src && !img.src.includes('emoji') && !imageUrls.includes(img.src)) {
              imageUrls.push(img.src);
            }
          });
          
          // Extract hashtags, mentions and external links
          hashtags = extractHashtags(content);
          
          const mentionMatches = content.match(/@[\w.]+/g);
          if (mentionMatches) {
            mentions = Array.from(new Set(mentionMatches));
          }
          
          // Look for links
          el.querySelectorAll('a[href^="http"]').forEach(link => {
            const href = link.href;
            if (!href.includes('facebook.com') && !externalLinks.includes(href)) {
              externalLinks.push(href);
            }
          });
        } catch (err) {
          console.warn(`Error processing Facebook post ${index} metadata:`, err);
        }
        
        // Sentiment analysis
        let sentimentScore = 0;
        let positiveCount = 0;
        let negativeCount = 0;
        
        try {
          // Simple sentiment analysis
          const positiveWords = ['happy', 'great', 'love', 'excited', 'amazing', 'wonderful', 'thank'];
          const negativeWords = ['sad', 'angry', 'hate', 'terrible', 'awful', 'disappointing', 'upset'];
          
          const lowerContent = content.toLowerCase();
          
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
          
          // Calculate sentiment score
          const totalSentiment = positiveCount + negativeCount;
          if (totalSentiment > 0) {
            sentimentScore = (positiveCount - negativeCount) / totalSentiment;
          }
        } catch (err) {
          console.warn(`Error processing sentiment for Facebook post ${index}:`, err);
        }
        
        // Create post object
        const post = {
          content: content,
          platform: 'facebook',
          user: user,
          is_friend: el.querySelector('.sv5sfqaa') !== null,
          is_family: isFamily,
          verified: isVerified,
          image_urls: imageUrls.slice(0, 3).join(','),
          timestamp: timestamp,
          collected_at: new Date().toISOString(),
          likes: likes,
          comments: comments,
          shares: shares,
          mentions: mentions.join(','),
          hashtags: hashtags.join(','),
          external_links: externalLinks.join(','),
          sentiment_score: sentimentScore,
          sentiment_indicators: {
            positive: positiveCount,
            negative: negativeCount
          },
          is_sponsored: isSponsored,
          content_length: content.length
        };
        
        posts.push(post);
        console.log(`Added Facebook post to collection: ${content.substr(0, 50)}...`);
      } catch (err) {
        console.error(`Error processing Facebook post ${index}:`, err);
      }
    });

    console.log(`Collected ${posts.length} Facebook posts`);
  
    // Send posts through background script if any were collected
    if (posts.length > 0) {
      // Use message passing to send posts to background script which will handle the API call
      chrome.storage.local.get(['apiKey', 'apiEndpoint'], function(result) {
        const apiKey = result.apiKey || '42ad72779a934c2d8005992bbecb6772'; // Default fallback API key
        const apiEndpoint = result.apiEndpoint || 'http://localhost:8000';
        
        console.log(`Sending ${posts.length} Facebook posts to background script`);
        
        try {
          // Use the retry-enabled message passing function for reliability
          sendMessageWithRetry({
            action: 'sendPosts',
            platform: 'facebook',
            posts: posts,
            apiKey: apiKey,
            apiEndpoint: apiEndpoint
          }, 3)
          .then(response => {
            console.log("Facebook posts processed successfully:", response);
          })
          .catch(error => {
            console.error("Error sending Facebook posts:", error);
            // Update connection error counter
            connectionErrorCount++;
            lastConnectionError = error.message || "Error sending posts";
            
            if (connectionErrorCount >= MAX_CONNECTION_ERRORS) {
              console.error(`Too many connection errors (${connectionErrorCount}). Last error: ${lastConnectionError}`);
            }
          });
        } catch (err) {
          console.error("Exception when sending Facebook posts:", err);
        }
      });
    }

    return posts;
  } catch (err) {
    console.error("Fatal error in Facebook collection:", err);
    return [];
  }
}

/**
 * Helper function to send posts using direct fetch API
 * NOTE: This function is modified to use the background script
 */
function sendWithDirectFetch(posts, apiKey, apiEndpoint) {
  console.log("Using background script to send posts");
  
  // Send the posts to the background script instead of making direct fetch
  chrome.runtime.sendMessage({
    action: 'sendPosts',
    platform: 'facebook',
    posts: posts,
    apiKey: apiKey,
    apiEndpoint: apiEndpoint
  }, function(response) {
    if (chrome.runtime.lastError) {
      console.error("Error sending posts to background script:", chrome.runtime.lastError);
    } else {
      console.log("Successfully sent posts to background script:", response);
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
          
          // Calculate sentiment score
          const totalSentiment = positiveCount + negativeCount;
          if (totalSentiment > 0) {
            sentimentScore = (positiveCount - negativeCount) / totalSentiment;
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
        
        // Create post object with all collected data
        if (content.length > 30) {  // Only capture posts with sufficient content
          posts.push({
            content,
            platform: 'linkedin',
            user: user,
            is_friend: isFriend,
            is_family: false,
            category: hashtags.join(','),
            verified: isVerified,
            image_urls: imageUrls.slice(0, 3).join(','),
            collected_at: new Date().toISOString(),
            timestamp: timestamp,
            likes: likes,
            comments: comments,
            connection_degree: connectionDegree,
            mentions: mentions.join(','),
            hashtags: hashtags.join(','),
            sentiment_score: sentimentScore,
            bizfluencer_score: bizfluencerScore,
            is_job_post: isJobPost,
            content_length: content.length
          });
        }
      } catch (err) {
        console.error("Error processing LinkedIn post:", err);
      }
    });
    
    console.log(`Collected ${posts.length} LinkedIn posts`);
    
    // Send all posts at once in a batch instead of one by one
    if (posts.length > 0) {
      // Get API key and endpoint from storage
      chrome.storage.local.get(['apiKey', 'apiEndpoint'], function(result) {
        const apiKey = result.apiKey || '8484e01c2e0b4d368eb9a0f9b89807ad'; // Default fallback API key
        
        // Format post boolean values
        const formattedPosts = posts.map(post => ({
          ...post,
          is_friend: Boolean(post.is_friend),
          is_family: Boolean(post.is_family),
          verified: Boolean(post.verified),
          is_sponsored: Boolean(post.is_sponsored),
          is_job_post: Boolean(post.is_job_post)
        }));
        
        // Send posts through background script
        try {
          console.log(`Sending ${formattedPosts.length} LinkedIn posts to background script`);
          sendMessageWithRetry({
            action: 'sendPosts',
            platform: 'linkedin',
            posts: formattedPosts,
            apiKey: apiKey,
            apiEndpoint: result.apiEndpoint
          }, 3)
          .then(response => {
            console.log("LinkedIn posts processed successfully:", response);
          })
          .catch(error => {
            console.error("Error sending LinkedIn posts:", error);
          });
        } catch (err) {
          console.error("Exception when sending LinkedIn posts:", err);
        }
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
