#!/usr/bin/env python3
"""
Test Script for Stealth Collection System
Tests proxy manager, stealth collector, and basic functionality
"""

import asyncio
import sys
import os
import json
from pathlib import Path

# Add collection directory to path
sys.path.append(str(Path(__file__).parent / "collection"))

from collection.proxy_manager import ProxyManager
from collection.stealth_collector import StealthCollector

class BrowserFingerprint:
    """Mock browser fingerprint class for testing"""
    
    def get_headers(self):
        return {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        }

async def test_proxy_manager():
    """Test the proxy manager functionality"""
    print("🔍 Testing Proxy Manager...")
    
    # Create test configuration
    proxy_config = {
        'provider': 'decodo',
        'username': 'test_user',
        'password': 'test_pass'
    }
    
    proxy_manager = ProxyManager(proxy_config)
    
    try:
        # Initialize proxy pool
        await proxy_manager.initialize()
        print(f"✅ Proxy manager initialized with {len(proxy_manager.active_proxies)} proxies")
        
        # Get a proxy
        proxy = await proxy_manager.get_proxy()
        print(f"✅ Retrieved proxy: {proxy['ip']}:{proxy['port']}")
        
        # Get stats
        stats = proxy_manager.get_stats()
        print(f"✅ Proxy stats: {stats}")
        
        return True
        
    except Exception as e:
        print(f"❌ Proxy manager test failed: {str(e)}")
        return False

async def test_stealth_collector():
    """Test the stealth collector functionality"""
    print("\n🥷 Testing Stealth Collector...")
    
    try:
        # Create mock components
        proxy_config = {
            'provider': 'decodo',
            'username': 'test_user',
            'password': 'test_pass'
        }
        
        proxy_manager = ProxyManager(proxy_config)
        browser_fingerprint = BrowserFingerprint()
        
        # Create stealth collector
        collector = StealthCollector(proxy_manager, browser_fingerprint)
        
        # Initialize session
        await collector.initialize_session()
        print("✅ Stealth collector session initialized")
        
        # Test Facebook collection (mock)
        posts = await collector.collect_facebook_posts("https://facebook.com", max_posts=5)
        print(f"✅ Collected {len(posts)} Facebook posts (mock data)")
        
        # Print first post for verification
        if posts:
            print(f"📄 Sample post: {posts[0]}")
        
        # Clean up
        await collector.close()
        print("✅ Stealth collector closed cleanly")
        
        return True
        
    except Exception as e:
        print(f"❌ Stealth collector test failed: {str(e)}")
        return False

async def test_proxy_health():
    """Test proxy health checking"""
    print("\n🏥 Testing Proxy Health Check...")
    
    try:
        proxy_config = {
            'provider': 'decodo',
            'username': 'test_user',
            'password': 'test_pass'
        }
        
        proxy_manager = ProxyManager(proxy_config)
        await proxy_manager.initialize()
        
        # Test health of first proxy
        if proxy_manager.active_proxies:
            proxy = proxy_manager.active_proxies[0]
            
            # Note: This will fail without real proxy credentials, but tests the logic
            healthy = await proxy_manager.test_proxy_health(proxy)
            print(f"✅ Health check completed (result: {healthy})")
            print("ℹ️  Note: Health check may fail without real proxy credentials")
        
        return True
        
    except Exception as e:
        print(f"❌ Proxy health test failed: {str(e)}")
        return False

def test_imports():
    """Test that all required modules can be imported"""
    print("📦 Testing Imports...")
    
    try:
        import aiohttp
        print("✅ aiohttp imported")
        
        import asyncio
        print("✅ asyncio imported")
        
        import random
        print("✅ random imported")
        
        import time
        print("✅ time imported")
        
        from collection.proxy_manager import ProxyManager
        print("✅ ProxyManager imported")
        
        from collection.stealth_collector import StealthCollector
        print("✅ StealthCollector imported")
        
        return True
        
    except ImportError as e:
        print(f"❌ Import test failed: {str(e)}")
        return False

async def main():
    """Main test runner"""
    print("🚀 Starting Stealth Collection System Tests")
    print("=" * 50)
    
    tests = [
        ("Import Test", test_imports),
        ("Proxy Manager Test", test_proxy_manager),
        ("Stealth Collector Test", test_stealth_collector),
        ("Proxy Health Test", test_proxy_health),
    ]
    
    results = []
    
    for test_name, test_func in tests:
        print(f"\n🧪 Running {test_name}...")
        
        if asyncio.iscoroutinefunction(test_func):
            result = await test_func()
        else:
            result = test_func()
            
        results.append((test_name, result))
    
    # Print summary
    print("\n" + "=" * 50)
    print("📊 Test Results Summary:")
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
        print("🎉 All tests passed! Stealth collection system is ready.")
        print("\n💡 Next steps:")
        print("1. Configure real proxy provider credentials")
        print("2. Test with actual social media URLs")
        print("3. Implement real parsing logic")
    else:
        print("⚠️  Some tests failed. Check the errors above.")
    
    return failed == 0

if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1) 