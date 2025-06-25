"""
API Views Module

Contains all API endpoints for the BrandSensor application.
These endpoints are used by the Chrome extension and external integrations.
"""

import json
import logging
import hashlib
import secrets
import string
from datetime import timedelta
from django.http import JsonResponse, HttpResponse, HttpResponseBadRequest
from django.contrib.auth.models import User
from django.contrib.auth import authenticate
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from django.db.models import Q, Count, Sum, Avg
from django.conf import settings

from ..models import (
    SocialPost, 
    Brand, 
    BehaviorLog, 
    UserPreference,
    APIKey, 
    SocialConnection,
    FilterPreset,
    MLPredictionLog,
    InterpretationLog,
    MLModel
)
from ..decorators import api_key_required
from ..ml_processor import process_post, process_user_posts

logger = logging.getLogger(__name__)

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

@csrf_exempt
@api_key_required
def api_log_behavior(request):
    """
    API endpoint to log user behavior from the Chrome extension
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'Only POST method allowed'}, status=405)
    
    user = get_user_from_api_key(request)
    if not user:
        return JsonResponse({'error': 'Authentication required'}, status=401)
    
    try:
        data = json.loads(request.body)
        
        # Required fields
        action = data.get('action')
        if not action:
            return JsonResponse({'error': 'Action is required'}, status=400)
        
        # Create behavior log entry
        behavior_log = BehaviorLog.objects.create(
            user=user,
            action=action,
            details=json.dumps(data.get('details', {})),
            timestamp=timezone.now()
        )
        
        return JsonResponse({
            'status': 'success',
            'log_id': behavior_log.id,
            'timestamp': behavior_log.timestamp.isoformat()
        })
        
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON data'}, status=400)
    except Exception as e:
        logger.error(f"Error logging behavior: {e}")
        return JsonResponse({'error': 'Internal server error'}, status=500)

@csrf_exempt
def api_log_post(request):
    """
    API endpoint to log social media posts from the Chrome extension
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'Only POST method allowed'}, status=405)
    
    user = get_user_from_api_key(request)
    if not user:
        return JsonResponse({'error': 'Authentication required'}, status=401)
    
    try:
        data = json.loads(request.body)
        
        # Required fields
        required_fields = ['content', 'author', 'platform']
        for field in required_fields:
            if not data.get(field):
                return JsonResponse({'error': f'{field} is required'}, status=400)
        
        # Generate content hash for deduplication
        content_hash = hashlib.sha256(
            f"{data['content']}{data['author']}{data['platform']}".encode()
        ).hexdigest()
        
        # Check if post already exists
        existing_post = SocialPost.objects.filter(
            user=user,
            content_hash=content_hash
        ).first()
        
        if existing_post:
            return JsonResponse({
                'status': 'duplicate',
                'post_id': existing_post.id,
                'message': 'Post already exists'
            })
        
        # Create new post
        post = SocialPost.objects.create(
            user=user,
            content=data['content'],
            author=data['author'],
            platform=data['platform'],
            content_hash=content_hash,
            post_url=data.get('post_url', ''),
            image_url=data.get('image_url', ''),
            timestamp=timezone.now(),
            created_at=timezone.now()
        )
        
        # Try to identify brand from content
        brand = identify_brand_from_content(data['content'])
        if brand:
            post.brand = brand
            post.save()
        
        # Queue for ML processing if enabled
        if settings.ML_PROCESSING_ENABLED:
            try:
                ml_result = process_post(post)
                if ml_result:
                    post.sentiment = ml_result.get('sentiment', 'neutral')
                    post.authenticity_score = ml_result.get('authenticity_score', 0.5)
                    post.save()
            except Exception as e:
                logger.error(f"ML processing failed for post {post.id}: {e}")
        
        return JsonResponse({
            'status': 'success',
            'post_id': post.id,
            'content_hash': content_hash,
            'brand': brand.name if brand else None,
        })
        
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON data'}, status=400)
    except Exception as e:
        logger.error(f"Error logging post: {e}")
        return JsonResponse({'error': 'Internal server error'}, status=500)

def identify_brand_from_content(content):
    """
    Identify brand mentions in content
    """
    if not content:
        return None
    
    content_lower = content.lower()
    
    # Check for exact brand name matches
    for brand in Brand.objects.all():
        if brand.name.lower() in content_lower:
            return brand
        
        # Check brand keywords if they exist
        if hasattr(brand, 'keywords') and brand.keywords:
            keywords = brand.keywords.lower().split(',')
            for keyword in keywords:
                if keyword.strip() in content_lower:
                    return brand
    
    return None

@csrf_exempt
def collect_posts(request):
    """
    API endpoint for bulk post collection from automated systems
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'Only POST method allowed'}, status=405)
    
    user = get_user_from_api_key(request)
    if not user:
        return JsonResponse({'error': 'Authentication required'}, status=401)
    
    try:
        data = json.loads(request.body)
        posts_data = data.get('posts', [])
        
        if not isinstance(posts_data, list):
            return JsonResponse({'error': 'Posts must be a list'}, status=400)
        
        created_posts = []
        duplicate_posts = []
        errors = []
        
        for i, post_data in enumerate(posts_data):
            try:
                # Validate required fields
                required_fields = ['content', 'author', 'platform']
                for field in required_fields:
                    if not post_data.get(field):
                        errors.append(f"Post {i}: {field} is required")
                        continue
                
                # Generate content hash
                content_hash = hashlib.sha256(
                    f"{post_data['content']}{post_data['author']}{post_data['platform']}".encode()
                ).hexdigest()
                
                # Check for duplicates
                if SocialPost.objects.filter(user=user, content_hash=content_hash).exists():
                    duplicate_posts.append(i)
                    continue
                
                # Create post
                post = SocialPost.objects.create(
                    user=user,
                    content=post_data['content'],
                    author=post_data['author'],
                    platform=post_data['platform'],
                    content_hash=content_hash,
                    post_url=post_data.get('post_url', ''),
                    image_url=post_data.get('image_url', ''),
                    timestamp=timezone.now(),
                    created_at=timezone.now()
                )
                
                # Brand identification
                brand = identify_brand_from_content(post_data['content'])
                if brand:
                    post.brand = brand
                    post.save()
                
                created_posts.append({
                    'index': i,
                    'post_id': post.id,
                    'brand': brand.name if brand else None
                })
                
            except Exception as e:
                errors.append(f"Post {i}: {str(e)}")
        
        return JsonResponse({
            'status': 'success',
            'created_posts': len(created_posts),
            'duplicate_posts': len(duplicate_posts),
            'errors': len(errors),
            'details': {
                'created': created_posts,
                'duplicates': duplicate_posts,
                'errors': errors
            }
        })
        
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON data'}, status=400)
    except Exception as e:
        logger.error(f"Error in bulk post collection: {e}")
        return JsonResponse({'error': 'Internal server error'}, status=500)

@csrf_exempt
def post_stats(request):
    """
    API endpoint to get post statistics
    """
    user = get_user_from_api_key(request)
    if not user:
        return JsonResponse({'error': 'Authentication required'}, status=401)
    
    try:
        # Get date range from query params
        days = int(request.GET.get('days', 7))
        cutoff_date = timezone.now() - timedelta(days=days)
        
        # Base queryset
        posts_qs = SocialPost.objects.filter(user=user, created_at__gte=cutoff_date)
        
        # Basic stats
        total_posts = posts_qs.count()
        
        # Platform breakdown
        platform_stats = dict(posts_qs.values_list('platform').annotate(Count('platform')))
        
        # Sentiment analysis
        sentiment_stats = {
            'positive': posts_qs.filter(sentiment='positive').count(),
            'negative': posts_qs.filter(sentiment='negative').count(),
            'neutral': posts_qs.filter(sentiment='neutral').count(),
        }
        
        # Brand mentions
        brand_stats = dict(
            posts_qs.filter(brand__isnull=False)
            .values_list('brand__name')
            .annotate(Count('brand'))
        )
        
        # Authenticity score distribution
        authenticity_stats = posts_qs.aggregate(
            avg_score=Avg('authenticity_score'),
            high_quality=Count('id', filter=Q(authenticity_score__gte=0.8)),
            medium_quality=Count('id', filter=Q(authenticity_score__range=(0.5, 0.8))),
            low_quality=Count('id', filter=Q(authenticity_score__lt=0.5))
        )
        
        return JsonResponse({
            'status': 'success',
            'date_range_days': days,
            'total_posts': total_posts,
            'platform_stats': platform_stats,
            'sentiment_stats': sentiment_stats,
            'brand_stats': brand_stats,
            'authenticity_stats': authenticity_stats
        })
        
    except ValueError:
        return JsonResponse({'error': 'Invalid days parameter'}, status=400)
    except Exception as e:
        logger.error(f"Error getting post stats: {e}")
        return JsonResponse({'error': 'Internal server error'}, status=500)

@csrf_exempt
def feedback(request):
    """
    API endpoint for user feedback collection
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'Only POST method allowed'}, status=405)
    
    user = get_user_from_api_key(request)
    if not user:
        return JsonResponse({'error': 'Authentication required'}, status=401)
    
    try:
        data = json.loads(request.body)
        
        feedback_type = data.get('type')
        message = data.get('message')
        
        if not feedback_type or not message:
            return JsonResponse({'error': 'Type and message are required'}, status=400)
        
        # Log feedback as behavior
        BehaviorLog.objects.create(
            user=user,
            action='feedback',
            details=json.dumps({
                'type': feedback_type,
                'message': message,
                'post_id': data.get('post_id'),
                'rating': data.get('rating'),
            }),
            timestamp=timezone.now()
        )
        
        # If it's feedback about a specific post, update the post
        post_id = data.get('post_id')
        if post_id:
            try:
                post = SocialPost.objects.get(id=post_id, user=user)
                
                # Handle sentiment correction
                if feedback_type == 'sentiment_correction':
                    new_sentiment = data.get('correct_sentiment')
                    if new_sentiment in ['positive', 'negative', 'neutral']:
                        post.sentiment = new_sentiment
                        post.sentiment_override = True
                        post.save()
                
                # Handle brand correction
                elif feedback_type == 'brand_correction':
                    brand_id = data.get('correct_brand_id')
                    if brand_id:
                        try:
                            brand = Brand.objects.get(id=brand_id)
                            post.brand = brand
                            post.brand_override = True
                            post.save()
                        except Brand.DoesNotExist:
                            pass
                
            except SocialPost.DoesNotExist:
                pass
        
        return JsonResponse({
            'status': 'success',
            'message': 'Feedback received successfully'
        })
        
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON data'}, status=400)
    except Exception as e:
        logger.error(f"Error processing feedback: {e}")
        return JsonResponse({'error': 'Internal server error'}, status=500)

@csrf_exempt
def api_health_check(request):
    """
    API health check endpoint
    """
    try:
        # Basic health checks
        db_status = 'ok'
        try:
            User.objects.count()
        except Exception:
            db_status = 'error'
        
        return JsonResponse({
            'status': 'healthy',
            'timestamp': timezone.now().isoformat(),
            'database': db_status,
            'version': getattr(settings, 'VERSION', '1.0.0')
        })
        
    except Exception as e:
        logger.error(f"Health check error: {e}")
        return JsonResponse({
            'status': 'error',
            'error': str(e)
        }, status=500)

@csrf_exempt
def verify_api_key(request):
    """
    API endpoint to verify API key validity
    """
    user = get_user_from_api_key(request)
    
    if not user:
        return JsonResponse({
            'valid': False,
            'error': 'Invalid or missing API key'
        }, status=401)
    
    try:
        api_key = request.headers.get('X-API-Key') or request.GET.get('api_key')
        key_obj = APIKey.objects.get(key=api_key, is_active=True)
        
        return JsonResponse({
            'valid': True,
            'user_id': user.id,
            'username': user.username,
            'key_name': key_obj.name,
            'created_at': key_obj.created_at.isoformat(),
            'last_used': key_obj.last_used.isoformat() if key_obj.last_used else None
        })
        
    except APIKey.DoesNotExist:
        return JsonResponse({
            'valid': False,
            'error': 'API key not found'
        }, status=401)
    except Exception as e:
        logger.error(f"Error verifying API key: {e}")
        return JsonResponse({
            'valid': False,
            'error': 'Internal server error'
        }, status=500)

@csrf_exempt
def api_process_ml(request):
    """
    API endpoint to trigger ML processing for posts
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'Only POST method allowed'}, status=405)
    
    user = get_user_from_api_key(request)
    if not user:
        return JsonResponse({'error': 'Authentication required'}, status=401)
    
    try:
        data = json.loads(request.body)
        
        # Get post IDs to process
        post_ids = data.get('post_ids', [])
        if not isinstance(post_ids, list):
            return JsonResponse({'error': 'post_ids must be a list'}, status=400)
        
        # Process specified posts or all user posts if none specified
        if post_ids:
            posts = SocialPost.objects.filter(id__in=post_ids, user=user)
        else:
            posts = SocialPost.objects.filter(user=user)
        
        processed_count = 0
        errors = []
        
        for post in posts:
            try:
                ml_result = process_post(post)
                if ml_result:
                    post.sentiment = ml_result.get('sentiment', post.sentiment)
                    post.authenticity_score = ml_result.get('authenticity_score', post.authenticity_score)
                    post.save()
                    processed_count += 1
                    
                    # Log ML processing
                    MLPredictionLog.objects.create(
                        user=user,
                        post=post,
                        model_used='default',
                        predictions=json.dumps(ml_result),
                        confidence_scores=json.dumps(ml_result.get('confidence', {})),
                        timestamp=timezone.now()
                    )
                    
            except Exception as e:
                errors.append(f"Post {post.id}: {str(e)}")
        
        return JsonResponse({
            'status': 'success',
            'processed_posts': processed_count,
            'total_posts': posts.count(),
            'errors': errors
        })
        
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON data'}, status=400)
    except Exception as e:
        logger.error(f"Error in ML processing API: {e}")
        return JsonResponse({'error': 'Internal server error'}, status=500) 