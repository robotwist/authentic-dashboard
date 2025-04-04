// Store extension settings in chrome.storage
const DEFAULT_SETTINGS = {
    autoScan: true,
    advancedML: true,
    collectSponsored: true,
    showNotifications: true,
    apiKey: '508f3487618d47da8d02970250bc26a1', // Default API key for testing
    scanHistory: [],
    stats: {
        totalPosts: 0,
        todayPosts: 0,
        mlProcessed: 0,
        lastScanDate: null
    }
};

// Load settings when popup opens
document.addEventListener('DOMContentLoaded', function() {
    // Load saved settings or use defaults
    chrome.storage.local.get(['settings'], function(result) {
        const settings = result.settings || DEFAULT_SETTINGS;
        
        // Set toggle states based on saved settings
        document.getElementById('autoScan').checked = settings.autoScan;
        document.getElementById('advancedML').checked = settings.advancedML;
        document.getElementById('collectSponsored').checked = settings.collectSponsored;
        document.getElementById('showNotifications').checked = settings.showNotifications;
        
        // Set API key
        document.getElementById('apiKey').value = settings.apiKey || '';
        
        // Update stats display
        updateStatsDisplay(settings.stats);
        
        // Update recent scans
        updateRecentScansDisplay(settings.scanHistory);
    });
    
    // Add event listener for the scan button
    document.getElementById('scanButton').addEventListener('click', performScan);
    
    // Add event listeners for toggle switches
    document.getElementById('autoScan').addEventListener('change', updateSettings);
    document.getElementById('advancedML').addEventListener('change', updateSettings);
    document.getElementById('collectSponsored').addEventListener('change', updateSettings);
    document.getElementById('showNotifications').addEventListener('change', updateSettings);

    // Add event listener for saving API key
    document.getElementById('saveApiKey').addEventListener('click', function() {
        updateAPIKey();
    });

    // Add event listeners for dashboard links
    document.getElementById('dashboardLink').addEventListener('click', function(e) {
        e.preventDefault();
        openDashboard();
    });
    
    document.getElementById('mlDashboardLink').addEventListener('click', function(e) {
        e.preventDefault();
        openMLDashboard();
    });
    
    // Add event listener for troubleshoot link
    document.getElementById('troubleshootLink').addEventListener('click', function(e) {
        e.preventDefault();
        troubleshootDashboardAccess();
    });
});

// Function to perform scan on the current page
function performScan() {
    const scanButton = document.getElementById('scanButton');
    const statusElement = document.getElementById('status');
    
    // Disable button during scan
    scanButton.disabled = true;
    scanButton.textContent = 'Scanning...';
    statusElement.textContent = 'Scanning current page...';
    statusElement.className = 'status';
    
    // Get the active tab
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        const activeTab = tabs[0];
        
        // Detect platform based on URL
        let platform = 'unknown';
        if (activeTab.url.includes('instagram.com')) {
            platform = 'instagram';
        } else if (activeTab.url.includes('facebook.com')) {
            platform = 'facebook';
        } else if (activeTab.url.includes('linkedin.com')) {
            platform = 'linkedin';
        }
        
        // Skip if we're not on a supported platform
        if (platform === 'unknown') {
            scanButton.disabled = false;
            scanButton.textContent = 'Scan Current Page';
            statusElement.textContent = 'This page is not supported for scanning.';
            statusElement.className = 'status error';
            return;
        }
        
        // Load settings for the scan
        chrome.storage.local.get(['settings'], function(result) {
            const settings = result.settings || DEFAULT_SETTINGS;
            
            // Execute content script function to collect posts
            chrome.tabs.sendMessage(activeTab.id, {
                action: 'collectPosts',
                platform: platform,
                settings: {
                    advancedML: settings.advancedML,
                    collectSponsored: settings.collectSponsored
                }
            }, function(response) {
                if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError);
                    scanButton.disabled = false;
                    scanButton.textContent = 'Scan Current Page';
                    statusElement.textContent = 'Error: Could not connect to page.';
                    statusElement.className = 'status error';
                    return;
                }
                
                if (!response || !response.posts) {
                    scanButton.disabled = false;
                    scanButton.textContent = 'Scan Current Page';
                    statusElement.textContent = 'No posts found on this page.';
                    statusElement.className = 'status';
                    return;
                }
                
                const posts = response.posts;
                
                // Send posts to backend API
                sendPostsToAPI(posts, platform, function(success, count) {
                    scanButton.disabled = false;
                    scanButton.textContent = 'Scan Current Page';
                    
                    if (success) {
                        statusElement.textContent = `Successfully collected ${count} posts.`;
                        statusElement.className = 'status success';
                        
                        // Update stats and scan history
                        updateStats(platform, count);
                        
                        // Show notification if enabled
                        if (settings.showNotifications) {
                            chrome.notifications.create({
                                type: 'basic',
                                iconUrl: 'icon48.png',
                                title: 'Authentic Dashboard',
                                message: `Successfully collected ${count} posts from ${platform}.`
                            });
                        }
                    } else {
                        statusElement.textContent = 'Error sending data to server.';
                        statusElement.className = 'status error';
                    }
                });
            });
        });
    });
}

// Function to send posts to the backend API
function sendPostsToAPI(posts, platform, callback) {
    if (!posts || posts.length === 0) {
        callback(false, 0);
        return;
    }
    
    // Get API key from settings
    chrome.storage.local.get(['settings'], function(result) {
        const settings = result.settings || DEFAULT_SETTINGS;
        const apiKey = settings.apiKey || '';
        
        // Send each post to the API
        let successCount = 0;
        let failureCount = 0;
        
        posts.forEach(post => {
            fetch('http://localhost:8000/api/post/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': apiKey
                },
                body: JSON.stringify(post)
            })
            .then(response => response.json())
            .then(data => {
                if (data.status && (data.status === 'post saved and processed' || data.status === 'duplicate post, skipped')) {
                    successCount++;
                } else {
                    failureCount++;
                }
                
                // Check if all posts have been processed
                if (successCount + failureCount === posts.length) {
                    callback(true, successCount);
                }
            })
            .catch(error => {
                console.error('Error:', error);
                failureCount++;
                
                // Check if all posts have been processed
                if (successCount + failureCount === posts.length) {
                    callback(successCount > 0, successCount);
                }
            });
        });
    });
}

// Function to update settings when toggles change
function updateSettings() {
    chrome.storage.local.get(['settings'], function(result) {
        let settings = result.settings || DEFAULT_SETTINGS;
        
        // Update settings based on toggle states
        settings.autoScan = document.getElementById('autoScan').checked;
        settings.advancedML = document.getElementById('advancedML').checked;
        settings.collectSponsored = document.getElementById('collectSponsored').checked;
        settings.showNotifications = document.getElementById('showNotifications').checked;
        
        // Save updated settings
        chrome.storage.local.set({ settings: settings });
    });
}

// Function to update stats after a successful scan
function updateStats(platform, count) {
    chrome.storage.local.get(['settings'], function(result) {
        let settings = result.settings || DEFAULT_SETTINGS;
        
        // Update total post count
        settings.stats.totalPosts += count;
        
        // Update today's post count
        const today = new Date().toDateString();
        const lastScanDate = settings.stats.lastScanDate;
        
        if (lastScanDate === today) {
            settings.stats.todayPosts += count;
        } else {
            settings.stats.todayPosts = count;
            settings.stats.lastScanDate = today;
        }
        
        // Update ML processed count (estimate)
        settings.stats.mlProcessed += Math.round(count * 0.9); // Assume ~90% of posts get ML processed
        
        // Add to scan history
        const scanEntry = {
            platform: platform,
            count: count,
            timestamp: new Date().toISOString()
        };
        
        settings.scanHistory.unshift(scanEntry);
        
        // Keep only the last 10 scans
        if (settings.scanHistory.length > 10) {
            settings.scanHistory.pop();
        }
        
        // Save updated settings
        chrome.storage.local.set({ settings: settings });
        
        // Update the displayed stats
        updateStatsDisplay(settings.stats);
        
        // Update recent scans display
        updateRecentScansDisplay(settings.scanHistory);
    });
}

// Function to update stats display
function updateStatsDisplay(stats) {
    document.getElementById('postsToday').textContent = stats.todayPosts;
    document.getElementById('postsTotal').textContent = stats.totalPosts;
    document.getElementById('mlProcessed').textContent = stats.mlProcessed;
}

// Function to update recent scans display
function updateRecentScansDisplay(scanHistory) {
    const recentScansElement = document.getElementById('recentScans');
    recentScansElement.innerHTML = '';
    
    if (scanHistory.length === 0) {
        recentScansElement.innerHTML = '<p>No recent scans</p>';
        return;
    }
    
    scanHistory.forEach(scan => {
        const scanDate = new Date(scan.timestamp);
        const timeString = scanDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        const scanItem = document.createElement('div');
        scanItem.className = 'scan-item';
        scanItem.innerHTML = `
            <span class="scan-platform">${scan.platform}</span>: 
            ${scan.count} posts 
            <span class="scan-time">(${timeString})</span>
        `;
        
        recentScansElement.appendChild(scanItem);
    });
}

// Function to update API key
function updateAPIKey() {
    const apiKeyInput = document.getElementById('apiKey');
    const apiKey = apiKeyInput.value.trim();
    
    chrome.storage.local.get(['settings'], function(result) {
        let settings = result.settings || DEFAULT_SETTINGS;
        
        // Update API key
        settings.apiKey = apiKey;
        
        // Save updated settings
        chrome.storage.local.set({ settings: settings }, function() {
            // Show brief confirmation
            const statusElement = document.getElementById('status');
            statusElement.textContent = 'API key saved successfully!';
            statusElement.className = 'status success';
            
            // Reset status after 2 seconds
            setTimeout(function() {
                statusElement.textContent = 'Ready to scan.';
                statusElement.className = 'status';
            }, 2000);
        });
    });
}

// Function to open dashboard with proper auth handling
function openDashboard() {
    // Get the API key to help with authentication
    chrome.storage.local.get(['settings'], function(result) {
        const settings = result.settings || DEFAULT_SETTINGS;
        const apiKey = settings.apiKey || '';
        
        // Create URL with API key if available
        let dashboardUrl = 'http://localhost:8000/dashboard/';
        if (apiKey) {
            dashboardUrl += `?api_key=${encodeURIComponent(apiKey)}`;
        }
        
        // Track dashboard opening attempts
        const openAttempt = {
            type: 'dashboard',
            timestamp: new Date().toISOString()
        };
        
        // Store the attempt to potentially handle errors later
        chrome.storage.local.get(['dashboardAttempts'], function(data) {
            const attempts = data.dashboardAttempts || [];
            attempts.unshift(openAttempt);
            
            // Keep only the last 5 attempts
            if (attempts.length > 5) {
                attempts.pop();
            }
            
            chrome.storage.local.set({ dashboardAttempts: attempts });
            
            // Open the dashboard
            chrome.tabs.create({url: dashboardUrl});
        });
    });
}

// Function to open ML dashboard with proper auth handling
function openMLDashboard() {
    // Get the API key to help with authentication
    chrome.storage.local.get(['settings'], function(result) {
        const settings = result.settings || DEFAULT_SETTINGS;
        const apiKey = settings.apiKey || '';
        
        // Create URL with API key if available
        let mlDashboardUrl = 'http://localhost:8000/ml-dashboard/';
        if (apiKey) {
            mlDashboardUrl += `?api_key=${encodeURIComponent(apiKey)}`;
        }
        
        // Track dashboard opening attempts
        const openAttempt = {
            type: 'ml-dashboard',
            timestamp: new Date().toISOString()
        };
        
        // Store the attempt to potentially handle errors later
        chrome.storage.local.get(['dashboardAttempts'], function(data) {
            const attempts = data.dashboardAttempts || [];
            attempts.unshift(openAttempt);
            
            // Keep only the last 5 attempts
            if (attempts.length > 5) {
                attempts.pop();
            }
            
            chrome.storage.local.set({ dashboardAttempts: attempts });
            
            // Open the dashboard
            chrome.tabs.create({url: mlDashboardUrl});
        });
    });
}

// Function to troubleshoot dashboard access issues
function troubleshootDashboardAccess() {
    // Check if the Django server is running
    fetch('http://localhost:8000/api/health-check/', { 
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        if (response.ok) {
            return response.json();
        }
        throw new Error('Server not responding');
    })
    .then(data => {
        // Server is running, check authentication
        chrome.storage.local.get(['settings'], function(result) {
            const settings = result.settings || DEFAULT_SETTINGS;
            const apiKey = settings.apiKey || '';
            
            if (!apiKey) {
                document.getElementById('status').textContent = 'API key is missing. Please add a valid API key.';
                document.getElementById('status').className = 'status error';
                return;
            }
            
            // Check if API key is valid
            fetch('http://localhost:8000/api/verify-key/', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': apiKey
                }
            })
            .then(response => {
                if (response.ok) {
                    document.getElementById('status').textContent = 'Authentication is working correctly.';
                    document.getElementById('status').className = 'status success';
                } else {
                    document.getElementById('status').textContent = 'API key is invalid. Please update your API key.';
                    document.getElementById('status').className = 'status error';
                }
            })
            .catch(error => {
                document.getElementById('status').textContent = 'Error verifying API key: ' + error.message;
                document.getElementById('status').className = 'status error';
            });
        });
    })
    .catch(error => {
        document.getElementById('status').textContent = 'Django server is not running at localhost:8000.';
        document.getElementById('status').className = 'status error';
    });
}
  