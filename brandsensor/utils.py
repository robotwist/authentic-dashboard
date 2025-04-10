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