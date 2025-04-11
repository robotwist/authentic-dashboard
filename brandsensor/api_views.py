from rest_framework import viewsets, permissions, status
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.response import Response
from rest_framework.views import APIView
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from django.db.utils import IntegrityError
import json
import time
import hashlib
import logging

from .models import SocialPost, UserPreference, Brand, BehaviorLog, APIKey, FilterPreset, MLPredictionLog, SocialConnection
from .api_serializers import (
    SocialPostSerializer, BrandSerializer, BehaviorLogSerializer,
    APIKeySerializer, UserPreferenceSerializer, FilterPresetSerializer,
    MLPredictionLogSerializer
)
from .ml_processor import process_post, process_user_posts, analyze_sentiment
from .decorators import api_key_required
from django.contrib.auth.models import User
from .auth import APIKeyAuthentication

logger = logging.getLogger(__name__)

# Custom authentication for API key is now imported from auth.py
# The rest of the file remains unchanged

# ViewSets for REST Framework
class SocialPostViewSet(viewsets.ModelViewSet):
    """API endpoint for social posts"""
    serializer_class = SocialPostSerializer
    authentication_classes = [APIKeyAuthentication]
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """Only show posts for the authenticated user"""
        return SocialPost.objects.filter(user=self.request.user).order_by('-created_at')
    
    def perform_create(self, serializer):
        """Set the user when creating a post"""
        post = serializer.save(user=self.request.user)
        # Process the post with ML after creation
        process_post(post)
        return post

class UserPreferenceViewSet(viewsets.ModelViewSet):
    """API endpoint for user preferences"""
    serializer_class = UserPreferenceSerializer
    authentication_classes = [APIKeyAuthentication]
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """Only show preferences for the authenticated user"""
        return UserPreference.objects.filter(user=self.request.user)

class FilterPresetViewSet(viewsets.ModelViewSet):
    """API endpoint for filter presets"""
    serializer_class = FilterPresetSerializer
    authentication_classes = [APIKeyAuthentication]
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """Only show presets for the authenticated user"""
        return FilterPreset.objects.filter(user=self.request.user)
    
    def perform_create(self, serializer):
        """Set the user when creating a preset"""
        serializer.save(user=self.request.user)

# Legacy API functions now refactored to use REST Framework where appropriate
@api_view(['POST'])
@authentication_classes([APIKeyAuthentication])
@permission_classes([permissions.IsAuthenticated])
def log_behavior(request):
    """
    Accepts POST requests with behavior log data from the Chrome extension.
    """
    try:
        data = request.data
        user = request.user
        brand_name = data.get("brand", "")
        brand_domain = data.get("domain", "")
        behavior_type = data.get("behavior_type")
        count = data.get("count", 1)

        if not brand_domain or not behavior_type:
            return Response({"error": "Missing required fields"}, status=status.HTTP_400_BAD_REQUEST)

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

        return Response({"status": "logged"})
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
@authentication_classes([APIKeyAuthentication])
@permission_classes([permissions.IsAuthenticated])
def log_post(request):
    """
    Accepts POST requests with social post data scraped by the Chrome extension.
    """
    logger.info("Received request at /api/post/")
    try:
        user = request.user
        data = request.data

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
            return Response({"status": "duplicate post, skipped"})
        
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
        serializer = SocialPostSerializer(data={
            "content": content,
            "platform": platform,
            "original_user": original_user,
            "is_friend": data.get("is_friend", False),
            "is_family": is_family,
            "category": data.get("category", ""),
            "verified": data.get("verified", False),
            "image_urls": data.get("image_urls", ""),
            "collected_at": timezone.now().isoformat(),
            "likes": data.get("likes", 0),
            "comments": data.get("comments", 0),
            "shares": data.get("shares", 0),
            "timestamp": data.get("timestamp", ""),
            "hashtags": data.get("hashtags", ""),
            "mentions": data.get("mentions", ""),
            "external_links": data.get("external_links", ""),
            "is_sponsored": data.get("is_sponsored", False),
            "is_job_post": data.get("is_job_post", False),
            "content_length": data.get("content_length", 0),
            "connection_degree": data.get("connection_degree"),
            "bizfluencer_score": data.get("bizfluencer_score", 0),
            "sentiment_score": data.get("sentiment_score"),
            "sentiment_indicators": data.get("sentiment_indicators", "")
        })
        
        if serializer.is_valid():
            post = serializer.save(user=user)
            
            # Run ML processing on the post
            process_post(post)
            
            logger.info("Post saved and processed successfully")
            return Response({"status": "post saved and processed"})
        else:
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        logger.error(f"Error in log_post: {str(e)}")
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
@authentication_classes([APIKeyAuthentication])
@permission_classes([permissions.IsAuthenticated])
def collect_posts(request):
    """
    API endpoint to collect social media posts from browser extension
    """
    logger.info("collect_posts endpoint called")
    
    try:
        data = request.data
        logger.info(f"Received data: platform={data.get('platform')}, posts count={len(data.get('posts', []))}")
        
        posts = data.get('posts', [])
        platform = data.get('platform')
        
        if not platform or not posts:
            logger.warning("Missing platform or posts data")
            return Response({'status': 'error', 'message': 'Missing platform or posts data'}, status=status.HTTP_400_BAD_REQUEST)
        
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
                    user=request.user, 
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
                        serializer = SocialPostSerializer(data={
                            "platform": platform,
                            "platform_id": platform_id,
                            "content_hash": content_hash,
                            "content": content,
                            "original_user": post_data.get('original_user', ''),
                            "engagement_count": post_data.get('engagement_count', 0),
                            "is_sponsored": post_data.get('is_sponsored', False),
                            "verified": post_data.get('verified', False),
                            "timestamp": post_data.get('timestamp'),
                            "is_friend": post_data.get('is_friend', False),
                            "is_family": post_data.get('is_family', False),
                            "collected_at": timezone.now().isoformat()
                        })
                        
                        if serializer.is_valid():
                            serializer.save(user=request.user)
                            new_count += 1
                            logger.info(f"New post created successfully")
                        else:
                            logger.error(f"Serializer validation error: {serializer.errors}")
                            error_count += 1
                    except IntegrityError as e:
                        # This handles the rare case where a duplicate was created between our check and save
                        logger.warning(f"IntegrityError: {str(e)}")
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
            user=request.user,
            behavior_type='collect_posts',
            platform=platform,
            count=new_count + updated_count,
            details=activity_details
        )
        
        # Process ML for new posts in the background
        if new_count > 0:
            process_user_posts(request.user.id, limit=50)
        
        return Response({
            'status': 'success',
            'message': activity_details,
            'new': new_count,
            'updated': updated_count,
            'duplicates': duplicate_count,
            'errors': error_count
        })
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        return Response({'status': 'error', 'message': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET'])
@authentication_classes([APIKeyAuthentication])
@permission_classes([permissions.IsAuthenticated])
def post_stats(request):
    """
    API endpoint to get statistics for the current user's posts
    """
    from django.core.cache import cache
    from django.db.models import Count
    
    # Generate cache key based on user
    from .dashboard_views import user_cache_key
    cache_key = user_cache_key(request.user.id, 'post_stats')
    
    # Try to get cached data
    cached_data = cache.get(cache_key)
    if cached_data:
        return Response({
            'status': 'success',
            'stats': cached_data,
            'cached': True
        })
    
    try:
        # Get counts
        total_posts = SocialPost.objects.filter(user=request.user).count()
        sponsored_count = SocialPost.objects.filter(user=request.user, is_sponsored=True).count()
        friend_count = SocialPost.objects.filter(user=request.user, is_friend=True).count()
        family_count = SocialPost.objects.filter(user=request.user, is_family=True).count()
        
        # Get platform distribution
        platform_stats = SocialPost.objects.filter(user=request.user).values('platform').annotate(count=Count('id'))
        
        # Get ML stats
        ml_processed = SocialPost.objects.filter(user=request.user, automated_category__isnull=False).count()
        
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
        from django.conf import settings
        cache.set(cache_key, stats_data, getattr(settings, 'CACHE_TTL_SHORT', 600))
        
        return Response({
            'status': 'success',
            'stats': stats_data
        })
    except Exception as e:
        return Response({'status': 'error', 'message': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
@authentication_classes([APIKeyAuthentication])
@permission_classes([permissions.IsAuthenticated])
def feedback(request):
    """
    API endpoint to collect user feedback on posts and ML predictions
    """
    try:
        data = request.data
        post_id = data.get('post_id')
        feedback_type = data.get('feedback_type')
        feedback_value = data.get('feedback_value')
        
        if not post_id or not feedback_type:
            return Response({'status': 'error', 'message': 'Missing required parameters'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Find post
        try:
            post = SocialPost.objects.get(platform_id=post_id, user=request.user)
        except SocialPost.DoesNotExist:
            return Response({'status': 'error', 'message': 'Post not found'}, status=status.HTTP_404_NOT_FOUND)
        
        # Handle different feedback types
        if feedback_type == 'category':
            # User is correcting the category
            post.user_category = feedback_value
            post.save()
            
            # Log the ML prediction correction
            MLPredictionLog.objects.create(
                user=request.user,
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
                    user=request.user,
                    post=post,
                    original_prediction=str(post.sentiment_score),
                    user_correction=str(sentiment_value),
                    feedback_type='sentiment_correction'
                )
            except ValueError:
                return Response({'status': 'error', 'message': 'Invalid sentiment value'}, status=status.HTTP_400_BAD_REQUEST)
                
        elif feedback_type == 'relevance':
            # User is rating relevance
            try:
                relevance_value = int(feedback_value)
                post.relevance_score = relevance_value
                post.save()
            except ValueError:
                return Response({'status': 'error', 'message': 'Invalid relevance value'}, status=status.HTTP_400_BAD_REQUEST)
                
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
            user=request.user,
            action=f'feedback_{feedback_type}',
            platform=post.platform,
            details=f"Provided {feedback_type} feedback for post {post_id}"
        )
        
        return Response({
            'status': 'success',
            'message': f'Feedback recorded successfully for {feedback_type}'
        })
        
    except Exception as e:
        return Response({'status': 'error', 'message': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET'])
@authentication_classes([])  # Empty list means no authentication required
@permission_classes([])      # Empty list means no permissions required
def api_health_check(request):
    """
    Simple health check endpoint to verify API is up and running.
    This endpoint is intentionally open (no auth) to allow connectivity checks.
    """
    return Response({
        'status': 'ok',
        'message': 'API is operational',
        'version': '1.0'
    })

@api_view(['GET'])
@authentication_classes([APIKeyAuthentication])
def verify_api_key(request):
    """
    API endpoint to verify if an API key is valid.
    Used by the Chrome extension for troubleshooting.
    """
    # If request made it past authentication, the key is valid
    if request.user.is_authenticated:
        return Response({
            'status': 'ok',
            'valid': True,
            'user': request.user.username,
            'created': request.auth.created_at.isoformat() if hasattr(request, 'auth') and hasattr(request.auth, 'created_at') else None,
            'last_used': request.auth.last_used.isoformat() if hasattr(request, 'auth') and hasattr(request.auth, 'last_used') else None
        })
    else:
        return Response({
            'status': 'error',
            'valid': False,
            'message': 'Invalid or inactive API key'
        }, status=status.HTTP_401_UNAUTHORIZED)

@api_view(['POST'])
@authentication_classes([APIKeyAuthentication])
@permission_classes([permissions.IsAuthenticated])
def process_ml(request):
    """
    API endpoint for ML processing that accepts API key auth
    """
    # Process data from the request
    try:
        data = request.data
        
        # Log the incoming data for debugging
        logger.info(f"Processing ML data for platform: {data.get('platform', 'unknown')}")
        
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
        return Response(results)
    except Exception as e:
        logger.error(f"Error in api_process_ml: {str(e)}")
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
