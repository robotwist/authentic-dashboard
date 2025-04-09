from .models import UserPreference, APIKey, SocialPost
from django.db.models import Count, Q, Avg, F

def get_user_data(user):
    """
    Fetch user preferences, API keys, post count, platform statistics, and user ratings.
    Calculate a composite score for posts based on user ratings and engagement metrics.
    """
    preferences, _ = UserPreference.objects.get_or_create(user=user)
    api_keys = APIKey.objects.filter(user=user)
    post_count = SocialPost.objects.filter(user=user).count()
    platform_stats = SocialPost.objects.filter(user=user).values('platform').annotate(count=Count('id'))

    # Exclude duplicate posts based on content_hash
    unique_posts = SocialPost.objects.filter(user=user).distinct('content_hash')

    # Fetch user ratings and sort posts by average rating
    rated_posts = SocialPost.objects.filter(user=user).annotate(avg_rating=Avg('userpreference__rating')).order_by('-avg_rating')

    # Calculate composite score: (User Rating * 0.5) + (Likes * 0.3) + (Comments * 0.1) + (Shares * 0.1)
    scored_posts = SocialPost.objects.filter(user=user).annotate(
        composite_score=(
            F('rating') * 0.5 +
            F('likes') * 0.3 +
            F('comments') * 0.1 +
            F('shares') * 0.1
        )
    ).order_by('-composite_score')

    return {
        "preferences": preferences,
        "api_keys": api_keys,
        "post_count": post_count,
        "platform_stats": platform_stats,
        "unique_posts": unique_posts,
        "rated_posts": rated_posts,
        "scored_posts": scored_posts,
    }