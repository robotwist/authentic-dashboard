#!/usr/bin/env python3
"""
Week 1 Starter Script - Authentic Dashboard Refactoring
Splits the monolithic 1,734-line views.py into modular components
"""

import os
import shutil
from pathlib import Path

def create_directory_structure():
    """Create the necessary directory structure for modular views"""
    print("📁 Creating directory structure...")
    
    # Ensure brandsensor/views/ directory exists
    views_dir = Path("brandsensor/views")
    views_dir.mkdir(exist_ok=True)
    
    # Create __init__.py for the views package
    init_file = views_dir / "__init__.py"
    if not init_file.exists():
        init_file.write_text("# Views package for modular organization\n")
    
    print("✅ Directory structure created")

def backup_original_views():
    """Backup the original monolithic views.py"""
    print("💾 Backing up original views.py...")
    
    original = Path("brandsensor/views.py")
    backup = Path("brandsensor/views_original_backup.py")
    
    if original.exists() and not backup.exists():
        shutil.copy2(original, backup)
        print("✅ Original views.py backed up")
    else:
        print("ℹ️ Backup already exists or original not found")

def create_auth_views():
    """Extract authentication-related views"""
    print("🔐 Creating auth_views.py...")
    
    auth_content = '''from django.shortcuts import render, redirect
from django.contrib.auth import login, authenticate, logout
from django.contrib.auth.models import User
from django.contrib.auth.decorators import login_required

def user_login(request):
    """Handle user login"""
    if request.user.is_authenticated:
        return redirect('dashboard')
        
    error_message = None
    
    if request.method == 'POST':
        username = request.POST.get('username')
        password = request.POST.get('password')
        
        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)
            next_url = request.GET.get('next', 'dashboard')
            return redirect(next_url)
        else:
            error_message = "Invalid username or password"
    
    return render(request, 'brandsensor/login.html', {'error_message': error_message})

def user_logout(request):
    """Handle user logout"""
    logout(request)
    return redirect('landing')

def user_register(request):
    """Handle user registration"""
    if request.user.is_authenticated:
        return redirect('dashboard')
        
    error_message = None
    
    if request.method == 'POST':
        username = request.POST.get('username')
        email = request.POST.get('email')
        password = request.POST.get('password')
        password_confirm = request.POST.get('password_confirm')
        
        if password != password_confirm:
            error_message = "Passwords do not match"
        elif User.objects.filter(username=username).exists():
            error_message = "Username already exists"
        elif User.objects.filter(email=email).exists():
            error_message = "Email already registered"
        else:
            # Create user
            user = User.objects.create_user(username=username, email=email, password=password)
            # Create default preferences
            from ..models import UserPreference
            UserPreference.objects.create(user=user)
            # Log in the user
            login(request, user)
            return redirect('dashboard')
    
    return render(request, 'brandsensor/register.html', {'error_message': error_message})
'''
    
    auth_file = Path("brandsensor/views/auth_views.py")
    auth_file.write_text(auth_content)
    print("✅ auth_views.py created")

def create_api_views():
    """Create API views module structure"""
    print("🔌 Creating api_views.py...")
    
    api_content = '''from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from django.contrib.auth.models import User
from ..models import SocialPost, APIKey, BehaviorLog
from ..decorators import api_key_required
import json
import logging

logger = logging.getLogger(__name__)

def get_user_from_api_key(request):
    """Authenticate a request using the API key from the header"""
    api_key = request.headers.get('X-API-Key')
    
    if not api_key and request.GET.get('api_key'):
        api_key = request.GET.get('api_key')
    
    if not api_key:
        return None
        
    try:
        key_obj = APIKey.objects.get(key=api_key, is_active=True)
        key_obj.last_used = timezone.now()
        key_obj.save(update_fields=['last_used'])
        return key_obj.user
    except APIKey.DoesNotExist:
        return None

@csrf_exempt
@api_key_required
def api_log_behavior(request):
    """API endpoint for logging user behavior"""
    if request.method != 'POST':
        return JsonResponse({'error': 'Only POST method allowed'}, status=405)
    
    try:
        data = json.loads(request.body)
        user = get_user_from_api_key(request)
        
        if not user:
            return JsonResponse({'error': 'Invalid API key'}, status=401)
        
        # Log the behavior
        BehaviorLog.objects.create(
            user=user,
            behavior_type=data.get('behavior_type', 'unknown'),
            platform=data.get('platform', ''),
            details=data.get('details', {}),
            url=data.get('url', ''),
            timestamp=timezone.now()
        )
        
        return JsonResponse({'status': 'success'})
        
    except Exception as e:
        logger.error(f"Error logging behavior: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
def api_health_check(request):
    """Health check endpoint for API monitoring"""
    return JsonResponse({
        'status': 'healthy',
        'timestamp': timezone.now().isoformat(),
        'version': '1.0'
    })

@csrf_exempt  
def verify_api_key(request):
    """Verify API key validity"""
    user = get_user_from_api_key(request)
    
    if user:
        return JsonResponse({
            'valid': True,
            'user_id': user.id,
            'username': user.username
        })
    else:
        return JsonResponse({'valid': False}, status=401)
'''
    
    api_file = Path("brandsensor/views/api_views.py") 
    api_file.write_text(api_content)
    print("✅ api_views.py created")

def create_stealth_collector():
    """Create the basic stealth collection system"""
    print("🥷 Creating stealth collection system...")
    
    # Ensure collection directory exists
    collection_dir = Path("collection")
    collection_dir.mkdir(exist_ok=True)
    
    # Create stealth collector
    stealth_content = '''"""
Advanced Stealth Social Media Collector
Undetectable data collection using residential proxies and behavioral mimicry
"""

import asyncio
import aiohttp
import random
import time
from typing import List, Dict, Optional
from urllib.parse import urljoin
import logging

logger = logging.getLogger(__name__)

class StealthCollector:
    """
    Advanced social media collector with anti-detection capabilities
    """
    
    def __init__(self, proxy_manager, browser_fingerprint):
        self.proxy_manager = proxy_manager
        self.browser_fingerprint = browser_fingerprint
        self.session = None
        self.current_proxy = None
        
    async def initialize_session(self):
        """Initialize HTTP session with stealth configuration"""
        
        # Get fresh proxy
        self.current_proxy = await self.proxy_manager.get_proxy()
        
        # Create session with proxy
        connector = aiohttp.TCPConnector(
            limit=10,
            limit_per_host=2,
            ttl_dns_cache=300,
            use_dns_cache=True,
        )
        
        timeout = aiohttp.ClientTimeout(total=30, connect=10)
        
        self.session = aiohttp.ClientSession(
            connector=connector,
            timeout=timeout,
            headers=self.browser_fingerprint.get_headers()
        )
        
        logger.info(f"Initialized stealth session with proxy: {self.current_proxy['ip']}")
        
    async def collect_facebook_posts(self, target_url: str, max_posts: int = 25) -> List[Dict]:
        """
        Collect Facebook posts using stealth techniques
        """
        if not self.session:
            await self.initialize_session()
            
        posts = []
        
        try:
            # Human-like delay before starting
            await asyncio.sleep(random.uniform(2, 5))
            
            # Navigate to target URL
            async with self.session.get(target_url, proxy=self.current_proxy['url']) as response:
                if response.status == 200:
                    html = await response.text()
                    posts = self._parse_facebook_posts(html, max_posts)
                    
                    # Simulate human behavior - scroll and wait
                    await self._simulate_human_browsing()
                    
                else:
                    logger.warning(f"Unexpected response status: {response.status}")
                    
        except Exception as e:
            logger.error(f"Error collecting Facebook posts: {str(e)}")
            
        return posts
        
    async def _simulate_human_browsing(self):
        """Simulate human browsing patterns"""
        
        # Random delays to mimic reading time
        read_time = random.uniform(10, 30)
        await asyncio.sleep(read_time)
        
        # Simulate scroll events (would be implemented with browser automation)
        scroll_actions = random.randint(3, 8)
        for _ in range(scroll_actions):
            await asyncio.sleep(random.uniform(1, 3))
            
    def _parse_facebook_posts(self, html: str, max_posts: int) -> List[Dict]:
        """Parse Facebook posts from HTML"""
        # This would contain the actual parsing logic
        # For now, return placeholder structure
        
        posts = []
        
        # Placeholder post structure
        for i in range(min(max_posts, 10)):  # Limit for demo
            posts.append({
                'platform': 'facebook',
                'content': f'Sample post content {i}',
                'author': f'User{i}',
                'timestamp': time.time(),
                'engagement': {
                    'likes': random.randint(0, 100),
                    'comments': random.randint(0, 20),
                    'shares': random.randint(0, 10)
                }
            })
            
        return posts
        
    async def close(self):
        """Clean up resources"""
        if self.session:
            await self.session.close()
'''
    
    stealth_file = collection_dir / "stealth_collector.py"
    stealth_file.write_text(stealth_content)
    
    # Create proxy manager
    proxy_content = '''"""
Residential Proxy Manager for Stealth Collection
Handles proxy rotation, health monitoring, and failover
"""

import asyncio
import aiohttp
import random
import time
from typing import Dict, List, Optional
import logging

logger = logging.getLogger(__name__)

class ProxyManager:
    """
    Manages residential proxy rotation and health monitoring
    """
    
    def __init__(self, proxy_config: Dict):
        self.config = proxy_config
        self.active_proxies = []
        self.failed_proxies = []
        self.current_index = 0
        
    async def initialize(self):
        """Initialize proxy pool"""
        
        # For Decodo (placeholder configuration)
        if self.config.get('provider') == 'decodo':
            self.active_proxies = [
                {
                    'ip': 'proxy1.decodo.com',
                    'port': 10000,
                    'username': self.config.get('username'),
                    'password': self.config.get('password'),
                    'url': f"http://{self.config.get('username')}:{self.config.get('password')}@proxy1.decodo.com:10000",
                    'country': 'US',
                    'success_rate': 100,
                    'last_used': 0
                }
            ]
            
        logger.info(f"Initialized {len(self.active_proxies)} proxies")
        
    async def get_proxy(self) -> Dict:
        """Get next available proxy with rotation"""
        
        if not self.active_proxies:
            await self.initialize()
            
        # Simple round-robin rotation
        proxy = self.active_proxies[self.current_index]
        self.current_index = (self.current_index + 1) % len(self.active_proxies)
        
        # Update last used time
        proxy['last_used'] = time.time()
        
        return proxy
        
    async def test_proxy_health(self, proxy: Dict) -> bool:
        """Test if proxy is working correctly"""
        
        test_url = "https://httpbin.org/ip"
        
        try:
            timeout = aiohttp.ClientTimeout(total=10)
            
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(test_url, proxy=proxy['url']) as response:
                    if response.status == 200:
                        data = await response.json()
                        logger.info(f"Proxy {proxy['ip']} is healthy, IP: {data.get('origin')}")
                        return True
                        
        except Exception as e:
            logger.warning(f"Proxy {proxy['ip']} failed health check: {str(e)}")
            return False
            
        return False
        
    async def rotate_proxy(self, failed_proxy: Dict = None):
        """Rotate to next proxy, optionally marking one as failed"""
        
        if failed_proxy:
            self.failed_proxies.append(failed_proxy)
            if failed_proxy in self.active_proxies:
                self.active_proxies.remove(failed_proxy)
                
        return await self.get_proxy()
        
    def get_stats(self) -> Dict:
        """Get proxy pool statistics"""
        
        return {
            'active_proxies': len(self.active_proxies),
            'failed_proxies': len(self.failed_proxies),
            'current_proxy': self.current_index,
            'total_requests': sum(p.get('requests', 0) for p in self.active_proxies)
        }
'''
    
    proxy_file = collection_dir / "proxy_manager.py"
    proxy_file.write_text(proxy_content)
    
    print("✅ Stealth collection system created")

def create_requirements_stealth():
    """Create requirements file for stealth collection"""
    print("📋 Creating stealth requirements...")
    
    requirements_content = '''# Stealth Collection Requirements
aiohttp==3.9.1
asyncio-throttle==1.0.2
fake-useragent==1.4.0
playwright==1.40.0
beautifulsoup4==4.12.2
lxml==4.9.3
selenium==4.15.2
requests==2.31.0

# Anti-detection
curl-cffi==0.6.2
tls-client==0.2.2
undetected-chromedriver==3.5.4

# Proxy support
aiohttp-socks==0.8.4
pysocks==1.7.1

# Data processing
pandas==2.1.4
numpy==1.24.4
'''
    
    requirements_file = Path("requirements_stealth.txt")
    requirements_file.write_text(requirements_content)
    print("✅ requirements_stealth.txt created")

def main():
    """Main execution function"""
    print("🚀 Starting Week 1 Development Setup")
    print("=" * 50)
    
    # Step 1: Directory structure
    create_directory_structure()
    
    # Step 2: Backup original
    backup_original_views()
    
    # Step 3: Create modular views
    create_auth_views()
    create_api_views()
    
    # Step 4: Create stealth system
    create_stealth_collector()
    
    # Step 5: Requirements
    create_requirements_stealth()
    
    print("=" * 50)
    print("✅ Week 1 setup complete!")
    print()
    print("📋 Next steps:")
    print("1. Test Django with new modular views")
    print("2. Install stealth requirements: pip install -r requirements_stealth.txt")
    print("3. Configure proxy provider (Decodo recommended)")
    print("4. Test basic stealth collection")
    print()
    print("💡 Remember: Chrome extension stays DISABLED for safety")
    print("🎯 Goal: Undetectable collection by end of week")

if __name__ == "__main__":
    main() 