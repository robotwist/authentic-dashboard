/**
 * worker.js - Background worker functionality for Authentic Dashboard
 * 
 * Handles creation and management of web workers for background processing.
 */

import { generatePostFingerprint } from './utils.js';

let backgroundWorker = null;

/**
 * Try to create a background worker for processing tasks
 * @returns {Promise<Worker|null>} - Promise resolving to Worker or null if unavailable
 */
function createBackgroundWorker() {
  return new Promise((resolve) => {
    try {
      // Check if workers are supported in this context
      if (typeof Worker === 'undefined') {
        console.log("Web Workers are not supported in this context");
        resolve(null);
        return;
      }
      
      // Create a blob URL for the worker script
      const workerScript = `
        // Background worker for processing posts
        self.onmessage = function(e) {
          const { action, data, id } = e.data;
          
          console.log('Worker received task:', action, id);
          
          switch (action) {
            case 'processPosts':
              processPosts(data.posts, data.settings, id);
              break;
            case 'deduplicate':
              deduplicatePosts(data.posts, data.existing || [], id);
              break;
            case 'ping':
              // Simple ping to check if worker is alive
              self.postMessage({ 
                action: 'pong', 
                id: id,
                timestamp: Date.now() 
              });
              break;
            default:
              self.postMessage({ 
                action: 'error', 
                id: id,
                error: 'Unknown action: ' + action 
              });
          }
        };
        
        // Process posts to extract additional features and metadata
        function processPosts(posts, settings, taskId) {
          if (!posts || !Array.isArray(posts)) {
            self.postMessage({ 
              action: 'error', 
              id: taskId,
              error: 'Invalid posts data' 
            });
            return;
          }
          
          try {
            const startTime = Date.now();
            const enhancedPosts = posts.map(post => {
              // Clone the post to avoid modifying original
              const enhancedPost = {...post};
              
              // Extract and count hashtags if not already present
              if (post.content && !post.hashtags) {
                const hashtagMatches = post.content.match(/#[a-zA-Z0-9_]+/g) || [];
                enhancedPost.hashtags = hashtagMatches.map(tag => tag.substring(1)).join(',');
                enhancedPost.hashtag_count = hashtagMatches.length;
              }
              
              // Count mentions
              if (post.content) {
                const mentionMatches = post.content.match(/@[a-zA-Z0-9_]+/g) || [];
                enhancedPost.mention_count = mentionMatches.length;
              }
              
              // Analyze content length
              if (post.content) {
                enhancedPost.content_length = post.content.length;
                enhancedPost.word_count = post.content.split(/\\s+/).filter(Boolean).length;
              }
              
              // Detect probable ads based on keywords if not already flagged
              if (post.content && !post.is_sponsored) {
                const adKeywords = ['sponsored', 'partner', 'promotion', 'ad', 'advertisement', 
                                   'paid', 'offer', 'discount', 'sale', 'buy', 'promo'];
                const hasAdKeywords = adKeywords.some(keyword => 
                  post.content.toLowerCase().includes(keyword)
                );
                
                enhancedPost.probably_sponsored = hasAdKeywords;
              }
              
              return enhancedPost;
            });
            
            const duration = Date.now() - startTime;
            
            self.postMessage({ 
              action: 'processPostsComplete', 
              id: taskId,
              posts: enhancedPosts,
              stats: {
                count: enhancedPosts.length,
                duration: duration,
                avgTimePerPost: Math.round(duration / enhancedPosts.length)
              }
            });
          } catch (error) {
            self.postMessage({ 
              action: 'error', 
              id: taskId,
              error: error.toString(),
              stack: error.stack
            });
          }
        }
        
        // Function to deduplicate posts based on content
        function deduplicatePosts(newPosts, existingPosts, taskId) {
          if (!newPosts || !Array.isArray(newPosts)) {
            self.postMessage({ 
              action: 'error', 
              id: taskId,
              error: 'Invalid posts data' 
            });
            return;
          }
          
          try {
            const startTime = Date.now();
            
            // Create a Set of fingerprints from existing posts
            const existingFingerprints = new Set();
            
            existingPosts.forEach(post => {
              const fingerprint = generatePostFingerprint(post);
              existingFingerprints.add(fingerprint);
            });
            
            // Filter out duplicates
            const uniquePosts = newPosts.filter(post => {
              const fingerprint = generatePostFingerprint(post);
              return !existingFingerprints.has(fingerprint);
            });
            
            const duration = Date.now() - startTime;
            
            self.postMessage({ 
              action: 'deduplicateComplete', 
              id: taskId,
              posts: uniquePosts,
              stats: {
                original: newPosts.length,
                unique: uniquePosts.length,
                duplicates: newPosts.length - uniquePosts.length,
                duration: duration
              }
            });
          } catch (error) {
            self.postMessage({ 
              action: 'error', 
              id: taskId,
              error: error.toString(),
              stack: error.stack
            });
          }
        }
        
        // Helper function to generate a fingerprint for a post
        function generatePostFingerprint(post) {
          // Use a combination of platform, user, and content
          const platform = post.platform || '';
          const user = post.original_user || post.user || '';
          const content = post.content || '';
          
          // Take first 50 chars of content for fingerprint
          const contentSnippet = content.substring(0, 50);
          
          return \`\${platform}:\${user}:\${contentSnippet}\`;
        }
      `;
      
      // Create a blob with the worker code
      const blob = new Blob([workerScript], { type: 'application/javascript' });
      const blobURL = URL.createObjectURL(blob);
      
      // Create the worker
      const worker = new Worker(blobURL);
      
      // Set up message handler
      worker.onmessage = function(e) {
        const { action, id, error, posts, stats } = e.data;
        
        if (action === 'error') {
          console.error(`Worker error (${id}):`, error);
        } else if (action === 'processPostsComplete') {
          console.log(`Worker completed post processing (${id}):`, stats);
        } else if (action === 'deduplicateComplete') {
          console.log(`Worker completed deduplication (${id}):`, stats);
        } else if (action === 'pong') {
          console.log(`Worker is responsive (${id}), responded in ${Date.now() - stats.timestamp}ms`);
        }
      };
      
      // Handle worker errors
      worker.onerror = function(error) {
        console.error('Worker error:', error);
      };
      
      // Test the worker with a ping
      worker.postMessage({ 
        action: 'ping', 
        id: 'init_' + Date.now(),
        data: {} 
      });
      
      console.log('Background worker created successfully');
      resolve(worker);
    } catch (error) {
      console.error('Error creating background worker:', error);
      resolve(null);
    }
  });
}

/**
 * Initialize the background worker
 * @returns {Promise<Worker|null>} - Promise resolving to Worker or null if unavailable
 */
async function initializeWorker() {
  backgroundWorker = await createBackgroundWorker();
  return backgroundWorker;
}

/**
 * Process posts in the main thread if no worker is available
 * @param {Array} posts - Array of posts to process
 * @param {Object} settings - Processing settings
 * @returns {Array} - Enhanced posts
 */
function processPostsInMainThread(posts, settings = {}) {
  if (!posts || !Array.isArray(posts)) {
    throw new Error('Invalid posts data');
  }
  
  const enhancedPosts = posts.map(post => {
    // Clone the post to avoid modifying original
    const enhancedPost = {...post};
    
    // Extract and count hashtags if not already present
    if (post.content && !post.hashtags) {
      const hashtagMatches = post.content.match(/#[a-zA-Z0-9_]+/g) || [];
      enhancedPost.hashtags = hashtagMatches.map(tag => tag.substring(1)).join(',');
      enhancedPost.hashtag_count = hashtagMatches.length;
    }
    
    // Count mentions
    if (post.content) {
      const mentionMatches = post.content.match(/@[a-zA-Z0-9_]+/g) || [];
      enhancedPost.mention_count = mentionMatches.length;
    }
    
    // Analyze content length
    if (post.content) {
      enhancedPost.content_length = post.content.length;
      enhancedPost.word_count = post.content.split(/\s+/).filter(Boolean).length;
    }
    
    // Detect probable ads based on keywords if not already flagged
    if (post.content && !post.is_sponsored) {
      const adKeywords = ['sponsored', 'partner', 'promotion', 'ad', 'advertisement', 
                         'paid', 'offer', 'discount', 'sale', 'buy', 'promo'];
      const hasAdKeywords = adKeywords.some(keyword => 
        post.content.toLowerCase().includes(keyword)
      );
      
      enhancedPost.probably_sponsored = hasAdKeywords;
    }
    
    return enhancedPost;
  });
  
  return enhancedPosts;
}

/**
 * Deduplicate posts in the main thread if no worker is available
 * @param {Array} newPosts - New posts to check
 * @param {Array} existingPosts - Existing posts to check against
 * @returns {Object} - Result containing unique posts and stats
 */
function deduplicatePostsInMainThread(newPosts, existingPosts = []) {
  if (!newPosts || !Array.isArray(newPosts)) {
    throw new Error('Invalid posts data');
  }
  
  // Create a Set of fingerprints from existing posts
  const existingFingerprints = new Set();
  
  existingPosts.forEach(post => {
    const fingerprint = generatePostFingerprint(post);
    existingFingerprints.add(fingerprint);
  });
  
  // Filter out duplicates
  const uniquePosts = newPosts.filter(post => {
    const fingerprint = generatePostFingerprint(post);
    return !existingFingerprints.has(fingerprint);
  });
  
  return {
    uniquePosts,
    stats: {
      original: newPosts.length,
      unique: uniquePosts.length,
      duplicates: newPosts.length - uniquePosts.length
    }
  };
}

export {
  initializeWorker,
  processPostsInMainThread,
  deduplicatePostsInMainThread
}; 