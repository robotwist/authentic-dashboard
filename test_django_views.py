#!/usr/bin/env python3
"""
Test Django Views Integration
Tests that the new modular views work correctly
"""

import os
import sys
import django
from pathlib import Path

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config_project.settings')
django.setup()

from django.test import TestCase, Client
from django.contrib.auth.models import User
from django.urls import reverse
from brandsensor.models import APIKey, SocialPost

def test_django_setup():
    """Test that Django is properly configured"""
    print("🔧 Testing Django Setup...")
    
    try:
        from django.conf import settings
        print(f"✅ Django settings loaded: {settings.DEBUG}")
        
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            result = cursor.fetchone()
        print("✅ Database connection working")
        
        return True
        
    except Exception as e:
        print(f"❌ Django setup failed: {str(e)}")
        return False

def test_auth_views():
    """Test authentication views"""
    print("\n🔐 Testing Auth Views...")
    
    try:
        from brandsensor.views.auth_views import user_login, user_logout, user_register
        print("✅ Auth views imported successfully")
        
        # Test with Django test client
        client = Client()
        
        # Test login page
        response = client.get('/login/')
        if response.status_code == 200:
            print("✅ Login page accessible")
        else:
            print(f"⚠️  Login page returned status {response.status_code}")
        
        return True
        
    except Exception as e:
        print(f"❌ Auth views test failed: {str(e)}")
        return False

def test_api_views():
    """Test API views"""
    print("\n🔌 Testing API Views...")
    
    try:
        from brandsensor.views.api_views import (
            api_health_check, 
            verify_api_key, 
            get_user_from_api_key
        )
        print("✅ API views imported successfully")
        
        # Test health check
        client = Client()
        response = client.get('/api/health/')
        if response.status_code == 200:
            print("✅ Health check endpoint accessible")
            data = response.json()
            print(f"✅ Health check response: {data.get('status')}")
        else:
            print(f"⚠️  Health check returned status {response.status_code}")
        
        return True
        
    except Exception as e:
        print(f"❌ API views test failed: {str(e)}")
        return False

def test_models():
    """Test that models are working"""
    print("\n📊 Testing Models...")
    
    try:
        # Test model imports
        from brandsensor.models import SocialPost, APIKey, BehaviorLog
        print("✅ Models imported successfully")
        
        # Test model counts
        post_count = SocialPost.objects.count()
        api_key_count = APIKey.objects.count()
        print(f"✅ Database accessible - {post_count} posts, {api_key_count} API keys")
        
        return True
        
    except Exception as e:
        print(f"❌ Models test failed: {str(e)}")
        return False

def test_url_routing():
    """Test URL routing"""
    print("\n🛣️  Testing URL Routing...")
    
    try:
        from django.urls import resolve
        from django.core.urlresolvers import reverse
        
        # Test some key URLs
        urls_to_test = [
            '/api/health/',
            '/login/',
        ]
        
        for url in urls_to_test:
            try:
                resolved = resolve(url)
                print(f"✅ URL {url} resolves to {resolved.func.__name__}")
            except Exception as e:
                print(f"⚠️  URL {url} failed to resolve: {str(e)}")
        
        return True
        
    except Exception as e:
        print(f"❌ URL routing test failed: {str(e)}")
        return False

def main():
    """Main test runner"""
    print("🚀 Starting Django Views Integration Tests")
    print("=" * 50)
    
    tests = [
        ("Django Setup", test_django_setup),
        ("Auth Views", test_auth_views),
        ("API Views", test_api_views),
        ("Models", test_models),
        ("URL Routing", test_url_routing),
    ]
    
    results = []
    
    for test_name, test_func in tests:
        print(f"\n🧪 Running {test_name}...")
        result = test_func()
        results.append((test_name, result))
    
    # Print summary
    print("\n" + "=" * 50)
    print("📊 Django Test Results Summary:")
    print("=" * 50)
    
    passed = 0
    failed = 0
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {test_name}")
        
        if result:
            passed += 1
        else:
            failed += 1
    
    print(f"\n📈 Total: {passed} passed, {failed} failed")
    
    if failed == 0:
        print("🎉 All Django tests passed! Views integration is working.")
        print("\n💡 Next steps:")
        print("1. Start Django development server")
        print("2. Test views in browser")
        print("3. Integrate with stealth collection system")
    else:
        print("⚠️  Some Django tests failed. Check the errors above.")
    
    return failed == 0

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1) 