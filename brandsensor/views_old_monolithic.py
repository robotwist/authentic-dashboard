# Main views.py - Import from modular view modules
# This file now serves as the main entry point for all views

# Import from modular view files
from .views.auth_views import landing, user_login, user_logout, user_register
from .views.dashboard_views import dashboard, toggle_mode, onboarding, pure_feed
from .views.post_views import post_detail, post_action, mark_family
from .views.ml_views import process_ml, ml_dashboard, ml_insights
from .views.management_views import user_settings, api_keys, generate_api_key, delete_api_key, filter_presets
from .views.api_views import *  # Import all API views

# Legacy imports for remaining utility functions
import os
import json
import logging
from django.shortcuts import render, redirect, get_object_or_404
from django.http import JsonResponse, HttpResponse, HttpResponseBadRequest
from django.contrib.auth.decorators import login_required
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from django.db.models import Q, Count, Sum, Avg, F
from django.contrib.auth.models import User
from django.conf import settings

from .models import SocialPost, UserPreference, Brand, BehaviorLog, APIKey
from .decorators import api_key_required
from .utils import get_user_data

logger = logging.getLogger(__name__)

# Helper function to authenticate API requests
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

# Legacy API endpoints that haven't been moved to api_views.py yet
@csrf_exempt
def collect_posts(request):
    """
    Legacy API endpoint for collecting posts
    This should be moved to api_views.py in future refactoring
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'Only POST allowed'}, status=405)
    
    user = get_user_from_api_key(request)
    if not user:
        return JsonResponse({'error': 'Invalid API key'}, status=401)
    
    try:
        data = json.loads(request.body)
        posts = data.get('posts', [])
        
        created_count = 0
        for post_data in posts:
            # Create or update post
            post, created = SocialPost.objects.get_or_create(
                user=user,
                platform=post_data.get('platform'),
                original_id=post_data.get('id'),
                defaults={
                    'content': post_data.get('content', ''),
                    'original_user': post_data.get('user', ''),
                    'collected_at': timezone.now(),
                }
            )
            if created:
                created_count += 1
        
        return JsonResponse({
            'status': 'success',
            'created': created_count,
            'total': len(posts)
        })
        
    except Exception as e:
        logger.error(f"Error in collect_posts: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
def api_health_check(request):
    """
    API health check endpoint
    """
    return JsonResponse({
        'status': 'ok',
        'timestamp': timezone.now().isoformat(),
        'version': '1.0'
    })

@csrf_exempt
def verify_api_key(request):
    """
    Verify API key endpoint
    """
    user = get_user_from_api_key(request)
    if user:
        return JsonResponse({
            'valid': True,
            'user': user.username,
            'user_id': user.id
        })
    else:
        return JsonResponse({'valid': False}, status=401)
