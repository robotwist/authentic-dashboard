/**
 * Display Mode Toggle - Allows users to switch between different feed views
 * 
 * This module creates a UI for toggling between different display modes:
 * - Default: Standard view of the social media platform
 * - Friends Only: Show only posts from friends
 * - Interests Only: Show only posts matching user's interests
 * - Minimal Feed: A simplified, less distracting view
 */

import { recordError, createErrorHandler } from './modules/error_handling.js';
import { showInPageNotification } from './content.js';
import { addSettingsButton } from './modules/display_settings.js';

/**
 * Toggle between different display modes
 * 
 * @param {string} mode - The mode to switch to (default, friends-only, interest-only, minimal-feed)
 * @returns {Promise} - Resolves when the mode is applied, rejects on error
 */
function displayModeToggle(mode) {
  return new Promise((resolve, reject) => {
    console.log(`Switching to display mode: ${mode}`);
    
    try {
      // Get user preferences
      chrome.storage.local.get(['userPreferences'], (result) => {
        const preferences = result.userPreferences || {};
        
        // Create a filter function based on the selected mode
        let filterFn = null;
        let modeTitle = '';
        let modeDescription = '';
        
        switch (mode) {
          case 'friends-only':
            modeTitle = 'Friends Only Mode';
            modeDescription = 'Showing only posts from friends';
            filterFn = (post) => post.is_friend === true;
            break;
            
          case 'interest-only':
            const interests = preferences.interest_filter ? 
                             preferences.interest_filter.split(',').map(i => i.trim().toLowerCase()) : 
                             [];
            const hashtags = preferences.favorite_hashtags ? 
                            preferences.favorite_hashtags.split(',').map(h => h.trim().toLowerCase()) : 
                            [];
                            
            modeTitle = 'Interests Only Mode';
            modeDescription = `Showing posts matching your interests: ${interests.join(', ')}`;
            
            if (interests.length === 0 && hashtags.length === 0) {
              showInPageNotification('Warning', 'No interests configured. Please update your preferences.', 'warning');
              reject('No interests configured');
              return;
            }
            
            filterFn = (post) => {
              // Check if the post content matches any interest
              const content = post.content?.toLowerCase() || '';
              const postHashtags = post.hashtags?.toLowerCase() || '';
              
              // Check for matching interests in content
              for (const interest of interests) {
                if (content.includes(interest)) {
                  return true;
                }
              }
              
              // Check for matching hashtags in content
              for (const hashtag of hashtags) {
                if (postHashtags.includes(hashtag)) {
                  return true;
                }
              }
              
              return false;
            };
            break;
            
          case 'minimal-feed':
            modeTitle = 'Minimal Feed Mode';
            modeDescription = 'Showing only the most relevant posts';
            filterFn = (post) => {
              // This is a placeholder filter for Minimal Feed mode
              // You can implement your own logic here
              return true;
            };
            break;
            
          case 'focus-mode':
            modeTitle = 'Focus Mode';
            modeDescription = 'Showing only the most important content';
            filterFn = (post) => {
              // Filter out anything with promotional content
              if (post.is_sponsored) return false;
              
              // Keep posts from verified accounts or with significant engagement
              const hasHighEngagement = post.metadata && 
                                      (post.metadata.likes > 50 || 
                                      post.metadata.comments > 10);
              return post.is_friend || hasHighEngagement || post.isVerified;
            };
            break;
            
          case 'chronological':
            modeTitle = 'Chronological Mode';
            modeDescription = 'Recent posts first';
            // This doesn't filter, just sorts, so allow all posts
            filterFn = (post) => true;
            break;
            
          default:
            modeTitle = 'Default Mode';
            modeDescription = 'Showing all posts';
            filterFn = (post) => true;
            break;
        }
        
        // Apply the display mode
        applyDisplayMode(mode, filterFn)
          .then(() => {
            // Show notification about mode change
            showInPageNotification(modeTitle, modeDescription, 'info');
            
            // Save current mode
            try {
              chrome.storage.local.set({ currentDisplayMode: mode });
            } catch (storageError) {
              console.error('Error saving display mode:', storageError);
              recordError('extension', storageError, { component: 'display_mode_save' });
            }
            
            // Resolve with success
            resolve({
              mode: mode,
              title: modeTitle,
              description: modeDescription
            });
          })
          .catch(error => {
            console.error(`Error applying display mode ${mode}:`, error);
            recordError('dom', error, { 
              component: 'display_mode_apply',
              mode: mode
            });
            reject(error);
          });
      });
    } catch (error) {
      console.error(`Error in display mode toggle:`, error);
      recordError('extension', error, { component: 'display_mode_toggle' });
      reject(error);
    }
  });
}

/**
 * Apply a display mode by modifying the DOM
 * 
 * @param {string} mode - The mode to apply
 * @param {Function} filterFn - Function to filter posts
 * @returns {Promise} - Resolves when completed
 */
async function applyDisplayMode(mode, filterFn) {
  return new Promise(async (resolve, reject) => {
    try {
      // Get current platform
      const platform = window.location.hostname;
      
      // Get all posts on the page
      const posts = document.querySelectorAll('.post, .tweet, article, [data-testid="tweet"], [role="article"]');
      if (!posts || posts.length === 0) {
        reject('No posts found on page');
        return;
      }
      
      console.log(`Applying ${mode} mode to ${posts.length} posts`);
      
      // Reset any previous mode
      document.querySelectorAll('.ad-filtered-post').forEach(post => {
        post.classList.remove('ad-filtered-post');
      });
      
      // Apply special CSS for this mode
      let styleElement = document.getElementById('ad-display-mode-style');
      if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = 'ad-display-mode-style';
        document.head.appendChild(styleElement);
      }
      
      // Set display mode styles
      switch (mode) {
        case 'minimal-feed':
          // Get settings
          const settings = await new Promise(resolve => {
            chrome.storage.local.get(['displayModeSettings'], result => {
              resolve(result.displayModeSettings || {});
            });
          });
          
          const hideSidebar = settings.hideSidebar !== false;
          const reduceOpacity = settings.reduceOpacity !== false;
          const opacityLevel = settings.opacityLevel || 0.4;
          
          let css = '';
          
          if (reduceOpacity) {
            css += `
              .ad-filtered-post {
                opacity: ${opacityLevel} !important;
                transform: scale(0.95) !important;
                transition: all 0.2s ease !important;
              }
              .ad-filtered-post:hover {
                opacity: 1 !important;
                transform: scale(1) !important;
              }
            `;
          } else {
            css += `
              .ad-filtered-post {
                display: none !important;
              }
            `;
          }
          
          if (hideSidebar) {
            css += `
              /* Hide distracting elements */
              .recommended-topics, 
              .who-to-follow, 
              .trends-container,
              [aria-label="Timeline: Trending now"],
              [aria-label="Who to follow"],
              [data-testid="sidebarColumn"],
              [data-testid="primaryColumn"] aside {
                display: none !important;
              }
            `;
          }
          
          styleElement.textContent = css;
          break;
          
        case 'friends-only':
        case 'interest-only':
          styleElement.textContent = `
            .ad-filtered-post {
              display: none !important;
            }
          `;
          break;
          
        case 'chronological':
          // Try to sort posts in chronological order
          try {
            const container = document.querySelector('.timeline, [data-testid="primaryColumn"] > div > div, .feed-container');
            if (container) {
              const posts = Array.from(container.querySelectorAll('.post, .tweet, article, [data-testid="tweet"], [role="article"]'));
              
              // Extract timestamps using platform-specific selectors
              const getTimestamp = (post) => {
                const timeEl = post.querySelector('time, [data-testid="tweet"] time, [datetime]');
                if (timeEl) {
                  return timeEl.getAttribute('datetime') || '';
                }
                return ''; // No timestamp found
              };
              
              // Sort posts by timestamp (most recent first)
              posts.sort((a, b) => {
                const timeA = getTimestamp(a);
                const timeB = getTimestamp(b);
                return timeB.localeCompare(timeA);
              });
              
              // Reinsert posts in chronological order
              posts.forEach(post => {
                container.appendChild(post);
              });
            }
          } catch (error) {
            console.error('Error sorting posts chronologically:', error);
            recordError('dom', error, { component: 'chronological_mode' });
          }
          
          // No special styling needed
          styleElement.textContent = '';
          break;
          
        default:
          // Remove any custom styles
          styleElement.textContent = '';
          break;
      }
      
      // Apply filtering to posts
      let processedCount = 0;
      let filteredCount = 0;
      
      // Process each post
      posts.forEach(post => {
        processedCount++;
        
        // Extract post data for filtering
        const postData = extractPostData(post, platform);
        
        // Apply filter
        if (!filterFn(postData)) {
          post.classList.add('ad-filtered-post');
          filteredCount++;
        }
      });
      
      console.log(`Display mode applied: ${filteredCount}/${processedCount} posts filtered`);
      resolve({
        processed: processedCount,
        filtered: filteredCount
      });
    } catch (error) {
      console.error('Error applying display mode:', error);
      recordError('dom', error, { component: 'apply_display_mode' });
      reject(error);
    }
  });
}

/**
 * Extract data from a post element for filtering
 * 
 * @param {Element} postElement - The post DOM element
 * @param {string} platform - The social media platform
 * @returns {Object} - Post data for filtering
 */
function extractPostData(postElement, platform) {
  try {
    const postData = {
      content: '',
      author: '',
      hashtags: '',
      is_friend: false,
      is_sponsored: false
    };
    
    // Extract content
    const contentElement = postElement.querySelector('.post-content, .tweet-text, [data-testid="tweetText"], .post-message, .feed-shared-update-v2__description');
    if (contentElement) {
      postData.content = contentElement.textContent || '';
    }
    
    // Extract author
    const authorElement = postElement.querySelector('.author, .tweet-author, [data-testid="User-Name"], .feed-shared-actor__name');
    if (authorElement) {
      postData.author = authorElement.textContent || '';
    }
    
    // Check for hashtags
    const hashtagElements = postElement.querySelectorAll('[href*="hashtag"], [href*="explore"]');
    if (hashtagElements.length > 0) {
      postData.hashtags = Array.from(hashtagElements)
        .map(el => el.textContent || '')
        .join(' ')
        .toLowerCase();
    }
    
    // Detect if it's from a friend (very platform specific)
    const isFriend = postElement.querySelector('.is-friend, .follows-you, [data-testid="socialContext"], .feed-shared-actor__sub-description');
    postData.is_friend = !!isFriend;
    
    // Detect if it's sponsored - FIX: replace invalid :contains() selector
    const isSponsored = postElement.querySelector('[data-testid="promoted"], .promoted-tweet, [data-ad-id]');
    
    // Manually check for "Promoted" text in subtitles
    const subtitleElements = postElement.querySelectorAll('.feed-shared-actor__subtitle-text, [aria-label*="Sponsored"], [data-testid*="ad"]');
    const hasPromotedText = Array.from(subtitleElements).some(el => 
      el.textContent.includes('Promoted') || 
      el.textContent.includes('Sponsored')
    );
    
    postData.is_sponsored = !!isSponsored || hasPromotedText;
    
    return postData;
  } catch (error) {
    console.error('Error extracting post data:', error);
    recordError('dom', error, { component: 'extract_post_data' });
    
    // Return a default object that won't break the filter function
    return {
      content: '',
      author: '',
      hashtags: '',
      is_friend: false,
      is_sponsored: false
    };
  }
}

/**
 * Initialize the UI for display mode switching
 */
function initDisplayModeUI() {
  // Add floating control panel
  const panel = document.createElement('div');
  panel.id = 'authentic-display-toggle';
  panel.innerHTML = `
    <div class="ad-toggle-header">Display Mode</div>
    <div class="ad-toggle-options">
      <button class="ad-toggle-btn active" data-mode="default">Standard</button>
      <button class="ad-toggle-btn" data-mode="friends-only">Friends Only</button>
      <button class="ad-toggle-btn" data-mode="interest-only">Interests</button>
      <button class="ad-toggle-btn" data-mode="minimal-feed">Minimal</button>
      <button class="ad-toggle-btn" data-mode="focus-mode">Focus</button>
      <button class="ad-toggle-btn" data-mode="chronological">Chronological</button>
    </div>
  `;
  
  // Style the panel
  panel.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    z-index: 9999;
    padding: 10px;
    font-family: Arial, sans-serif;
    font-size: 14px;
    color: #333;
    width: 160px;
    transition: opacity 0.3s, transform 0.3s;
  `;
  
  // Style header
  const header = panel.querySelector('.ad-toggle-header');
  header.style.cssText = `
    font-weight: bold;
    border-bottom: 1px solid #eee;
    margin-bottom: 10px;
    padding-bottom: 5px;
    text-align: center;
  `;
  
  // Style buttons
  const buttons = panel.querySelectorAll('.ad-toggle-btn');
  buttons.forEach(btn => {
    btn.style.cssText = `
      display: block;
      width: 100%;
      padding: 8px;
      margin: 5px 0;
      background: #f1f1f1;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      text-align: left;
      transition: background 0.2s;
    `;
    
    // Add hover effect
    btn.addEventListener('mouseover', () => {
      btn.style.background = '#e0e0e0';
    });
    
    btn.addEventListener('mouseout', () => {
      if (!btn.classList.contains('active')) {
        btn.style.background = '#f1f1f1';
      }
    });
    
    // Add click handler
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-mode');
      
      // Update UI
      buttons.forEach(b => {
        b.classList.remove('active');
        b.style.background = '#f1f1f1';
        b.style.fontWeight = 'normal';
      });
      
      btn.classList.add('active');
      btn.style.background = '#e1f5fe';
      btn.style.fontWeight = 'bold';
      
      // Apply the mode
      displayModeToggle(mode)
        .catch(error => {
          console.error('Error toggling display mode:', error);
        });
    });
  });
  
  // Add auto-hide behavior
  let hideTimeout;
  const hidePanel = () => {
    panel.style.opacity = '0.7';
    panel.style.transform = 'scale(0.95) translateX(20px)';
  };
  
  const showPanel = () => {
    panel.style.opacity = '1';
    panel.style.transform = 'scale(1) translateX(0)';
    clearTimeout(hideTimeout);
  };
  
  panel.addEventListener('mouseenter', showPanel);
  panel.addEventListener('mouseleave', () => {
    hideTimeout = setTimeout(hidePanel, 3000);
  });
  
  // Initial state
  setTimeout(hidePanel, 5000);
  
  // Add to page
  document.body.appendChild(panel);
  
  // Add settings button to the panel
  addSettingsButton(panel);
  
  // Apply saved mode if any
  chrome.storage.local.get(['displayModeSettings', 'currentDisplayMode'], (result) => {
    // Use saved mode or default mode from settings
    const savedMode = result.currentDisplayMode || 
                     (result.displayModeSettings && result.displayModeSettings.defaultMode) || 
                     'default';
                     
    if (savedMode && savedMode !== 'default') {
      const btn = panel.querySelector(`[data-mode="${savedMode}"]`);
      if (btn) {
        btn.click();
      }
    }
  });
}

// Export the functions
export {
  displayModeToggle,
  initDisplayModeUI
};