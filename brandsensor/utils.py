from .models import UserPreference, APIKey, SocialPost
from django.db.models import Count, Q, F
from django.utils.timezone import now
import datetime

def get_user_data(user):
    """
    Fetch user preferences, API keys, post count, platform statistics, and user ratings.
    Calculate a composite score for posts based on user ratings and engagement metrics.
    Incorporate user preferences into filtering logic and adjust composite score to prioritize user-defined preferences.
    """
    preferences, _ = UserPreference.objects.get_or_create(user=user)
    api_keys = APIKey.objects.filter(user=user)
    post_count = SocialPost.objects.filter(user=user).count()
    platform_stats = SocialPost.objects.filter(user=user).values('platform').annotate(count=Count('id'))

    # Exclude duplicate posts based on content_hash
    unique_posts = SocialPost.objects.filter(user=user).distinct('content_hash')

    # Fetch user ratings and sort posts by rating
    rated_posts = SocialPost.objects.filter(user=user).order_by('-rating')

    # Filter posts based on user preferences
    filtered_posts = SocialPost.objects.filter(user=user)

    if preferences.interest_filter:
        interests = [interest.strip() for interest in preferences.interest_filter.split(',')]
        interest_query = Q()
        for interest in interests:
            if interest:
                interest_query |= (
                    Q(content__icontains=interest) |
                    Q(category__icontains=interest) |
                    Q(hashtags__icontains=interest)
                )
        filtered_posts = filtered_posts.filter(interest_query)

    if preferences.favorite_hashtags:
        hashtags = [hashtag.strip() for hashtag in preferences.favorite_hashtags.split(',')]
        hashtag_query = Q()
        for hashtag in hashtags:
            if hashtag:
                hashtag_query |= Q(hashtags__icontains=hashtag)
        filtered_posts = filtered_posts.filter(hashtag_query)

    if preferences.approved_brands:
        approved_brands = [brand.strip().lower() for brand in preferences.approved_brands.split(',')]
        brand_query = Q()
        for brand in approved_brands:
            if brand:
                brand_query |= Q(original_user__icontains=brand)
        filtered_posts = filtered_posts.filter(brand_query)

    # Adjust composite score to prioritize user preferences
    scored_posts = filtered_posts.annotate(
        composite_score=(
            F('rating') * 0.6 +  # Increase weight for user rating
            F('likes') * 0.2 +
            F('comments') * 0.1 +
            F('shares') * 0.1
        )
    ).order_by('-composite_score')

    today = now().date()
    start_of_week = today - datetime.timedelta(days=today.weekday())

    today_posts = SocialPost.objects.filter(user=user, created_at__date=today).count()
    this_week_posts = SocialPost.objects.filter(user=user, created_at__date__gte=start_of_week).count()

    return {
        "preferences": preferences,
        "api_keys": api_keys,
        "post_count": post_count,
        "platform_stats": platform_stats,
        "unique_posts": unique_posts,
        "rated_posts": rated_posts,  # Updated to remove invalid annotation
        "filtered_posts": filtered_posts,
        "scored_posts": scored_posts,
        "today_posts": today_posts,
        "this_week_posts": this_week_posts,
    }

def process_image_analysis(posts):
    """
    Process image analysis data from a queryset of social posts.
    Returns statistics about image content, such as objects detected, aesthetics scores, and more.
    
    Args:
        posts: A queryset of SocialPost objects
    
    Returns:
        dict: A dictionary containing image analysis statistics
    """
    import json
    
    # Initialize counters
    total_images = 0
    posts_with_images = 0
    posts_with_analysis = 0
    object_counts = {}
    face_count = 0
    posts_with_faces = 0
    aesthetic_scores = []
    captions = []
    
    # Collect analysis data
    for post in posts:
        if not post.image_urls:
            continue
            
        # Count images
        image_urls = post.image_urls.split(',')
        num_images = len([url for url in image_urls if url.strip()])
        total_images += num_images
        
        if num_images > 0:
            posts_with_images += 1
        
        # Process image analysis JSON if field exists
        # Use hasattr to check if the field exists, in case migration hasn't run
        if hasattr(post, 'image_analysis') and post.image_analysis:
            try:
                analysis = json.loads(post.image_analysis)
                posts_with_analysis += 1
                
                # Extract objects
                if 'objects' in analysis:
                    for obj in analysis['objects']:
                        object_name = obj.get('name', 'unknown')
                        object_counts[object_name] = object_counts.get(object_name, 0) + 1
                
                # Count faces
                if 'faces' in analysis:
                    num_faces = len(analysis['faces'])
                    face_count += num_faces
                    if num_faces > 0:
                        posts_with_faces += 1
                
                # Collect aesthetics scores
                if 'aesthetics' in analysis and isinstance(analysis['aesthetics'], (int, float)):
                    aesthetic_scores.append(analysis['aesthetics'])
                
                # Collect captions
                if 'caption' in analysis and analysis['caption']:
                    captions.append(analysis['caption'])
            except (json.JSONDecodeError, TypeError):
                # Skip posts with invalid JSON
                continue
    
    # Calculate averages and prepare results
    avg_aesthetic_score = sum(aesthetic_scores) / len(aesthetic_scores) if aesthetic_scores else 0
    top_objects = sorted(object_counts.items(), key=lambda x: x[1], reverse=True)[:10]
    
    return {
        'total_images': total_images,
        'posts_with_images': posts_with_images,
        'posts_with_analysis': posts_with_analysis,
        'top_objects': top_objects,
        'face_count': face_count,
        'posts_with_faces': posts_with_faces,
        'avg_aesthetic_score': avg_aesthetic_score,
        'captions_sample': captions[:5]  # Show just a sample of captions
    }

def analyze_post_images(post):
    """
    Analyzes images from a social post and updates the image_analysis field.
    This is a sample implementation that generates mock image analysis data.
    In a real implementation, this would call computer vision APIs.
    
    Args:
        post: A SocialPost object
    
    Returns:
        bool: True if analysis was successful, False otherwise
    """
    import json
    import random
    
    if not post.image_urls:
        return False
    
    # Check if the image_analysis field exists
    if not hasattr(post, 'image_analysis'):
        return False
    
    # Parse image URLs
    image_urls = [url.strip() for url in post.image_urls.split(',') if url.strip()]
    if not image_urls:
        return False
    
    # Generate mock analysis data
    # In a real implementation, this would call computer vision APIs
    analysis = {
        'caption': f"A {random.choice(['beautiful', 'colorful', 'interesting', 'stunning'])} {random.choice(['photo', 'image', 'picture'])} of {random.choice(['nature', 'people', 'landscape', 'product', 'food'])}",
        'objects': [
            {'name': random.choice(['person', 'tree', 'car', 'building', 'water', 'sky', 'cat', 'dog', 'food', 'flower']), 'confidence': random.uniform(0.7, 0.99)}
            for _ in range(random.randint(1, 5))
        ],
        'faces': [
            {'age': random.randint(20, 60), 'gender': random.choice(['male', 'female']), 'emotion': random.choice(['happy', 'neutral', 'serious'])}
            for _ in range(random.randint(0, 2))
        ],
        'aesthetics': random.uniform(3.0, 9.0),
        'dominant_colors': [
            {'color': color, 'percentage': random.uniform(0.1, 0.5)} 
            for color in random.sample(['red', 'blue', 'green', 'yellow', 'black', 'white', 'purple', 'orange'], k=3)
        ],
        'safe_search': {
            'adult': random.uniform(0, 0.1),
            'spoof': random.uniform(0, 0.1),
            'medical': random.uniform(0, 0.1),
            'violence': random.uniform(0, 0.1)
        },
        'text_detection': random.choice([[], ['Sample text'], ['LOGO'], ['#hashtag']])
    }
    
    # Save analysis to post
    post.image_analysis = json.dumps(analysis)
    post.save(update_fields=['image_analysis'])
    
    return True

def analyze_all_post_images(user_id, limit=100):
    """
    Batch process images for a user's social posts.
    
    Args:
        user_id: The user ID to process posts for
        limit: Maximum number of posts to analyze
    
    Returns:
        int: Number of posts successfully analyzed
    """
    from .models import SocialPost
    
    # Get posts with images but no analysis
    posts = SocialPost.objects.filter(
        user_id=user_id
    ).exclude(
        image_urls=''
    ).order_by('-created_at')[:limit]
    
    count = 0
    for post in posts:
        if not hasattr(post, 'image_analysis') or not post.image_analysis:
            if analyze_post_images(post):
                count += 1
    
    return count