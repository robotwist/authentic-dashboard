"""
Post Views Module

Contains all post-related views for the BrandSensor application.
"""

import json
import logging
import re
from collections import Counter
from django.shortcuts import render, redirect, get_object_or_404
from django.http import JsonResponse, HttpResponse
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.utils import timezone
from django.db.models import Q
from django.conf import settings

from ..models import (
    SocialPost, 
    Brand, 
    BehaviorLog, 
    UserPreference,
    SocialConnection
)

logger = logging.getLogger(__name__)

@login_required
def post_detail(request, post_id):
    """
    View detailed information about a specific post
    """
    user = request.user
    post = get_object_or_404(SocialPost, id=post_id, user=user)
    
    # Log behavior for viewing post details
    BehaviorLog.objects.create(
        user=user,
        action='view_post_detail',
        post=post,
        timestamp=timezone.now()
    )
    
    context = {
        'post': post,
        'user': user,
    }
    
    return render(request, 'brandsensor/post_detail.html', context)

@login_required
def mark_family(request, username, platform):
    """
    Mark a user/account as family/friend to reduce false positives
    """
    user = request.user
    
    if request.method == 'POST':
        # Mark all posts from this user as family
        posts_updated = SocialPost.objects.filter(
            user=user,
            author=username,
            platform=platform
        ).update(is_family=True)
        
        # Log the action
        BehaviorLog.objects.create(
            user=user,
            action='mark_family',
            details=json.dumps({
                'username': username,
                'platform': platform,
                'posts_updated': posts_updated
            }),
            timestamp=timezone.now()
        )
        
        messages.success(
            request, 
            f"Marked {posts_updated} posts from {username} on {platform} as family/friends"
        )
        
        return JsonResponse({
            'status': 'success',
            'posts_updated': posts_updated,
            'message': f"Marked {posts_updated} posts as family/friends"
        })
    
    return JsonResponse({
        'status': 'error',
        'message': 'Invalid request method'
    })

@login_required
def post_action(request, post_id):
    """
    Handle various actions on posts (like, unlike, flag, etc.)
    """
    user = request.user
    post = get_object_or_404(SocialPost, id=post_id, user=user)
    
    if request.method == 'POST':
        action = request.POST.get('action')
        
        if action == 'flag':
            # Flag post as inappropriate
            post.is_flagged = True
            post.flag_reason = request.POST.get('reason', 'User flagged')
            post.save()
            
            # Log the action
            BehaviorLog.objects.create(
                user=user,
                action='flag_post',
                post=post,
                details=json.dumps({
                    'reason': post.flag_reason
                }),
                timestamp=timezone.now()
            )
            
            return JsonResponse({
                'status': 'success',
                'message': 'Post flagged successfully'
            })
        
        elif action == 'unflag':
            # Remove flag from post
            post.is_flagged = False
            post.flag_reason = None
            post.save()
            
            # Log the action
            BehaviorLog.objects.create(
                user=user,
                action='unflag_post',
                post=post,
                timestamp=timezone.now()
            )
            
            return JsonResponse({
                'status': 'success',
                'message': 'Post unflagged successfully'
            })
        
        elif action == 'hide':
            # Hide post from feed
            post.is_hidden = True
            post.save()
            
            # Log the action
            BehaviorLog.objects.create(
                user=user,
                action='hide_post',
                post=post,
                timestamp=timezone.now()
            )
            
            return JsonResponse({
                'status': 'success',
                'message': 'Post hidden from feed'
            })
        
        elif action == 'show':
            # Show post in feed
            post.is_hidden = False
            post.save()
            
            # Log the action
            BehaviorLog.objects.create(
                user=user,
                action='show_post',
                post=post,
                timestamp=timezone.now()
            )
            
            return JsonResponse({
                'status': 'success',
                'message': 'Post restored to feed'
            })
        
        elif action == 'set_sentiment':
            # Manual sentiment override
            sentiment = request.POST.get('sentiment')
            if sentiment in ['positive', 'negative', 'neutral']:
                post.sentiment = sentiment
                post.sentiment_override = True
                post.save()
                
                # Log the action
                BehaviorLog.objects.create(
                    user=user,
                    action='set_sentiment',
                    post=post,
                    details=json.dumps({
                        'sentiment': sentiment
                    }),
                    timestamp=timezone.now()
                )
                
                return JsonResponse({
                    'status': 'success',
                    'message': f'Sentiment set to {sentiment}'
                })
        
        elif action == 'set_brand':
            # Manual brand assignment
            brand_id = request.POST.get('brand_id')
            if brand_id:
                try:
                    brand = Brand.objects.get(id=brand_id)
                    post.brand = brand
                    post.brand_override = True
                    post.save()
                    
                    # Log the action
                    BehaviorLog.objects.create(
                        user=user,
                        action='set_brand',
                        post=post,
                        details=json.dumps({
                            'brand_id': brand_id,
                            'brand_name': brand.name
                        }),
                        timestamp=timezone.now()
                    )
                    
                    return JsonResponse({
                        'status': 'success',
                        'message': f'Brand set to {brand.name}'
                    })
                except Brand.DoesNotExist:
                    return JsonResponse({
                        'status': 'error',
                        'message': 'Brand not found'
                    })
    
    return JsonResponse({
        'status': 'error',
        'message': 'Invalid action'
    })

def extract_key_terms(text, max_terms=5):
    """
    Extract key terms from text for analysis
    """
    if not text:
        return []
    
    # Simple keyword extraction (could be enhanced with NLP)
    words = re.findall(r'\w+', text.lower())
    
    # Filter out common stop words
    stop_words = {
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
        'before', 'after', 'above', 'below', 'between', 'among', 'this', 'that',
        'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me',
        'him', 'her', 'us', 'them', 'my', 'your', 'his', 'her', 'its', 'our',
        'their', 'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
        'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
        'should', 'may', 'might', 'must', 'can', 'cant', 'wont', 'dont',
        'didnt', 'isnt', 'arent', 'wasnt', 'werent', 'hasnt', 'havent',
        'hadnt', 'wouldnt', 'couldnt', 'shouldnt'
    }
    
    # Filter out stop words and short words
    filtered_words = [word for word in words if len(word) > 2 and word not in stop_words]
    
    # Count word frequency
    word_counts = Counter(filtered_words)
    
    # Return top terms
    return [word for word, count in word_counts.most_common(max_terms)]

@login_required 
def pure_feed(request):
    """
    Show a clean, distraction-free feed of posts
    """
    user = request.user
    
    # Get user preferences
    try:
        preferences = UserPreference.objects.get(user=user)
    except UserPreference.DoesNotExist:
        preferences = UserPreference.objects.create(user=user)
    
    # Base query for posts
    posts_qs = SocialPost.objects.filter(user=user, is_hidden=False)
    
    # Apply user preferences for content filtering
    if preferences.filter_inappropriate_content:
        posts_qs = posts_qs.filter(is_flagged=False)
    
    if preferences.filter_low_quality_content:
        posts_qs = posts_qs.filter(authenticity_score__gte=0.5)
    
    # Apply brand filtering if user has approved brands
    approved_brands = preferences.approved_brands.all()
    if approved_brands.exists():
        posts_qs = posts_qs.filter(
            Q(brand__in=approved_brands) | Q(brand__isnull=True)
        )
    
    # Handle search and filtering
    search_query = request.GET.get('search', '').strip()
    if search_query:
        posts_qs = posts_qs.filter(
            Q(content__icontains=search_query) |
            Q(author__icontains=search_query) |
            Q(brand__name__icontains=search_query)
        )
    
    # Sentiment filter
    sentiment_filter = request.GET.get('sentiment')
    if sentiment_filter and sentiment_filter != 'all':
        posts_qs = posts_qs.filter(sentiment=sentiment_filter)
    
    # Platform filter
    platform_filter = request.GET.get('platform')
    if platform_filter and platform_filter != 'all':
        posts_qs = posts_qs.filter(platform=platform_filter)
    
    # Date range filter
    date_range = request.GET.get('date_range', '7')  # Default 7 days
    if date_range != 'all':
        try:
            days = int(date_range)
            cutoff_date = timezone.now() - timezone.timedelta(days=days)
            posts_qs = posts_qs.filter(created_at__gte=cutoff_date)
        except ValueError:
            pass
    
    # Order by created_at (newest first)
    posts_qs = posts_qs.order_by('-created_at')
    
    # Pagination
    from django.core.paginator import Paginator
    paginator = Paginator(posts_qs, 25)  # Show 25 posts per page
    page_number = request.GET.get('page')
    page_obj = paginator.get_page(page_number)
    
    # Get filter options for the UI
    platforms = SocialPost.objects.filter(user=user).values_list('platform', flat=True).distinct()
    brands = Brand.objects.all().order_by('name')
    
    context = {
        'page_obj': page_obj,
        'posts': page_obj.object_list,
        'user': user,
        'preferences': preferences,
        'platforms': platforms,
        'brands': brands,
        'search_query': search_query,
        'sentiment_filter': sentiment_filter,
        'platform_filter': platform_filter,
        'date_range': date_range,
    }
    
    return render(request, 'brandsensor/pure_feed.html', context) 