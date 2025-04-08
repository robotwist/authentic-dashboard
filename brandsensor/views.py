from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.db.models import Q, Count, Avg, F
from django.utils import timezone
from django.conf import settings
from django.core.cache import cache
from django.views.decorators.cache import cache_page
import json
import datetime
import uuid
import secrets
import string
import hashlib
from django.db.utils import IntegrityError

from .models import SocialPost, UserPreference, Brand, BehaviorLog, SocialConnection, MLModel, MLPredictionLog, APIKey, FilterPreset
from .ml_processor import process_post, process_user_posts
from django.contrib.auth.models import User
from django.contrib.auth import authenticate, login, logout

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
    
    # Get user preferences or create defaults
    preferences, created = UserPreference.objects.get_or_create(user=user)
    
    # Get API keys
    api_keys = APIKey.objects.filter(user=user)
    
    # Get user statistics
    post_count = SocialPost.objects.filter(user=user).count()
    platform_stats = SocialPost.objects.filter(user=user).values('platform').annotate(count=Count('id'))
    
    if request.method == 'POST':
        # Handle settings update
        # Update user profile if needed
        if 'email' in request.POST:
            user.email = request.POST.get('email')
            user.save()
        
        # Update notification settings
        preferences.email_notifications = 'email_notifications' in request.POST
        preferences.browser_notifications = 'browser_notifications' in request.POST
        preferences.save()
        
        return redirect('user_settings')
    
    context = {
        'user': user,
        'preferences': preferences,
        'api_keys': api_keys,
        'post_count': post_count,
        'platform_stats': platform_stats,
    }
    
    return render(request, 'brandsensor/user_settings.html', context)

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
    Renders the dashboard with curated social posts and recent behavior logs.
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
        # We have cached data, but still need to add the current filter presets
        cached_context['filter_presets'] = FilterPreset.objects.filter(user=request.user)
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
    
    # Get recent behavior logs (limit to 10 for display)
    logs = BehaviorLog.objects.filter(user=request.user).order_by('-created_at')[:10]
    
    # Get platform statistics
    platform_stats = SocialPost.objects.filter(
        user=request.user
    ).values('platform').annotate(
        count=Count('id')
    ).order_by('-count')
    
    # Get sentiment statistics
    sentiment_stats = SocialPost.objects.filter(
        user=request.user,
        sentiment_score__isnull=False
    ).aggregate(
        avg_sentiment=Avg('sentiment_score'),
        positive_count=Count('id', filter=Q(sentiment_score__gt=0.2)),
        negative_count=Count('id', filter=Q(sentiment_score__lt=-0.2)),
        neutral_count=Count('id', filter=Q(sentiment_score__gte=-0.2, sentiment_score__lte=0.2))
    )
    
    # Get topic/category statistics
    topic_stats = SocialPost.objects.filter(
        user=request.user,
        automated_category__isnull=False
    ).exclude(automated_category='').values('automated_category').annotate(
        count=Count('id')
    ).order_by('-count')[:10]
    
    # Get category statistics from manual categories
    categories = []
    for post in posts:
        if post.category:
            for category in post.category.split(','):
                if category.strip() and not category.strip().startswith('#'):
                    categories.append(category.strip())
    
    category_counts = {}
    for category in categories:
        if category in category_counts:
            category_counts[category] += 1
        else:
            category_counts[category] = 1
    
    # Convert to list of dicts for the template
    category_stats = [
        {'name': k, 'count': v} 
        for k, v in sorted(category_counts.items(), key=lambda x: x[1], reverse=True)
    ][:10]  # Top 10 categories
    
    # Get ML-processed post count
    ml_processed_count = SocialPost.objects.filter(
        user=request.user,
        automated_category__isnull=False,
        sentiment_score__isnull=False
    ).count()
    
    # Add user's filter presets to the context
    filter_presets = FilterPreset.objects.filter(user=request.user)
    
    context = {
        "posts": posts[:50],  # Limit to 50 posts for performance
        "preferences": preferences,
        "logs": logs,
        "platform_stats": platform_stats,
        "category_stats": category_stats,
        "topic_stats": topic_stats,
        "sentiment_stats": sentiment_stats,
        "days_filter": days_filter,
        "platforms": SocialPost.PLATFORM_CHOICES,
        "current_platform": platform_filter,
        "current_sort": sort_by,
        "ml_processed_count": ml_processed_count,
        "total_posts_count": SocialPost.objects.filter(user=request.user).count(),
        "filter_presets": filter_presets,  # Add filter presets to the context
    }
    
    # Cache this context for 5 minutes (short-lived cache for dashboard)
    cache.set(cache_key, context, settings.CACHE_TTL_SHORT)
    
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
def api_log_behavior(request):
    """
    Accepts POST requests with behavior log data from the Chrome extension.
    Uses API key authentication.
    """
    if request.method != "POST":
        return JsonResponse({"error": "Only POST allowed"}, status=405)
    try:
        # Get user from API key
        user = get_user_from_api_key(request)
        if not user:
            return JsonResponse({"error": "Invalid or missing API key"}, status=401)
            
        data = json.loads(request.body)
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
    # Handle OPTIONS preflight requests
    if request.method == "OPTIONS":
        response = JsonResponse({'status': 'ok'})
        response["Access-Control-Allow-Origin"] = "*"
        response["Access-Control-Allow-Methods"] = "POST, OPTIONS"
        response["Access-Control-Allow-Headers"] = "X-API-Key, Content-Type"
        return response
        
    if request.method != "POST":
        response = JsonResponse({"error": "Only POST allowed"}, status=405)
        response["Access-Control-Allow-Origin"] = "*"
        return response
    
    try:
        # Get user from API key
        user = get_user_from_api_key(request)
        if not user:
            response = JsonResponse({"error": "Invalid or missing API key"}, status=401)
            response["Access-Control-Allow-Origin"] = "*"
            return response
        
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            response = JsonResponse({"error": "Invalid JSON data"}, status=400)
            response["Access-Control-Allow-Origin"] = "*"
            return response
        
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

        response = JsonResponse({"status": "post saved and processed"})
        response["Access-Control-Allow-Origin"] = "*"
        return response
    except Exception as e:
        print(f"Error in api_log_post: {str(e)}")
        response = JsonResponse({"error": str(e)}, status=500)
        response["Access-Control-Allow-Origin"] = "*"
        return response


@login_required
def post_action(request, post_id):
    """
    Handle various post actions: star, hide, rate, categorize
    """
    if request.method == "POST":
        action = request.POST.get('action')
        try:
            post = SocialPost.objects.get(id=post_id, user=request.user)
            
            if action == "star":
                post.starred = not post.starred
            elif action == "hide":
                post.hidden = True
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
    # Get days filter (default to 30 days)
    days_filter = request.GET.get('days', '30')
    try:
        days_ago = int(days_filter)
    except ValueError:
        days_ago = 30
    
    # Generate a cache key for this view and its parameters
    cache_key = user_cache_key(
        request.user.id, 
        'ml_dashboard', 
        days=days_ago
    )
    
    # Try to get cached data
    cached_context = cache.get(cache_key)
    if cached_context:
        return render(request, "brandsensor/ml_dashboard.html", cached_context)
    
    since_date = timezone.now() - datetime.timedelta(days=days_ago)
    
    # Process any unprocessed posts - wrap in try/except to catch IntegrityError
    try:
        process_user_posts(request.user.id, limit=100)
    except IntegrityError as e:
        # Log the error but continue - the duplicate has been handled
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"IntegrityError in ml_dashboard: {str(e)}")
    except Exception as e:
        # Handle any other exceptions that might occur
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
    
    # Check if we have any ML-processed posts
    if ml_posts.count() == 0:
        # If no ML-processed posts, show a basic template
        context = {
            'ml_posts_count': 0,
            'total_posts_count': SocialPost.objects.filter(user=request.user).count(),
            'no_ml_data': True,
            'days_filter': days_filter,
        }
        return render(request, "brandsensor/ml_dashboard.html", context)
    
    # Get sentiment statistics by platform
    sentiment_by_platform = (
        ml_posts.values('platform')
        .annotate(
            avg_sentiment=Avg('sentiment_score'),
            count=Count('id')
        )
        .order_by('-count')
    )
    
    # Get topic distribution
    topic_distribution = (
        ml_posts.exclude(automated_category='')
        .values('automated_category')
        .annotate(count=Count('id'))
        .order_by('-count')[:10]  # Top 10 topics
    )
    
    # Get engagement prediction distribution
    engagement_ranges = {
        'Very Low': (0, 0.2),
        'Low': (0.2, 0.4),
        'Medium': (0.4, 0.6),
        'High': (0.6, 0.8),
        'Very High': (0.8, 1.0)
    }
    
    engagement_distribution = {}
    for label, (min_val, max_val) in engagement_ranges.items():
        count = ml_posts.filter(
            engagement_prediction__gte=min_val,
            engagement_prediction__lt=max_val
        ).count()
        engagement_distribution[label] = count
    
    # Get toxicity analysis
    toxicity_ranges = {
        'Clean': (0, 0.2),
        'Mild': (0.2, 0.4),
        'Moderate': (0.4, 0.6),
        'High': (0.6, 0.8),
        'Extreme': (0.8, 1.0)
    }
    
    toxicity_distribution = {}
    for label, (min_val, max_val) in toxicity_ranges.items():
        count = ml_posts.filter(
            toxicity_score__gte=min_val,
            toxicity_score__lt=max_val
        ).count()
        toxicity_distribution[label] = count
    
    # Get sentiment over time (weekly)
    sentiment_over_time = []
    for i in range(days_ago // 7 + 1):
        end_date = since_date + datetime.timedelta(days=(i+1)*7)
        start_date = since_date + datetime.timedelta(days=i*7)
        
        # Skip future periods
        if start_date > timezone.now():
            continue
            
        # Cap the end date to today
        if end_date > timezone.now():
            end_date = timezone.now()
        
        # Get average sentiment for this week
        weekly_sentiment = ml_posts.filter(
            created_at__gte=start_date,
            created_at__lt=end_date
        ).aggregate(avg_sentiment=Avg('sentiment_score'))
        
        if weekly_sentiment['avg_sentiment'] is not None:
            sentiment_over_time.append({
                'period': f"{start_date.strftime('%b %d')} - {end_date.strftime('%b %d')}",
                'sentiment': weekly_sentiment['avg_sentiment']
            })
    
    # Get most positive/negative posts
    most_positive_posts = ml_posts.order_by('-sentiment_score')[:5]
    most_negative_posts = ml_posts.filter(sentiment_score__lt=0).order_by('sentiment_score')[:5]
    
    # Get highest/lowest engagement posts
    highest_engagement_posts = ml_posts.order_by('-engagement_prediction')[:5]
    
    # Get posts with highest toxicity scores
    toxic_posts = ml_posts.order_by('-toxicity_score')[:5]
    
    # Prepare data for charts (JSON)
    charts_data = {
        'sentiment_by_platform': [
            {
                'platform': item['platform'],
                'avg_sentiment': float(item['avg_sentiment']) if item['avg_sentiment'] else 0,
                'count': item['count']
            }
            for item in sentiment_by_platform
        ],
        'topic_distribution': [
            {
                'topic': item['automated_category'],
                'count': item['count']
            }
            for item in topic_distribution
        ],
        'engagement_distribution': [
            {
                'label': label,
                'count': count
            }
            for label, count in engagement_distribution.items()
        ],
        'toxicity_distribution': [
            {
                'label': label,
                'count': count
            }
            for label, count in toxicity_distribution.items()
        ],
        'sentiment_over_time': sentiment_over_time
    }
    
    context = {
        'ml_posts': ml_posts[:20],  # Limit to 20 for performance
        'ml_posts_count': ml_posts.count(),
        'total_posts_count': SocialPost.objects.filter(user=request.user).count(),
        'charts_data': json.dumps(charts_data),
        'most_positive_posts': most_positive_posts,
        'most_negative_posts': most_negative_posts,
        'highest_engagement_posts': highest_engagement_posts,
        'toxic_posts': toxic_posts,
        'days_filter': days_filter,
    }
    
    # Cache this heavy computation result (ML dashboard is very compute-intensive)
    cache.set(cache_key, context, settings.CACHE_TTL)
    
    return render(request, "brandsensor/ml_dashboard.html", context)

# ------------------------------
# Filter Preset Management
# ------------------------------

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

# API Endpoints
@csrf_exempt
def collect_posts(request):
    """
    API endpoint to collect social media posts from browser extension
    """
    if request.method != 'POST':
        return JsonResponse({'status': 'error', 'message': 'Only POST requests are allowed'}, status=405)
    
    # API key authentication
    user = get_user_from_api_key(request)
    if user is None:
        return JsonResponse({'status': 'error', 'message': 'Invalid API key'}, status=401)
    
    try:
        data = json.loads(request.body)
        posts = data.get('posts', [])
        platform = data.get('platform')
        
        if not platform or not posts:
            return JsonResponse({'status': 'error', 'message': 'Missing platform or posts data'}, status=400)
        
        # Create statistics counters
        new_count = 0
        updated_count = 0
        duplicate_count = 0
        
        # Process each post
        for post_data in posts:
            content = post_data.get('content', '')
            if not content:
                continue  # Skip posts with no content
                
            # Check if post already exists by platform_id
            platform_id = post_data.get('platform_id')
            if not platform_id:
                # Generate a unique ID if not provided
                platform_id = str(uuid.uuid4())
            
            # Create hash for content to detect duplicates
            content_to_hash = f"{platform}:{content}"
            content_hash = hashlib.md5(content_to_hash.encode('utf-8')).hexdigest()
            
            # Check for duplicates either by platform_id or content_hash
            existing_post = None
            if platform_id:
                existing_post = SocialPost.objects.filter(platform_id=platform_id, user=user).first()
            
            # If not found by platform_id, check by content_hash
            if not existing_post:
                existing_post = SocialPost.objects.filter(content_hash=content_hash, user=user).first()
            
            if existing_post:
                # Update existing post with any new information
                was_updated = False
                
                # Only update fields that are provided and different
                for field in ['original_user', 'engagement_count', 'is_sponsored', 
                             'verified', 'timestamp', 'is_friend', 'is_family']:
                    if field in post_data and getattr(existing_post, field) != post_data[field]:
                        setattr(existing_post, field, post_data[field])
                        was_updated = True
                
                # Only update content if it's different and we want to overwrite
                if content != existing_post.content and post_data.get('overwrite_content', False):
                    existing_post.content = content
                    was_updated = True
                
                if was_updated:
                    # Track update timestamp
                    existing_post.collected_at = timezone.now()
                    existing_post.save()
                    updated_count += 1
                else:
                    duplicate_count += 1
            else:
                # Create new post with the content hash
                try:
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
                except IntegrityError:
                    # This handles the rare case where a duplicate was created between our check and save
                    duplicate_count += 1
        
        # Log the activity
        BehaviorLog.objects.create(
            user=user,
            behavior_type='collect_posts',
            platform=platform,
            count=new_count + updated_count,
            details=f"Collected {new_count} new posts, updated {updated_count}, and skipped {duplicate_count} duplicates"
        )
        
        # Process ML for new posts in the background
        # TODO: Handle this with a background task
        if new_count > 0:
            process_user_posts(user.id, limit=50)
        
        return JsonResponse({
            'status': 'success',
            'new_posts': new_count,
            'updated_posts': updated_count,
            'duplicate_posts': duplicate_count,
            'message': f"Successfully collected {new_count} new posts, updated {updated_count}, and skipped {duplicate_count} duplicates"
        })
    except json.JSONDecodeError:
        return JsonResponse({'status': 'error', 'message': 'Invalid JSON data'}, status=400)
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"Error in collect_posts: {error_details}")
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
    """
    response = JsonResponse({
        'status': 'ok',
        'message': 'API is operational',
        'version': '1.0'
    })
    # Add CORS headers to bypass preflight check issues
    response["Access-Control-Allow-Origin"] = "*"
    response["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    response["Access-Control-Allow-Headers"] = "X-API-Key, Content-Type"
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
