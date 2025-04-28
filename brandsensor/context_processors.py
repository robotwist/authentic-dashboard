"""
Context processors for templates to access social media configurations.
"""
from django.conf import settings
from config_project.social_auth_settings import FACEBOOK_CONFIG, INSTAGRAM_CONFIG, LINKEDIN_CONFIG, THREADS_CONFIG

def social_media_settings(request):
    """
    Add social media configuration to the template context.
    This makes API IDs and versions available to templates.
    """
    return {
        # Facebook settings
        'facebook_app_id': settings.FACEBOOK_APP_ID,
        'facebook_api_version': settings.FACEBOOK_API_VERSION,
        
        # Instagram settings
        'instagram_app_id': settings.INSTAGRAM_APP_ID,
        'instagram_api_version': settings.INSTAGRAM_API_VERSION,
        
        # LinkedIn settings
        'linkedin_client_id': settings.LINKEDIN_CLIENT_ID,
        
        # Threads settings
        'threads_enabled': getattr(settings, 'THREADS_ENABLED', False),
        'threads_app_id': getattr(settings, 'THREADS_APP_ID', settings.FACEBOOK_APP_ID),
        
        # Environment settings
        'is_production': settings.IS_PRODUCTION,
        'oauth_redirect_domain': settings.OAUTH_REDIRECT_DOMAIN,
    } 