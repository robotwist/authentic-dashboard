#!/usr/bin/env python3
import os
import sys

# Use absolute path for output file
output_file = '/home/robwistrand/code/ga/sandbox/authentic_dashboard_project/db_check_output.txt'

# Function to run the check
def run_check():
    # Set up Django
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config_project.settings')
    import django
    django.setup()
    
    # Import models
    from brandsensor.models import SocialPost, APIKey
    from django.contrib.auth.models import User
    
    with open(output_file, 'w') as f:
        # 1. API Key Check
        f.write("=== API KEY CHECK ===\n")
        api_key = APIKey.objects.filter(key="42ad72779a934c2d8005992bbecb6772").first()
        f.write(f"API Key valid: {api_key is not None}\n")
        if api_key:
            f.write(f"Associated user: {api_key.user.username}\n")
        else:
            f.write("API key not found in database\n")
        
        # 2. Post Check
        f.write("\n=== POST CHECK ===\n")
        latest_posts = SocialPost.objects.all().order_by("-created_at")[:5]
        
        if not latest_posts:
            f.write("No posts found in database\n")
        else:
            f.write(f"Latest {len(latest_posts)} posts:\n")
            for post in latest_posts:
                f.write(f"ID: {post.id}, Platform: {post.platform}, User: {post.original_user}, Processed: {post.sentiment_score is not None}\n")
        
        # 3. Statistics
        f.write("\n=== STATISTICS ===\n")
        total_posts = SocialPost.objects.count()
        f.write(f"Total posts in database: {total_posts}\n")
        
        processed_posts = SocialPost.objects.filter(sentiment_score__isnull=False).count()
        f.write(f"Processed posts (with sentiment score): {processed_posts}\n")
        
        # 4. Platform Breakdown
        f.write("\n=== POSTS BY PLATFORM ===\n")
        platforms = SocialPost.objects.values_list('platform', flat=True).distinct()
        for platform in platforms:
            count = SocialPost.objects.filter(platform=platform).count()
            f.write(f"- {platform}: {count} posts\n")
    
    return f"Results written to {output_file}"

if __name__ == "__main__":
    print(run_check()) 