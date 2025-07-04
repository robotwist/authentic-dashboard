import os
import json
import logging
import datetime
import re
import hashlib
import secrets
import string
from datetime import timedelta
from collections import Counter, defaultdict
from django.shortcuts import render, redirect, get_object_or_404
from django.http import JsonResponse, HttpResponse, HttpResponseBadRequest
from django.contrib.auth.decorators import login_required
from django.contrib.auth import login, authenticate, logout
from django.contrib.auth.forms import UserCreationForm, AuthenticationForm
from django.contrib import messages
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from django.db.models import Q, Count, Sum, Avg, F, Value, CharField
from django.db.models.functions import TruncDate
from django.core.cache import cache
from django.core.paginator import Paginator
from django.conf import settings
from .models import (
    SocialPost, 
    Brand, 
    BehaviorLog, 
    UserPreferences, 
    APIKey, 
    SocialConnection,
    FilterPreset,
    MLPredictionLog,
    InterpretationLog
)
from .decorators import api_key_required

logger = logging.getLogger(__name__)

from .models import SocialPost, UserPreference, Brand, BehaviorLog, SocialConnection, MLModel, MLPredictionLog, APIKey, FilterPreset
from .ml_processor import process_post, process_user_posts
from django.contrib.auth.models import User
from django.contrib.auth import authenticate, login, logout
from .utils import get_user_data
from .decorators import api_key_required

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

# ------------------------------
# Dashboard and User Preference Views
# ------------------------------

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
def onboarding(request):
    """
    View for the onboarding process after extension installation.
    Guides users through setting up their API key and preferences.
    """
    # Get the current user if authenticated
    user = request.user if request.user.is_authenticated else None
    
    # If POST request, process the form data
    if request.method == 'POST':
        # Extract form data
        friends_only = request.POST.get('friends_only') == 'on'
        family_only = request.POST.get('family_only') == 'on'
        hide_sponsored = request.POST.get('hide_sponsored') == 'on'
        show_verified_only = request.POST.get('show_verified_only') == 'on'
        interest_filter = request.POST.get('interest_filter', '')
        excluded_keywords = request.POST.get('excluded_keywords', '')
        approved_brands = request.POST.get('approved_brands', '')
        favorite_hashtags = request.POST.get('favorite_hashtags', '')
        
        # Get or create user preferences
        preferences, created = UserPreferences.objects.get_or_create(user=user)
        
        # Update preferences
        preferences.friends_only = friends_only
        preferences.family_only = family_only
        preferences.hide_sponsored = hide_sponsored
        preferences.show_verified_only = show_verified_only
        preferences.interest_filter = interest_filter
        preferences.excluded_keywords = excluded_keywords
        preferences.approved_brands = approved_brands
        preferences.favorite_hashtags = favorite_hashtags
        preferences.save()
        
        # Log the action
        BehaviorLog.objects.create(
            user=user,
            action='complete_onboarding',
            details=f'User completed onboarding and set preferences'
        )
        
        # Generate API key if user doesn't have one
        api_key = APIKey.objects.filter(user=user).first()
        if not api_key:
            # Generate a random API key
            key_length = 32
            alphabet = string.ascii_letters + string.digits
            key_value = ''.join(secrets.choice(alphabet) for _ in range(key_length))
            
            # Create the API key
            api_key = APIKey.objects.create(
                user=user,
                key=key_value,
                name=f"API Key {timezone.now().strftime('%Y-%m-%d %H:%M')}"
            )
        
        # Redirect to dashboard
        messages.success(request, 'Your preferences have been saved! You\'re all set to use Authentic Dashboard.')
        return redirect('dashboard')
    
    # If user is authenticated, try to get their API key
    api_key = None
    if user:
        api_key = APIKey.objects.filter(user=user).first()
    
    # Get user preferences if they exist
    preferences = None
    if user:
        preferences, created = UserPreferences.objects.get_or_create(user=user)
    
    context = {
        'user': user,
        'api_key': api_key,
        'has_api_key': api_key is not None,
        'preferences': preferences,
    }
    
    return render(request, 'brandsensor/onboarding.html', context)


@login_required
def post_detail(request, post_id):
    """
    Display detailed view of a single post with actions and metadata
    """
    post = get_object_or_404(SocialPost, id=post_id, user=request.user)
    
    # Ensure this post has been processed with ML
    post = process_post(post)
    
    # Get suggested posts with similar content or from same user or same topic
    similar_posts = SocialPost.objects.filter(
        user=request.user
    ).filter(
        Q(original_user=post.original_user) | 
        Q(category__icontains=post.category.split(',')[0] if post.category else '') |
        Q(automated_category=post.automated_category) if post.automated_category else Q()
    ).exclude(id=post.id)[:5]
    
    # Get ML prediction logs for this post
    prediction_logs = MLPredictionLog.objects.filter(post=post).order_by('-created_at')
    
    context = {
        "post": post,
        "similar_posts": similar_posts,
        "prediction_logs": prediction_logs,
    }
    return render(request, "brandsensor/post_detail.html", context)


@login_required
def mark_family(request, username, platform):
    """
    Mark a user as family
    """
    if request.method == "POST":
        # Add or update a social connection
        connection, created = SocialConnection.objects.get_or_create(
            user=request.user,
            platform=platform,
            platform_username=username,
            defaults={'connection_type': 'family', 'trust_level': 10}
        )
        
        if not created:
            connection.connection_type = 'family'
            connection.trust_level = 10
            connection.save()
        
        # Update existing posts from this user
        updated_count = SocialPost.objects.filter(
            user=request.user,
            original_user=username,
            platform=platform
        ).update(is_family=True)
        
        # Check if it's an AJAX request
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return JsonResponse({
                'success': True,
                'username': username,
                'updated_posts': updated_count
            })
    
    # Redirect back to referring page or dashboard
    next_url = request.POST.get('next', 'dashboard')
    return redirect(next_url)


# ------------------------------
# API Endpoints for Chrome Extension
# ------------------------------

@csrf_exempt
@api_key_required
def api_log_behavior(request):
    """
    Accepts POST requests with behavior log data from the Chrome extension.
    """
    if request.method != "POST":
        return JsonResponse({"error": "Only POST allowed"}, status=405)

    try:
        data = json.loads(request.body)
        user = request.user  # User is now attached by the decorator
        brand_name = data.get("brand", "")
        brand_domain = data.get("domain", "")
        behavior_type = data.get("behavior_type")
        count = data.get("count", 1)

        if not brand_domain or not behavior_type:
            return JsonResponse({"error": "Missing required fields"}, status=400)

        brand, _ = Brand.objects.get_or_create(
            name=brand_name or brand_domain,
            domain=brand_domain
        )

        BehaviorLog.objects.create(
            user=user,
            brand=brand,
            behavior_type=behavior_type,
            count=count
        )

        return JsonResponse({"status": "logged"})
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)

@csrf_exempt
def api_log_post(request):
    """
    Accepts POST requests with social post data scraped by the Chrome extension.
    Uses API key authentication.
    """
    logger.info("Received request at /api/post/")
    if request.method != "POST":
        logger.warning("Invalid request method: %s", request.method)
        response = JsonResponse({"error": "Only POST allowed"}, status=405)
        response["Access-Control-Allow-Origin"] = "*"
        return response

    try:
        user = get_user_from_api_key(request)
        if not user:
            logger.warning("Invalid or missing API key")
            response = JsonResponse({"error": "Invalid or missing API key"}, status=401)
            response["Access-Control-Allow-Origin"] = "*"
            return response

        data = json.loads(request.body)
        logger.info("Request data: %s", data)

        # Check if post from this user/content already exists to avoid duplicates
        content = data.get("content", "")
        platform = data.get("platform", "")
        original_user = data.get("user", "unknown")
        
        # Simple de-duplication - check if we already have a very similar post
        existing = SocialPost.objects.filter(
            user=user,
            platform=platform, 
            original_user=original_user,
            content=content[:100]  # Compare first 100 chars to avoid minor changes
        ).exists()
        
        if existing:
            logger.info("Duplicate post detected, skipping")
            response = JsonResponse({"status": "duplicate post, skipped"})
            response["Access-Control-Allow-Origin"] = "*"
            return response
        
        # Check if this user is marked as family
        is_family = data.get("is_family", False)
        if not is_family and original_user != "unknown":
            # Check if we have a family connection for this user
            family_connection = SocialConnection.objects.filter(
                user=user,
                platform=platform,
                platform_username=original_user,
                connection_type='family'
            ).exists()
            
            if family_connection:
                is_family = True
        
        # Create the post with all available data
        post = SocialPost(
            user=user,
            content=content,
            platform=platform,
            original_user=original_user,
            is_friend=data.get("is_friend", False),
            is_family=is_family,
            category=data.get("category", ""),
            verified=data.get("verified", False),
            image_urls=data.get("image_urls", ""),
            collected_at=timezone.now(),
            likes=data.get("likes", 0),
            comments=data.get("comments", 0),
            shares=data.get("shares", 0),
            timestamp=data.get("timestamp", ""),
            hashtags=data.get("hashtags", ""),
            mentions=data.get("mentions", ""),
            external_links=data.get("external_links", ""),
            is_sponsored=data.get("is_sponsored", False),
            is_job_post=data.get("is_job_post", False),
            content_length=data.get("content_length", 0),
            connection_degree=data.get("connection_degree"),
            bizfluencer_score=data.get("bizfluencer_score", 0),
            sentiment_score=data.get("sentiment_score")
        )
        
        # Handle sentiment indicators if present
        if "sentiment_indicators" in data:
            post.sentiment_indicators = data["sentiment_indicators"]
        
        # Save the post first
        post.save()
        
        # Run ML processing on the post
        process_post(post)

        logger.info("Post saved and processed successfully")
        response = JsonResponse({"status": "post saved and processed"})
        response["Access-Control-Allow-Origin"] = "*"
        return response
    except json.JSONDecodeError:
        logger.error("Invalid JSON data")
        response = JsonResponse({"error": "Invalid JSON data"}, status=400)
        response["Access-Control-Allow-Origin"] = "*"
        return response
    except Exception as e:
        logger.error("Error in api_log_post: %s", str(e))
        response = JsonResponse({"error": str(e)}, status=500)
        response["Access-Control-Allow-Origin"] = "*"
        return response


@login_required
def post_action(request, post_id):
    """
    Handle various post actions: star, hide, hide_similar, rate, categorize
    """
    if request.method == "POST":
        action = request.POST.get('action')
        try:
            post = SocialPost.objects.get(id=post_id, user=request.user)
            
            if action == "star":
                post.starred = not post.starred
            elif action == "hide":
                post.hidden = True
                # Log the hiding action for feedback
                BehaviorLog.objects.create(
                    user=request.user,
                    behavior_type='feedback_hide',
                    platform=post.platform,
                    details=f"Hidden {post.platform} post from {post.original_user}"
                )
            elif action == "hide_similar":
                post.hidden = True
                
                # Process keywords from post content for similarity detection
                from django.db.models import Q
                import re
                
                # Extract key terms from content (simple implementation)
                def extract_key_terms(text, max_terms=5):
                    if not text:
                        return []
                    # Remove URLs, special characters and convert to lowercase
                    text = re.sub(r'https?://\S+|www\.\S+', '', text.lower())
                    text = re.sub(r'[^\w\s]', '', text)
                    # Split into words and filter out short words
                    words = [w for w in text.split() if len(w) > 3]
                    # Return most frequent words
                    word_counts = {}
                    for word in words:
                        if word not in word_counts:
                            word_counts[word] = 0
                        word_counts[word] += 1
                    # Sort by frequency
                    sorted_words = sorted(word_counts.items(), key=lambda x: x[1], reverse=True)
                    return [word for word, count in sorted_words[:max_terms]]
                
                key_terms = extract_key_terms(post.content)
                content_filter = None
                
                # Build content similarity query
                for term in key_terms:
                    if content_filter is None:
                        content_filter = Q(content__icontains=term)
                    else:
                        content_filter |= Q(content__icontains=term)
                
                # Create a query for similar posts
                similar_filter = Q()
                
                # Similar by content keywords
                if content_filter and len(key_terms) > 0:
                    similar_filter |= content_filter
                
                # Similar by same user
                if post.original_user and post.original_user != "unknown":
                    similar_filter |= Q(original_user=post.original_user)
                
                # Similar by category
                if post.automated_category:
                    similar_filter |= Q(automated_category=post.automated_category)
                elif post.category:
                    main_category = post.category.split(',')[0]
                    similar_filter |= Q(category__icontains=main_category)
                
                # Find and hide similar posts
                similar_posts = SocialPost.objects.filter(
                    user=request.user,
                    hidden=False  # Only select posts that aren't already hidden
                ).filter(similar_filter).exclude(id=post.id)
                
                # Limit the number of similar posts to hide (prevent over-hiding)
                similar_count = similar_posts.count()
                max_to_hide = 10  # Limit to prevent accidental mass-hiding
                
                if similar_count > 0:
                    # Hide only a limited number of most similar posts
                    hidden_count = similar_posts[:max_to_hide].update(hidden=True)
                    
                    # Log the bulk hiding action
                    BehaviorLog.objects.create(
                        user=request.user,
                        behavior_type='feedback_hide_similar',
                        platform=post.platform,
                        count=hidden_count,
                        details=f"Hidden {hidden_count} similar posts to {post_id}"
                    )
                    
                    # Add a message for non-AJAX requests
                    if request.headers.get('X-Requested-With') != 'XMLHttpRequest':
                        from django.contrib import messages
                        messages.success(request, f"Hidden this post and {hidden_count} similar posts.")
                
                # Log the original hide action
                BehaviorLog.objects.create(
                    user=request.user,
                    behavior_type='feedback_hide',
                    platform=post.platform,
                    details=f"Hidden {post.platform} post from {post.original_user}"
                )
            elif action == "rate":
                rating = request.POST.get('rating')
                if rating and rating.isdigit():
                    post.rating = int(rating)
            elif action == "categorize":
                category = request.POST.get('category', '').strip()
                if category:
                    # Don't overwrite existing categories, add to them
                    if post.category:
                        if category not in post.category:
                            post.category = f"{post.category},{category}"
                    else:
                        post.category = category
                        
            post.save()
            
            # If this is an AJAX request, return success
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return JsonResponse({"status": "success"})
                
        except SocialPost.DoesNotExist:
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return JsonResponse({"error": "Post not found"}, status=404)
    
    # For non-AJAX requests, redirect back to the dashboard
    return redirect('dashboard')


@login_required
@csrf_exempt
def process_ml(request):
    """
    Process posts with ML models
    """
    if request.method == "POST":
        count = process_user_posts(request.user.id, limit=int(request.POST.get('limit', 100)))
        return JsonResponse({
            "status": "success", 
            "processed": count,
            "message": f"Successfully processed {count} posts with machine learning."
        })
    
    return JsonResponse({"error": "Only POST allowed"}, status=405)


@login_required
def ml_dashboard(request):
    """
    Advanced Machine Learning Dashboard
    Provides detailed analysis and visualizations of ML-processed content
    """
    user_data = get_user_data(request.user)

    # Get days filter (default to 30 days)
    days_filter = request.GET.get('days', '30')
    try:
        days_ago = int(days_filter)
    except ValueError:
        days_ago = 30

    since_date = timezone.now() - datetime.timedelta(days=days_ago)

    # Process any unprocessed posts - wrap in try/except to catch IntegrityError
    try:
        process_user_posts(request.user.id, limit=100)
    except IntegrityError as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"IntegrityError in ml_dashboard: {str(e)}")
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error processing posts in ml_dashboard: {str(e)}")

    # Get ML-processed posts
    ml_posts = SocialPost.objects.filter(
        user=request.user,
        created_at__gte=since_date,
        sentiment_score__isnull=False,
        automated_category__isnull=False
    ).order_by('-created_at')

    context = {
        'ml_posts': ml_posts[:20],  # Limit to 20 for performance
        'ml_posts_count': ml_posts.count(),
        'total_posts_count': SocialPost.objects.filter(user=request.user).count(),
        'today_posts': user_data['today_posts'],
        'this_week_posts': user_data['this_week_posts'],
        'days_filter': days_filter,
    }

    return render(request, "brandsensor/ml_dashboard.html", context)

@login_required
def ml_insights(request):
    """
    Enhanced ML Insights page
    Provides advanced image and content analysis with state-of-the-art ML models
    """
    user_data = get_user_data(request.user)

    # Get days filter (default to 30 days)
    days_filter = request.GET.get('days', '30')
    try:
        days_ago = int(days_filter)
    except ValueError:
        days_ago = 30

    since_date = timezone.now() - datetime.timedelta(days=days_ago)
    
    # Get platform filter
    platform_filter = request.GET.get('platform', '')
    platforms = request.GET.getlist('platform') or [p[0] for p in SocialPost.PLATFORM_CHOICES]
    
    # Process any unprocessed posts
    try:
        process_user_posts(request.user.id, limit=100)
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error processing posts in ml_insights: {str(e)}")
    
    # Query for posts with images
    posts_query = SocialPost.objects.filter(
        user=request.user,
        created_at__gte=since_date,
    )
    
    # Apply platform filter if specified
    if platform_filter:
        posts_query = posts_query.filter(platform=platform_filter)
    
    # Filter posts that have image URLs
    posts_with_images = posts_query.exclude(image_urls='').order_by('-created_at')
    
    # Get ML-processed posts
    ml_posts = posts_query.filter(
        sentiment_score__isnull=False,
        automated_category__isnull=False
    ).order_by('-created_at')
    
    # Get stats by platform
    platform_stats = []
    for platform_code, platform_name in SocialPost.PLATFORM_CHOICES:
        platform_posts = posts_query.filter(platform=platform_code)
        platform_stats.append({
            'platform': platform_name,
            'code': platform_code,
            'count': platform_posts.count(),
            'sentiment': platform_posts.filter(sentiment_score__isnull=False).aggregate(Avg('sentiment_score'))['sentiment_score__avg'] or 0,
            'engagement': platform_posts.aggregate(Avg('engagement_count'))['engagement_count__avg'] or 0,
        })
    
    # Get category distribution
    category_counts = ml_posts.exclude(automated_category='').values('automated_category').annotate(
        count=Count('id')
    ).order_by('-count')
    
    # Prepare for visualization (limit to top 10)
    category_data = {item['automated_category']: item['count'] for item in category_counts[:10]}
    
    context = {
        'ml_posts': ml_posts[:20],
        'ml_posts_count': ml_posts.count(),
        'platform_stats': platform_stats,
        'category_data': json.dumps(category_data),
        'posts_with_images': posts_with_images[:20],
        'image_posts_count': posts_with_images.count(),
        'days_filter': days_filter,
        'platform_filter': platform_filter,
        'platforms': platforms,
        'today_posts': user_data['today_posts'],
        'this_week_posts': user_data['this_week_posts'],
    }
    
    return render(request, "brandsensor/ml_insights.html", context)

@login_required
def pure_feed(request):
    """
    Pure Feed view - displays social posts ranked by authenticity score
    Using the 0-100 scale:
    90-100: Pure Feed. Vulnerable, funny, deep, unique.
    70-89: Insightful, honest, charmingly human.
    40-69: Neutral. Meh. Safe but not manipulative.
    20-39: Performative, cringe, bland, try-hard.
    0-19: Obvious spam, ads, outrage bait, AI slop.
    """
    # Process any unprocessed posts
    try:
        process_user_posts(request.user.id, limit=100)
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error processing posts for pure feed: {str(e)}")
    
    # Get filters from URL parameters
    days_filter = request.GET.get('days', '30')
    try:
        days_ago = int(days_filter)
    except ValueError:
        days_ago = 30
    
    platform_filter = request.GET.get('platform', '')
    min_score = request.GET.get('min_score', '')
    max_score = request.GET.get('max_score', '')
    
    since_date = timezone.now() - datetime.timedelta(days=days_ago)
    
    # Base query - all posts in time range
    posts = SocialPost.objects.filter(
        user=request.user,
        created_at__gte=since_date,
        hidden=False  # Don't show posts the user has hidden
    )
    
    # Apply platform filter if specified
    if platform_filter:
        posts = posts.filter(platform=platform_filter)
    
    # Filter by score range if specified
    if min_score and min_score.isdigit():
        posts = posts.filter(authenticity_score__gte=int(min_score))
    
    if max_score and max_score.isdigit():
        posts = posts.filter(authenticity_score__lte=int(max_score))
    
    # Order by authenticity score (highest first)
    posts = posts.order_by('-authenticity_score', '-collected_at')
    
    # Count posts by score bracket
    score_brackets = [
        {'name': 'Pure Feed (90-100)', 'min': 90, 'max': 100, 'description': 'Vulnerable, funny, deep, unique'},
        {'name': 'Insightful (70-89)', 'min': 70, 'max': 89, 'description': 'Honest, charmingly human'},
        {'name': 'Neutral (40-69)', 'min': 40, 'max': 69, 'description': 'Meh. Safe but not manipulative'},
        {'name': 'Performative (20-39)', 'min': 20, 'max': 39, 'description': 'Cringe, bland, try-hard'},
        {'name': 'Spam/Ads (0-19)', 'min': 0, 'max': 19, 'description': 'Obvious spam, ads, outrage bait, AI slop'}
    ]
    
    # Add counts to each bracket
    for bracket in score_brackets:
        bracket['count'] = posts.filter(
            authenticity_score__gte=bracket['min'],
            authenticity_score__lte=bracket['max']
        ).count()
    
    # Get platform stats
    platform_stats = []
    for platform_code, platform_name in SocialPost.PLATFORM_CHOICES:
        platform_posts = SocialPost.objects.filter(
            user=request.user,
            platform=platform_code
        )
        platform_stats.append({
            'platform': platform_name,
            'code': platform_code,
            'count': platform_posts.count(),
            'avg_authenticity': platform_posts.filter(authenticity_score__isnull=False).aggregate(
                Avg('authenticity_score'))['authenticity_score__avg'] or 0,
        })
    
    context = {
        "posts": posts[:50],  # Limit to 50 posts
        "post_count": posts.count(),
        "days_filter": days_filter,
        "platforms": SocialPost.PLATFORM_CHOICES,
        "current_platform": platform_filter,
        "min_score": min_score,
        "max_score": max_score,
        "score_brackets": score_brackets,
        "platform_stats": platform_stats,
    }
    
    return render(request, "brandsensor/pure_feed.html", context)

# API Endpoints
@csrf_exempt
def collect_posts(request):
    """
    API endpoint to collect social media posts from browser extension
    """
    logger.info("collect_posts endpoint called")
    
    if request.method != 'POST':
        logger.warning("Only POST requests are allowed")
        return JsonResponse({'status': 'error', 'message': 'Only POST requests are allowed'}, status=405)
    
    # API key authentication
    user = get_user_from_api_key(request)
    if user is None:
        logger.warning("Invalid API key")
        return JsonResponse({'status': 'error', 'message': 'Invalid API key'}, status=401)
    
    try:
        data = json.loads(request.body)
        logger.info(f"Received data: platform={data.get('platform')}, posts count={len(data.get('posts', []))}")
        
        posts = data.get('posts', [])
        platform = data.get('platform')
        
        if not platform or not posts:
            logger.warning("Missing platform or posts data")
            return JsonResponse({'status': 'error', 'message': 'Missing platform or posts data'}, status=400)
        
        # Create statistics counters
        new_count = 0
        updated_count = 0
        duplicate_count = 0
        error_count = 0
        
        # Process each post
        for post_data in posts:
            try:
                content = post_data.get('content', '')
                if not content or len(content) < 10:  # Skip posts with very little content
                    logger.warning(f"Skipping post with insufficient content: {content}")
                    continue
                
                # Generate a content hash for duplicate detection
                content_hash = hashlib.md5(content.encode()).hexdigest()
                
                # Use platform_id if available, otherwise generate one
                platform_id = post_data.get('platform_id')
                if not platform_id:
                    # Generate a unique ID based on content hash and timestamp
                    platform_id = f"{platform}_{content_hash[:8]}_{int(time.time())}"
                
                # Check if the post already exists by platform_id or content hash
                existing_post = SocialPost.objects.filter(
                    user=user, 
                    platform=platform,
                    content_hash=content_hash
                ).first()
                
                if existing_post:
                    # Post already exists, update if necessary
                    logger.info(f"Post already exists with ID {existing_post.id}")
                    updated = False
                    
                    # Update fields if needed (e.g., engagement metrics)
                    for field in ['likes', 'comments', 'shares']:
                        if field in post_data and getattr(existing_post, field, 0) != post_data.get(field, 0):
                            setattr(existing_post, field, post_data.get(field, 0))
                            updated = True
                    
                    if updated:
                        existing_post.save()
                        updated_count += 1
                    else:
                        duplicate_count += 1
                else:
                    # Create new post with the content hash
                    try:
                        logger.info(f"Creating new post for platform {platform}")
                        SocialPost.objects.create(
                            user=user,
                            platform=platform,
                            platform_id=platform_id,
                            content_hash=content_hash,
                            content=content,
                            original_user=post_data.get('original_user', ''),
                            engagement_count=post_data.get('engagement_count', 0),
                            is_sponsored=post_data.get('is_sponsored', False),
                            verified=post_data.get('verified', False),
                            timestamp=post_data.get('timestamp'),
                            is_friend=post_data.get('is_friend', False),
                            is_family=post_data.get('is_family', False),
                            collected_at=timezone.now()
                        )
                        new_count += 1
                        logger.info(f"New post created successfully")
                    except IntegrityError as e:
                        # This handles the rare case where a duplicate was created between our check and save
                        logger.error(f"IntegrityError: {str(e)}")
                        duplicate_count += 1
                    except Exception as e:
                        logger.error(f"Error creating post: {str(e)}")
                        error_count += 1
            except Exception as e:
                logger.error(f"Error processing post: {str(e)}")
                error_count += 1
        
        # Log the activity
        activity_details = f"Collected {new_count} new posts, updated {updated_count}, skipped {duplicate_count} duplicates, and encountered {error_count} errors"
        logger.info(activity_details)
        
        BehaviorLog.objects.create(
            user=user,
            behavior_type='collect_posts',
            platform=platform,
            count=new_count + updated_count,
            details=activity_details
        )
        
        # Process ML for new posts in the background
        # TODO: Handle this with a background task
        if new_count > 0:
            process_user_posts(user.id, limit=50)
        
        return JsonResponse({
            'status': 'success',
            'message': activity_details,
            'new': new_count,
            'updated': updated_count,
            'duplicates': duplicate_count,
            'errors': error_count
        })
    except json.JSONDecodeError:
        logger.error("Invalid JSON in request body")
        return JsonResponse({'status': 'error', 'message': 'Invalid JSON in request body'}, status=400)
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)

@csrf_exempt
def post_stats(request):
    """
    API endpoint to get statistics for the current user's posts
    """
    # API key authentication
    user = get_user_from_api_key(request)
    if user is None:
        return JsonResponse({'status': 'error', 'message': 'Invalid API key'}, status=401)
    
    # Generate cache key based on user
    cache_key = user_cache_key(user.id, 'post_stats')
    
    # Try to get cached data
    cached_data = cache.get(cache_key)
    if cached_data:
        return JsonResponse({
            'status': 'success',
            'stats': cached_data,
            'cached': True
        })
    
    try:
        # Get counts
        total_posts = SocialPost.objects.filter(user=user).count()
        sponsored_count = SocialPost.objects.filter(user=user, is_sponsored=True).count()
        friend_count = SocialPost.objects.filter(user=user, is_friend=True).count()
        family_count = SocialPost.objects.filter(user=user, is_family=True).count()
        
        # Get platform distribution
        platform_stats = SocialPost.objects.filter(user=user).values('platform').annotate(count=Count('id'))
        
        # Get ML stats
        ml_processed = SocialPost.objects.filter(user=user, automated_category__isnull=False).count()
        
        # Prepare stats data
        stats_data = {
            'total_posts': total_posts,
            'sponsored_count': sponsored_count,
            'friend_count': friend_count,
            'family_count': family_count,
            'ml_processed': ml_processed,
            'platform_distribution': list(platform_stats)
        }
        
        # Cache the stats for a moderate amount of time (10 minutes)
        cache.set(cache_key, stats_data, settings.CACHE_TTL_SHORT)
        
        return JsonResponse({
            'status': 'success',
            'stats': stats_data
        })
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)

@csrf_exempt
def feedback(request):
    """
    API endpoint to collect user feedback on posts and ML predictions
    """
    if request.method != 'POST':
        return JsonResponse({'status': 'error', 'message': 'Only POST requests are allowed'}, status=405)
    
    # API key authentication
    user = get_user_from_api_key(request)
    if user is None:
        return JsonResponse({'status': 'error', 'message': 'Invalid API key'}, status=401)
    
    try:
        data = json.loads(request.body)
        post_id = data.get('post_id')
        feedback_type = data.get('feedback_type')
        feedback_value = data.get('feedback_value')
        
        if not post_id or not feedback_type:
            return JsonResponse({'status': 'error', 'message': 'Missing required parameters'}, status=400)
        
        # Find post
        try:
            post = SocialPost.objects.get(platform_id=post_id, user=user)
        except SocialPost.DoesNotExist:
            return JsonResponse({'status': 'error', 'message': 'Post not found'}, status=404)
        
        # Handle different feedback types
        if feedback_type == 'category':
            # User is correcting the category
            post.user_category = feedback_value
            post.save()
            
            # Log the ML prediction correction
            MLPredictionLog.objects.create(
                user=user,
                post=post,
                original_prediction=post.automated_category,
                user_correction=feedback_value,
                feedback_type='category_correction'
            )
            
        elif feedback_type == 'sentiment':
            # User is giving sentiment feedback
            try:
                sentiment_value = float(feedback_value)
                post.user_sentiment = sentiment_value
                post.save()
                
                # Log the sentiment feedback
                MLPredictionLog.objects.create(
                    user=user,
                    post=post,
                    original_prediction=str(post.sentiment_score),
                    user_correction=str(sentiment_value),
                    feedback_type='sentiment_correction'
                )
            except ValueError:
                return JsonResponse({'status': 'error', 'message': 'Invalid sentiment value'}, status=400)
                
        elif feedback_type == 'relevance':
            # User is rating relevance
            try:
                relevance_value = int(feedback_value)
                post.relevance_score = relevance_value
                post.save()
            except ValueError:
                return JsonResponse({'status': 'error', 'message': 'Invalid relevance value'}, status=400)
                
        elif feedback_type == 'hide':
            # User wants to hide this post
            post.hidden = True
            post.save()
            
        elif feedback_type == 'star':
            # User is starring/unstarring post
            star_value = data.get('feedback_value', False)
            post.starred = star_value
            post.save()
            
        # Log the feedback action
        BehaviorLog.objects.create(
            user=user,
            action=f'feedback_{feedback_type}',
            platform=post.platform,
            details=f"Provided {feedback_type} feedback for post {post_id}"
        )
        
        return JsonResponse({
            'status': 'success',
            'message': f'Feedback recorded successfully for {feedback_type}'
        })
        
    except json.JSONDecodeError:
        return JsonResponse({'status': 'error', 'message': 'Invalid JSON data'}, status=400)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)

# API Key management views
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

@csrf_exempt
def api_health_check(request):
    """
    Simple health check endpoint to verify API is up and running
    This endpoint intentionally allows OPTIONS requests and sets CORS headers directly
    to ensure it can be accessed from anywhere for connectivity checking.
    """
    # Handle OPTIONS preflight requests
    if request.method == "OPTIONS":
        response = JsonResponse({'status': 'ok'})
        response["Access-Control-Allow-Origin"] = "*"
        response["Access-Control-Allow-Methods"] = "GET, OPTIONS"
        response["Access-Control-Allow-Headers"] = "X-API-Key, Content-Type, Origin"
        response["Access-Control-Max-Age"] = "86400"  # Cache preflight for 24 hours
        return response
    
    response = JsonResponse({
        'status': 'ok',
        'message': 'API is operational',
        'version': '1.0',
        'timestamp': timezone.now().isoformat()
    })
    # Add CORS headers to bypass preflight check issues
    response["Access-Control-Allow-Origin"] = "*"
    response["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    response["Access-Control-Allow-Headers"] = "X-API-Key, Content-Type, Origin"
    return response

@csrf_exempt
def verify_api_key(request):
    """
    API endpoint to verify if an API key is valid.
    Used by the Chrome extension for troubleshooting.
    """
    # Get API key from header
    api_key = request.headers.get('X-API-Key')
    
    if not api_key:
        return JsonResponse({
            'status': 'error',
            'message': 'No API key provided'
        }, status=401)
    
    # Check if API key exists and is active
    try:
        key_obj = APIKey.objects.get(key=api_key, is_active=True)
        
        # Update last used timestamp
        key_obj.last_used = timezone.now()
        key_obj.save(update_fields=['last_used'])
        
        return JsonResponse({
            'status': 'ok',
            'valid': True,
            'user': key_obj.user.username,
            'created': key_obj.created_at.isoformat(),
            'last_used': key_obj.last_used.isoformat()
        })
    except APIKey.DoesNotExist:
        return JsonResponse({
            'status': 'error',
            'valid': False,
            'message': 'Invalid or inactive API key'
        }, status=401)

@csrf_exempt
def api_process_ml(request):
    """
    API endpoint for ML processing that accepts API key auth
    """
    # Handle OPTIONS preflight requests
    if request.method == "OPTIONS":
        response = JsonResponse({'status': 'ok'})
        response["Access-Control-Allow-Origin"] = "*"
        response["Access-Control-Allow-Methods"] = "POST, OPTIONS"
        response["Access-Control-Allow-Headers"] = "X-API-Key, Content-Type"
        return response
        
    if request.method != "POST":
        response = JsonResponse({"error": "Only POST method is allowed"}, status=405)
        response["Access-Control-Allow-Origin"] = "*"
        return response
    
    # Get user from API key
    user = get_user_from_api_key(request)
    if not user:
        response = JsonResponse({
            "error": "Invalid or missing API key"
        }, status=401)
        response["Access-Control-Allow-Origin"] = "*"
        return response
    
    # Process data from the request
    try:
        data = json.loads(request.body)
        
        # Log the incoming data for debugging
        print(f"Processing ML data for platform: {data.get('platform', 'unknown')}")
        
        # Ensure boolean fields are properly typed
        for field in ['is_friend', 'is_family', 'verified', 'is_sponsored', 'is_job_post']:
            if field in data:
                data[field] = bool(data[field])
        
        # Apply ML processing to the content
        content = data.get('content', '')
        if content:
            # Apply simple sentiment analysis to feed back to extension
            sentiment_result = analyze_sentiment(content)
            
            # Return the processed results with ML data
            results = {
                "status": "success",
                "message": "ML processing completed",
                "processed_at": timezone.now().isoformat(),
                "ml_data": {
                    "sentiment_score": sentiment_result.get('sentiment_score', 0),
                    "positive_indicators": sentiment_result.get('positive_indicators', 0),
                    "negative_indicators": sentiment_result.get('negative_indicators', 0)
                }
            }
        else:
            results = {
                "status": "error",
                "message": "No content provided for processing",
                "processed_at": timezone.now().isoformat()
            }
        
        # Return the results
        response = JsonResponse(results)
        response["Access-Control-Allow-Origin"] = "*"
        return response
    except json.JSONDecodeError:
        response = JsonResponse({"error": "Invalid JSON"}, status=400)
        response["Access-Control-Allow-Origin"] = "*"
        return response
    except Exception as e:
        print(f"Error in api_process_ml: {str(e)}")
        response = JsonResponse({"error": str(e)}, status=500)
        response["Access-Control-Allow-Origin"] = "*"
        return response
