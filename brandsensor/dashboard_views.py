from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from django.db.models import Q, Count, Avg, F
from django.utils import timezone
from django.conf import settings
from django.core.cache import cache
from django.db.utils import IntegrityError
import hashlib
import datetime
import json
import logging

from .models import SocialPost, UserPreference, FilterPreset
from .ml_processor import process_user_posts
from .utils import get_user_data

logger = logging.getLogger(__name__)

# Helper function to create a user-specific cache key
def user_cache_key(user_id, prefix, **kwargs):
    """
    Create a user-specific cache key with additional parameters.
    This ensures each user gets their own cached data.
    """
    key = f"{prefix}_{user_id}"
    
    # Add additional kwargs to the key if provided
    if kwargs:
        # Sort items to ensure consistent keys
        sorted_items = sorted(kwargs.items())
        param_str = "_".join(f"{k}_{v}" for k, v in sorted_items)
        key = f"{key}_{param_str}"
    
    # Use MD5 to ensure the key length is not too long
    return f"cached_{hashlib.md5(key.encode()).hexdigest()}"

@login_required
def dashboard(request):
    """
    Renders the dashboard with curated social posts.
    Applies filtering based on the user's preferences.
    """
    try:
        preferences = request.user.userpreference
    except UserPreference.DoesNotExist:
        # Create default preferences if none exist
        preferences = UserPreference.objects.create(user=request.user)
    
    # Check for preset application
    preset_id = request.GET.get('preset')
    if preset_id:
        try:
            preset = FilterPreset.objects.get(id=preset_id, user=request.user)
            # Apply the preset settings to the current preferences
            preferences = preset.apply_to_preferences(preferences)
            preferences.save()
            return redirect('dashboard')
        except FilterPreset.DoesNotExist:
            pass  # Ignore invalid presets
    
    # Process unprocessed posts for this user - wrap in try/except to catch IntegrityError
    try:
        process_user_posts(request.user.id, limit=50)
    except IntegrityError as e:
        # Log the error but continue - the duplicate has been handled
        print(f"IntegrityError in dashboard: {str(e)}")
    
    # Set default time filter (last 30 days if not specified)
    days_filter = request.GET.get('days', '30')
    try:
        days_ago = int(days_filter)
    except ValueError:
        days_ago = 30
    
    # Generate a cache key for this specific view and parameters
    cache_key = user_cache_key(
        request.user.id, 
        'dashboard', 
        days=days_ago,
        platform=request.GET.get('platform', ''),
        sort=request.GET.get('sort', ''),
        # Include user preferences state in the cache key to invalidate when they change
        preferences_updated=preferences.updated_at.isoformat() if hasattr(preferences, 'updated_at') else ''
    )
    
    # Try to get cached data
    cached_context = cache.get(cache_key)
    if cached_context:
        return render(request, "brandsensor/dashboard.html", cached_context)
    
    # No cached data, continue with normal data fetching
    since_date = timezone.now() - datetime.timedelta(days=days_ago)
    
    # Build the base query
    posts = SocialPost.objects.filter(
        user=request.user,
        created_at__gte=since_date,
        hidden=False  # Don't show posts the user has hidden
    )
    
    # Apply platform filter if specified
    platform_filter = request.GET.get('platform', '')
    if platform_filter:
        posts = posts.filter(platform=platform_filter)
    
    # Apply user preferences filters
    if preferences.friends_only:
        posts = posts.filter(is_friend=True)
    
    if preferences.family_only:
        posts = posts.filter(is_family=True)
    
    if preferences.hide_sponsored:
        posts = posts.filter(is_sponsored=False)
    
    if preferences.show_verified_only:
        posts = posts.filter(verified=True)
    
    # Filter by sentiment if requested
    if preferences.high_sentiment_only and preferences.sentiment_threshold:
        posts = posts.filter(sentiment_score__gte=preferences.sentiment_threshold)
    
    # Filter out "bizfluencer" content if requested
    if preferences.bizfluencer_filter and preferences.bizfluencer_threshold:
        posts = posts.filter(
            Q(bizfluencer_score__lte=preferences.bizfluencer_threshold) | 
            Q(bizfluencer_score__isnull=True)
        )
    
    # Filter out job posts if requested
    if preferences.hide_job_posts:
        posts = posts.filter(is_job_post=False)
    
    # Filter by content length if specified
    if preferences.max_content_length:
        posts = posts.filter(
            Q(content_length__lte=preferences.max_content_length) | 
            Q(content_length__isnull=True)
        )
    
    # Apply interest filter if set
    if preferences.interest_filter:
        # Split by commas and create OR condition for each interest
        interests = [interest.strip() for interest in preferences.interest_filter.split(',')]
        interest_query = Q()
        for interest in interests:
            if interest:
                interest_query |= (
                    Q(content__icontains=interest) | 
                    Q(category__icontains=interest) | 
                    Q(hashtags__icontains=interest) |
                    Q(automated_category__iexact=interest)
                )
        
        if interest_query:
            posts = posts.filter(interest_query)
    
    # Apply approved brands filter if set
    if preferences.approved_brands:
        approved = [b.strip().lower() for b in preferences.approved_brands.split(',')]
        brand_query = Q()
        for brand in approved:
            if brand:
                brand_query |= Q(original_user__icontains=brand)
        
        if brand_query:
            posts = posts.filter(brand_query)
    
    # Apply excluded keywords filter
    if preferences.excluded_keywords:
        excluded = [k.strip() for k in preferences.excluded_keywords.split(',')]
        for keyword in excluded:
            if keyword:
                posts = posts.exclude(content__icontains=keyword)
    
    # Apply favorite hashtags boost if specified
    if preferences.favorite_hashtags:
        hashtags = [h.strip() for h in preferences.favorite_hashtags.split(',')]
        favorite_posts = posts.none()  # Empty queryset
        
        for hashtag in hashtags:
            if hashtag:
                favorite_posts |= posts.filter(
                    Q(content__icontains=f"#{hashtag}") | 
                    Q(category__icontains=hashtag) |
                    Q(hashtags__icontains=hashtag)
                )
        
        # Combine favorite posts with regular posts, putting favorites first
        # We use distinct() to remove duplicates
        posts = (favorite_posts | posts).distinct()
    
    # Sort by relevance if requested
    sort_by = request.GET.get('sort', '')
    if sort_by == 'relevance':
        posts = posts.order_by('-relevance_score', '-collected_at')
    elif sort_by == 'engagement':
        posts = posts.order_by('-engagement_prediction', '-collected_at')
    elif sort_by == 'sentiment':
        posts = posts.order_by('-sentiment_score', '-collected_at')
    
    # Filter posts to include only curated social media posts
    curated_posts = posts[:50]  # Limit to 50 posts for performance

    # Get ML stats for dashboard
    ml_processed_count = SocialPost.objects.filter(
        user=request.user,
        sentiment_score__isnull=False,
        automated_category__isnull=False
    ).count()
    
    # Get count of posts with images
    image_posts_count = SocialPost.objects.filter(
        user=request.user
    ).exclude(image_urls='').count()
    
    # Get platform stats
    platform_stats = []
    for platform_code, platform_name in SocialPost.PLATFORM_CHOICES:
        platform_posts = SocialPost.objects.filter(
            user=request.user,
            platform=platform_code
        )
        platform_stats.append({
            'platform': platform_name,
            'count': platform_posts.count()
        })
    
    # Get top categories
    category_stats = SocialPost.objects.filter(
        user=request.user,
        category__isnull=False
    ).exclude(category='').values('category').annotate(
        count=Count('id'),
        name=F('category')
    ).order_by('-count')[:5]
    
    # Get top ML-detected topics
    topic_stats = SocialPost.objects.filter(
        user=request.user,
        automated_category__isnull=False
    ).exclude(automated_category='').values('automated_category').annotate(
        count=Count('id')
    ).order_by('-count')[:5]

    context = {
        "posts": curated_posts,  # Only curated posts
        "preferences": preferences,
        "days_filter": days_filter,
        "platforms": SocialPost.PLATFORM_CHOICES,
        "current_platform": platform_filter,
        "current_sort": sort_by,
        "ml_processed_count": ml_processed_count,
        "image_posts_count": image_posts_count,
        "platform_stats": platform_stats,
        "category_stats": category_stats,
        "topic_stats": topic_stats,
    }

    return render(request, "brandsensor/dashboard.html", context)


@login_required
def toggle_mode(request):
    """
    Updates user preferences based on the form submission from the dashboard.
    """
    if request.method == "POST":
        preferences, _ = UserPreference.objects.get_or_create(user=request.user)
        preferences.friends_only = 'friends_only' in request.POST
        preferences.family_only = 'family_only' in request.POST
        preferences.hide_sponsored = 'hide_sponsored' in request.POST
        preferences.show_verified_only = 'show_verified_only' in request.POST
        preferences.bizfluencer_filter = 'bizfluencer_filter' in request.POST
        preferences.high_sentiment_only = 'high_sentiment_only' in request.POST
        preferences.hide_job_posts = 'hide_job_posts' in request.POST
        preferences.filter_sexual_content = 'filter_sexual_content' in request.POST
        
        # Get numeric values
        try:
            if 'bizfluencer_threshold' in request.POST:
                preferences.bizfluencer_threshold = int(request.POST.get('bizfluencer_threshold', 3))
            
            if 'sentiment_threshold' in request.POST:
                preferences.sentiment_threshold = float(request.POST.get('sentiment_threshold', 0.2))
                
            if 'max_content_length' in request.POST and request.POST.get('max_content_length'):
                preferences.max_content_length = int(request.POST.get('max_content_length', 2000))
            else:
                preferences.max_content_length = None
                
        except (ValueError, TypeError):
            pass  # Ignore conversion errors and keep defaults
        
        # Get text fields
        preferences.interest_filter = request.POST.get('interest_filter', '').strip()
        preferences.approved_brands = request.POST.get('approved_brands', '').strip()
        preferences.excluded_keywords = request.POST.get('excluded_keywords', '').strip()
        preferences.favorite_hashtags = request.POST.get('favorite_hashtags', '').strip()
        
        preferences.save()
        
        # Invalidate the user's dashboard cache when preferences change
        cache_pattern = f"cached_{hashlib.md5(f'dashboard_{request.user.id}'.encode()).hexdigest()}"
        keys_to_delete = []
        for key in cache.keys(f"{cache_pattern}*"):
            keys_to_delete.append(key)
        
        if keys_to_delete:
            cache.delete_many(keys_to_delete)
        
        # Check if we need to save these settings as a preset
        save_as_preset = request.POST.get('save_as_preset')
        if save_as_preset:
            preset_name = request.POST.get('preset_name', '').strip()
            if preset_name:
                # Create a new preset from current preferences
                preset = FilterPreset(
                    user=request.user,
                    name=preset_name,
                    description=request.POST.get('preset_description', '').strip(),
                    
                    # Copy all preference settings
                    friends_only=preferences.friends_only,
                    family_only=preferences.family_only,
                    interest_filter=preferences.interest_filter,
                    approved_brands=preferences.approved_brands,
                    hide_sponsored=preferences.hide_sponsored,
                    show_verified_only=preferences.show_verified_only,
                    excluded_keywords=preferences.excluded_keywords,
                    favorite_hashtags=preferences.favorite_hashtags,
                    
                    bizfluencer_filter=preferences.bizfluencer_filter,
                    bizfluencer_threshold=preferences.bizfluencer_threshold,
                    high_sentiment_only=preferences.high_sentiment_only,
                    sentiment_threshold=preferences.sentiment_threshold,
                    hide_job_posts=preferences.hide_job_posts,
                    max_content_length=preferences.max_content_length,
                    
                    # Optional settings
                    icon=request.POST.get('preset_icon', 'filter'),
                    color=request.POST.get('preset_color', 'primary'),
                    is_default='preset_default' in request.POST
                )
                
                # Check for existing preset with same name
                try:
                    existing = FilterPreset.objects.get(user=request.user, name=preset_name)
                    # Update existing preset instead of creating new one
                    preset.id = existing.id
                except FilterPreset.DoesNotExist:
                    pass
                    
                preset.save()
        
        # Log the preference change
        from .models import BehaviorLog
        BehaviorLog.objects.create(
            user=request.user,
            action='update_preferences',
            details="Updated dashboard filter preferences"
        )
    
    # Return to dashboard with any existing query parameters
    platform = request.GET.get('platform', '')
    days = request.GET.get('days', '30')
    sort = request.GET.get('sort', '')
    
    redirect_url = f'/dashboard/?days={days}'
    if platform:
        redirect_url += f'&platform={platform}'
    if sort:
        redirect_url += f'&sort={sort}'
    
    return redirect(redirect_url)


@login_required
def filter_presets(request):
    """View to manage filter presets"""
    presets = FilterPreset.objects.filter(user=request.user)
    
    if request.method == "POST":
        action = request.POST.get('action')
        
        if action == 'delete':
            preset_id = request.POST.get('preset_id')
            if preset_id:
                FilterPreset.objects.filter(id=preset_id, user=request.user).delete()
        
        elif action == 'set_default':
            preset_id = request.POST.get('preset_id')
            if preset_id:
                preset = get_object_or_404(FilterPreset, id=preset_id, user=request.user)
                preset.is_default = True
                preset.save()
    
    return render(request, "brandsensor/filter_presets.html", {
        "presets": presets
    })

@login_required
def apply_preset(request, preset_id):
    """Apply a filter preset and redirect to dashboard"""
    from django.shortcuts import get_object_or_404
    
    preset = get_object_or_404(FilterPreset, id=preset_id, user=request.user)
    
    try:
        preferences = request.user.userpreference
    except UserPreference.DoesNotExist:
        preferences = UserPreference.objects.create(user=request.user)
    
    # Apply preset to current preferences
    preferences = preset.apply_to_preferences(preferences)
    preferences.save()
    
    # Get current filter parameters
    platform = request.GET.get('platform', '')
    days = request.GET.get('days', '30')
    sort = request.GET.get('sort', '')
    
    # Redirect to dashboard with filters
    redirect_url = f'/dashboard/?days={days}'
    if platform:
        redirect_url += f'&platform={platform}'
    if sort:
        redirect_url += f'&sort={sort}'
    
    return redirect(redirect_url)
