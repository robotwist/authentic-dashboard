"""
Dashboard Views Module

Contains all dashboard-related views for the BrandSensor application.
"""

import os
import json
import logging
import datetime
from datetime import timedelta
from collections import Counter, defaultdict
from django.shortcuts import render, redirect, get_object_or_404
from django.http import JsonResponse, HttpResponse
from django.contrib.auth.decorators import login_required
from django.utils import timezone
from django.db.models import Q, Count, Sum, Avg, F, Value, CharField
from django.db.models.functions import TruncDate
from django.core.cache import cache
from django.core.paginator import Paginator
from django.conf import settings

from ..models import (
    SocialPost, 
    Brand, 
    BehaviorLog, 
    UserPreferences,
    UserPreference,
    FilterPreset,
    MLPredictionLog,
    InterpretationLog,
    SocialConnection
)
from ..utils import get_user_data

logger = logging.getLogger(__name__)

def user_cache_key(user_id, prefix, **kwargs):
    """Generate a cache key for user-specific data."""
    suffix = '_'.join(f"{k}_{v}" for k, v in sorted(kwargs.items()))
    return f"{prefix}_{user_id}_{suffix}" if suffix else f"{prefix}_{user_id}"

@login_required
def dashboard(request):
    """
    Main dashboard view for authenticated users
    """
    user = request.user
    
    # Handle filter form submission
    filter_params = extract_filter_params(request)
    
    # Build cache key based on user and filters
    cache_key = user_cache_key(
        user.id, 
        'dashboard_data',
        **filter_params
    )
    
    # Try to get data from cache
    dashboard_data = cache.get(cache_key)
    
    if not dashboard_data:
        # Generate dashboard data
        dashboard_data = generate_dashboard_data(user, filter_params)
        # Cache for 5 minutes
        cache.set(cache_key, dashboard_data, 300)
    
    # Get user preferences and brands for UI
    try:
        preferences = UserPreference.objects.get(user=user)
    except UserPreference.DoesNotExist:
        preferences = UserPreference.objects.create(user=user)
    
    # Get all brands for filter dropdown
    brands = Brand.objects.all().order_by('name')
    
    # Get filter presets
    filter_presets = FilterPreset.objects.filter(user=user).order_by('name')
    
    context = {
        **dashboard_data,
        'user': user,
        'preferences': preferences,
        'brands': brands,
        'filter_presets': filter_presets,
        'active_filters': filter_params,
    }
    
    return render(request, 'brandsensor/dashboard.html', context)

def extract_filter_params(request):
    """Extract filter parameters from request"""
    filter_params = {}
    
    # Date range filters
    date_from = request.GET.get('date_from')
    date_to = request.GET.get('date_to')
    
    if date_from:
        filter_params['date_from'] = date_from
    if date_to:
        filter_params['date_to'] = date_to
    
    # Platform filter
    platform = request.GET.get('platform')
    if platform and platform != 'all':
        filter_params['platform'] = platform
    
    # Brand filter
    brand_id = request.GET.get('brand')
    if brand_id and brand_id != 'all':
        filter_params['brand_id'] = brand_id
    
    # Sentiment filter
    sentiment = request.GET.get('sentiment')
    if sentiment and sentiment != 'all':
        filter_params['sentiment'] = sentiment
    
    # Authenticity filter
    authenticity = request.GET.get('authenticity')
    if authenticity and authenticity != 'all':
        filter_params['authenticity'] = authenticity
    
    # Search query
    search = request.GET.get('search')
    if search:
        filter_params['search'] = search
    
    return filter_params

def generate_dashboard_data(user, filter_params):
    """Generate dashboard data based on user and filters"""
    
    # Base queryset for posts
    posts_qs = SocialPost.objects.filter(user=user)
    
    # Apply filters
    posts_qs = apply_dashboard_filters(posts_qs, filter_params)
    
    # Get total counts
    total_posts = posts_qs.count()
    
    # Recent posts for feed
    recent_posts = posts_qs.order_by('-created_at')[:20]
    
    # Platform breakdown
    platform_stats = posts_qs.values('platform').annotate(
        count=Count('id')
    ).order_by('-count')
    
    # Brand sentiment analysis
    brand_sentiment = posts_qs.filter(brand__isnull=False).values(
        'brand__name'
    ).annotate(
        positive=Count('id', filter=Q(sentiment='positive')),
        negative=Count('id', filter=Q(sentiment='negative')),
        neutral=Count('id', filter=Q(sentiment='neutral')),
        total=Count('id')
    ).order_by('-total')[:10]
    
    # Daily activity
    daily_activity = posts_qs.annotate(
        date=TruncDate('created_at')
    ).values('date').annotate(
        count=Count('id')
    ).order_by('date')
    
    # Top keywords/hashtags
    hashtags = extract_hashtags_from_posts(posts_qs)
    top_hashtags = hashtags.most_common(10)
    
    # Authenticity score distribution
    authenticity_stats = posts_qs.aggregate(
        avg_authenticity=Avg('authenticity_score'),
        high_authenticity=Count('id', filter=Q(authenticity_score__gte=0.8)),
        medium_authenticity=Count('id', filter=Q(authenticity_score__range=(0.5, 0.8))),
        low_authenticity=Count('id', filter=Q(authenticity_score__lt=0.5))
    )
    
    return {
        'total_posts': total_posts,
        'recent_posts': recent_posts,
        'platform_stats': platform_stats,
        'brand_sentiment': brand_sentiment,
        'daily_activity': daily_activity,
        'top_hashtags': top_hashtags,
        'authenticity_stats': authenticity_stats,
    }

def apply_dashboard_filters(queryset, filter_params):
    """Apply various filters to the posts queryset"""
    
    if 'date_from' in filter_params:
        try:
            date_from = datetime.datetime.strptime(filter_params['date_from'], '%Y-%m-%d')
            queryset = queryset.filter(created_at__gte=date_from)
        except ValueError:
            pass
    
    if 'date_to' in filter_params:
        try:
            date_to = datetime.datetime.strptime(filter_params['date_to'], '%Y-%m-%d')
            queryset = queryset.filter(created_at__lte=date_to)
        except ValueError:
            pass
    
    if 'platform' in filter_params:
        queryset = queryset.filter(platform=filter_params['platform'])
    
    if 'brand_id' in filter_params:
        try:
            brand_id = int(filter_params['brand_id'])
            queryset = queryset.filter(brand_id=brand_id)
        except (ValueError, TypeError):
            pass
    
    if 'sentiment' in filter_params:
        queryset = queryset.filter(sentiment=filter_params['sentiment'])
    
    if 'authenticity' in filter_params:
        if filter_params['authenticity'] == 'high':
            queryset = queryset.filter(authenticity_score__gte=0.8)
        elif filter_params['authenticity'] == 'medium':
            queryset = queryset.filter(authenticity_score__range=(0.5, 0.8))
        elif filter_params['authenticity'] == 'low':
            queryset = queryset.filter(authenticity_score__lt=0.5)
    
    if 'search' in filter_params:
        search_query = filter_params['search']
        queryset = queryset.filter(
            Q(content__icontains=search_query) |
            Q(author__icontains=search_query) |
            Q(brand__name__icontains=search_query)
        )
    
    return queryset

def extract_hashtags_from_posts(posts_qs):
    """Extract hashtags from posts content"""
    hashtags = Counter()
    
    for post in posts_qs.only('content'):
        if post.content:
            # Simple hashtag extraction
            import re
            found_hashtags = re.findall(r'#\w+', post.content.lower())
            hashtags.update(found_hashtags)
    
    return hashtags

@login_required
def toggle_mode(request):
    """
    Toggle between different viewing modes (light/dark, compact/expanded, etc.)
    """
    if request.method == 'POST':
        mode_type = request.POST.get('mode_type')
        mode_value = request.POST.get('mode_value')
        
        if mode_type and mode_value:
            # Update user preferences
            try:
                preferences = UserPreference.objects.get(user=request.user)
            except UserPreference.DoesNotExist:
                preferences = UserPreference.objects.create(user=request.user)
            
            # Handle different mode types
            if mode_type == 'theme':
                # Assuming we add a theme field to UserPreference model
                preferences.theme = mode_value
                preferences.save()
            elif mode_type == 'view_mode':
                # Assuming we add a view_mode field to UserPreference model  
                preferences.view_mode = mode_value
                preferences.save()
            
            return JsonResponse({'status': 'success'})
    
    return JsonResponse({'status': 'error', 'message': 'Invalid request'})

@login_required
def onboarding(request):
    """
    User onboarding flow for new users
    """
    user = request.user
    
    # Check if user has completed onboarding
    try:
        preferences = UserPreference.objects.get(user=user)
        if preferences.onboarding_completed:
            return redirect('dashboard')
    except UserPreference.DoesNotExist:
        preferences = UserPreference.objects.create(user=user)
    
    if request.method == 'POST':
        # Handle onboarding form submission
        step = request.POST.get('step')
        
        if step == 'preferences':
            # Update user preferences from onboarding
            handle_onboarding_preferences(request, preferences)
        elif step == 'brands':
            # Handle brand selection
            handle_onboarding_brands(request, user)
        elif step == 'complete':
            # Mark onboarding as completed
            preferences.onboarding_completed = True
            preferences.save()
            return redirect('dashboard')
    
    # Get context for onboarding
    context = {
        'user': user,
        'preferences': preferences,
        'brands': Brand.objects.all().order_by('name'),
        'platforms': ['facebook', 'instagram', 'twitter', 'linkedin', 'tiktok'],
    }
    
    return render(request, 'brandsensor/onboarding.html', context)

def handle_onboarding_preferences(request, preferences):
    """Handle preference updates during onboarding"""
    
    # Update notification preferences
    preferences.email_notifications = 'email_notifications' in request.POST
    preferences.browser_notifications = 'browser_notifications' in request.POST
    
    # Update content filtering preferences
    if 'filter_inappropriate' in request.POST:
        preferences.filter_inappropriate_content = True
    
    if 'filter_low_quality' in request.POST:
        preferences.filter_low_quality_content = True
    
    preferences.save()

def handle_onboarding_brands(request, user):
    """Handle brand selection during onboarding"""
    
    selected_brands = request.POST.getlist('brands')
    
    if selected_brands:
        try:
            preferences = UserPreference.objects.get(user=user)
        except UserPreference.DoesNotExist:
            preferences = UserPreference.objects.create(user=user)
        
        # Set approved brands (assuming this field exists)
        brands = Brand.objects.filter(id__in=selected_brands)
        preferences.approved_brands.set(brands)
        preferences.save() 