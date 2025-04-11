from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.db.models import Q, Count, Avg, F
from django.utils import timezone
from django.db.utils import IntegrityError
import logging
import datetime
import json

from .models import SocialPost, MLModel, MLPredictionLog
from .ml_processor import process_user_posts
from .utils import get_user_data

logger = logging.getLogger(__name__)

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
        logger.warning(f"IntegrityError in ml_dashboard: {str(e)}")
    except Exception as e:
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
    
    # Enhanced image analysis - Process and get images with captions
    posts_with_captions = []
    for post in posts_with_images[:10]:  # Limit to 10 for performance
        image_urls = post.image_urls.split(',') if post.image_urls else []
        image_data = []
        
        for url in image_urls[:3]:  # Process up to 3 images per post
            url = url.strip()
            if url:
                # Check if we have ML data for this image
                image_analysis = json.loads(post.image_analysis) if post.image_analysis else {}
                caption = image_analysis.get('caption', 'No caption available')
                aesthetics = image_analysis.get('aesthetics', {})
                objects = image_analysis.get('objects', [])
                
                image_data.append({
                    'url': url,
                    'caption': caption,
                    'aesthetics': aesthetics,
                    'objects': objects[:5] if objects else [],  # Show top 5 objects
                })
        
        if image_data:
            posts_with_captions.append({
                'post': post,
                'images': image_data
            })
    
    # Get topic distribution over time
    topic_time_series = []
    weekly_data = []
    
    # Group posts by week and get top topics for each week
    week_posts = {}
    for post in ml_posts:
        week = post.created_at.strftime('%Y-%U')  # Year and week number
        if week not in week_posts:
            week_posts[week] = []
        week_posts[week].append(post)
    
    # For each week, get the top topics
    for week, posts in sorted(week_posts.items()):
        topics = {}
        for post in posts:
            if post.automated_category:
                topic = post.automated_category
                if topic not in topics:
                    topics[topic] = 0
                topics[topic] += 1
        
        top_topics = sorted(topics.items(), key=lambda x: x[1], reverse=True)[:3]
        week_date = datetime.datetime.strptime(week + '-1', '%Y-%U-%w')
        weekly_data.append({
            'week': week_date.strftime('%b %d'),
            'topics': [{'name': t[0], 'count': t[1]} for t in top_topics]
        })
    
    # Get image analysis statistics
    image_analysis_stats = {
        'total_images': posts_with_images.count(),
        'faces_detected': posts_query.filter(image_analysis__icontains='faces').count(),
        'has_aesthetics': posts_query.filter(image_analysis__icontains='aesthetics').count(),
        'has_objects': posts_query.filter(image_analysis__icontains='objects').count(),
    }
    
    context = {
        'ml_posts': ml_posts[:20],
        'ml_posts_count': ml_posts.count(),
        'platform_stats': platform_stats,
        'category_data': json.dumps(category_data),
        'posts_with_images': posts_with_images[:20],
        'posts_with_captions': posts_with_captions,
        'image_posts_count': posts_with_images.count(),
        'days_filter': days_filter,
        'platform_filter': platform_filter,
        'platforms': platforms,
        'today_posts': user_data['today_posts'],
        'this_week_posts': user_data['this_week_posts'],
        'SocialPost': SocialPost,  # Pass the model class for template access
        'weekly_data': weekly_data,
        'image_analysis_stats': image_analysis_stats,
    }
    
    return render(request, "brandsensor/ml_insights.html", context)
