#!/usr/bin/env python3
import requests
import json
import sys
import datetime

# Configuration
API_ENDPOINT = "http://localhost:8000"
# Using one of the active API keys that has been used recently
API_KEY = "42ad72779a934c2d8005992bbecb6772"

def test_health_check():
    """Test the health check endpoint"""
    url = f"{API_ENDPOINT}/api/health-check/"
    
    response = requests.get(url)
    
    print(f"Health Check Status: {response.status_code}")
    print(f"Response: {response.text}")
    print("-" * 50)
    
    return response.status_code == 200

def test_api_key():
    """Test if the API key is valid"""
    url = f"{API_ENDPOINT}/api/verify-key/"
    headers = {"X-API-Key": API_KEY}
    
    response = requests.get(url, headers=headers)
    
    print(f"API Key Verification Status: {response.status_code}")
    print(f"Response: {response.text}")
    print("-" * 50)
    
    return response.status_code == 200

def test_post_collection():
    """Test the post collection endpoint with a sample post"""
    url = f"{API_ENDPOINT}/api/collect-posts/"
    headers = {
        "X-API-Key": API_KEY,
        "Content-Type": "application/json"
    }
    
    # Create a sample post
    timestamp = datetime.datetime.now().isoformat()
    test_post = {
        "platform": "linkedin",
        "posts": [
            {
                "content": f"Test post created at {timestamp}",
                "original_user": "test_user",
                "is_sponsored": False,
                "verified": True,
                "is_friend": False,
                "is_family": False,
                "timestamp": timestamp
            }
        ]
    }
    
    response = requests.post(url, headers=headers, json=test_post)
    
    print(f"Post Collection Status: {response.status_code}")
    print(f"Response: {response.text}")
    print("-" * 50)
    
    return response.status_code == 200

def get_recent_posts():
    """Get recent posts to verify if test post was saved"""
    url = f"{API_ENDPOINT}/api/posts/"
    headers = {"X-API-Key": API_KEY}
    
    response = requests.get(url, headers=headers)
    
    print(f"Recent Posts Status: {response.status_code}")
    try:
        data = response.json()
        print(f"Response Data: {data}")
        
        # Try to extract posts based on different possible response formats
        if isinstance(data, list):
            posts = data
        elif isinstance(data, dict):
            posts = data.get('results', [])
            if not posts and 'data' in data:
                posts = data.get('data', [])
        
        print(f"Total posts found: {len(posts)}")
        
        if len(posts) > 0:
            count = min(5, len(posts))
            for i in range(count):
                post = posts[i]
                if isinstance(post, dict):
                    post_id = post.get('id', 'unknown')
                    content = post.get('content', 'No content')
                    print(f"Post ID: {post_id}, Content: {content[:50]}...")
                else:
                    print(f"Post format not recognized: {type(post)}")
        else:
            print("No posts found in the response")
    except Exception as e:
        print(f"Error parsing response: {e}")
        print(f"Raw response: {response.text[:500]}...")
    
    print("-" * 50)

def main():
    print("Testing API endpoints...")
    print("=" * 50)
    
    # Test health check
    if not test_health_check():
        print("CRITICAL: API server is not responding to health checks")
        return
    
    # Test API key
    if not test_api_key():
        print("CRITICAL: API key is not valid")
        return
    
    # Test post collection
    if test_post_collection():
        print("SUCCESS: Post collection accepted")
    else:
        print("ERROR: Post collection failed")
    
    # Check if the test post was saved
    print("\nChecking if the post was saved...")
    get_recent_posts()

if __name__ == "__main__":
    main() 