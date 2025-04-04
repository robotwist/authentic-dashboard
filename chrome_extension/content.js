function collectInstagramPosts() {
  const posts = [];

  // Instagram post containers
  const postElements = document.querySelectorAll('article');

  postElements.forEach((el) => {
    // Enhanced content extraction
    const content = el.innerText || "";
    const username = el.querySelector('header a')?.innerText || "unknown";
    
    // Look for verified badge
    const isVerified = el.querySelector('header svg[aria-label="Verified"]') !== null;
    
    // Try to detect if this is from someone you follow
    const isFollowed = el.querySelector('header button')?.innerText.includes('Following') || false;
    
    // Extract timestamps - if available
    let timestamp = '';
    const timeElement = el.querySelector('time');
    if (timeElement && timeElement.dateTime) {
      timestamp = timeElement.dateTime;
    }
    
    // Detect engagement metrics
    let likes = 0;
    let comments = 0;
    
    // Look for like count
    const likeElement = el.querySelector('section span');
    if (likeElement && likeElement.innerText) {
      const likeText = likeElement.innerText;
      if (likeText.includes('like') || likeText.includes('heart')) {
        // Extract first number from the text
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
    
    // Try to get image URLs (may not work due to lazy loading)
    const imageUrls = [];
    el.querySelectorAll('img').forEach(img => {
      if (img.src && !img.src.includes('profile_pic') && !imageUrls.includes(img.src)) {
        imageUrls.push(img.src);
      }
    });
    
    // Try to get hashtags and mentions
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

    if (content.length > 0) {
      posts.push({
        content,
        platform: 'instagram',
        user: username,
        is_friend: isFollowed,
        is_family: false,
        category: hashtags.join(','),
        verified: isVerified,
        image_urls: imageUrls.slice(0, 3).join(','),
        collected_at: new Date().toISOString(),
        timestamp: timestamp,
        likes: likes,
        comments: comments,
        mentions: mentions.join(','),
        hashtags: hashtags.join(','),
        sentiment_score: sentimentScore,
        sentiment_indicators: {
          positive: positiveCount,
          negative: negativeCount
        },
        content_length: content.length
      });
    }
  });

  // Send posts to backend
  posts.forEach(post => {
    fetch("http://localhost:8000/api/post/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(post)
    })
    .then(res => res.json())
    .then(data => console.log("Post saved:", data))
    .catch(err => console.error("Error sending post:", err));
  });
  
  console.log(`Collected ${posts.length} Instagram posts`);
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

  posts.forEach(post => {
    fetch("http://localhost:8000/api/post/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(post)
    })
    .then(res => res.json())
    .then(data => console.log("FB post saved:", data))
    .catch(err => console.error("Error sending FB post:", err));
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
  
  posts.forEach(post => {
    fetch("http://localhost:8000/api/post/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(post)
    })
    .then(res => res.json())
    .then(data => console.log("LinkedIn post saved:", data))
    .catch(err => console.error("Error sending LinkedIn post:", err));
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
    if (url.includes('instagram.com')) {
      const posts = collectInstagramPosts();
      alert(`Scanned ${posts.length} Instagram posts!`);
    } else if (url.includes('facebook.com')) {
      const posts = collectFacebookPosts();
      alert(`Scanned ${posts.length} Facebook posts!`);
    } else if (url.includes('linkedin.com')) {
      const posts = collectLinkedInPosts();
      alert(`Scanned ${posts.length} LinkedIn posts!`);
    } else {
      alert('Not on a supported social platform.');
    }
  });
  
  buttonContainer.appendChild(scanButton);
  document.body.appendChild(buttonContainer);
}

// Run scan on page load
window.addEventListener("load", () => {
  // Auto-detect platform and run appropriate collector
  const url = window.location.href;
  if (url.includes('instagram.com')) {
    collectInstagramPosts();
  } else if (url.includes('facebook.com')) {
    collectFacebookPosts();
  } else if (url.includes('linkedin.com')) {
    collectLinkedInPosts();
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
      collectInstagramPosts();
    } else if (url.includes('facebook.com')) {
      collectFacebookPosts();
    } else if (url.includes('linkedin.com')) {
      collectLinkedInPosts();
    }
  }, 300);
}, false);

// Enhanced ML detection capabilities
function analyzeContentWithML(text, platform) {
    const result = {
        sentiment_score: 0,
        sentiment_indicators: { positive: 0, negative: 0 },
        toxicity_score: 0,
        engagement_prediction: 0,
        automated_category: '',
        bizfluencer_score: 0
    };
    
    if (!text || text.length < 3) {
        return result;
    }
    
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

// Update the Instagram posts collection with ML analysis
function collectInstagramPosts() {
    // ... existing code ...
    
    // Enhanced data collection
    const posts = document.querySelectorAll('article');
    const results = [];
    
    posts.forEach(post => {
        try {
            const contentEl = post.querySelector('div[data-testid="post-content"] > div > span, div._a9zs > span');
            const content = contentEl ? contentEl.innerText : "";
            
            const userEl = post.querySelector('div._aacl._aacs._aact._aacx._aada a, header a');
            const username = userEl ? userEl.innerText : "unknown";
            
            const isVerified = post.querySelector('div._aacl._aacs._aact._aacx._aada span[title="Verified"]') !== null;
            
            // Extract likes, comments, timestamp
            const likesEl = post.querySelector('span.x1lliihq, section._ae5m button._abl-');
            const likes = likesEl ? parseInt(likesEl.innerText) || 0 : 0;
            
            const commentsEl = post.querySelector('a.x1i10hfl span, div._ae2s span');
            const comments = commentsEl ? parseInt(commentsEl.innerText) || 0 : 0;
            
            const timeEl = post.querySelector('time');
            const timestamp = timeEl ? timeEl.getAttribute('datetime') : "";
            
            // Extract hashtags
            const hashtags = [];
            const hashtagEls = post.querySelectorAll('a[href*="explore/tags"]');
            hashtagEls.forEach(tag => {
                hashtags.push(tag.innerText);
            });
            
            // Check for image URLs
            const imageEls = post.querySelectorAll('img._aagt, img._aagz');
            const imageUrls = [];
            imageEls.forEach(img => {
                if (img.src) imageUrls.push(img.src);
            });
            
            // Extract mentions
            const mentions = [];
            const mentionEls = post.querySelectorAll('a[href*="instagram.com/"][href*="people_mentioned_in_caption"]');
            mentionEls.forEach(mention => {
                mentions.push(mention.innerText);
            });
            
            // Check if the post is sponsored
            const isSponsored = post.innerText.toLowerCase().includes('sponsored') || 
                               post.innerText.toLowerCase().includes('paid partnership');
            
            // Enhanced data with ML analysis
            const mlAnalysis = analyzeContentWithML(content, 'instagram');
            
            results.push({
                platform: 'instagram',
                user: username,
                content: content,
                verified: isVerified,
                is_friend: false, // To be determined by the backend
                is_family: false, // To be determined by the backend
                category: hashtags.join(', '),
                image_urls: imageUrls.join(', '),
                likes: likes,
                comments: comments,
                timestamp: timestamp,
                hashtags: hashtags.join(', '),
                mentions: mentions.join(', '),
                is_sponsored: isSponsored,
                content_length: content.length,
                sentiment_score: mlAnalysis.sentiment_score,
                sentiment_indicators: mlAnalysis.sentiment_indicators,
                toxicity_score: mlAnalysis.toxicity_score,
                automated_category: mlAnalysis.automated_category,
                engagement_prediction: mlAnalysis.engagement_prediction
            });
        } catch (e) {
            console.error("Error collecting Instagram post:", e);
        }
    });
    
    return results;
}

// Update the Facebook posts collection with ML analysis
function collectFacebookPosts() {
    // ... existing code ...
    
    // Enhanced data collection
    const posts = document.querySelectorAll('div[role="article"]');
    const results = [];
    
    posts.forEach(post => {
        try {
            // Skip posts that are clearly not user content
            if (post.querySelector('[data-ad-preview="message"]') || 
                post.innerText.includes('Suggested for you')) {
                return;
            }
            
            const contentEl = post.querySelector('div[data-ad-comet-preview="message"], div.xdj266r');
            const content = contentEl ? contentEl.innerText : "";
            
            const userEl = post.querySelector('h4 a, strong');
            const username = userEl ? userEl.innerText : "unknown";
            
            const isVerified = post.querySelector('svg[aria-label="Verified"]') !== null;
            
            // Extract reaction counts
            const likesEl = post.querySelector('span[aria-label*="reactions"], span.x16hj40l');
            const likes = likesEl ? parseFacebookCount(likesEl.innerText) : 0;
            
            const commentsEl = post.querySelector('span[aria-label*="comment"], span.x1jchvi3');
            const comments = commentsEl ? parseFacebookCount(commentsEl.innerText) : 0;
            
            const sharesEl = post.querySelector('span[aria-label*="share"], span.x1jchvi3:last-child');
            const shares = sharesEl ? parseFacebookCount(sharesEl.innerText) : 0;
            
            // Extract timestamp
            const timeEl = post.querySelector('a[aria-label*="day"], a[aria-label*="hour"], span.x4k7w5x a');
            const timestamp = timeEl ? new Date().toISOString() : "";
            
            // Check for image URLs
            const imageEls = post.querySelectorAll('img.x1ey2m1c, img.xz74otr');
            const imageUrls = [];
            imageEls.forEach(img => {
                if (img.src && !img.src.includes('emoji')) imageUrls.push(img.src);
            });
            
            // Extract hashtags
            const hashtags = extractHashtags(content);
            
            // Extract external links
            const linkEls = post.querySelectorAll('a[href*="l.facebook.com"]');
            const externalLinks = [];
            linkEls.forEach(link => {
                if (link.href) externalLinks.push(link.href);
            });
            
            // Check if the post is sponsored
            const isSponsored = post.innerText.toLowerCase().includes('sponsored') || 
                                post.innerText.toLowerCase().includes('suggested');
            
            // Enhanced data with ML analysis
            const mlAnalysis = analyzeContentWithML(content, 'facebook');
            
            results.push({
                platform: 'facebook',
                user: username,
                content: content,
                verified: isVerified,
                is_friend: false, // To be determined by the backend
                is_family: false, // To be determined by the backend
                category: hashtags.join(', '),
                image_urls: imageUrls.join(', '),
                likes: likes,
                comments: comments,
                shares: shares,
                timestamp: timestamp,
                hashtags: hashtags.join(', '),
                external_links: externalLinks.join(', '),
                is_sponsored: isSponsored,
                content_length: content.length,
                sentiment_score: mlAnalysis.sentiment_score,
                sentiment_indicators: mlAnalysis.sentiment_indicators,
                toxicity_score: mlAnalysis.toxicity_score,
                automated_category: mlAnalysis.automated_category,
                engagement_prediction: mlAnalysis.engagement_prediction
            });
        } catch (e) {
            console.error("Error collecting Facebook post:", e);
        }
    });
    
    return results;
}

// Update the LinkedIn posts collection with ML analysis
function collectLinkedInPosts() {
    // ... existing code ...
    
    // Enhanced data collection
    const posts = document.querySelectorAll('.feed-shared-update-v2');
    const results = [];
    
    posts.forEach(post => {
        try {
            const contentEl = post.querySelector('.feed-shared-update-v2__description-text');
            const content = contentEl ? contentEl.innerText : "";
            
            const userEl = post.querySelector('.feed-shared-actor__name');
            const username = userEl ? userEl.innerText : "unknown";
            
            const isVerified = post.querySelector('.feed-shared-actor__verification-icon') !== null;
            
            // Extract social actions
            const likesEl = post.querySelector('.feed-shared-social-action-bar__action-count, .social-details-social-counts__reactions-count');
            const likes = likesEl ? parseInt(likesEl.innerText) || 0 : 0;
            
            const commentsEl = post.querySelector('.feed-shared-social-action-bar__comment-count, .social-details-social-counts__comments');
            const comments = commentsEl ? parseInt(commentsEl.innerText) || 0 : 0;
            
            // Extract hashtags
            const hashtags = extractHashtags(content);
            
            // Check for image URLs
            const imageEls = post.querySelectorAll('img.feed-shared-image__image, img.ivm-view-attr__img--centered');
            const imageUrls = [];
            imageEls.forEach(img => {
                if (img.src) imageUrls.push(img.src);
            });
            
            // Check if post is a job post
            const isJobPost = content.toLowerCase().includes('hiring') ||
                              content.toLowerCase().includes('job opening') ||
                              content.toLowerCase().includes('position available') ||
                              post.innerText.toLowerCase().includes('applications welcome');
            
            // Get connection degree
            let connectionDegree = null;
            const degreeText = post.innerText;
            if (degreeText.includes('1st')) {
                connectionDegree = 1;
            } else if (degreeText.includes('2nd')) {
                connectionDegree = 2;
            } else if (degreeText.includes('3rd')) {
                connectionDegree = 3;
            }
            
            // Enhanced data with ML analysis
            const mlAnalysis = analyzeContentWithML(content, 'linkedin');
            
            results.push({
                platform: 'linkedin',
                user: username,
                content: content,
                verified: isVerified,
                is_friend: connectionDegree === 1,
                is_family: false,
                category: hashtags.join(', '),
                image_urls: imageUrls.join(', '),
                likes: likes,
                comments: comments,
                shares: 0, // LinkedIn doesn't easily expose share counts
                timestamp: new Date().toISOString(),
                hashtags: hashtags.join(', '),
                is_sponsored: post.innerText.toLowerCase().includes('promoted'),
                is_job_post: isJobPost,
                content_length: content.length,
                connection_degree: connectionDegree,
                bizfluencer_score: mlAnalysis.bizfluencer_score,
                sentiment_score: mlAnalysis.sentiment_score,
                sentiment_indicators: mlAnalysis.sentiment_indicators,
                toxicity_score: mlAnalysis.toxicity_score,
                automated_category: mlAnalysis.automated_category,
                engagement_prediction: mlAnalysis.engagement_prediction
            });
        } catch (e) {
            console.error("Error collecting LinkedIn post:", e);
        }
    });
    
    return results;
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
