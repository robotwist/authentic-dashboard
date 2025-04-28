import os
from django.conf import settings
from .social_api import FacebookAPI, InstagramAPI, LinkedInAPI, ThreadsAPI

def verify_credentials():
    """Verify that all required credentials are set"""
    credentials = {
        'Facebook': {
            'APP_ID': settings.FACEBOOK_APP_ID,
            'APP_SECRET': settings.FACEBOOK_APP_SECRET,
            'API_VERSION': settings.FACEBOOK_API_VERSION
        },
        'Instagram': {
            'APP_ID': settings.INSTAGRAM_APP_ID,
            'APP_SECRET': settings.INSTAGRAM_APP_SECRET,
            'API_VERSION': settings.INSTAGRAM_API_VERSION
        },
        'LinkedIn': {
            'CLIENT_ID': settings.LINKEDIN_CLIENT_ID,
            'CLIENT_SECRET': settings.LINKEDIN_CLIENT_SECRET
        },
        'Threads': {
            'APP_ID': getattr(settings, 'THREADS_APP_ID', settings.FACEBOOK_APP_ID),
            'APP_SECRET': getattr(settings, 'THREADS_APP_SECRET', settings.FACEBOOK_APP_SECRET),
            'ENABLED': getattr(settings, 'THREADS_ENABLED', False)
        }
    }
    
    all_valid = True
    print("\nVerifying Social Media Credentials:")
    print("===================================")
    
    for platform, creds in credentials.items():
        print(f"\n{platform} Credentials:")
        platform_valid = True
        
        for key, value in creds.items():
            is_valid = bool(value) and value != f'your-{key.lower()}'
            status = '✓' if is_valid else '✗'
            print(f"{status} {key}: {'[SET]' if is_valid else '[MISSING]'}")
            
            if not is_valid:
                platform_valid = False
                all_valid = False
        
        if platform_valid:
            print(f"✓ All {platform} credentials are properly set")
        else:
            print(f"✗ Some {platform} credentials are missing or invalid")
    
    print("\nOverall Status:")
    print("===============")
    if all_valid:
        print("✓ All credentials are properly configured")
    else:
        print("✗ Some credentials are missing or invalid")
        print("\nPlease update your .env file with the missing credentials")
    
    return all_valid

if __name__ == '__main__':
    verify_credentials() 