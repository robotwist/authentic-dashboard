import os
import django

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config_project.settings')
django.setup()

# Now import the models
from brandsensor.models import SocialPost, APIKey
from django.contrib.auth.models import User

def check_api_key_and_posts():
    # 1. Verify your API key
    api_key = APIKey.objects.filter(key="42ad72779a934c2d8005992bbecb6772").first()
    print(f"API Key valid: {api_key is not None}")
    if api_key:
        print(f"Associated user: {api_key.user.username}")
    else:
        print("API key not found in database")

    # 2. Check if posts are being received but not displayed
    # Look at the latest posts in the database
    latest_posts = SocialPost.objects.all().order_by("-created_at")[:5]
    
    if not latest_posts:
        print("No posts found in database")
    else:
        print(f"\nLatest {len(latest_posts)} posts:")
        for post in latest_posts:
            print(f"ID: {post.id}, Platform: {post.platform}, User: {post.original_user}, Processed: {post.sentiment_score is not None}")
    
    # 3. Check total count of posts
    total_posts = SocialPost.objects.count()
    print(f"\nTotal posts in database: {total_posts}")
    
    # 4. Check posts with sentiment score (processed)
    processed_posts = SocialPost.objects.filter(sentiment_score__isnull=False).count()
    print(f"Processed posts (with sentiment score): {processed_posts}")
    
    # 5. Check by platform
    platforms = SocialPost.objects.values_list('platform', flat=True).distinct()
    print("\nPosts by platform:")
    for platform in platforms:
        count = SocialPost.objects.filter(platform=platform).count()
        print(f"- {platform}: {count} posts")

if __name__ == "__main__":
    check_api_key_and_posts() 