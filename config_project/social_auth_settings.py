from django.conf import settings
from .environment_settings import get_oauth_redirect_domain, get_callback_urls

# Get the appropriate OAuth redirect domain
OAUTH_REDIRECT_DOMAIN = get_oauth_redirect_domain()

# Get callback URLs
CALLBACK_URLS = get_callback_urls()

# Facebook Settings
FACEBOOK_CONFIG = {
    'APP_ID': settings.FACEBOOK_APP_ID,
    'APP_SECRET': settings.FACEBOOK_APP_SECRET,
    'API_VERSION': settings.FACEBOOK_API_VERSION,
    'SCOPE': [
        'public_profile',
        'pages_show_list',
        'pages_read_engagement'
    ],
    'FIELDS': 'id,name,email,picture',
    'AUTH_ENDPOINT': f'https://www.facebook.com/{settings.FACEBOOK_API_VERSION}/dialog/oauth',
    'TOKEN_ENDPOINT': f'https://graph.facebook.com/{settings.FACEBOOK_API_VERSION}/oauth/access_token',
    'API_BASE_URL': f'https://graph.facebook.com/{settings.FACEBOOK_API_VERSION}/',
}

# Instagram Settings
INSTAGRAM_CONFIG = {
    'APP_ID': settings.INSTAGRAM_APP_ID,
    'APP_SECRET': settings.INSTAGRAM_APP_SECRET,
    'API_VERSION': settings.INSTAGRAM_API_VERSION,
    'SCOPE': [
        'basic',
        'user_profile',
        'user_media'
    ],
    'AUTH_ENDPOINT': 'https://api.instagram.com/oauth/authorize',
    'TOKEN_ENDPOINT': 'https://api.instagram.com/oauth/access_token',
    'API_BASE_URL': 'https://graph.instagram.com/',
}

# LinkedIn Settings
LINKEDIN_CONFIG = {
    'CLIENT_ID': settings.LINKEDIN_CLIENT_ID,
    'CLIENT_SECRET': settings.LINKEDIN_CLIENT_SECRET,
    'SCOPE': [
        'r_liteprofile',
        'r_emailaddress',
        'w_member_social'
    ],
    'AUTH_ENDPOINT': 'https://www.linkedin.com/oauth/v2/authorization',
    'TOKEN_ENDPOINT': 'https://www.linkedin.com/oauth/v2/accessToken',
    'API_BASE_URL': 'https://api.linkedin.com/v2/',
}

# Threads Settings (if available)
THREADS_CONFIG = {
    'APP_ID': settings.FACEBOOK_APP_ID,  # Uses same app as Facebook
    'APP_SECRET': settings.FACEBOOK_APP_SECRET,
    'SCOPE': [
        'threads_basic',
        'threads_content_publish',
        'threads_manage_insights',
        'threads_read_replies'
    ],
    'AUTH_ENDPOINT': f'https://www.facebook.com/{settings.FACEBOOK_API_VERSION}/dialog/oauth',
    'TOKEN_ENDPOINT': f'https://graph.facebook.com/{settings.FACEBOOK_API_VERSION}/oauth/access_token',
    'API_BASE_URL': 'https://graph.threads.meta.com/',
}

# OAuth Settings
OAUTH_CONFIG = {
    'REDIRECT_DOMAIN': OAUTH_REDIRECT_DOMAIN,
    'FACEBOOK_REDIRECT_URI': CALLBACK_URLS['facebook'],
    'INSTAGRAM_REDIRECT_URI': CALLBACK_URLS['instagram'],
    'LINKEDIN_REDIRECT_URI': CALLBACK_URLS['linkedin'],
    'THREADS_REDIRECT_URI': CALLBACK_URLS['threads'],
}

# Token Settings
TOKEN_CONFIG = {
    'FACEBOOK_TOKEN_EXPIRY': 60 * 60 * 2,  # 2 hours
    'INSTAGRAM_TOKEN_EXPIRY': 60 * 60 * 24,  # 24 hours
    'LINKEDIN_TOKEN_EXPIRY': 60 * 60 * 24 * 60,  # 60 days
    'REFRESH_THRESHOLD': 60 * 5,  # 5 minutes before expiry
}

# Rate Limiting
RATE_LIMITS = {
    'FACEBOOK': {
        'CALLS_PER_HOUR': 200,
        'CALLS_PER_DAY': 4800,
    },
    'INSTAGRAM': {
        'CALLS_PER_HOUR': 200,
        'CALLS_PER_DAY': 4800,
    },
    'LINKEDIN': {
        'CALLS_PER_DAY': 100000,
    }
} 