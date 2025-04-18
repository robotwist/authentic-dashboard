// Simple background script that uses a module import
console.log("Module background script started");

// Import the simplified API module
import { checkApiAvailability } from './modules/simple-api.js';

// Basic initialization
async function initialize() {
  console.log("Module initialization starting");
  
  // Check API availability
  try {
    const available = await checkApiAvailability();
    console.log("API available:", available);
  } catch (error) {
    console.error("Error checking API:", error);
  }
  
  // Set up a basic message listener
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Received message:", message);
    
    if (message.action === 'ping') {
      sendResponse({ success: true, status: 'alive' });
      return true;
    }
    
    if (message.action === 'checkApi') {
      checkApiAvailability()
        .then(available => {
          sendResponse({ success: true, available });
        })
        .catch(error => {
          sendResponse({ success: false, error: error.message });
        });
      return true;
    }
    
    return false;
  });
  
  console.log("Module initialization completed");
}

// Initialize
initialize();

// Log completion
console.log("Module background script setup complete"); 