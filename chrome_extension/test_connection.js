// Test script to diagnose connection issues in the Authentic Dashboard extension

// This function will run basic diagnostics on the extension
function runDiagnostics() {
  console.log("=== AUTHENTIC DASHBOARD DIAGNOSTICS ===");
  console.log("Running comprehensive tests...");
  
  // Test 1: Check if extension API is functioning
  console.log("\n1. Testing extension API access:");
  try {
    if (chrome && chrome.runtime && chrome.runtime.id) {
      console.log("✅ Extension API accessible");
      console.log("   Extension ID: " + chrome.runtime.id);
    } else {
      console.error("❌ Cannot access extension ID - potential initialization issue");
    }
  } catch (e) {
    console.error("❌ Exception when accessing extension API:", e);
  }
  
  // Test 2: Check message passing
  console.log("\n2. Testing message passing:");
  try {
    chrome.runtime.sendMessage(
      { action: "ping", source: "diagnostics" },
      function(response) {
        if (chrome.runtime.lastError) {
          console.error("❌ Message error: " + chrome.runtime.lastError.message);
          if (chrome.runtime.lastError.message.includes("receiving end does not exist")) {
            console.error("   This suggests the background script is not running properly");
            console.error("   Possible causes:");
            console.error("   - Extension was just installed/updated but not reloaded");
            console.error("   - Background script has an error preventing initialization");
            console.error("   - Extension is in developer mode and needs reloading");
          }
        } else if (response && response.action === "pong") {
          console.log("✅ Message successfully sent and received from background");
          console.log("   Response time: " + response.timestamp);
        } else {
          console.warn("⚠️ Message sent but received unexpected response:", response);
        }
      }
    );
  } catch (e) {
    console.error("❌ Exception when sending message:", e);
  }
  
  // Test 3: Check storage access
  console.log("\n3. Testing storage access:");
  try {
    const testData = { test: "diagnostic-" + Date.now() };
    chrome.storage.local.set(testData, function() {
      if (chrome.runtime.lastError) {
        console.error("❌ Error writing to storage: " + chrome.runtime.lastError.message);
      } else {
        console.log("✅ Successfully wrote to storage");
        
        // Read it back
        chrome.storage.local.get(["test"], function(result) {
          if (chrome.runtime.lastError) {
            console.error("❌ Error reading from storage: " + chrome.runtime.lastError.message);
          } else if (result.test === testData.test) {
            console.log("✅ Successfully read from storage");
          } else {
            console.warn("⚠️ Read from storage but data doesn't match:", result);
          }
        });
      }
    });
  } catch (e) {
    console.error("❌ Exception when accessing storage:", e);
  }
  
  // Test 4: Check API endpoint settings
  console.log("\n4. Testing API endpoint settings:");
  try {
    chrome.storage.local.get(["apiEndpoint", "apiKey", "apiAvailable", "apiLastCheck"], function(result) {
      if (chrome.runtime.lastError) {
        console.error("❌ Error reading API settings: " + chrome.runtime.lastError.message);
      } else {
        console.log("API Endpoint:", result.apiEndpoint || "Not set (will use default)");
        console.log("API Key:", result.apiKey ? "Set" : "Not set (will use default)");
        console.log("API Available:", result.apiAvailable === true ? "Yes" : result.apiAvailable === false ? "No" : "Unknown");
        console.log("Last API Check:", result.apiLastCheck ? new Date(result.apiLastCheck).toLocaleString() : "Never");
      }
      
      // Try a connection to the API endpoint
      const apiEndpoint = result.apiEndpoint || "http://127.0.0.1:8000";
      const apiKey = result.apiKey || "8484e01c2e0b4d368eb9a0f9b89807ad";
      
      console.log("Testing connection to: " + apiEndpoint);
      fetch(`${apiEndpoint}/api/health-check/`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey
        }
      })
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        console.log("✅ API connection successful!");
        console.log("   Response:", data);
      })
      .catch(error => {
        console.error("❌ API connection failed:", error);
        console.log("   Trying alternate URLs...");
        
        // Try alternatives
        const alternateUrls = [
          "http://localhost:8000/api/health-check/",
          "http://127.0.0.1:8000/api/health-check/",
          "http://0.0.0.0:8000/api/health-check/"
        ];
        
        // Filter out the one we already tried
        const remainingUrls = alternateUrls.filter(url => !url.includes(apiEndpoint));
        
        // Try each alternate URL
        remainingUrls.forEach(url => {
          fetch(url, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              "X-API-Key": apiKey
            }
          })
          .then(response => {
            if (!response.ok) {
              throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
          })
          .then(data => {
            console.log(`✅ Alternate URL ${url} connection successful!`);
            console.log("   Response:", data);
            console.log("   Consider updating your apiEndpoint to use this URL");
          })
          .catch(error => {
            console.error(`❌ Alternate URL ${url} connection failed:`, error);
          });
        });
      });
    });
  } catch (e) {
    console.error("❌ Exception when checking API settings:", e);
  }
  
  console.log("\n=== DIAGNOSTICS COMPLETE ===");
  console.log("Some tests run asynchronously; check console for full results.");
}

// Run diagnostics automatically when this script is loaded
runDiagnostics();

// Add listener to respond to ping messages (allows other scripts to test connectivity)
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === "ping") {
    sendResponse({
      action: "pong",
      source: "test_connection.js",
      timestamp: Date.now()
    });
    return true;
  }
}); 