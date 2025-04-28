/**
 * Facebook Integration - Handles FB SDK interactions for Authentic Dashboard
 * 
 * This file provides functions for:
 * 1. Authentication with Facebook
 * 2. Fetching user feed content 
 * 3. Processing content for filtering
 */

class FacebookIntegration {
    constructor() {
        this.isInitialized = false;
        this.userId = null;
        this.accessToken = null;
        this.loginStatus = 'unknown';
        this.initialize();
    }

    /**
     * Initialize the Facebook integration
     */
    initialize() {
        // Check if FB SDK is loaded
        if (typeof FB !== 'undefined') {
            this.isInitialized = true;
            this.checkLoginStatus();
        } else {
            // Listen for the FB SDK ready event
            document.addEventListener('fb-sdk-ready', () => {
                this.isInitialized = true;
                this.checkLoginStatus();
            });
            
            // Fallback to window.fbAsyncInit if the event approach doesn't work
            window.fbAsyncInit = () => {
                if (!this.isInitialized) {
                    this.isInitialized = true;
                    this.checkLoginStatus();
                }
            };
        }
    }

    /**
     * Check if the user is already logged in to Facebook
     */
    checkLoginStatus() {
        FB.getLoginStatus((response) => {
            this.handleLoginStatusResponse(response);
        });
    }

    /**
     * Handle the login status response
     * This is used by both the custom button and the official Facebook button
     * @param {Object} response - The FB.getLoginStatus response object
     */
    handleLoginStatusResponse(response) {
        this.loginStatus = response.status;
        console.log('Facebook login status:', response.status);

        switch (response.status) {
            case 'connected':
                // User is logged in to Facebook and has authorized your app
                this.userId = response.authResponse.userID;
                this.accessToken = response.authResponse.accessToken;
                this.onLoginSuccess(response);
                this.updateUI('connected');
                break;
            
            case 'not_authorized':
                // User is logged in to Facebook but has not authorized your app
                console.log('User logged into Facebook but not authorized for app');
                this.updateUI('not_authorized');
                break;
            
            default: // 'unknown'
                // User is not logged in to Facebook
                console.log('User not logged into Facebook');
                this.updateUI('unknown');
                break;
        }
    }

    /**
     * Update UI based on login status
     * @param {string} status - The login status ('connected', 'not_authorized', 'unknown')
     */
    updateUI(status) {
        // Find UI elements that should reflect login state
        const loginBtn = document.getElementById('facebook-login-btn');
        const logoutBtn = document.getElementById('facebook-logout-btn');
        const authStatusElement = document.getElementById('facebook-auth-status');
        const connectedContent = document.querySelector('.facebook-connected-content');
        const disconnectedContent = document.querySelector('.facebook-disconnected-content');

        if (status === 'connected') {
            // Update buttons
            if (loginBtn) loginBtn.style.display = 'none';
            if (logoutBtn) logoutBtn.style.display = 'block';
            
            // Update status message if it exists
            if (authStatusElement) {
                authStatusElement.textContent = 'Connected to Facebook';
                authStatusElement.className = 'status-connected';
            }
            
            // Show/hide content sections
            if (connectedContent) connectedContent.style.display = 'block';
            if (disconnectedContent) disconnectedContent.style.display = 'none';

            // Dispatch an event that other parts of the app might listen for
            document.dispatchEvent(new CustomEvent('facebook-status-change', { 
                detail: { status: 'connected' } 
            }));
        } else {
            // Either not_authorized or unknown
            if (loginBtn) loginBtn.style.display = 'block';
            if (logoutBtn) logoutBtn.style.display = 'none';
            
            if (authStatusElement) {
                if (status === 'not_authorized') {
                    authStatusElement.textContent = 'Please authorize this app to access your Facebook data';
                    authStatusElement.className = 'status-not-authorized';
                } else {
                    authStatusElement.textContent = 'Not connected to Facebook';
                    authStatusElement.className = 'status-unknown';
                }
            }
            
            if (connectedContent) connectedContent.style.display = 'none';
            if (disconnectedContent) disconnectedContent.style.display = 'block';

            // Dispatch an event
            document.dispatchEvent(new CustomEvent('facebook-status-change', { 
                detail: { status: status } 
            }));
        }
    }

    /**
     * Log in to Facebook
     * @param {Function} callback - Optional callback after login attempt
     */
    login(callback) {
        FB.login((response) => {
            if (response.status === 'connected') {
                this.userId = response.authResponse.userID;
                this.accessToken = response.authResponse.accessToken;
                this.loginStatus = 'connected';
                this.onLoginSuccess(response);
                this.updateUI('connected');
            } else {
                this.loginStatus = response.status;
                this.onLoginFailed(response);
                this.updateUI(response.status);
            }
            
            if (callback && typeof callback === 'function') {
                callback(response);
            }
        }, {
            // Request these additional permissions when logging in
            scope: 'public_profile,user_posts,pages_show_list,pages_read_engagement',
            // Enable re-requesting declined permissions
            auth_type: 'rerequest'
        });
    }

    /**
     * Log out from Facebook
     * @param {Function} callback - Optional callback after logout
     */
    logout(callback) {
        FB.logout((response) => {
            this.userId = null;
            this.accessToken = null;
            this.loginStatus = 'unknown';
            this.updateUI('unknown');
            
            if (callback && typeof callback === 'function') {
                callback(response);
            }
        });
    }

    /**
     * Handle successful login
     * @param {Object} response - The login response
     */
    onLoginSuccess(response) {
        console.log('Facebook login successful', response);
        
        // Store token expiration time
        if (response.authResponse && response.authResponse.expiresIn) {
            const expiresAt = new Date().getTime() + (response.authResponse.expiresIn * 1000);
            localStorage.setItem('fb_token_expires_at', expiresAt);
        }
        
        // Get user info
        this.getUserInfo((userInfo) => {
            console.log('User info retrieved', userInfo);
            
            // Notify the server about the successful authentication
            this.sendAuthToServer(response.authResponse, userInfo);
        });
    }

    /**
     * Handle failed login
     * @param {Object} response - The login response
     */
    onLoginFailed(response) {
        console.error('Facebook login failed', response);
    }

    /**
     * Get user information
     * @param {Function} callback - Callback with user information
     */
    getUserInfo(callback) {
        FB.api('/me', {fields: 'id,name,email,picture'}, (response) => {
            if (callback && typeof callback === 'function') {
                callback(response);
            }
        });
    }

    /**
     * Send authentication data to the server
     * @param {Object} authResponse - Facebook auth response
     * @param {Object} userInfo - User information
     */
    sendAuthToServer(authResponse, userInfo) {
        fetch('/auth/facebook/token/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': this.getCsrfToken()
            },
            body: JSON.stringify({
                access_token: authResponse.accessToken,
                user_id: authResponse.userID,
                expires_in: authResponse.expiresIn,
                user_info: userInfo
            }),
            credentials: 'same-origin'
        })
        .then(response => response.json())
        .then(data => {
            console.log('Server authentication successful', data);
            // Trigger an event that other parts of the app can listen for
            document.dispatchEvent(new CustomEvent('facebook-auth-complete', { 
                detail: { success: true, data: data } 
            }));
        })
        .catch(error => {
            console.error('Server authentication failed', error);
            document.dispatchEvent(new CustomEvent('facebook-auth-complete', { 
                detail: { success: false, error: error } 
            }));
        });
    }

    /**
     * Get user feed posts
     * @param {Function} callback - Callback with feed data
     * @param {Object} options - Options for the feed request
     */
    getUserFeed(callback, options = {}) {
        if (this.loginStatus !== 'connected') {
            console.error('Cannot fetch feed: User not connected to Facebook');
            if (callback && typeof callback === 'function') {
                callback({ error: 'User not connected to Facebook' });
            }
            return;
        }

        const defaultOptions = {
            limit: 25,
            fields: 'id,message,created_time,full_picture,type,permalink_url,likes.summary(true),comments.summary(true),shares'
        };
        
        const requestOptions = {...defaultOptions, ...options};
        
        FB.api('/me/feed', requestOptions, (response) => {
            if (response && !response.error) {
                if (callback && typeof callback === 'function') {
                    callback(response);
                }
            } else {
                console.error('Failed to fetch user feed', response);
                if (callback && typeof callback === 'function') {
                    callback(response);
                }
            }
        });
    }

    /**
     * Check if token is expired or will expire soon
     * @param {number} threshold - Seconds before expiry to consider token as expiring (default: 300 - 5 minutes)
     * @returns {boolean} - True if token is expired or will expire soon
     */
    isTokenExpiringSoon(threshold = 300) {
        const expiresAt = localStorage.getItem('fb_token_expires_at');
        if (!expiresAt) return true;
        
        const now = new Date().getTime();
        return (expiresAt - now) / 1000 < threshold;
    }

    /**
     * Refresh the access token
     * @param {Function} callback - Optional callback after token refresh
     */
    refreshToken(callback) {
        FB.getLoginStatus((response) => {
            if (response.status === 'connected') {
                this.userId = response.authResponse.userID;
                this.accessToken = response.authResponse.accessToken;
                
                // Update token expiration time
                if (response.authResponse.expiresIn) {
                    const expiresAt = new Date().getTime() + (response.authResponse.expiresIn * 1000);
                    localStorage.setItem('fb_token_expires_at', expiresAt);
                }
                
                if (callback && typeof callback === 'function') {
                    callback(true, response);
                }
            } else {
                if (callback && typeof callback === 'function') {
                    callback(false, response);
                }
            }
        }, true); // Force a token refresh by passing true
    }

    /**
     * Get CSRF token from cookies
     * @returns {String} CSRF token
     */
    getCsrfToken() {
        const name = 'csrftoken';
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }
}

// Create a global instance of the Facebook integration
window.facebookIntegration = new FacebookIntegration();

/**
 * Callback function for the official Facebook login button
 * This bridges the official button with our integration class
 */
window.fbButtonCallback = function() {
    console.log("Official Facebook button callback triggered");
    FB.getLoginStatus(function(response) {
        window.facebookIntegration.handleLoginStatusResponse(response);
    });
};

// Add login button click handler
document.addEventListener('DOMContentLoaded', () => {
    const fbLoginBtn = document.getElementById('facebook-login-btn');
    if (fbLoginBtn) {
        fbLoginBtn.addEventListener('click', (event) => {
            event.preventDefault();
            window.facebookIntegration.login();
        });
    }
    
    const fbLogoutBtn = document.getElementById('facebook-logout-btn');
    if (fbLogoutBtn) {
        fbLogoutBtn.addEventListener('click', (event) => {
            event.preventDefault();
            window.facebookIntegration.logout();
        });
    }

    // Set up periodic token refresh check
    setInterval(() => {
        if (window.facebookIntegration.loginStatus === 'connected' && 
            window.facebookIntegration.isTokenExpiringSoon()) {
            console.log('Facebook token expiring soon, refreshing...');
            window.facebookIntegration.refreshToken();
        }
    }, 60000); // Check every minute
}); 