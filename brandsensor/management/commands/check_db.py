from django.core.management.base import BaseCommand
from brandsensor.models import SocialPost, APIKey
from django.contrib.auth.models import User

class Command(BaseCommand):
    help = 'Checks API key and posts in the database'

    def handle(self, *args, **options):
        # Check API key
        api_key = APIKey.objects.filter(key="42ad72779a934c2d8005992bbecb6772").first()
        self.stdout.write(f"API Key valid: {api_key is not None}")
        
        if api_key:
            self.stdout.write(f"Associated user: {api_key.user.username}")
        else:
            self.stdout.write(self.style.ERROR("API key not found in database"))

        # Check posts
        latest_posts = SocialPost.objects.all().order_by("-created_at")[:5]
        
        if not latest_posts:
            self.stdout.write(self.style.WARNING("No posts found in database"))
        else:
            self.stdout.write(self.style.SUCCESS(f"\nLatest {len(latest_posts)} posts:"))
            for post in latest_posts:
                self.stdout.write(f"ID: {post.id}, Platform: {post.platform}, User: {post.original_user}, Processed: {post.sentiment_score is not None}")
        
        # Total posts
        total_posts = SocialPost.objects.count()
        self.stdout.write(f"\nTotal posts in database: {total_posts}")
        
        # Processed posts
        processed_posts = SocialPost.objects.filter(sentiment_score__isnull=False).count()
        self.stdout.write(f"Processed posts (with sentiment score): {processed_posts}")
        
        # Posts by platform
        platforms = SocialPost.objects.values_list('platform', flat=True).distinct()
        self.stdout.write(self.style.SUCCESS("\nPosts by platform:"))
        for platform in platforms:
            count = SocialPost.objects.filter(platform=platform).count()
            self.stdout.write(f"- {platform}: {count} posts") 