from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.db.models import Q
import logging

from .models import SocialPost, SocialConnection, BehaviorLog, MLPredictionLog
from .ml_processor import process_post

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
