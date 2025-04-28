"""
Environment-specific settings for the Authentic Dashboard application.
This file contains configuration for both development and production environments.
"""
import os
from django.conf import settings

# Environment detection
def is_production():
    """Check if the application is running in production environment"""
    return not settings.DEBUG or os.getenv('ENVIRONMENT') == 'production'

# Environment-specific URLs
def get_oauth_redirect_domain():
    """Get the OAuth redirect domain based on environment"""
    if is_production():
        return "https://authenticdashboard.com"
    else:
        return "http://localhost:8000"

# OAuth callback URLs
def get_callback_urls():
    """Return environment-appropriate callback URLs for OAuth"""
    domain = get_oauth_redirect_domain()
    return {
        'facebook': f"{domain}/auth/facebook/callback/",
        'instagram': f"{domain}/auth/instagram/callback/",
        'linkedin': f"{domain}/auth/linkedin/callback/",
        'threads': f"{domain}/auth/threads/callback/",
    }

# For Meta App configuration
SITE_URLS = {
    'development': {
        'site_url': 'http://localhost:8000',
        'privacy_url': 'http://localhost:8000/privacy-policy/',
        'terms_url': 'http://localhost:8000/terms/',
    },
    'production': {
        'site_url': 'https://authenticdashboard.com',
        'privacy_url': 'https://authenticdashboard.com/privacy-policy/',
        'terms_url': 'https://authenticdashboard.com/terms/',
    }
}

def get_current_site_urls():
    """Get the appropriate site URLs based on environment"""
    env = 'production' if is_production() else 'development'
    return SITE_URLS[env] 