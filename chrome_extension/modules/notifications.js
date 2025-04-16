/**
 * notifications.js - Notification handling for Authentic Dashboard
 * 
 * Manages browser notifications for the extension.
 */

/**
 * Show a notification to the user
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {string} type - Notification type (info, success, error)
 */
function showNotification(title, message, type = 'info') {
  let iconPath = 'icon48.png';
  
  // Different icons for different notification types
  if (type === 'error') {
    title = title || 'Error';
    iconPath = 'icon48.png'; // Could use a specific error icon
  }
  
  chrome.notifications.create({
    type: 'basic',
    iconUrl: iconPath,
    title: title,
    message: message
  });
}

/**
 * Update the browser action badge with post count
 * @param {number} count - Number to display on badge
 * @param {string} color - Badge background color (default: green)
 */
function updateBadge(count, color = '#4CAF50') {
  try {
    // Format large numbers
    let badgeText = count.toString();
    if (count > 999) {
      badgeText = Math.floor(count / 1000) + 'k';
    }
    
    // Set the badge text
    chrome.action.setBadgeText({ text: badgeText });
    
    // Set badge background color
    chrome.action.setBadgeBackgroundColor({ color: color });
    
    // Clear badge after 5 seconds
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '' });
    }, 5000);
    
    console.log(`Updated badge with count: ${count}`);
  } catch (error) {
    // Handle errors gracefully - this is a non-critical feature
    console.error('Error updating badge:', error);
    
    // Try older API if newer one failed (for backward compatibility)
    try {
      if (chrome.browserAction) {
        chrome.browserAction.setBadgeText({ text: count.toString() });
        chrome.browserAction.setBadgeBackgroundColor({ color: color });
        
        setTimeout(() => {
          chrome.browserAction.setBadgeText({ text: '' });
        }, 5000);
      }
    } catch (innerError) {
      console.error('Error with fallback badge update:', innerError);
    }
  }
}

/**
 * Set up listener for notification clicks
 */
function setupNotificationClickListener() {
  chrome.notifications.onClicked.addListener(function(notificationId) {
    // Open dashboard
    chrome.tabs.create({ url: 'http://localhost:8000/dashboard/' });
  });
}

export {
  showNotification,
  updateBadge,
  setupNotificationClickListener
}; 