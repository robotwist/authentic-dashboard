#!/usr/bin/env python3
import os
import sys
import django
from datetime import datetime, timedelta

# Set up Django environment
sys.path.append('/home/robwistrand/code/ga/sandbox/authentic_dashboard_project')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config_project.settings')
django.setup()

# Import models after Django setup
from brandsensor.models import APIKey, BehaviorLog, SocialPost
from django.contrib.auth.models import User
from django.utils import timezone

def create_new_api_key(username):
    """Create a new API key for the user and make it active"""
    try:
        user = User.objects.get(username=username)
        
        # Check for existing keys
        old_keys = APIKey.objects.filter(user=user, is_active=True)
        print(f"Found {old_keys.count()} active API keys for {username}")
        
        # Create a new key
        import uuid
        new_key = APIKey(
            user=user,
            key=uuid.uuid4().hex,
            name=f"API Key (Generated {timezone.now().strftime('%Y-%m-%d')})",
            is_active=True
        )
        new_key.save()
        
        print(f"Created new API key: {new_key.key}")
        print("Please update this key in your Chrome extension settings")
        
        return new_key.key
    except User.DoesNotExist:
        print(f"User {username} not found")
        return None

def cleanup_error_logs(days=1):
    """Cleanup recent error logs to provide a clean slate"""
    cutoff_date = timezone.now() - timedelta(days=days)
    error_logs = BehaviorLog.objects.filter(
        behavior_type='collect_posts',
        created_at__gte=cutoff_date,
        details__icontains='error'
    )
    
    count = error_logs.count()
    if count > 0:
        print(f"Found {count} error logs in the last {days} days")
        error_logs.delete()
        print(f"Deleted {count} error logs")
    else:
        print(f"No error logs found in the last {days} days")

def test_api_key(api_key):
    """Test if the API key is valid"""
    try:
        key = APIKey.objects.get(key=api_key)
        
        # Update last_used
        key.last_used = timezone.now()
        key.save()
        
        print(f"API key is valid for user: {key.user.username}")
        print(f"Key name: {key.name}")
        print(f"Last used: {key.last_used}")
        
        return True
    except APIKey.DoesNotExist:
        print(f"API key not found in database")
        return False

def verify_post_collection():
    """Verify that posts can be collected by checking recent posts"""
    today = timezone.now().date()
    yesterday = today - timedelta(days=1)
    
    today_posts = SocialPost.objects.filter(collected_at__date=today).count()
    yesterday_posts = SocialPost.objects.filter(collected_at__date=yesterday).count()
    
    print(f"Posts collected today: {today_posts}")
    print(f"Posts collected yesterday: {yesterday_posts}")
    
    if today_posts > 0:
        print("✅ Posts are being collected today")
    else:
        print("❌ No posts collected today")
    
    if yesterday_posts > 0:
        print("✅ Posts were collected yesterday")
    else:
        print("❌ No posts collected yesterday")

def create_test_post(api_key):
    """Create a test post to verify API connectivity"""
    import requests
    import json
    
    api_endpoint = "http://localhost:8000/api/collect-posts/"
    headers = {
        "X-API-Key": api_key,
        "Content-Type": "application/json"
    }
    
    # Create a sample post
    timestamp = datetime.now().isoformat()
    test_post = {
        "platform": "linkedin",
        "posts": [
            {
                "content": f"API fix test post created at {timestamp}",
                "original_user": "test_user",
                "is_sponsored": False,
                "verified": True,
                "is_friend": False,
                "is_family": False,
                "timestamp": timestamp
            }
        ]
    }
    
    try:
        response = requests.post(api_endpoint, headers=headers, json=test_post)
        
        print(f"API Test Status: {response.status_code}")
        print(f"Response: {response.text}")
        
        return response.status_code == 200
    except Exception as e:
        print(f"Error testing API: {e}")
        return False

def main():
    print("=" * 60)
    print("FIXING COLLECTION ISSUES")
    print("=" * 60)
    
    # Parse arguments
    import argparse
    parser = argparse.ArgumentParser(description='Fix collection issues')
    parser.add_argument('--username', type=str, help='Username to create API key for')
    parser.add_argument('--verify', action='store_true', help='Verify collection status')
    parser.add_argument('--cleanup', action='store_true', help='Cleanup error logs')
    parser.add_argument('--test-key', type=str, help='Test an API key')
    parser.add_argument('--create-test', action='store_true', help='Create a test post')
    
    args = parser.parse_args()
    
    if args.verify:
        print("\nVerifying post collection status...")
        verify_post_collection()
    
    if args.cleanup:
        print("\nCleaning up error logs...")
        cleanup_error_logs()
    
    if args.username:
        print(f"\nCreating new API key for {args.username}...")
        api_key = create_new_api_key(args.username)
        
        if api_key and args.create_test:
            print("\nCreating test post with new API key...")
            create_test_post(api_key)
    
    if args.test_key:
        print(f"\nTesting API key: {args.test_key}...")
        if test_api_key(args.test_key) and args.create_test:
            print("\nCreating test post with provided API key...")
            create_test_post(args.test_key)
    
    if not any([args.verify, args.cleanup, args.username, args.test_key]):
        parser.print_help()
    
    print("\nDone!")

if __name__ == "__main__":
    main() 