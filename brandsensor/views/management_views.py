from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.contrib import messages
from django.utils import timezone
import secrets
import string
import logging

from ..models import UserPreference, APIKey, BehaviorLog, FilterPreset, SocialPost
from ..utils import get_user_data

logger = logging.getLogger(__name__)

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

    # Update preferences
    preferences.email_notifications = 'email_notifications' in request.POST
    preferences.browser_notifications = 'browser_notifications' in request.POST
    preferences.hide_political_content = 'hide_political_content' in request.POST
    preferences.hide_sexual_content = 'hide_sexual_content' in request.POST
    
    # Update filter preferences
    preferences.interest_filter = request.POST.get('interest_filter', '')
    preferences.friends_list = request.POST.get('friends_list', '')
    preferences.approved_brands = request.POST.get('approved_brands', '')
    preferences.excluded_keywords = request.POST.get('excluded_keywords', '')
    
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

@login_required
def api_keys(request):
    """
    API Keys management view
    """
    user_api_keys = APIKey.objects.filter(user=request.user).order_by('-created_at')
    
    context = {
        'api_keys': user_api_keys,
    }
    
    return render(request, 'brandsensor/api_keys.html', context)

@login_required
def generate_api_key(request):
    """
    Generate a new API key for the user
    """
    if request.method == 'POST':
        name = request.POST.get('name', 'Default API Key')
        
        # Generate a secure random API key
        key = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(32))
        
        # Create the API key
        api_key = APIKey.objects.create(
            user=request.user,
            name=name,
            key=key,
            is_active=True
        )
        
        messages.success(request, f'API key "{name}" created successfully!')
        return redirect('api_keys')
    
    return redirect('api_keys')

@login_required
def delete_api_key(request, key_id):
    """
    Delete an API key
    """
    if request.method == 'POST':
        try:
            api_key = get_object_or_404(APIKey, id=key_id, user=request.user)
            key_name = api_key.name
            api_key.delete()
            
            messages.success(request, f'API key "{key_name}" deleted successfully!')
        except Exception as e:
            logger.error(f"Error deleting API key: {str(e)}")
            messages.error(request, "Error deleting API key.")
    
    return redirect('api_keys')

@login_required
def filter_presets(request):
    """
    Manage filter presets
    """
    presets = FilterPreset.objects.filter(user=request.user).order_by('-created_at')
    
    if request.method == 'POST':
        action = request.POST.get('action')
        
        if action == 'create':
            name = request.POST.get('name')
            if name:
                # Get current filter settings from the form
                preset = FilterPreset.objects.create(
                    user=request.user,
                    name=name,
                    platform_filter=request.POST.get('platform_filter', ''),
                    days_filter=int(request.POST.get('days_filter', 7)),
                    friends_only=request.POST.get('friends_only') == 'true',
                    hide_sponsored=request.POST.get('hide_sponsored') == 'true',
                    min_authenticity=int(request.POST.get('min_authenticity', 0)) if request.POST.get('min_authenticity') else None,
                    max_authenticity=int(request.POST.get('max_authenticity', 100)) if request.POST.get('max_authenticity') else None,
                )
                messages.success(request, f'Filter preset "{name}" created successfully!')
        
        elif action == 'delete':
            preset_id = request.POST.get('preset_id')
            if preset_id:
                try:
                    preset = get_object_or_404(FilterPreset, id=preset_id, user=request.user)
                    preset_name = preset.name
                    preset.delete()
                    messages.success(request, f'Filter preset "{preset_name}" deleted successfully!')
                except Exception as e:
                    logger.error(f"Error deleting filter preset: {str(e)}")
                    messages.error(request, "Error deleting filter preset.")
        
        return redirect('filter_presets')
    
    context = {
        'presets': presets,
        'platforms': SocialPost.PLATFORM_CHOICES,
    }
    
    return render(request, 'brandsensor/filter_presets.html', context) 