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

// Function to check server connection before collecting
let lastServerCheckTime = 0;
const SERVER_CHECK_COOLDOWN = 10000; // Check server at most every 10 seconds
let isServerAvailable = false;

// Function to check if server is available
function checkServerAvailability(callback) {
  const currentTime = Date.now();
  
  // Don't check too frequently
  if (currentTime - lastServerCheckTime < SERVER_CHECK_COOLDOWN) {
    callback(isServerAvailable);
    return;
  }
  
  // Update check timestamp
  lastServerCheckTime = currentTime;
  
  // Get API key from storage
  chrome.storage.local.get(['apiKey'], function(result) {
    const apiKey = result.apiKey || '8484e01c2e0b4d368eb9a0f9b89807ad'; // Default fallback API key
    
    // Try to connect to health check endpoint
    fetch('http://localhost:8000/api/health-check/', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
      }
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      console.log('Server connection successful:', data);
      isServerAvailable = true;
      callback(true);
    })
    .catch(error => {
      console.error('Server connection failed:', error);
      isServerAvailable = false;
      callback(false);
    });
  });
}

// Modify the collectWithRateLimitProtection to check server first
function collectWithRateLimitProtection(platform, collectionFunction) {
  // First check if server is available
  checkServerAvailability(function(available) {
    if (!available) {
      console.log('Server unavailable. Collection skipped.');
      return [];
    }
    
    // Continue with original function if server is available
    // Check if we're currently in a rate-limit backoff period
    const currentTime = Date.now();
    if (isRateLimited && currentTime < rateLimitResetTime) {
      console.log(`Rate limit backoff active. Waiting ${Math.round((rateLimitResetTime - currentTime)/1000)}s before retrying.`);
      return [];
    }
    
    // Check if we're trying to collect too frequently
    if (currentTime - lastCollectionTime < COLLECTION_COOLDOWN) {
      console.log('Collection attempted too frequently. Skipping to prevent rate limiting.');
      return [];
    }
    
    // Update collection timestamp
    lastCollectionTime = currentTime;
    
    try {
      // Run the actual collection function
      const results = collectionFunction();
      
      // If successful, reset any rate limit flags
      isRateLimited = false;
      connectionErrorCount = 0;
      
      return results;
    } catch (error) {
      // Check if this is a rate limit error (429)
      if (error.message && error.message.includes('429')) {
        console.warn('Rate limit detected. Activating backoff.');
        isRateLimited = true;
        rateLimitResetTime = currentTime + RATE_LIMIT_BACKOFF;
        
        // Show notification about rate limiting
        chrome.runtime.sendMessage({
          action: 'showNotification',
          title: 'Rate Limit Detected',
          message: `${platform} is rate limiting requests. Collection paused for 1 minute.`
        });
      } else {
        // Handle other errors
        connectionErrorCount++;
        lastConnectionError = error.message;
        console.error('Error in collection:', error);
        
        if (connectionErrorCount >= MAX_CONNECTION_ERRORS) {
          chrome.runtime.sendMessage({
            action: 'showNotification',
            title: 'Connection Error',
            message: `Error connecting to ${platform}. Please check your connection.`
          });
        }
      }
      
      return [];
    }
  });
}

function collectInstagramPosts(dataPreferences) {
  // Default to all enabled if not specified
  const prefs = dataPreferences || {
    collectContent: true,
    collectEngagement: true,
    collectUsers: true,
    collectHashtags: true,
    collectLocalML: true
  };
  
  // Existing post collection code, but respect preferences
  const posts = [];
  const postElements = document.querySelectorAll('article');

  postElements.forEach((el) => {
    // Get content only if preference is enabled
    const content = prefs.collectContent ? (el.innerText || "") : "";
    
    // Get user only if preference is enabled
    const username = prefs.collectUsers 
      ? (el.querySelector('header a')?.innerText || "unknown") 
      : "anonymous";
    
    // Collect engagement data based on preference
    let likes = 0;
    let comments = 0;
    
    if (prefs.collectEngagement) {
      // Look for like count
      const likeElement = el.querySelector('section span');
      if (likeElement && likeElement.innerText) {
        const likeText = likeElement.innerText;
        if (likeText.includes('like') || likeText.includes('heart')) {
          const match = likeText.match(/\d+/);
          if (match) likes = parseInt(match[0]);
        }
      }
      
      // Look for comment count
      const commentElement = el.querySelector('a[href*="comments"]');
      if (commentElement && commentElement.innerText) {
        const commentText = commentElement.innerText;
        if (commentText.includes('comment')) {
          const match = commentText.match(/\d+/);
          if (match) comments = parseInt(match[0]);
        }
      }
    }
    
    // Only collect hashtags if preference enabled
    const hashtags = [];
    const mentions = [];
    
    if (prefs.collectHashtags) {
      // Extract hashtags
      const hashtagMatches = content.match(/#[\w]+/g);
      if (hashtagMatches) {
        hashtagMatches.forEach(tag => {
          if (!hashtags.includes(tag)) hashtags.push(tag);
        });
      }
      
      // Extract mentions
      const mentionMatches = content.match(/@[\w.]+/g);
      if (mentionMatches) {
        mentionMatches.forEach(mention => {
          if (!mentions.includes(mention)) mentions.push(mention);
        });
      }
    }
    
    // Only do ML analysis if enabled
    let sentimentScore = 0;
    let manipulativePatterns = [];
    
    if (prefs.collectLocalML && content) {
      // Simple sentiment analysis
      const mlAnalysis = analyzeContentWithML(content, 'instagram');
      sentimentScore = mlAnalysis.sentiment_score;
      manipulativePatterns = mlAnalysis.manipulative_patterns;
    }

    if (content.length > 0) {
      // Build an object with only the enabled data fields
      const post = {
        platform: 'instagram',
        collected_at: new Date().toISOString()
      };
      
      // Only add fields based on preferences
      if (prefs.collectContent) {
        post.content = content;
        post.content_length = content.length;
      }
      
      if (prefs.collectUsers) {
        post.user = username;
        post.verified = el.querySelector('header svg[aria-label="Verified"]') !== null;
        post.is_friend = el.querySelector('header button')?.innerText.includes('Following') || false;
        post.is_family = false; // Always needs user input
      }
      
      if (prefs.collectEngagement) {
        post.likes = likes;
        post.comments = comments;
      }
      
      if (prefs.collectHashtags) {
        post.hashtags = hashtags.join(',');
        post.mentions = mentions.join(',');
        post.category = hashtags.join(',');
      }
      
      if (prefs.collectLocalML) {
        post.sentiment_score = sentimentScore;
        post.manipulative_patterns = manipulativePatterns;
      }
      
      posts.push(post);
    }
  });

  return posts;
}

// Enhanced Facebook post collector
function collectFacebookPosts() {
  const posts = [];

  // Typical FB post containers
  const postElements = document.querySelectorAll('[role="article"]');

  postElements.forEach((el) => {
    const content = el.innerText || "";
    
    // Better user extraction
    const userElement = el.querySelector('h4 span strong, h4 span a');
    const user = userElement?.innerText || "unknown";
    
    // Check if it's sponsored content
    const isSponsored = content.includes("Sponsored") || 
                        el.innerHTML.includes("Sponsored") ||
                        el.querySelector('a[href*="ads"]') !== null;
    
    // Check for verified badge
    const isVerified = el.querySelector('svg[aria-label*="Verified"]') !== null;
    
    // Try to determine friend status - this is a best guess
    const isFriend = !isSponsored && 
                     (el.querySelector('h4 a[href*="/friends/"]') !== null || 
                      el.querySelector('[role="button"]:not([aria-label*="Like"])'));
    
    // Extract timestamp
    let timestamp = '';
    const timeElement = el.querySelector('abbr');
    if (timeElement && timeElement.getAttribute('data-utime')) {
      const unixTime = timeElement.getAttribute('data-utime');
      timestamp = new Date(parseInt(unixTime) * 1000).toISOString();
    }
    
    // Try to get engagement metrics
    let likes = 0;
    let comments = 0;
    let shares = 0;
    
    // Look for reaction counts
    const reactionElements = el.querySelectorAll('[aria-label*="reaction"], [data-testid*="UFI2ReactionsCount"]');
    reactionElements.forEach(element => {
      if (element.innerText) {
        const match = element.innerText.match(/\d+/);
        if (match) likes += parseInt(match[0]);
      }
    });
    
    // Look for comment counts
    const commentElements = el.querySelectorAll('[data-testid*="UFI2CommentCount"], [aria-label*="comment"]');
    commentElements.forEach(element => {
      if (element.innerText) {
        const match = element.innerText.match(/\d+/);
        if (match) comments += parseInt(match[0]);
      }
    });
    
    // Look for share counts
    const shareElements = el.querySelectorAll('[data-testid*="UFI2SharesCount"], [aria-label*="share"]');
    shareElements.forEach(element => {
      if (element.innerText) {
        const match = element.innerText.match(/\d+/);
        if (match) shares += parseInt(match[0]);
      }
    });
    
    // Extract image URLs
    const imageUrls = [];
    el.querySelectorAll('img').forEach(img => {
      if (img.src && img.width > 100 && !img.src.includes('profile_pic') && !imageUrls.includes(img.src)) {
        imageUrls.push(img.src);
      }
    });
    
    // Try to identify topics/categories
    let category = isSponsored ? "sponsored" : "";
    
    // Look for hashtags and mentions
    const hashtags = [];
    const mentions = [];
    
    // Extract hashtags
    const hashtagMatches = content.match(/#[\w]+/g);
    if (hashtagMatches) {
      hashtagMatches.forEach(tag => {
        if (!hashtags.includes(tag)) {
          hashtags.push(tag);
          if (category) category += ',';
          category += tag;
        }
      });
    }
    
    // Extract mentions
    const mentionMatches = content.match(/@[\w.]+/g);
    if (mentionMatches) {
      mentionMatches.forEach(mention => {
        if (!mentions.includes(mention)) mentions.push(mention);
      });
    }
    
    // Simple sentiment analysis indicators
    const sentimentIndicators = {
      positive: ['love', 'happy', 'great', 'good', 'awesome', 'excellent', 'beautiful', 'amazing', 'perfect', 'joy', 'grateful', 'blessed', 'thank', 'exciting', 'fun', '😊', '❤️', '😍', '🥰', '😁', '👍'],
      negative: ['sad', 'bad', 'hate', 'terrible', 'awful', 'horrible', 'disappointing', 'worst', 'never', 'angry', 'upset', 'unfortunately', 'unfair', 'broken', '😔', '😢', '😭', '😠', '👎', '💔']
    };
    
    // Count sentiment indicators
    let positiveCount = 0;
    let negativeCount = 0;
    
    const lowerContent = content.toLowerCase();
    
    sentimentIndicators.positive.forEach(term => {
      const regex = new RegExp(term, 'g');
      const matches = lowerContent.match(regex);
      if (matches) positiveCount += matches.length;
    });
    
    sentimentIndicators.negative.forEach(term => {
      const regex = new RegExp(term, 'g');
      const matches = lowerContent.match(regex);
      if (matches) negativeCount += matches.length;
    });
    
    // Calculate a simple sentiment score (-1 to 1)
    let sentimentScore = 0;
    const totalSentiment = positiveCount + negativeCount;
    if (totalSentiment > 0) {
      sentimentScore = (positiveCount - negativeCount) / totalSentiment;
    }
    
    // Extract external link information
    const externalLinks = [];
    el.querySelectorAll('a').forEach(link => {
      if (link.href && 
          !link.href.includes('facebook.com') && 
          !link.href.includes('instagram.com') &&
          !externalLinks.includes(link.href)) {
        externalLinks.push(link.href);
      }
    });

    if (content.length > 20) {  // Only capture meaningful posts
      posts.push({
        content,
        platform: 'facebook',
        user: user,
        is_friend: isFriend,
        is_family: false,  // Requires user input
        category: category || "",
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
      });
    }
  });

  // Get API key and send posts
  chrome.storage.local.get(['apiKey'], function(result) {
    const apiKey = result.apiKey || '8484e01c2e0b4d368eb9a0f9b89807ad'; // Default fallback API key
    
    posts.forEach(post => {
      fetch("http://localhost:8000/api/process-ml/", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-API-Key": apiKey
        },
        body: JSON.stringify(post)
      })
      .then(res => {
        if (!res.ok) {
          throw new Error(`HTTP error! Status: ${res.status}`);
        }
        return res.json();
      })
      .then(data => console.log("FB post saved:", data))
      .catch(err => {
        console.error("Error sending FB post:", err);
        // Update connection error counters
        connectionErrorCount++;
        lastConnectionError = err.message;
        
        if (connectionErrorCount >= MAX_CONNECTION_ERRORS) {
          chrome.runtime.sendMessage({
            action: 'showNotification',
            title: 'Connection Error',
            message: `Error connecting to server: ${err.message}`
          });
        }
      });
    });
  });
  
  console.log(`Collected ${posts.length} Facebook posts`);
  return posts;
}

// Enhanced LinkedIn collector
function collectLinkedInPosts() {
  const posts = [];
  
  // LinkedIn post containers
  const postElements = document.querySelectorAll('.feed-shared-update-v2');
  
  postElements.forEach((el) => {
    const content = el.querySelector('.feed-shared-update-v2__description')?.innerText || "";
    
    // Extract user information
    const userElement = el.querySelector('.feed-shared-actor__name');
    const user = userElement?.innerText.trim() || "unknown";
    
    // Check for verified badge (Premium)
    const isVerified = el.querySelector('.premium-icon') !== null;
    
    // Determine connection status (1st, 2nd, 3rd)
    let connectionDegree = 0;
    const connectionElement = el.querySelector('.feed-shared-actor__sub-description');
    if (connectionElement) {
      if (connectionElement.innerText.includes('1st')) {
        connectionDegree = 1;
      } else if (connectionElement.innerText.includes('2nd')) {
        connectionDegree = 2;
      } else if (connectionElement.innerText.includes('3rd')) {
        connectionDegree = 3;
      }
    }
    
    // Extract timestamp
    let timestamp = '';
    const timeElement = el.querySelector('.feed-shared-actor__sub-description time');
    if (timeElement && timeElement.dateTime) {
      timestamp = timeElement.dateTime;
    }
    
    // Get engagement metrics
    let likes = 0;
    let comments = 0;
    
    // Parse reaction counts
    const reactionElement = el.querySelector('.social-details-social-counts__reactions-count');
    if (reactionElement && reactionElement.innerText) {
      const match = reactionElement.innerText.match(/\d+/);
      if (match) likes = parseInt(match[0]);
    }
    
    // Parse comment counts
    const commentElement = el.querySelector('.social-details-social-counts__comments-count');
    if (commentElement && commentElement.innerText) {
      const match = commentElement.innerText.match(/\d+/);
      if (match) comments = parseInt(match[0]);
    }
    
    // Extract image URLs
    const imageUrls = [];
    el.querySelectorAll('img').forEach(img => {
      if (img.src && 
          img.width > 100 && 
          !img.src.includes('profile-pic') && 
          !img.src.includes('profile-display-pic') && 
          !imageUrls.includes(img.src)) {
        imageUrls.push(img.src);
      }
    });
    
    // Extract mentioned companies, people, and hashtags
    const hashtags = [];
    const mentions = [];
    
    // Extract hashtags
    const hashtagMatches = content.match(/#[\w]+/g);
    if (hashtagMatches) {
      hashtagMatches.forEach(tag => {
        if (!hashtags.includes(tag)) hashtags.push(tag);
      });
    }
    
    // Extract mentions
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
    
    let bizfluencerScore = 0;
    const lowerContent = content.toLowerCase();
    
    bizfluencerWords.forEach(word => {
      const regex = new RegExp('\\b' + word + '\\b', 'gi');
      const matches = lowerContent.match(regex);
      if (matches) bizfluencerScore += matches.length;
    });
    
    // Simple sentiment analysis
    const sentimentIndicators = {
      positive: ['excited', 'honored', 'thrilled', 'proud', 'happy', 'delighted', 'pleased', 
                'grateful', 'thankful', 'appreciate', 'excellent', 'amazing', 'opportunity'],
      negative: ['unfortunately', 'regret', 'sad', 'disappointed', 'difficult', 'challenge', 
                'problem', 'issue', 'concerned', 'worry']
    };
    
    let positiveCount = 0;
    let negativeCount = 0;
    
    sentimentIndicators.positive.forEach(term => {
      const regex = new RegExp('\\b' + term + '\\b', 'gi');
      const matches = lowerContent.match(regex);
      if (matches) positiveCount += matches.length;
    });
    
    sentimentIndicators.negative.forEach(term => {
      const regex = new RegExp('\\b' + term + '\\b', 'gi');
      const matches = lowerContent.match(regex);
      if (matches) negativeCount += matches.length;
    });
    
    // Calculate sentiment score
    let sentimentScore = 0;
    const totalSentiment = positiveCount + negativeCount;
    if (totalSentiment > 0) {
      sentimentScore = (positiveCount - negativeCount) / totalSentiment;
    }
    
    // Check if it's a job posting
    const isJobPost = lowerContent.includes('hiring') || 
                      lowerContent.includes('job opening') || 
                      lowerContent.includes('apply now') ||
                      lowerContent.includes('we are looking for') ||
                      lowerContent.includes('job opportunity');
    
    if (content.length > 30) {  // Only capture posts with sufficient content
      posts.push({
        content,
        platform: 'linkedin',
        user: user,
        is_friend: connectionDegree === 1,  // 1st connections are "friends"
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
  });
  
  // Get API key and send posts
  chrome.storage.local.get(['apiKey'], function(result) {
    const apiKey = result.apiKey || '8484e01c2e0b4d368eb9a0f9b89807ad'; // Default fallback API key
    
    posts.forEach(post => {
      fetch("http://localhost:8000/api/process-ml/", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-API-Key": apiKey
        },
        body: JSON.stringify(post)
      })
      .then(res => {
        if (!res.ok) {
          throw new Error(`HTTP error! Status: ${res.status}`);
        }
        return res.json();
      })
      .then(data => console.log("LinkedIn post saved:", data))
      .catch(err => {
        console.error("Error sending LinkedIn post:", err);
        // Update connection error counters
        connectionErrorCount++;
        lastConnectionError = err.message;
        
        if (connectionErrorCount >= MAX_CONNECTION_ERRORS) {
          chrome.runtime.sendMessage({
            action: 'showNotification',
            title: 'Connection Error',
            message: `Error connecting to server: ${err.message}`
          });
        }
      });
    });
  });
  
  console.log(`Collected ${posts.length} LinkedIn posts`);
  return posts;
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
chrome.runtime.sendMessage({ action: 'checkConnection' }, function(response) {
  if (chrome.runtime.lastError) {
    console.error('Extension connection error:', chrome.runtime.lastError);
    // Don't try to auto-collect on page load if we have connection issues
    return;
  }
  
  // If we get here, the connection is good
  // Auto-detect platform and run appropriate collector
  const url = window.location.href;
  if (url.includes('instagram.com')) {
    setTimeout(() => {
      collectWithRateLimitProtection('Instagram', () => collectInstagramPosts());
    }, 1500);
  } else if (url.includes('facebook.com')) {
    setTimeout(() => {
      collectWithRateLimitProtection('Facebook', () => collectFacebookPosts());
    }, 1500);
  } else if (url.includes('linkedin.com')) {
    setTimeout(() => {
      collectWithRateLimitProtection('LinkedIn', () => collectLinkedInPosts());
    }, 1500);
  }
  
  // Add scan button for manual refresh
  injectScanButton();
});

// Also run scan when scrolling stops to capture new content
let isScrolling;
window.addEventListener('scroll', function() {
  // Clear our timeout throughout the scroll
  window.clearTimeout(isScrolling);

  // Set a timeout to run after scrolling ends
  isScrolling = setTimeout(function() {
    const url = window.location.href;
    if (url.includes('instagram.com')) {
      collectWithRateLimitProtection('Instagram', () => collectInstagramPosts());
    } else if (url.includes('facebook.com')) {
      collectWithRateLimitProtection('Facebook', () => collectFacebookPosts());
    } else if (url.includes('linkedin.com')) {
      collectWithRateLimitProtection('LinkedIn', () => collectLinkedInPosts());
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
function extractHashtags(text) {
    if (!text) return [];
    
    const hashtagRegex = /#(\w+)/g;
    const hashtags = [];
    let match;
    
    while ((match = hashtagRegex.exec(text)) !== null) {
        hashtags.push(match[0]);
    }
    
    return hashtags;
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
      checkServerAvailability(function(available) {
        if (!available) {
          sendResponse({ 
            success: false, 
            message: 'Server unavailable. Cannot collect posts.' 
          });
          return;
        }
        
        let posts = [];
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
        
        // Collect posts based on platform
        if (platform === 'instagram') {
          posts = collectInstagramPosts(dataPreferences);
        } else if (platform === 'facebook') {
          posts = collectFacebookPosts(dataPreferences);
        } else if (platform === 'linkedin') {
          posts = collectLinkedInPosts(dataPreferences);
        }
        
        sendResponse({ 
          success: true, 
          posts: posts,
          count: posts.length
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

// Function to handle messaging errors with retry logic
function sendMessageWithRetry(message, retries = 3) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, function(response) {
        if (chrome.runtime.lastError) {
          console.error('Message error:', chrome.runtime.lastError);
          if (retries > 0) {
            setTimeout(() => {
              sendMessageWithRetry(message, retries - 1)
                .then(resolve)
                .catch(reject);
            }, 500);
          } else {
            reject(chrome.runtime.lastError);
          }
        } else {
          resolve(response);
        }
      });
    } catch (error) {
      console.error('Exception in sendMessage:', error);
      reject(error);
    }
  });
}

// Replace the original window.addEventListener load with our retry-enabled version
window.addEventListener("load", () => {
  // Using the retry-enabled message sending
  sendMessageWithRetry({ action: 'checkConnection' })
    .then(() => {
      // Rest of your code for platform detection and collection
      // Auto-detect platform and run appropriate collector with delay
      const url = window.location.href;
      if (url.includes('instagram.com')) {
        setTimeout(() => {
          collectWithRateLimitProtection('Instagram', () => collectInstagramPosts());
        }, 1500);
      } else if (url.includes('facebook.com')) {
        setTimeout(() => {
          collectWithRateLimitProtection('Facebook', () => collectFacebookPosts());
        }, 1500);
      } else if (url.includes('linkedin.com')) {
        setTimeout(() => {
          collectWithRateLimitProtection('LinkedIn', () => collectLinkedInPosts());
        }, 1500);
      }
      
      // Add scan button for manual refresh
      injectScanButton();
    })
    .catch(error => {
      console.error('Failed to establish connection:', error);
      // Still try to inject the scan button for manual operation
      injectScanButton();
    });
});
