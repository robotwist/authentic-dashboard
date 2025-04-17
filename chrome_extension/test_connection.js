/**
 * test_connection.js - Test connectivity between all components of the extension
 * 
 * This script provides a diagnostic interface for testing:
 * - Content script injection
 * - Background script communication
 * - API server connectivity
 * - Storage access
 */

document.addEventListener('DOMContentLoaded', function() {
  // References to DOM elements
  const results = document.getElementById('results');
  const contentScriptStatus = document.getElementById('content-script-status');
  const backgroundScriptStatus = document.getElementById('background-script-status');
  const apiStatus = document.getElementById('api-status');
  const storageStatus = document.getElementById('storage-status');
  const permissionsStatus = document.getElementById('permissions-status');
  
  // Buttons
  const testAllBtn = document.getElementById('test-all');
  const testContentBtn = document.getElementById('test-content');
  const testBackgroundBtn = document.getElementById('test-background');
  const testApiBtn = document.getElementById('test-api');
  const testStorageBtn = document.getElementById('test-storage');
  const testPermissionsBtn = document.getElementById('test-permissions');
  const clearResultsBtn = document.getElementById('clear-results');
  
  // Set up event listeners
  testAllBtn.addEventListener('click', testAll);
  testContentBtn.addEventListener('click', testContentScript);
  testBackgroundBtn.addEventListener('click', testBackgroundScript);
  testApiBtn.addEventListener('click', testApiConnection);
  testStorageBtn.addEventListener('click', testStorage);
  testPermissionsBtn.addEventListener('click', testPermissions);
  clearResultsBtn.addEventListener('click', clearResults);
  
  // Run all tests
  function testAll() {
    clearResults();
    logMessage('Running all tests...');
    
    Promise.all([
      testContentScript(),
      testBackgroundScript(),
      testApiConnection(),
      testStorage(),
      testPermissions()
    ])
    .then(() => {
      logMessage('All tests completed');
    })
    .catch(error => {
      logError('Error running tests:', error);
    });
  }
  
  // Test content script injection
  function testContentScript() {
    contentScriptStatus.className = 'status testing';
    contentScriptStatus.textContent = 'Testing...';
    logMessage('Testing content script injection...');
    
    return new Promise((resolve) => {
      // Get active tab
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || tabs.length === 0) {
          setTestResult(contentScriptStatus, 'error', 'No active tab found');
          logError('Content script test failed: No active tab found');
          resolve(false);
          return;
        }
        
        const activeTab = tabs[0];
        const url = activeTab.url;
        
        // Check if we're on a supported site
        if (!isSupportedSite(url)) {
          setTestResult(contentScriptStatus, 'warning', 'Not on a supported site');
          logWarning(`Content script test skipped: Current site (${getDomain(url)}) not supported`);
          resolve(false);
          return;
        }
        
        // Try to send a message to the content script
        chrome.tabs.sendMessage(activeTab.id, { action: 'ping' }, (response) => {
          if (chrome.runtime.lastError) {
            setTestResult(contentScriptStatus, 'error', 'Not responding');
            logError('Content script test failed:', chrome.runtime.lastError);
            resolve(false);
            return;
          }
          
          if (response && response.success) {
            setTestResult(contentScriptStatus, 'success', 'Injected & responding');
            logSuccess(`Content script injected successfully on ${getDomain(url)}`);
            resolve(true);
          } else {
            setTestResult(contentScriptStatus, 'error', 'Invalid response');
            logError('Content script test failed: Invalid response', response);
            resolve(false);
          }
        });
      });
    });
  }
  
  // Test background script communication
  function testBackgroundScript() {
    backgroundScriptStatus.className = 'status testing';
    backgroundScriptStatus.textContent = 'Testing...';
    logMessage('Testing background script communication...');
    
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'ping' }, (response) => {
        if (chrome.runtime.lastError) {
          setTestResult(backgroundScriptStatus, 'error', 'Not responding');
          logError('Background script test failed:', chrome.runtime.lastError);
          resolve(false);
          return;
        }
        
        if (response && response.success) {
          setTestResult(backgroundScriptStatus, 'success', 'Connected');
          logSuccess('Background script communication successful');
          resolve(true);
        } else {
          setTestResult(backgroundScriptStatus, 'error', 'Invalid response');
          logError('Background script test failed: Invalid response', response);
          resolve(false);
        }
      });
    });
  }
  
  // Test API connection
  function testApiConnection() {
    apiStatus.className = 'status testing';
    apiStatus.textContent = 'Testing...';
    logMessage('Testing API connection...');
    
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'checkConnection', forceCheck: true }, (response) => {
        if (chrome.runtime.lastError) {
          setTestResult(apiStatus, 'error', 'Test failed');
          logError('API connection test failed:', chrome.runtime.lastError);
          resolve(false);
          return;
        }
        
        if (response && response.success) {
          const isConnected = response.status === 'connected';
          
          if (isConnected) {
            setTestResult(apiStatus, 'success', 'Connected');
            logSuccess('API connection successful');
          } else {
            setTestResult(apiStatus, 'error', 'Disconnected');
            logError('API connection test failed: API server unreachable');
          }
          
          resolve(isConnected);
        } else {
          setTestResult(apiStatus, 'error', 'Test error');
          logError('API connection test error:', response ? response.error : 'Unknown error');
          resolve(false);
        }
      });
    });
  }
  
  // Test storage access
  function testStorage() {
    storageStatus.className = 'status testing';
    storageStatus.textContent = 'Testing...';
    logMessage('Testing storage access...');
    
    return new Promise((resolve) => {
      const testData = {
        testKey: 'test-value-' + Date.now()
      };
      
      // Test setting data
      chrome.storage.local.set(testData, () => {
        if (chrome.runtime.lastError) {
          setTestResult(storageStatus, 'error', 'Write failed');
          logError('Storage test failed (write):', chrome.runtime.lastError);
          resolve(false);
          return;
        }
        
        // Test reading data
        chrome.storage.local.get(['testKey'], (result) => {
          if (chrome.runtime.lastError) {
            setTestResult(storageStatus, 'error', 'Read failed');
            logError('Storage test failed (read):', chrome.runtime.lastError);
            resolve(false);
            return;
          }
          
          if (result.testKey === testData.testKey) {
            setTestResult(storageStatus, 'success', 'Working');
            logSuccess('Storage test successful (read/write)');
            resolve(true);
          } else {
            setTestResult(storageStatus, 'error', 'Data mismatch');
            logError('Storage test failed: Data mismatch', { expected: testData.testKey, actual: result.testKey });
            resolve(false);
          }
        });
      });
    });
  }
  
  // Test permissions
  function testPermissions() {
    permissionsStatus.className = 'status testing';
    permissionsStatus.textContent = 'Testing...';
    logMessage('Testing permissions...');
    
    return new Promise((resolve) => {
      // Get the manifest to check declared permissions
      const manifest = chrome.runtime.getManifest();
      const declaredPermissions = manifest.permissions || [];
      const declaredHostPermissions = manifest.host_permissions || [];
      
      logMessage('Declared permissions:', declaredPermissions.join(', '));
      logMessage('Declared host permissions:', declaredHostPermissions.join(', '));
      
      // Check which ones we have
      chrome.permissions.getAll((currentPermissions) => {
        const hasPermissions = currentPermissions.permissions || [];
        const hasOrigins = currentPermissions.origins || [];
        
        logMessage('Current permissions:', hasPermissions.join(', '));
        logMessage('Current origins:', hasOrigins.join(', '));
        
        // Check if we have storage (critical)
        if (!hasPermissions.includes('storage')) {
          setTestResult(permissionsStatus, 'error', 'Missing storage');
          logError('Permissions test failed: Missing storage permission');
          resolve(false);
          return;
        }
        
        // Check if we have tabs (important)
        if (!hasPermissions.includes('tabs')) {
          setTestResult(permissionsStatus, 'warning', 'Missing tabs');
          logWarning('Permissions warning: Missing tabs permission');
        }
        
        // Check if we have at least one host permission
        if (hasOrigins.length === 0) {
          setTestResult(permissionsStatus, 'error', 'No host permissions');
          logError('Permissions test failed: No host permissions');
          resolve(false);
          return;
        }
        
        // Overall, we're good enough
        setTestResult(permissionsStatus, 'success', 'Sufficient');
        logSuccess('Permissions test successful: Critical permissions granted');
        resolve(true);
      });
    });
  }
  
  // Helper functions
  function isSupportedSite(url) {
    return (
      url.includes('facebook.com') ||
      url.includes('instagram.com') ||
      url.includes('linkedin.com')
    );
  }
  
  function getDomain(url) {
    try {
      return new URL(url).hostname;
    } catch (e) {
      return url;
    }
  }
  
  function setTestResult(element, result, message) {
    element.className = `status ${result}`;
    element.textContent = message;
  }
  
  function logMessage(message, ...args) {
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    logEntry.innerHTML = `<span class="timestamp">${new Date().toLocaleTimeString()}</span> <span class="message">${message}</span>`;
    
    if (args && args.length > 0) {
      logEntry.innerHTML += ` <pre>${JSON.stringify(args, null, 2)}</pre>`;
    }
    
    results.appendChild(logEntry);
    results.scrollTop = results.scrollHeight;
    
    console.log(message, ...args);
  }
  
  function logSuccess(message, ...args) {
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry success';
    logEntry.innerHTML = `<span class="timestamp">${new Date().toLocaleTimeString()}</span> <span class="message">✓ ${message}</span>`;
    
    if (args && args.length > 0) {
      logEntry.innerHTML += ` <pre>${JSON.stringify(args, null, 2)}</pre>`;
    }
    
    results.appendChild(logEntry);
    results.scrollTop = results.scrollHeight;
    
    console.log(`✓ ${message}`, ...args);
  }
  
  function logError(message, ...args) {
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry error';
    logEntry.innerHTML = `<span class="timestamp">${new Date().toLocaleTimeString()}</span> <span class="message">✗ ${message}</span>`;
    
    if (args && args.length > 0) {
      logEntry.innerHTML += ` <pre>${JSON.stringify(args, null, 2)}</pre>`;
    }
    
    results.appendChild(logEntry);
    results.scrollTop = results.scrollHeight;
    
    console.error(`✗ ${message}`, ...args);
  }
  
  function logWarning(message, ...args) {
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry warning';
    logEntry.innerHTML = `<span class="timestamp">${new Date().toLocaleTimeString()}</span> <span class="message">⚠ ${message}</span>`;
    
    if (args && args.length > 0) {
      logEntry.innerHTML += ` <pre>${JSON.stringify(args, null, 2)}</pre>`;
    }
    
    results.appendChild(logEntry);
    results.scrollTop = results.scrollHeight;
    
    console.warn(`⚠ ${message}`, ...args);
  }
  
  function clearResults() {
    results.innerHTML = '';
    
    // Reset status indicators
    contentScriptStatus.className = 'status';
    contentScriptStatus.textContent = 'Unknown';
    
    backgroundScriptStatus.className = 'status';
    backgroundScriptStatus.textContent = 'Unknown';
    
    apiStatus.className = 'status';
    apiStatus.textContent = 'Unknown';
    
    storageStatus.className = 'status';
    storageStatus.textContent = 'Unknown';
    
    permissionsStatus.className = 'status';
    permissionsStatus.textContent = 'Unknown';
  }
  
  // Run initial test
  setTimeout(testAll, 500);
}); 