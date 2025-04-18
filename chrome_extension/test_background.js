// Simple background script for testing service worker functionality
console.log("Test background script started");

// Basic initialization
function initialize() {
  console.log("Test initialization completed");
  
  // Print extension ID for debugging
  const extensionId = chrome.runtime.id;
  console.log("Extension ID:", extensionId);
  
  // Set up a message listener with core functionality
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Received message:", message);
    
    // Essential ping functionality
    if (message.action === 'ping') {
      console.log("Ping received, sending response");
      sendResponse({ 
        success: true, 
        status: 'alive',
        extensionId: extensionId
      });
      return true;
    }
    
    // Handle content script loaded notifications
    if (message.action === 'contentScriptLoaded') {
      console.log(`Content script loaded for ${message.platform}`);
      sendResponse({ 
        success: true, 
        message: 'Content script registered',
        extensionId: extensionId
      });
      return true;
    }
    
    // Handle getResourceUrl requests - help diagnose invalid extension errors
    if (message.action === 'getResourceUrl') {
      try {
        const url = chrome.runtime.getURL(message.resource || '');
        console.log(`Resource URL requested for: ${message.resource} => ${url}`);
        sendResponse({ 
          success: true, 
          url: url,
          extensionId: extensionId
        });
      } catch (error) {
        console.error(`Error getting resource URL: ${error.message}`);
        sendResponse({ 
          success: false, 
          error: error.message,
          extensionId: extensionId
        });
      }
      return true;
    }
    
    // Handle posts sent from content script
    if (message.action === 'sendPosts') {
      console.log(`Received ${message.posts?.length || 0} posts from ${message.platform}`);
      
      // Validate input to prevent errors
      if (!message.posts || !Array.isArray(message.posts) || message.posts.length === 0) {
        console.warn('Received invalid posts data');
        sendResponse({ 
          success: false, 
          message: 'Invalid posts data',
          extensionId: extensionId
        });
        return true;
      }
      
      // Store posts in local storage
      chrome.storage.local.get(['collectedPosts'], (result) => {
        try {
          const collectedPosts = result.collectedPosts || {};
          const platformPosts = collectedPosts[message.platform] || [];
          
          // Add new posts
          const updatedPosts = [...platformPosts, ...message.posts];
          
          // Update storage
          collectedPosts[message.platform] = updatedPosts;
          
          chrome.storage.local.set({
            collectedPosts: collectedPosts
          }, () => {
            if (chrome.runtime.lastError) {
              console.error('Error storing posts:', chrome.runtime.lastError);
              sendResponse({ 
                success: false, 
                error: chrome.runtime.lastError.message,
                extensionId: extensionId 
              });
            } else {
              console.log(`Stored ${message.posts.length} posts from ${message.platform}`);
              sendResponse({ 
                success: true, 
                message: `Stored ${message.posts.length} posts from ${message.platform}`,
                extensionId: extensionId
              });
            }
          });
        } catch (error) {
          console.error('Error processing posts:', error);
          sendResponse({ 
            success: false, 
            error: error.message,
            extensionId: extensionId
          });
        }
      });
      
      return true; // We'll respond asynchronously
    }
  });
  
  // Create a simple alarm just to test alarms functionality
  chrome.alarms.create('testAlarm', { periodInMinutes: 5 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'testAlarm') {
      console.log("Test alarm triggered");
    }
  });
}

// Initialize
initialize();

// Handle errors
console.log("Test background script setup complete"); 