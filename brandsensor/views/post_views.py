from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.db.models import Q
from django.contrib import messages
import logging
from django.db.utils import IntegrityError

from ..models import SocialPost, SocialConnection, BehaviorLog, MLPredictionLog
from ..ml_processor import process_post

logger = logging.getLogger(__name__)

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
def post_action(request, post_id):
    """
    Handle post actions like hide, rate, mark as friend, etc.
    """
    post = get_object_or_404(SocialPost, id=post_id, user=request.user)
    
    if request.method == "POST":
        action = request.POST.get("action")
        post_modified = False
        
        if action == "hide":
            post.hidden = True
            post_modified = True
            
            # Check if user wants to hide similar posts
            hide_similar = request.POST.get('hide_similar') == 'true'
            
            if hide_similar:
                # Build filter for similar posts
                similar_filter = Q()
                
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
                    hidden=False
                ).filter(similar_filter).exclude(id=post.id)
                
                # Limit the number of similar posts to hide
                similar_count = similar_posts.count()
                max_to_hide = 10
                
                if similar_count > 0:
                    similar_post_ids = list(similar_posts[:max_to_hide].values_list('id', flat=True))
                    hidden_count = SocialPost.objects.filter(id__in=similar_post_ids).update(hidden=True)
                    
                    # Log the bulk hiding action
                    BehaviorLog.objects.create(
                        user=request.user,
                        behavior_type='feedback_hide_similar',
                        platform=post.platform,
                        count=hidden_count,
                        details=f"Hidden {hidden_count} similar posts to {post_id}"
                    )
                    
                    if request.headers.get('X-Requested-With') != 'XMLHttpRequest':
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
                post_modified = True
                
                # Log the rating action
                BehaviorLog.objects.create(
                    user=request.user,
                    behavior_type='feedback_rate',
                    platform=post.platform,
                    details=f"Rated {post.platform} post: {rating}/5"
                )
                
        elif action == "mark_friend":
            # Mark the original user as a friend
            if post.original_user and post.original_user != "unknown":
                try:
                    # Get or create user preferences
                    from ..models import UserPreference
                    preferences, created = UserPreference.objects.get_or_create(user=request.user)
                    
                    # Add to friends list
                    current_friends = preferences.friends_list or ""
                    friends_list = [f.strip().lower() for f in current_friends.split(',') if f.strip()]
                    
                    username = post.original_user.lower()
                    if username not in friends_list:
                        friends_list.append(username)
                        preferences.friends_list = ', '.join(friends_list)
                        preferences.save()
                        
                        # Log the friend marking action
                        BehaviorLog.objects.create(
                            user=request.user,
                            behavior_type='mark_friend',
                            platform=post.platform,
                            details=f"Marked {post.original_user} as friend"
                        )
                        
                        if request.headers.get('X-Requested-With') != 'XMLHttpRequest':
                            messages.success(request, f"Marked {post.original_user} as a friend.")
                            
                except Exception as e:
                    logger.error(f"Error marking friend: {str(e)}")
                    
        elif action == "feedback":
            # Handle ML feedback
            feedback_type = request.POST.get('feedback_type')
            feedback_value = request.POST.get('feedback_value')
            
            if feedback_type and feedback_value:
                try:
                    # Log the feedback
                    MLPredictionLog.objects.create(
                        user=request.user,
                        post=post,
                        original_prediction=getattr(post, feedback_type, ''),
                        user_correction=feedback_value,
                        feedback_type=f'{feedback_type}_correction'
                    )
                    
                    # Update the post with user feedback
                    if feedback_type == 'category':
                        post.user_category = feedback_value
                    elif feedback_type == 'sentiment':
                        try:
                            post.user_sentiment = float(feedback_value)
                        except ValueError:
                            pass
                    
                    post_modified = True
                    
                except Exception as e:
                    logger.error(f"Error processing feedback: {str(e)}")
        
        # Save post if modified
        if post_modified:
            try:
                post.save()
            except Exception as e:
                logger.error(f"Error saving post: {str(e)}")
        
        # Return JSON response for AJAX requests
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return JsonResponse({
                'status': 'success',
                'action': action,
                'post_id': post_id
            })
        
        # Redirect for regular requests
        return redirect('dashboard')
    
    return JsonResponse({'error': 'Only POST allowed'}, status=405)

@login_required
def mark_family(request, username, platform):
    """
    Mark a user as family/friend across all their posts
    """
    if request.method == "POST":
        try:
            # Get user preferences
            from ..models import UserPreference
            preferences, created = UserPreference.objects.get_or_create(user=request.user)
            
            # Add to friends list
            current_friends = preferences.friends_list or ""
            friends_list = [f.strip().lower() for f in current_friends.split(',') if f.strip()]
            
            username_lower = username.lower()
            if username_lower not in friends_list:
                friends_list.append(username_lower)
                preferences.friends_list = ', '.join(friends_list)
                preferences.save()
                
                # Log the action
                BehaviorLog.objects.create(
                    user=request.user,
                    behavior_type='mark_family',
                    platform=platform,
                    details=f"Marked {username} as family/friend"
                )
                
                # Update all posts from this user to show as friend posts
                updated_count = SocialPost.objects.filter(
                    user=request.user,
                    original_user__iexact=username
                ).update(is_friend=True)
                
                messages.success(request, f"Marked {username} as family/friend. Updated {updated_count} posts.")
            else:
                messages.info(request, f"{username} is already in your friends list.")
                
        except Exception as e:
            logger.error(f"Error marking family: {str(e)}")
            messages.error(request, "Error updating friend status.")
    
    return redirect('dashboard') 