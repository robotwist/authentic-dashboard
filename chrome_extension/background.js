// Listen for tab updates to trigger auto-scanning
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    // Only act when the page is fully loaded
    if (changeInfo.status === 'complete') {
        // Check if we're on a supported platform
        const supportedPlatforms = ['instagram.com', 'facebook.com', 'linkedin.com'];
        const isSupported = supportedPlatforms.some(platform => tab.url.includes(platform));
        
        if (isSupported) {
            // Check if auto-scan is enabled
            chrome.storage.local.get(['settings'], function(result) {
                const settings = result.settings || {
                    autoScan: true,
                    advancedML: true,
                    collectSponsored: true,
                    showNotifications: true
                };
                
                if (settings.autoScan) {
                    // Wait a bit for page to fully render content
                    setTimeout(() => {
                        performAutoScan(tabId, tab.url, settings);
                    }, 3000);
                }
            });
        }
    }
});

// Listen for installation and update events
chrome.runtime.onInstalled.addListener(function(details) {
    if (details.reason === 'install') {
        // Initialize default settings on install
        const defaultSettings = {
            autoScan: true,
            advancedML: true,
            collectSponsored: true,
            showNotifications: true,
            scanHistory: [],
            stats: {
                totalPosts: 0,
                todayPosts: 0,
                mlProcessed: 0,
                lastScanDate: new Date().toDateString()
            }
        };
        
        chrome.storage.local.set({ settings: defaultSettings });
        
        // Open onboarding page
        chrome.tabs.create({
            url: 'http://localhost:8000/onboarding/'
        });
    }
});

// Function to perform auto scan when navigating to supported platforms
function performAutoScan(tabId, url, settings) {
    // Determine platform from URL
    let platform = 'unknown';
    if (url.includes('instagram.com')) {
        platform = 'instagram';
    } else if (url.includes('facebook.com')) {
        platform = 'facebook';
    } else if (url.includes('linkedin.com')) {
        platform = 'linkedin';
    }
    
    if (platform === 'unknown') {
        return;
    }
    
    // Execute content script to collect posts
    chrome.tabs.sendMessage(tabId, {
        action: 'collectPosts',
        platform: platform,
        settings: {
            advancedML: settings.advancedML,
            collectSponsored: settings.collectSponsored
        }
    }, function(response) {
        if (chrome.runtime.lastError || !response || !response.posts) {
            console.error('Auto-scan failed:', chrome.runtime.lastError);
            return;
        }
        
        const posts = response.posts;
        
        // Send posts to backend API
        sendPostsToAPI(posts, platform, settings);
    });
}

// Function to send posts to backend API
function sendPostsToAPI(posts, platform, settings) {
    if (!posts || posts.length === 0) {
        return;
    }
    
    const apiKey = settings.apiKey || '';
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
            if (successCount + failureCount === posts.length && successCount > 0) {
                // Update stats
                updateStats(platform, successCount, settings);
                
                // Show notification if enabled
                if (settings.showNotifications) {
                    chrome.notifications.create({
                        type: 'basic',
                        iconUrl: 'icon48.png',
                        title: 'Authentic Dashboard',
                        message: `Auto-scan: Collected ${successCount} posts from ${platform}.`
                    });
                }
            }
        })
        .catch(error => {
            console.error('Error sending post to API:', error);
            failureCount++;
        });
    });
}

// Function to update stats after successful scan
function updateStats(platform, count, currentSettings) {
    chrome.storage.local.get(['settings'], function(result) {
        // Make sure to get the most up-to-date settings
        let settings = result.settings || currentSettings;
        
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
        settings.stats.mlProcessed += Math.round(count * 0.9);
        
        // Add to scan history
        const scanEntry = {
            platform: platform,
            count: count,
            timestamp: new Date().toISOString(),
            automatic: true
        };
        
        settings.scanHistory.unshift(scanEntry);
        
        // Keep only the last 10 scans
        if (settings.scanHistory.length > 10) {
            settings.scanHistory.pop();
        }
        
        // Save updated settings
        chrome.storage.local.set({ settings: settings });
    });
} 