/**
 * pure_feed.js - Lightweight Post Classification and Ranking System
 * 
 * This module provides local in-browser ranking and classification of social media posts
 * to create a "Pure Feed" that prioritizes authentic, meaningful content.
 */

// Import FlexSearch for fast in-browser indexing
let FlexSearch = null;

// Import TensorFlow.js for ML classification
let tf = null;

// Global post index and classifier
let postIndex = null;
let postClassifier = null;
let isInitialized = false;
let pendingPosts = [];

// Configuration constants
const AUTHENTICITY_FACTORS = {
  SENTIMENT: 0.25,         // Positive content gets a boost
  BIZFLUENCER: -0.30,      // Corporate speak is penalized
  LENGTH: 0.15,            // Favor medium-length posts (not too short, not too long)
  ENGAGEMENT: 0.05,        // Small bonus for engagement (but don't overvalue it)
  LOCAL_ML: 0.25,          // TensorFlow model score
  MANIPULATIVE: -0.35,     // Heavy penalty for manipulative patterns
  SPONSORED: -0.50,        // Major penalty for sponsored content
  FRIEND_BONUS: 0.15,      // Bonus for content from friends
  FAMILY_BONUS: 0.20,      // Extra bonus for family connections
};

// Authenticity score categories (0-100 scale)
const AUTHENTICITY_CATEGORIES = [
  { name: "Pure soul", range: [90, 100], description: "Vulnerable, funny, deep, unique." },
  { name: "Insightful", range: [70, 89], description: "Honest, charmingly human." },
  { name: "Neutral", range: [40, 69], description: "Safe but not manipulative." },
  { name: "Performative", range: [20, 39], description: "Cringe, bland, try-hard." },
  { name: "Spam/Ads", range: [0, 19], description: "Spam, ads, outrage bait." }
];

/**
 * Initialize the Pure Feed module with required libraries
 */
async function initPureFeed() {
  if (isInitialized) return true;
  
  try {
    console.log("Initializing Pure Feed module...");
    
    // Load FlexSearch
    FlexSearch = await loadFlexSearch();
    
    // Initialize the post index with FlexSearch
    postIndex = new FlexSearch.Document({
      document: {
        id: "id",
        index: ["content", "original_user", "hashtags", "category"],
        store: true
      },
      tokenize: "forward",
      optimize: true,
      cache: 100
    });
    
    // Load TensorFlow.js
    tf = await loadTensorFlow();
    
    // Load our classifier model
    postClassifier = await initializeClassifier();
    
    // Process any pending posts
    if (pendingPosts.length > 0) {
      console.log(`Processing ${pendingPosts.length} pending posts`);
      for (const post of pendingPosts) {
        rankAndIndexPost(post);
      }
      pendingPosts = [];
    }
    
    isInitialized = true;
    console.log("Pure Feed module initialized successfully");
    return true;
  } catch (error) {
    console.error("Error initializing Pure Feed module:", error);
    return false;
  }
}

/**
 * Load FlexSearch library
 */
function loadFlexSearch() {
  return new Promise((resolve, reject) => {
    try {
      // Check if already available in window
      if (window.FlexSearch) {
        return resolve(window.FlexSearch);
      }
      
      // Dynamically load FlexSearch
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('lib/flexsearch.min.js');
      script.onload = () => resolve(window.FlexSearch);
      script.onerror = (e) => reject(new Error(`Failed to load FlexSearch: ${e}`));
      document.head.appendChild(script);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Load TensorFlow.js library
 */
function loadTensorFlow() {
  return new Promise((resolve, reject) => {
    try {
      // Check if already available in window
      if (window.tf) {
        return resolve(window.tf);
      }
      
      // Dynamically load TensorFlow.js
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('lib/tf.min.js');
      script.onload = () => resolve(window.tf);
      script.onerror = (e) => reject(new Error(`Failed to load TensorFlow: ${e}`));
      document.head.appendChild(script);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Initialize the TensorFlow.js classifier model
 * For now, we'll use a simple classifier based on Universal Sentence Encoder
 * Eventually, we'd replace this with a true model imported from ml_models/post_classifier.json
 */
async function initializeClassifier() {
  try {
    // For now, return a mock classifier that uses rules-based scoring
    // In a full implementation, we'd load a TF.js model here
    return {
      predict: function(text) {
        // Simple classifier based on content markers
        const lowerText = text.toLowerCase();
        
        // Rule-based markers for authenticity
        const authenticityMarkers = [
          'just wanted to share', 'honestly', 'my experience', 'i feel', 
          'i think', 'learned', 'personal', 'genuine', 'sharing', 'perspective'
        ];
        
        // Rule-based markers for promotional content
        const promotionalMarkers = [
          'buy now', 'limited time', 'offer', 'discount', 'promotion', 'click here',
          'purchase', 'best deal', 'sponsored', 'advertisement', 'giveaway', 'free'
        ];
        
        // Count marker occurrences
        let authenticCount = 0;
        let promotionalCount = 0;
        
        authenticityMarkers.forEach(marker => {
          if (lowerText.includes(marker)) authenticCount++;
        });
        
        promotionalMarkers.forEach(marker => {
          if (lowerText.includes(marker)) promotionalCount++;
        });
        
        // Calculate score (0-1 range)
        const totalMarkers = authenticCount + promotionalCount || 1;
        const score = Math.max(0, Math.min(1, 
          authenticCount / totalMarkers - (promotionalCount / totalMarkers) * 2));
        
        return score;
      }
    };
  } catch (error) {
    console.error("Error initializing post classifier:", error);
    return null;
  }
}

/**
 * Rank and index a new post
 * @param {Object} post - The post object to rank and index
 * @returns {Object} The post with an added authenticity_score property
 */
function rankAndIndexPost(post) {
  // Ensure Pure Feed module is initialized
  if (!isInitialized) {
    pendingPosts.push(post);
    initPureFeed();
    return post;
  }
  
  try {
    // Create a unique ID for the post based on platform, user, and content
    const postId = generatePostId(post);
    
    // Calculate the authenticity score
    const authenticityScore = calculateAuthenticityScore(post);
    const scoredPost = { ...post, id: postId, authenticity_score: authenticityScore };
    
    // Index the post for searching
    postIndex.add(scoredPost);
    
    // Store the post in local indexed DB
    storeRankedPost(scoredPost);
    
    return scoredPost;
  } catch (error) {
    console.error("Error ranking post:", error);
    return post;
  }
}

/**
 * Create a unique ID for a post
 */
function generatePostId(post) {
  const platform = post.platform || '';
  const user = post.original_user || post.user || '';
  const contentSnippet = (post.content || '').substring(0, 50).trim();
  
  // Use timestamp if available, otherwise current time
  const timestamp = post.timestamp || post.collected_at || new Date().toISOString();
  
  return `${platform}_${user}_${contentSnippet.replace(/[^a-zA-Z0-9]/g, '')}_${timestamp}`;
}

/**
 * Calculate an authenticity score for a post (0-100 scale)
 * Higher scores = more authentic, lower scores = more spammy/promotional
 */
function calculateAuthenticityScore(post) {
  // Start at a neutral 50%
  let score = 50;
  
  // Account for sentiment (higher is better)
  if (post.sentiment_score !== undefined) {
    // Convert from -1 to 1 scale to a ±15 point adjustment
    score += (post.sentiment_score * 15 * AUTHENTICITY_FACTORS.SENTIMENT);
  }
  
  // Penalize bizfluencer language
  if (post.bizfluencer_score !== undefined) {
    // 0-10 scale, more is worse
    score += ((10 - post.bizfluencer_score) * 2 * AUTHENTICITY_FACTORS.BIZFLUENCER);
  }
  
  // Text length sweet spot (neither too short nor too long)
  if (post.content_length !== undefined) {
    const lengthScore = post.content_length < 30 ? 0 : 
                         post.content_length > 5000 ? 0 : 
                         Math.min(10, (post.content_length / 500));
    score += (lengthScore * AUTHENTICITY_FACTORS.LENGTH);
  }
  
  // Apply ML model classification
  if (postClassifier) {
    const content = post.content || '';
    const mlScore = postClassifier.predict(content);
    score += (mlScore * 25 * AUTHENTICITY_FACTORS.LOCAL_ML);
  }
  
  // Penalize manipulative patterns
  if (post.manipulative_patterns && Array.isArray(post.manipulative_patterns)) {
    // Each pattern reduces score
    score += (-(post.manipulative_patterns.length * 7) * AUTHENTICITY_FACTORS.MANIPULATIVE);
  }
  
  // Major penalty for sponsored content
  if (post.is_sponsored) {
    score += (-25 * AUTHENTICITY_FACTORS.SPONSORED);
  }
  
  // Small bonus for friend content
  if (post.is_friend) {
    score += (10 * AUTHENTICITY_FACTORS.FRIEND_BONUS);
  }
  
  // Larger bonus for family content
  if (post.is_family) {
    score += (15 * AUTHENTICITY_FACTORS.FAMILY_BONUS);
  }
  
  // Ensure score is in 0-100 range
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Batch process multiple posts
 * @param {Array} posts - Array of post objects to rank
 * @returns {Array} Ranked posts
 */
function rankAndIndexPosts(posts) {
  // Initialize if needed
  if (!isInitialized) {
    pendingPosts = [...pendingPosts, ...posts];
    initPureFeed();
    return posts;
  }
  
  return posts.map(post => rankAndIndexPost(post));
}

/**
 * Store ranked post in local storage
 */
function storeRankedPost(post) {
  chrome.storage.local.get(['rankedPosts'], (result) => {
    const rankedPosts = result.rankedPosts || {};
    
    // Store with the post ID as key
    rankedPosts[post.id] = post;
    
    // Limit storage to most recent 1000 posts
    const postIds = Object.keys(rankedPosts);
    if (postIds.length > 1000) {
      // Delete oldest posts
      const oldestIds = postIds.slice(0, postIds.length - 1000);
      oldestIds.forEach(id => delete rankedPosts[id]);
    }
    
    chrome.storage.local.set({ rankedPosts });
  });
}

/**
 * Get a Category for an authenticity score
 * @param {Number} score - Authenticity score (0-100)
 * @returns {Object} Category object
 */
function getAuthenticityCategory(score) {
  for (const category of AUTHENTICITY_CATEGORIES) {
    if (score >= category.range[0] && score <= category.range[1]) {
      return category;
    }
  }
  return AUTHENTICITY_CATEGORIES[2]; // Default to neutral
}

/**
 * Search for posts using FlexSearch
 * @param {String} query - Search query
 * @param {Object} options - Search options
 * @returns {Array} Search results
 */
async function searchPosts(query, options = {}) {
  // Initialize if needed
  if (!isInitialized) {
    await initPureFeed();
  }
  
  // Default options
  const searchOptions = {
    limit: options.limit || 50,
    sort: options.sort || ((a, b) => b.authenticity_score - a.authenticity_score)
  };
  
  // Perform search
  const results = await postIndex.search(query, searchOptions);
  
  return results;
}

/**
 * Get all ranked posts ordered by authenticity score
 * @param {Object} options - Filter options
 * @returns {Array} Posts sorted by authenticity
 */
function getPureFeed(options = {}) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['rankedPosts'], (result) => {
      const rankedPosts = result.rankedPosts || {};
      
      // Convert to array
      let posts = Object.values(rankedPosts);
      
      // Apply platform filter if specified
      if (options.platform) {
        posts = posts.filter(post => post.platform === options.platform);
      }
      
      // Apply score filters
      if (options.minScore !== undefined) {
        posts = posts.filter(post => post.authenticity_score >= options.minScore);
      }
      
      if (options.maxScore !== undefined) {
        posts = posts.filter(post => post.authenticity_score <= options.maxScore);
      }
      
      // Apply category filter
      if (options.category) {
        posts = posts.filter(post => {
          const category = getAuthenticityCategory(post.authenticity_score);
          return category.name.toLowerCase() === options.category.toLowerCase();
        });
      }
      
      // Sort by authenticity score (descending)
      posts.sort((a, b) => b.authenticity_score - a.authenticity_score);
      
      // Apply limit
      if (options.limit) {
        posts = posts.slice(0, options.limit);
      }
      
      resolve(posts);
    });
  });
}

// Export functions
window.pureFeed = {
  init: initPureFeed,
  rankPost: rankAndIndexPost,
  rankPosts: rankAndIndexPosts,
  search: searchPosts,
  getPureFeed: getPureFeed,
  getAuthenticityCategory: getAuthenticityCategory
};

// Auto-initialize when loaded
initPureFeed().then(() => {
  console.log("Pure Feed module ready");
}); 