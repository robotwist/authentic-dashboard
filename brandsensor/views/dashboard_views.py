from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.db.models import Q, Count, Sum, Avg, F
from django.utils import timezone
from django.core.paginator import Paginator
from django.contrib import messages
import datetime
import logging

from ..models import SocialPost, UserPreference, Brand, BehaviorLog, FilterPreset
from ..ml_processor import process_user_posts
from ..utils import get_user_data, process_image_analysis

logger = logging.getLogger(__name__)

@login_required
def dashboard(request):
    """
    Main dashboard view with posts, analytics and filtering
    """
    # Process any unprocessed posts first
    try:
        process_user_posts(request.user.id, limit=50)
    except Exception as e:
        logger.error(f"Error processing posts for dashboard: {str(e)}")

    # Fetch user data using the utility function
    user_data = get_user_data(request.user)

    # Get user preferences or create default
    preferences, created = UserPreference.objects.get_or_create(user=request.user)
    
    # Get filters from URL parameters
    days_filter = request.GET.get('days', '7')
    platform_filter = request.GET.get('platform', '')
    friends_only = request.GET.get('friends_only', 'false') == 'true'
    hide_sponsored = request.GET.get('hide_sponsored', 'true') == 'true'
    min_authenticity = request.GET.get('min_authenticity', '')
    max_authenticity = request.GET.get('max_authenticity', '')
    
    # Convert days filter to integer
    try:
        days_ago = int(days_filter)
    except ValueError:
        days_ago = 7
    
    # Calculate date range
    since_date = timezone.now() - datetime.timedelta(days=days_ago)
    
    # Base query
    posts = SocialPost.objects.filter(
        user=request.user,
        created_at__gte=since_date,
        hidden=False
    )
    
    # Apply platform filter if specified
    if platform_filter:
        posts = posts.filter(platform=platform_filter)
    
    # Apply friends filter
    if friends_only and preferences.friends_list:
        friends = [f.strip().lower() for f in preferences.friends_list.split(',')]
        friends_query = Q()
        for friend in friends:
            if friend:
                friends_query |= Q(original_user__icontains=friend)
        posts = posts.filter(friends_query)
    
    # Apply sponsored content filter
    if hide_sponsored:
        posts = posts.filter(is_sponsored=False)
    
    # Apply authenticity score filters
    if min_authenticity and min_authenticity.isdigit():
        posts = posts.filter(authenticity_score__gte=int(min_authenticity))
    
    if max_authenticity and max_authenticity.isdigit():
        posts = posts.filter(authenticity_score__lte=int(max_authenticity))
    
    # Apply user preference filters
    if preferences.hide_political_content:
        posts = posts.exclude(
            Q(content__icontains='trump') | 
            Q(content__icontains='biden') | 
            Q(content__icontains='election') |
            Q(automated_category__iexact='politics') |
            Q(category__icontains='political')
        )
    
    if preferences.hide_sexual_content:
        posts = posts.exclude(
            Q(content__icontains='onlyfans') | 
            Q(content__icontains='dating') |
            Q(automated_category__iexact='adult') |
            Q(category__icontains='sexual')
        )
    
    # Apply interest filter if set
    if preferences.interest_filter:
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
    
    # Order posts by authenticity score and date
    posts = posts.order_by('-authenticity_score', '-collected_at')
    
    # Pagination
    paginator = Paginator(posts, 25)
    page_number = request.GET.get('page', 1)
    page_posts = paginator.get_page(page_number)
    
    # Get platform choices for filter dropdown
    platforms = SocialPost.PLATFORM_CHOICES
    
    # Get analytics data
    total_posts = posts.count()
    avg_authenticity = posts.aggregate(Avg('authenticity_score'))['authenticity_score__avg'] or 0
    
    # Platform distribution
    platform_stats = []
    for platform_code, platform_name in platforms:
        count = posts.filter(platform=platform_code).count()
        if count > 0:
            platform_stats.append({
                'platform': platform_name,
                'code': platform_code,
                'count': count
            })
    
    # Process image analysis data
    image_posts = SocialPost.objects.filter(user=request.user).exclude(image_urls='')
    image_analysis_stats = process_image_analysis(image_posts)
    
    # Get top categories
    category_stats = posts.exclude(category='').values('category').annotate(
        count=Count('id'),
        name=F('category')
    ).order_by('-count')[:5]
    
    # Get sentiment distribution
    sentiment_distribution = posts.filter(
        sentiment_score__isnull=False
    ).values('sentiment_score').annotate(
        count=Count('id')
    ).order_by('sentiment_score')
    
    # Group sentiment scores into bins
    sentiment_bins = {
        'very_negative': 0,
        'negative': 0,
        'neutral': 0,
        'positive': 0,
        'very_positive': 0
    }
    
    for item in sentiment_distribution:
        score = item['sentiment_score']
        count = item['count']
        
        if score < -0.6:
            sentiment_bins['very_negative'] += count
        elif score < -0.2:
            sentiment_bins['negative'] += count
        elif score < 0.2:
            sentiment_bins['neutral'] += count
        elif score < 0.6:
            sentiment_bins['positive'] += count
        else:
            sentiment_bins['very_positive'] += count
    
    context = {
        'posts': page_posts,
        'user_data': user_data,
        'preferences': preferences,
        'total_posts': total_posts,
        'avg_authenticity': round(avg_authenticity, 1),
        'platform_stats': platform_stats,
        'category_stats': category_stats,
        'sentiment_bins': sentiment_bins,
        'image_analysis_stats': image_analysis_stats,
        'platforms': platforms,
        'days_filter': days_filter,
        'platform_filter': platform_filter,
        'friends_only': friends_only,
        'hide_sponsored': hide_sponsored,
        'min_authenticity': min_authenticity,
        'max_authenticity': max_authenticity,
    }
    
    return render(request, "brandsensor/dashboard.html", context)

@login_required
def toggle_mode(request):
    """
    Toggle between different dashboard modes
    """
    mode = request.GET.get('mode', 'default')
    
    # Store mode preference in session
    request.session['dashboard_mode'] = mode
    
    return redirect('dashboard')

@login_required
def onboarding(request):
    """
    User onboarding flow
    """
    user_data = get_user_data(request.user)
    
    # Check if user has completed onboarding
    preferences = user_data.get('preferences')
    if preferences and preferences.onboarding_completed:
        return redirect('dashboard')
    
    if request.method == 'POST':
        # Process onboarding form
        interests = request.POST.get('interests', '')
        friends_list = request.POST.get('friends_list', '')
        
        if preferences:
            preferences.interest_filter = interests
            preferences.friends_list = friends_list
            preferences.onboarding_completed = True
            preferences.save()
        
        messages.success(request, "Onboarding completed! Welcome to your dashboard.")
        return redirect('dashboard')
    
    context = {
        'user_data': user_data,
    }
    
    return render(request, "brandsensor/onboarding.html", context)

@login_required
def pure_feed(request):
    """
    Pure Feed view - displays social posts ranked by authenticity score
    """
    # Process any unprocessed posts
    try:
        process_user_posts(request.user.id, limit=100)
    except Exception as e:
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
        hidden=False
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
    
    # Pagination
    paginator = Paginator(posts, 30)
    page_number = request.GET.get('page', 1)
    page_posts = paginator.get_page(page_number)
    
    # Get statistics
    total_posts = posts.count()
    avg_score = posts.aggregate(Avg('authenticity_score'))['authenticity_score__avg'] or 0
    
    # Score distribution
    score_ranges = {
        'pure': posts.filter(authenticity_score__gte=90).count(),
        'good': posts.filter(authenticity_score__gte=70, authenticity_score__lt=90).count(),
        'neutral': posts.filter(authenticity_score__gte=40, authenticity_score__lt=70).count(),
        'poor': posts.filter(authenticity_score__gte=20, authenticity_score__lt=40).count(),
        'spam': posts.filter(authenticity_score__lt=20).count(),
    }
    
    context = {
        'posts': page_posts,
        'total_posts': total_posts,
        'avg_score': round(avg_score, 1),
        'score_ranges': score_ranges,
        'platforms': SocialPost.PLATFORM_CHOICES,
        'days_filter': days_filter,
        'platform_filter': platform_filter,
        'min_score': min_score,
        'max_score': max_score,
    }
    
    return render(request, "brandsensor/pure_feed.html", context) 