from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.contrib.auth import authenticate, login, logout
from django.utils import timezone
import secrets
import string

from .models import UserPreference, APIKey, BehaviorLog
from .utils import get_user_data

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
