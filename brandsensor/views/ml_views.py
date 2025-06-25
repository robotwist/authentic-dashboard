"""
ML Views Module

Contains all machine learning related views for the BrandSensor application.
"""

import json
import logging
from django.shortcuts import render, redirect
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from django.db.models import Q, Count, Avg
from django.conf import settings

from ..models import (
    SocialPost, 
    UserPreference,
    MLModel,
    MLPredictionLog,
    InterpretationLog
)
from ..ml_processor import process_post, process_user_posts

logger = logging.getLogger(__name__)

@login_required
@csrf_exempt
def process_ml(request):
    """
    Process posts through ML models for sentiment analysis and authenticity scoring
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'Only POST method allowed'}, status=405)
    
    user = request.user
    
    try:
        # Process all user posts through ML
        posts = SocialPost.objects.filter(user=user)
        processed_count = 0
        
        for post in posts:
            try:
                result = process_post(post)
                if result:
                    post.sentiment = result.get('sentiment', post.sentiment)
                    post.authenticity_score = result.get('authenticity_score', post.authenticity_score)
                    post.save()
                    processed_count += 1
            except Exception as e:
                logger.error(f"Error processing post {post.id}: {e}")
        
        return JsonResponse({
            'status': 'success',
            'processed_posts': processed_count,
            'total_posts': posts.count()
        })
        
    except Exception as e:
        logger.error(f"Error in ML processing: {e}")
        return JsonResponse({'error': 'Internal server error'}, status=500)

@login_required
def ml_dashboard(request):
    """
    Machine Learning dashboard showing model performance and insights
    """
    user = request.user
    
    # Get ML processing statistics
    total_posts = SocialPost.objects.filter(user=user).count()
    processed_posts = SocialPost.objects.filter(
        user=user,
        sentiment__isnull=False
    ).count()
    
    # Sentiment distribution
    sentiment_stats = SocialPost.objects.filter(user=user).aggregate(
        positive=Count('id', filter=Q(sentiment='positive')),
        negative=Count('id', filter=Q(sentiment='negative')),
        neutral=Count('id', filter=Q(sentiment='neutral'))
    )
    
    # Authenticity score distribution
    authenticity_stats = SocialPost.objects.filter(user=user).aggregate(
        avg_score=Avg('authenticity_score'),
        high_quality=Count('id', filter=Q(authenticity_score__gte=0.8)),
        medium_quality=Count('id', filter=Q(authenticity_score__range=(0.5, 0.8))),
        low_quality=Count('id', filter=Q(authenticity_score__lt=0.5))
    )
    
    # Recent ML predictions
    recent_predictions = MLPredictionLog.objects.filter(
        user=user
    ).order_by('-timestamp')[:10]
    
    # Model performance metrics
    model_stats = {}
    if recent_predictions.exists():
        for prediction in recent_predictions:
            model_name = prediction.model_used
            if model_name not in model_stats:
                model_stats[model_name] = {
                    'predictions': 0,
                    'avg_confidence': 0,
                    'total_confidence': 0
                }
            
            model_stats[model_name]['predictions'] += 1
            try:
                confidence_data = json.loads(prediction.confidence_scores)
                avg_confidence = sum(confidence_data.values()) / len(confidence_data)
                model_stats[model_name]['total_confidence'] += avg_confidence
            except (json.JSONDecodeError, ZeroDivisionError, TypeError):
                pass
        
        # Calculate average confidence for each model
        for model_name, stats in model_stats.items():
            if stats['predictions'] > 0:
                stats['avg_confidence'] = stats['total_confidence'] / stats['predictions']
    
    context = {
        'user': user,
        'total_posts': total_posts,
        'processed_posts': processed_posts,
        'sentiment_stats': sentiment_stats,
        'authenticity_stats': authenticity_stats,
        'recent_predictions': recent_predictions,
        'model_stats': model_stats,
        'processing_enabled': getattr(settings, 'ML_PROCESSING_ENABLED', False)
    }
    
    return render(request, 'brandsensor/ml_dashboard.html', context)

@login_required
def ml_insights(request):
    """
    Advanced ML insights and analytics
    """
    user = request.user
    
    # Get posts with ML processing
    posts_qs = SocialPost.objects.filter(
        user=user,
        sentiment__isnull=False,
        authenticity_score__isnull=False
    )
    
    # Time-based sentiment trends
    from django.db.models.functions import TruncDate
    sentiment_trends = posts_qs.annotate(
        date=TruncDate('created_at')
    ).values('date').annotate(
        positive=Count('id', filter=Q(sentiment='positive')),
        negative=Count('id', filter=Q(sentiment='negative')),
        neutral=Count('id', filter=Q(sentiment='neutral'))
    ).order_by('date')
    
    # Platform-specific sentiment analysis
    platform_sentiment = posts_qs.values('platform').annotate(
        positive=Count('id', filter=Q(sentiment='positive')),
        negative=Count('id', filter=Q(sentiment='negative')),
        neutral=Count('id', filter=Q(sentiment='neutral')),
        avg_authenticity=Avg('authenticity_score')
    ).order_by('platform')
    
    # Brand sentiment analysis
    brand_sentiment = posts_qs.filter(brand__isnull=False).values(
        'brand__name'
    ).annotate(
        positive=Count('id', filter=Q(sentiment='positive')),
        negative=Count('id', filter=Q(sentiment='negative')),
        neutral=Count('id', filter=Q(sentiment='neutral')),
        avg_authenticity=Avg('authenticity_score'),
        total_posts=Count('id')
    ).order_by('-total_posts')[:10]
    
    # Content quality insights
    quality_insights = {
        'high_quality_posts': posts_qs.filter(authenticity_score__gte=0.8).count(),
        'medium_quality_posts': posts_qs.filter(
            authenticity_score__range=(0.5, 0.8)
        ).count(),
        'low_quality_posts': posts_qs.filter(authenticity_score__lt=0.5).count(),
        'avg_authenticity_by_platform': posts_qs.values('platform').annotate(
            avg_score=Avg('authenticity_score')
        ).order_by('-avg_score')
    }
    
    # Recent interpretations
    recent_interpretations = InterpretationLog.objects.filter(
        user=user
    ).order_by('-timestamp')[:5] if InterpretationLog.objects.filter(user=user).exists() else []
    
    # Prediction accuracy (if we have user feedback)
    prediction_accuracy = calculate_prediction_accuracy(user)
    
    context = {
        'user': user,
        'sentiment_trends': list(sentiment_trends),
        'platform_sentiment': list(platform_sentiment),
        'brand_sentiment': list(brand_sentiment),
        'quality_insights': quality_insights,
        'recent_interpretations': recent_interpretations,
        'prediction_accuracy': prediction_accuracy,
        'total_analyzed_posts': posts_qs.count()
    }
    
    return render(request, 'brandsensor/ml_insights.html', context)

def calculate_prediction_accuracy(user):
    """
    Calculate ML prediction accuracy based on user feedback/corrections
    """
    try:
        # Get posts where user has made corrections
        corrected_posts = SocialPost.objects.filter(
            user=user,
            sentiment_override=True
        )
        
        if not corrected_posts.exists():
            return None
        
        # Compare original ML predictions with user corrections
        # This is a simplified accuracy calculation
        total_corrections = corrected_posts.count()
        
        # Get original predictions from MLPredictionLog
        accurate_predictions = 0
        for post in corrected_posts:
            try:
                original_prediction = MLPredictionLog.objects.filter(
                    user=user,
                    post=post
                ).order_by('timestamp').first()
                
                if original_prediction:
                    original_data = json.loads(original_prediction.predictions)
                    original_sentiment = original_data.get('sentiment')
                    
                    # If original prediction matches current sentiment, it was accurate
                    if original_sentiment == post.sentiment:
                        accurate_predictions += 1
                        
            except (json.JSONDecodeError, AttributeError):
                continue
        
        accuracy_percentage = (accurate_predictions / total_corrections) * 100 if total_corrections > 0 else 0
        
        return {
            'accuracy_percentage': round(accuracy_percentage, 2),
            'total_corrections': total_corrections,
            'accurate_predictions': accurate_predictions
        }
        
    except Exception as e:
        logger.error(f"Error calculating prediction accuracy: {e}")
        return None 