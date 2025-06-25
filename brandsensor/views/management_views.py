"""
Management Views Module

Contains all management-related views for the BrandSensor application.
This includes API key management, user settings, and administrative functions.
"""

import secrets
import string
import logging
from django.shortcuts import render, redirect, get_object_or_404
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.utils import timezone
from django.conf import settings

from ..models import APIKey, UserPreference, FilterPreset
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

@login_required
def api_keys(request):
    """
    Display user's API keys
    """
    user = request.user
    api_keys = APIKey.objects.filter(user=user).order_by('-created_at')
    
    context = {
        'user': user,
        'api_keys': api_keys
    }
    
    return render(request, 'brandsensor/api_keys.html', context)

@login_required
def generate_api_key(request):
    """
    Generate a new API key for the user
    """
    if request.method == 'POST':
        user = request.user
        name = request.POST.get('name', 'API Key')
        
        # Generate a secure random key
        key = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(32))
        
        # Create the API key
        api_key = APIKey.objects.create(
            user=user,
            name=name,
            key=key,
            is_active=True,
            created_at=timezone.now()
        )
        
        messages.success(request, f'API key "{name}" created successfully!')
        
        return JsonResponse({
            'status': 'success',
            'api_key': {
                'id': api_key.id,
                'name': api_key.name,
                'key': api_key.key,
                'created_at': api_key.created_at.isoformat()
            }
        })
    
    return JsonResponse({'status': 'error', 'message': 'Invalid request method'})

@login_required
def delete_api_key(request, key_id):
    """
    Delete an API key
    """
    if request.method == 'POST':
        user = request.user
        
        try:
            api_key = APIKey.objects.get(id=key_id, user=user)
            api_key_name = api_key.name
            api_key.delete()
            
            messages.success(request, f'API key "{api_key_name}" deleted successfully!')
            
            return JsonResponse({
                'status': 'success',
                'message': f'API key "{api_key_name}" deleted'
            })
            
        except APIKey.DoesNotExist:
            return JsonResponse({
                'status': 'error',
                'message': 'API key not found'
            }, status=404)
    
    return JsonResponse({'status': 'error', 'message': 'Invalid request method'})

@login_required
def filter_presets(request):
    """
    Manage user's filter presets
    """
    user = request.user
    
    if request.method == 'POST':
        action = request.POST.get('action')
        
        if action == 'create':
            return create_filter_preset(request, user)
        elif action == 'update':
            return update_filter_preset(request, user)
        elif action == 'delete':
            return delete_filter_preset(request, user)
    
    # GET request - display presets
    presets = FilterPreset.objects.filter(user=user).order_by('name')
    
    context = {
        'user': user,
        'presets': presets
    }
    
    return render(request, 'brandsensor/filter_presets.html', context)

def create_filter_preset(request, user):
    """
    Create a new filter preset
    """
    try:
        name = request.POST.get('name')
        if not name:
            return JsonResponse({'status': 'error', 'message': 'Name is required'})
        
        # Check if preset with this name already exists
        if FilterPreset.objects.filter(user=user, name=name).exists():
            return JsonResponse({'status': 'error', 'message': 'Preset name already exists'})
        
        preset = FilterPreset.objects.create(
            user=user,
            name=name,
            platform_filter=request.POST.get('platform_filter', ''),
            sentiment_filter=request.POST.get('sentiment_filter', ''),
            date_range_filter=request.POST.get('date_range_filter', ''),
            brand_filter=request.POST.get('brand_filter', ''),
            authenticity_filter=request.POST.get('authenticity_filter', ''),
            search_query=request.POST.get('search_query', ''),
            filter_inappropriate_content=request.POST.get('filter_inappropriate') == 'on',
            filter_low_quality_content=request.POST.get('filter_low_quality') == 'on',
            filter_family_content=request.POST.get('filter_family') == 'on',
            filter_sexual_content=request.POST.get('filter_sexual') == 'on'
        )
        
        messages.success(request, f'Filter preset "{name}" created successfully!')
        
        return JsonResponse({
            'status': 'success',
            'preset': {
                'id': preset.id,
                'name': preset.name
            }
        })
        
    except Exception as e:
        logger.error(f"Error creating filter preset: {e}")
        return JsonResponse({'status': 'error', 'message': 'Failed to create preset'})

def update_filter_preset(request, user):
    """
    Update an existing filter preset
    """
    try:
        preset_id = request.POST.get('preset_id')
        if not preset_id:
            return JsonResponse({'status': 'error', 'message': 'Preset ID is required'})
        
        preset = get_object_or_404(FilterPreset, id=preset_id, user=user)
        
        # Update fields
        preset.name = request.POST.get('name', preset.name)
        preset.platform_filter = request.POST.get('platform_filter', preset.platform_filter)
        preset.sentiment_filter = request.POST.get('sentiment_filter', preset.sentiment_filter)
        preset.date_range_filter = request.POST.get('date_range_filter', preset.date_range_filter)
        preset.brand_filter = request.POST.get('brand_filter', preset.brand_filter)
        preset.authenticity_filter = request.POST.get('authenticity_filter', preset.authenticity_filter)
        preset.search_query = request.POST.get('search_query', preset.search_query)
        preset.filter_inappropriate_content = request.POST.get('filter_inappropriate') == 'on'
        preset.filter_low_quality_content = request.POST.get('filter_low_quality') == 'on'
        preset.filter_family_content = request.POST.get('filter_family') == 'on'
        preset.filter_sexual_content = request.POST.get('filter_sexual') == 'on'
        
        preset.save()
        
        messages.success(request, f'Filter preset "{preset.name}" updated successfully!')
        
        return JsonResponse({
            'status': 'success',
            'message': f'Preset "{preset.name}" updated'
        })
        
    except FilterPreset.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Preset not found'}, status=404)
    except Exception as e:
        logger.error(f"Error updating filter preset: {e}")
        return JsonResponse({'status': 'error', 'message': 'Failed to update preset'})

def delete_filter_preset(request, user):
    """
    Delete a filter preset
    """
    try:
        preset_id = request.POST.get('preset_id')
        if not preset_id:
            return JsonResponse({'status': 'error', 'message': 'Preset ID is required'})
        
        preset = get_object_or_404(FilterPreset, id=preset_id, user=user)
        preset_name = preset.name
        preset.delete()
        
        messages.success(request, f'Filter preset "{preset_name}" deleted successfully!')
        
        return JsonResponse({
            'status': 'success',
            'message': f'Preset "{preset_name}" deleted'
        })
        
    except FilterPreset.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Preset not found'}, status=404)
    except Exception as e:
        logger.error(f"Error deleting filter preset: {e}")
        return JsonResponse({'status': 'error', 'message': 'Failed to delete preset'})

@login_required
def export_data(request):
    """
    Export user data in various formats
    """
    if request.method == 'POST':
        export_format = request.POST.get('format', 'json')
        data_type = request.POST.get('data_type', 'posts')
        
        user = request.user
        
        try:
            if data_type == 'posts':
                return export_posts_data(user, export_format)
            elif data_type == 'behavior':
                return export_behavior_data(user, export_format)
            elif data_type == 'all':
                return export_all_data(user, export_format)
            else:
                return JsonResponse({'status': 'error', 'message': 'Invalid data type'})
                
        except Exception as e:
            logger.error(f"Error exporting data: {e}")
            return JsonResponse({'status': 'error', 'message': 'Export failed'})
    
    return render(request, 'brandsensor/export_data.html', {'user': request.user})

def export_posts_data(user, format_type):
    """
    Export user's posts data
    """
    from ..models import SocialPost
    import json
    import csv
    from django.http import HttpResponse
    
    posts = SocialPost.objects.filter(user=user).order_by('-created_at')
    
    if format_type == 'json':
        data = []
        for post in posts:
            data.append({
                'id': post.id,
                'content': post.content,
                'author': post.author,
                'platform': post.platform,
                'sentiment': post.sentiment,
                'authenticity_score': post.authenticity_score,
                'brand': post.brand.name if post.brand else None,
                'created_at': post.created_at.isoformat(),
                'post_url': post.post_url,
                'is_flagged': post.is_flagged,
                'is_hidden': post.is_hidden
            })
        
        response = HttpResponse(
            json.dumps(data, indent=2),
            content_type='application/json'
        )
        response['Content-Disposition'] = 'attachment; filename="posts_export.json"'
        return response
        
    elif format_type == 'csv':
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="posts_export.csv"'
        
        writer = csv.writer(response)
        writer.writerow([
            'ID', 'Content', 'Author', 'Platform', 'Sentiment', 
            'Authenticity Score', 'Brand', 'Created At', 'Post URL', 
            'Is Flagged', 'Is Hidden'
        ])
        
        for post in posts:
            writer.writerow([
                post.id,
                post.content,
                post.author,
                post.platform,
                post.sentiment,
                post.authenticity_score,
                post.brand.name if post.brand else '',
                post.created_at.isoformat(),
                post.post_url,
                post.is_flagged,
                post.is_hidden
            ])
        
        return response
    
    return JsonResponse({'status': 'error', 'message': 'Unsupported format'})

def export_behavior_data(user, format_type):
    """
    Export user's behavior data
    """
    # Implementation for behavior data export
    return JsonResponse({'status': 'error', 'message': 'Behavior export not implemented yet'})

def export_all_data(user, format_type):
    """
    Export all user data
    """
    # Implementation for complete data export
    return JsonResponse({'status': 'error', 'message': 'Full export not implemented yet'}) 