import os
import json
import logging
import secrets
import string
from django.shortcuts import render, redirect, get_object_or_404
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.contrib.auth import login, authenticate, logout
from django.contrib import messages
from django.utils import timezone
from django.contrib.auth.models import User
from ..models import UserPreference, APIKey
from ..utils import get_user_data

logger = logging.getLogger(__name__)

def landing(request):
    """
    Landing page view - redirects to dashboard if authenticated,
    otherwise shows marketing/onboarding page
    """
    if request.user.is_authenticated:
        return redirect('dashboard')
    
    return render(request, "brandsensor/landing.html")

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
def onboarding(request):
    """
    Handle user onboarding flow
    """
    if request.method == 'POST':
        # Handle onboarding form submission
        user = request.user
        
        # Get or create user preferences
        preferences, created = UserPreference.objects.get_or_create(user=user)
        
        # Update preferences based on form data
        preferences.interest_filter = request.POST.get('interests', '')
        preferences.hide_sponsored = 'hide_sponsored' in request.POST
        preferences.show_verified_only = 'verified_only' in request.POST
        preferences.bizfluencer_filter = 'hide_bizfluencer' in request.POST
        preferences.high_sentiment_only = 'positive_only' in request.POST
        preferences.save()
        
        messages.success(request, 'Welcome! Your preferences have been saved.')
        return redirect('dashboard')
    
    return render(request, 'brandsensor/onboarding.html')

@login_required
def api_keys(request):
    """
    Manage API keys for the user
    """
    user_keys = APIKey.objects.filter(user=request.user).order_by('-created_at')
    return render(request, 'brandsensor/api_keys.html', {'api_keys': user_keys})

@login_required
def generate_api_key(request):
    """
    Generate a new API key for the user
    """
    if request.method == 'POST':
        name = request.POST.get('name', 'API Key')
        
        # Generate a secure random key
        key = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(64))
        
        # Create the API key
        api_key = APIKey.objects.create(
            user=request.user,
            key=key,
            name=name
        )
        
        messages.success(request, f'API key "{name}" created successfully!')
        return redirect('api_keys')
    
    return render(request, 'brandsensor/api_keys.html')

@login_required
def delete_api_key(request, key_id):
    """
    Delete an API key
    """
    try:
        api_key = APIKey.objects.get(id=key_id, user=request.user)
        api_key.delete()
        messages.success(request, 'API key deleted successfully!')
    except APIKey.DoesNotExist:
        messages.error(request, 'API key not found.')
    
    return redirect('api_keys')

def get_user_from_api_key(request):
    """
    Authenticate a request using the API key from the header.
    Returns the user if successful, None otherwise.
    """
    api_key = request.headers.get('X-API-Key')
    
    # Check for API key in query parameters if not in header
    if not api_key and request.GET.get('api_key'):
        api_key = request.GET.get('api_key')
    
    # During testing/development, fallback to the first user if no API key
    if not api_key and settings.DEBUG:
        return User.objects.first()
        
    if not api_key:
        return None
        
    try:
        key_obj = APIKey.objects.get(key=api_key, is_active=True)
        
        # Update last_used timestamp
        key_obj.last_used = timezone.now()
        key_obj.save(update_fields=['last_used'])
        
        return key_obj.user
    except APIKey.DoesNotExist:
        return None 