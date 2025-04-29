from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.contrib.auth import authenticate, login, logout
from django.contrib import messages
from django.utils import timezone
from django.conf import settings
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
import secrets
import string
import json
import logging
import requests
from urllib.parse import urlencode

from .models import UserPreference, APIKey, BehaviorLog
from dashboard.models import SocialMediaAccount, UserProfile
from .utils import get_user_data
from config_project.social_auth_settings import (
    FACEBOOK_CONFIG, INSTAGRAM_CONFIG, LINKEDIN_CONFIG, THREADS_CONFIG,
    OAUTH_CONFIG
)
from dashboard.utils.social_api import FacebookAPI, ThreadsAPI

logger = logging.getLogger(__name__)

def landing(request):
    """
    Landing page view - redirects to dashboard if authenticated,
    otherwise shows marketing/onboarding page
    """
    if request.user.is_authenticated:
        return redirect('dashboard')
    
    return render(request, "brandsensor/landing.html")

def user_login(request):
    """
    Handle user login
    """
    if request.user.is_authenticated:
        return redirect('dashboard')
        
    error_message = None
    
    if request.method == 'POST':
        username = request.POST.get('username')
        password = request.POST.get('password')
        
        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)
            next_url = request.GET.get('next', 'dashboard')
            return redirect(next_url)
        else:
            error_message = "Invalid username or password"
    
    return render(request, 'brandsensor/login.html', {'error_message': error_message})

def user_logout(request):
    """
    Handle user logout
    """
    logout(request)
    return redirect('landing')

def user_register(request):
    """
    Handle user registration
    """
    if request.user.is_authenticated:
        return redirect('dashboard')
        
    error_message = None
    
    if request.method == 'POST':
        username = request.POST.get('username')
        email = request.POST.get('email')
        password = request.POST.get('password')
        password_confirm = request.POST.get('password_confirm')
        
        if password != password_confirm:
            error_message = "Passwords do not match"
        elif User.objects.filter(username=username).exists():
            error_message = "Username already exists"
        elif User.objects.filter(email=email).exists():
            error_message = "Email already registered"
        else:
            # Create user
            user = User.objects.create_user(username=username, email=email, password=password)
            # Create default preferences
            UserPreference.objects.create(user=user)
            # Log in the user
            login(request, user)
            return redirect('dashboard')
    
    return render(request, 'brandsensor/register.html', {'error_message': error_message})

@login_required
def user_settings(request):
    """
    User settings and profile view
    """
    user = request.user

    # Fetch user data using the utility function
    user_data = get_user_data(user)

    if request.method == 'POST':
        # Handle settings update
        handle_user_settings_update(request, user, user_data["preferences"])
        return redirect('user_settings')

    # Prepare context for rendering
    context = prepare_user_settings_context(
        user,
        user_data["preferences"],
        user_data["api_keys"],
        user_data["post_count"],
        user_data["platform_stats"],
    )
    return render(request, 'brandsensor/user_settings.html', context)


# Helper function to handle user settings update
def handle_user_settings_update(request, user, preferences):
    """
    Update user profile and preferences based on the POST request.
    """
    if 'email' in request.POST:
        user.email = request.POST.get('email')
        user.save()

    preferences.email_notifications = 'email_notifications' in request.POST
    preferences.browser_notifications = 'browser_notifications' in request.POST
    preferences.save()


# Helper function to prepare context for rendering
def prepare_user_settings_context(user, preferences, api_keys, post_count, platform_stats):
    """
    Prepare the context dictionary for rendering the user settings page.
    """
    return {
        'user': user,
        'preferences': preferences,
        'api_keys': api_keys,
        'post_count': post_count,
        'platform_stats': platform_stats,
    }

@login_required
def onboarding(request):
    """
    View for the onboarding process after extension installation.
    Guides users through setting up their API key and preferences.
    """
    # Get the current user if authenticated
    user = request.user if request.user.is_authenticated else None
    
    # If user is authenticated, try to get their API key
    api_key = None
    if user:
        api_key = APIKey.objects.filter(user=user).first()
    
    context = {
        'user': user,
        'api_key': api_key,
        'has_api_key': api_key is not None,
    }
    
    return render(request, 'brandsensor/onboarding.html', context)

@login_required
def api_keys(request):
    """
    View to manage API keys
    """
    api_keys = APIKey.objects.filter(user=request.user).order_by('-created_at')
    return render(request, 'brandsensor/api_keys.html', {'api_keys': api_keys})

@login_required
def generate_api_key(request):
    """
    Generate a new API key for the current user
    """
    # Generate a random API key
    key_length = 32
    alphabet = string.ascii_letters + string.digits
    key_value = ''.join(secrets.choice(alphabet) for _ in range(key_length))
    
    # Create the API key
    APIKey.objects.create(
        user=request.user,
        key=key_value,
        name=f"API Key {timezone.now().strftime('%Y-%m-%d %H:%M')}"
    )
    
    # Log the action
    BehaviorLog.objects.create(
        user=request.user,
        action='generate_api_key',
        details=f"Generated new API key"
    )
    
    return redirect('api_keys')

@login_required
def delete_api_key(request, key_id):
    """
    Delete an API key
    """
    api_key = get_object_or_404(APIKey, id=key_id, user=request.user)
    api_key.delete()
    
    # Log the action
    BehaviorLog.objects.create(
        user=request.user,
        action='delete_api_key',
        details=f"Deleted API key {api_key.name}"
    )
    
    return redirect('api_keys')

# Facebook Authentication
def facebook_auth(request):
    """
    Initiate Facebook OAuth flow
    """
    # Build the authorization URL
    auth_params = {
        'client_id': FACEBOOK_CONFIG['APP_ID'],
        'redirect_uri': OAUTH_CONFIG['FACEBOOK_REDIRECT_URI'],
        'scope': ','.join(FACEBOOK_CONFIG['SCOPE']),
        'response_type': 'code',
        'state': 'facebook',  # Used to verify the callback
    }
    
    auth_url = f"{FACEBOOK_CONFIG['AUTH_ENDPOINT']}?{urlencode(auth_params)}"
    return redirect(auth_url)

def facebook_callback(request):
    """
    Handle Facebook OAuth callback
    """
    error = request.GET.get('error')
    if error:
        error_reason = request.GET.get('error_reason', '')
        error_description = request.GET.get('error_description', '')
        logger.error(f"Facebook OAuth error: {error} - {error_reason}: {error_description}")
        return render(request, 'auth/error.html', {
            'error': error,
            'error_description': error_description
        })
    
    code = request.GET.get('code')
    if not code:
        logger.error("No code received from Facebook")
        return render(request, 'auth/error.html', {
            'error': 'no_code',
            'error_description': 'No authorization code received from Facebook'
        })
    
    # Exchange code for access token
    token_params = {
        'client_id': FACEBOOK_CONFIG['APP_ID'],
        'client_secret': FACEBOOK_CONFIG['APP_SECRET'],
        'redirect_uri': OAUTH_CONFIG['FACEBOOK_REDIRECT_URI'],
        'code': code,
    }
    
    try:
        token_response = requests.get(FACEBOOK_CONFIG['TOKEN_ENDPOINT'], params=token_params)
        token_data = token_response.json()
        
        if 'error' in token_data:
            logger.error(f"Facebook token error: {token_data['error']}")
            return render(request, 'auth/error.html', {
                'error': 'token_error',
                'error_description': token_data.get('error_description', 'Error obtaining access token')
            })
        
        access_token = token_data.get('access_token')
        
        # Get user info using the token
        user_info_params = {
            'fields': FACEBOOK_CONFIG['FIELDS'],
            'access_token': access_token,
        }
        
        user_info_url = f"{FACEBOOK_CONFIG['API_BASE_URL']}me"
        user_info_response = requests.get(user_info_url, params=user_info_params)
        user_info = user_info_response.json()
        
        # Create or get existing user
        username = f"facebook_{user_info['id']}"
        user, created = User.objects.get_or_create(
            username=username,
            defaults={
                'email': user_info.get('email', f"{username}@example.com"),
                'first_name': user_info.get('name', '').split(' ')[0] if ' ' in user_info.get('name', '') else user_info.get('name', ''),
                'last_name': ' '.join(user_info.get('name', '').split(' ')[1:]) if ' ' in user_info.get('name', '') else '',
            }
        )
        
        # Create or update social media account
        social_account, _ = SocialMediaAccount.objects.update_or_create(
            user=user,
            platform='facebook',
            platform_id=user_info['id'],
            defaults={
                'access_token': access_token,
                'token_expires_at': timezone.now() + timezone.timedelta(seconds=token_data.get('expires_in', 3600)),
                'name': user_info.get('name', ''),
                'email': user_info.get('email', ''),
                'profile_url': f"https://facebook.com/{user_info['id']}",
                'profile_image': user_info.get('picture', {}).get('data', {}).get('url', ''),
                'metadata': json.dumps(user_info),
            }
        )
        
        # Log the user in
        login(request, user)
        
        # Redirect to dashboard
        return redirect('dashboard')
        
    except Exception as e:
        logger.exception(f"Error during Facebook OAuth: {str(e)}")
        return render(request, 'auth/error.html', {
            'error': 'oauth_error',
            'error_description': f"An error occurred during Facebook authentication: {str(e)}"
        })

@api_view(['POST'])
@permission_classes([AllowAny])
def facebook_token_auth(request):
    """
    Authenticate with Facebook using client-side token
    For use with the Facebook JS SDK
    """
    try:
        data = request.data
        access_token = data.get('access_token')
        user_id = data.get('user_id')
        user_info = data.get('user_info', {})
        
        if not access_token or not user_id:
            return JsonResponse({
                'success': False,
                'error': 'missing_parameters',
                'message': 'Access token and user ID are required'
            }, status=400)
        
        # Verify the token with Facebook
        fb_api = FacebookAPI(access_token)
        verified_info = fb_api.verify_token()
        
        if not verified_info or verified_info.get('id') != user_id:
            logger.error(f"Facebook token verification failed: {verified_info}")
            return JsonResponse({
                'success': False,
                'error': 'invalid_token',
                'message': 'Invalid Facebook access token'
            }, status=400)
        
        # Create or get existing user
        username = f"facebook_{user_id}"
        user, created = User.objects.get_or_create(
            username=username,
            defaults={
                'email': user_info.get('email', f"{username}@example.com"),
                'first_name': user_info.get('name', '').split(' ')[0] if ' ' in user_info.get('name', '') else user_info.get('name', ''),
                'last_name': ' '.join(user_info.get('name', '').split(' ')[1:]) if ' ' in user_info.get('name', '') else '',
            }
        )
        
        # Create or update social media account
        social_account, _ = SocialMediaAccount.objects.update_or_create(
            user=user,
            platform='facebook',
            platform_id=user_id,
            defaults={
                'access_token': access_token,
                # Since we're using the JS SDK, the token validity time may not be known
                'token_expires_at': timezone.now() + timezone.timedelta(hours=2),  # Assume 2 hours
                'name': user_info.get('name', ''),
                'email': user_info.get('email', ''),
                'profile_url': f"https://facebook.com/{user_id}",
                'profile_image': user_info.get('picture', {}).get('data', {}).get('url', ''),
                'metadata': json.dumps(user_info),
            }
        )
        
        # Log the user in
        login(request, user)
        
        return JsonResponse({
            'success': True,
            'message': 'Authentication successful',
            'user': {
                'id': user.id,
                'username': user.username,
                'name': user.get_full_name(),
                'is_new': created
            }
        })
        
    except Exception as e:
        logger.exception(f"Error during Facebook token auth: {str(e)}")
        return JsonResponse({
            'success': False,
            'error': 'server_error',
            'message': f"An error occurred: {str(e)}"
        }, status=500)

# Instagram Authentication
def instagram_auth(request):
    """
    Initiate Instagram OAuth flow
    """
    # Build the authorization URL
    auth_params = {
        'client_id': INSTAGRAM_CONFIG['APP_ID'],
        'redirect_uri': OAUTH_CONFIG['INSTAGRAM_REDIRECT_URI'],
        'scope': ','.join(INSTAGRAM_CONFIG['SCOPE']),
        'response_type': 'code',
        'state': 'instagram',  # Used to verify the callback
    }
    
    auth_url = f"{INSTAGRAM_CONFIG['AUTH_ENDPOINT']}?{urlencode(auth_params)}"
    return redirect(auth_url)

# LinkedIn Authentication
def linkedin_auth(request):
    """
    Initiate LinkedIn OAuth flow
    """
    # Build the authorization URL
    auth_params = {
        'client_id': LINKEDIN_CONFIG['CLIENT_ID'],
        'redirect_uri': OAUTH_CONFIG['LINKEDIN_REDIRECT_URI'],
        'scope': ' '.join(LINKEDIN_CONFIG['SCOPE']),  # LinkedIn uses space-separated scopes
        'response_type': 'code',
        'state': 'linkedin',  # Used to verify the callback
    }
    
    auth_url = f"{LINKEDIN_CONFIG['AUTH_ENDPOINT']}?{urlencode(auth_params)}"
    return redirect(auth_url)

# Threads Authentication (if available)
def threads_auth(request):
    """
    Initiate Threads OAuth flow
    """
    # Check if Threads is enabled
    if not hasattr(settings, 'THREADS_ENABLED') or not settings.THREADS_ENABLED:
        return render(request, 'auth/error.html', {
            'error': 'service_unavailable',
            'error_description': 'Threads authentication is not currently available'
        })
        
    # Build the authorization URL
    auth_params = {
        'client_id': THREADS_CONFIG['APP_ID'],
        'redirect_uri': OAUTH_CONFIG['THREADS_REDIRECT_URI'],
        'scope': ','.join(THREADS_CONFIG['SCOPE']),
        'response_type': 'code',
        'state': 'threads',  # Used to verify the callback
    }
    
    auth_url = f"{THREADS_CONFIG['AUTH_ENDPOINT']}?{urlencode(auth_params)}"
    return redirect(auth_url)

@login_required
def threads_callback(request):
    """
    Handle Threads OAuth callback
    """
    code = request.GET.get('code')
    state = request.GET.get('state')
    
    # Verify state (security check)
    if not code or state != 'threads':
        messages.error(request, 'Failed to connect Threads account. Invalid callback parameters.')
        return redirect('dashboard:profile')
    
    # Exchange authorization code for access token
    try:
        response = requests.post(THREADS_CONFIG['TOKEN_ENDPOINT'], data={
            'client_id': THREADS_CONFIG['APP_ID'],
            'client_secret': THREADS_CONFIG['APP_SECRET'],
            'code': code,
            'redirect_uri': OAUTH_CONFIG['THREADS_REDIRECT_URI'],
            'grant_type': 'authorization_code'
        })
        
        response.raise_for_status()
        token_data = response.json()
        
        # Get access token and expiry
        access_token = token_data.get('access_token')
        expires_in = token_data.get('expires_in', 0)
        
        if not access_token:
            messages.error(request, 'Failed to obtain access token for Threads.')
            return redirect('dashboard:profile')
        
        # Get user data from Threads API
        threads_api = ThreadsAPI(access_token)
        user_data = threads_api.get_user_profile()
        
        # Save or update social media account
        SocialMediaAccount.objects.update_or_create(
            user=request.user,
            platform='threads',
            account_id=user_data['id'],
            defaults={
                'access_token': access_token,
                'token_expires_at': timezone.now() + timezone.timedelta(seconds=expires_in),
                'is_active': True
            }
        )
        
        messages.success(request, 'Threads account connected successfully!')
        
        # Log the authentication
        BehaviorLog.objects.create(
            user=request.user,
            behavior_type='social_auth',
            platform='threads',
            details=f"Connected Threads account: {user_data.get('username', 'Unknown')}"
        )
        
    except requests.exceptions.RequestException as e:
        logger.error(f"Threads OAuth error: {str(e)}")
        messages.error(request, f'Failed to connect Threads account: {str(e)}')
    except Exception as e:
        logger.error(f"Unexpected error in Threads callback: {str(e)}")
        messages.error(request, 'An unexpected error occurred while connecting your Threads account.')
    
    return redirect('dashboard:profile')
