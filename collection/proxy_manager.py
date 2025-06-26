"""
Residential Proxy Manager for Stealth Collection
Handles proxy rotation, health monitoring, and failover
Supports: Decodo, Bright Data, Oxylabs, and custom providers
"""

import asyncio
import aiohttp
import random
import time
import os
from typing import Dict, List, Optional
import logging

logger = logging.getLogger(__name__)

class ProxyManager:
    """
    Manages residential proxy rotation and health monitoring
    """
    
    def __init__(self, config: Dict = None):
        self.config = config or self._load_config_from_env()
        self.active_proxies = []
        self.failed_proxies = []
        self.current_index = 0
        self.last_rotation = 0
        self.requests_count = 0
        
    def _load_config_from_env(self) -> Dict:
        """Load proxy configuration from environment variables"""
        return {
            'provider': os.getenv('PROXY_PROVIDER', 'decodo'),
            'username': os.getenv('PROXY_USERNAME'),
            'password': os.getenv('PROXY_PASSWORD'),
            'endpoint': os.getenv('PROXY_ENDPOINT', 'proxy.decodo.com'),
            'port': int(os.getenv('PROXY_PORT', 10000)),
            'max_requests_per_proxy': int(os.getenv('STEALTH_MAX_REQUESTS_PER_PROXY', 100)),
            'rotation_interval': int(os.getenv('STEALTH_PROXY_ROTATION_INTERVAL', 300)),
            'health_check_interval': int(os.getenv('STEALTH_PROXY_HEALTH_CHECK_INTERVAL', 60))
        }
        
    async def initialize(self):
        """Initialize proxy pool based on provider"""
        
        provider = self.config.get('provider', 'decodo').lower()
        
        if provider == 'decodo':
            await self._initialize_decodo()
        elif provider == 'brightdata':
            await self._initialize_brightdata()
        elif provider == 'oxylabs':
            await self._initialize_oxylabs()
        else:
            await self._initialize_custom()
            
        logger.info(f"Initialized {len(self.active_proxies)} proxies from {provider}")
        
    async def _initialize_decodo(self):
        """Initialize Decodo proxy configuration"""
        # Decodo typically provides multiple endpoints
        endpoints = [
            f"{self.config['endpoint']}:{self.config['port']}",
            f"proxy2.{self.config['endpoint']}:{self.config['port']}",
            f"proxy3.{self.config['endpoint']}:{self.config['port']}"
        ]
        
        for i, endpoint in enumerate(endpoints):
            self.active_proxies.append({
                'id': f'decodo_{i}',
                'endpoint': endpoint,
                'username': self.config['username'],
                'password': self.config['password'],
                'url': f"http://{self.config['username']}:{self.config['password']}@{endpoint}",
                'country': 'US',  # Decodo offers US residential IPs
                'success_rate': 100,
                'last_used': 0,
                'requests_count': 0,
                'provider': 'decodo'
            })
            
    async def _initialize_brightdata(self):
        """Initialize Bright Data proxy configuration"""
        # Bright Data session-based proxy format
        session_id = f"session-{random.randint(1000, 9999)}"
        
        self.active_proxies.append({
            'id': 'brightdata_session',
            'endpoint': f"{self.config['endpoint']}:{self.config['port']}",
            'username': f"{self.config['username']}-session-{session_id}",
            'password': self.config['password'],
            'url': f"http://{self.config['username']}-session-{session_id}:{self.config['password']}@{self.config['endpoint']}:{self.config['port']}",
            'country': 'US',
            'success_rate': 100,
            'last_used': 0,
            'requests_count': 0,
            'provider': 'brightdata'
        })
        
    async def _initialize_oxylabs(self):
        """Initialize Oxylabs proxy configuration"""
        # Oxylabs sticky session format
        self.active_proxies.append({
            'id': 'oxylabs_residential',
            'endpoint': f"{self.config['endpoint']}:{self.config['port']}",
            'username': self.config['username'],
            'password': self.config['password'],
            'url': f"http://{self.config['username']}:{self.config['password']}@{self.config['endpoint']}:{self.config['port']}",
            'country': 'US',
            'success_rate': 100,
            'last_used': 0,
            'requests_count': 0,
            'provider': 'oxylabs'
        })
        
    async def _initialize_custom(self):
        """Initialize custom proxy configuration"""
        self.active_proxies.append({
            'id': 'custom_proxy',
            'endpoint': f"{self.config['endpoint']}:{self.config['port']}",
            'username': self.config['username'],
            'password': self.config['password'],
            'url': f"http://{self.config['username']}:{self.config['password']}@{self.config['endpoint']}:{self.config['port']}",
            'country': 'Unknown',
            'success_rate': 100,
            'last_used': 0,
            'requests_count': 0,
            'provider': 'custom'
        })
        
    async def get_proxy(self) -> Dict:
        """Get next available proxy with intelligent rotation"""
        
        if not self.active_proxies:
            await self.initialize()
            
        # Check if we need to rotate based on time or request count
        current_time = time.time()
        should_rotate = (
            current_time - self.last_rotation > self.config['rotation_interval'] or
            self.requests_count >= self.config['max_requests_per_proxy']
        )
        
        if should_rotate:
            await self._rotate_proxy()
            
        # Get current proxy
        proxy = self.active_proxies[self.current_index]
        
        # Update usage statistics
        proxy['last_used'] = current_time
        proxy['requests_count'] += 1
        self.requests_count += 1
        
        return proxy
        
    async def _rotate_proxy(self):
        """Rotate to next available proxy"""
        self.current_index = (self.current_index + 1) % len(self.active_proxies)
        self.last_rotation = time.time()
        self.requests_count = 0
        
        current_proxy = self.active_proxies[self.current_index]
        logger.info(f"Rotated to proxy: {current_proxy['id']} ({current_proxy['provider']})")
        
    async def test_proxy_health(self, proxy: Dict) -> bool:
        """Test if proxy is working correctly"""
        
        test_urls = [
            "https://httpbin.org/ip",
            "https://api.ipify.org?format=json",
            "https://ipinfo.io/json"
        ]
        
        for test_url in test_urls:
            try:
                timeout = aiohttp.ClientTimeout(total=10)
                
                async with aiohttp.ClientSession(timeout=timeout) as session:
                    async with session.get(test_url, proxy=proxy['url']) as response:
                        if response.status == 200:
                            data = await response.json()
                            detected_ip = data.get('origin') or data.get('ip')
                            
                            logger.info(f"Proxy {proxy['id']} is healthy, IP: {detected_ip}")
                            proxy['success_rate'] = min(100, proxy['success_rate'] + 5)
                            return True
                            
            except Exception as e:
                logger.warning(f"Proxy {proxy['id']} failed health check on {test_url}: {str(e)}")
                continue
                
        # All tests failed
        proxy['success_rate'] = max(0, proxy['success_rate'] - 20)
        return False
        
    async def mark_proxy_failed(self, proxy: Dict, error: str = None):
        """Mark a proxy as failed and rotate to next"""
        
        logger.warning(f"Marking proxy {proxy['id']} as failed: {error}")
        
        proxy['success_rate'] = max(0, proxy['success_rate'] - 30)
        
        # If success rate is too low, move to failed list
        if proxy['success_rate'] < 20:
            self.failed_proxies.append(proxy)
            if proxy in self.active_proxies:
                self.active_proxies.remove(proxy)
                
            # Adjust current index if needed
            if self.current_index >= len(self.active_proxies) and self.active_proxies:
                self.current_index = 0
                
        # Try to get a new proxy
        if self.active_proxies:
            await self._rotate_proxy()
        else:
            logger.error("All proxies have failed! Attempting to reinitialize...")
            await self.initialize()
            
    async def health_check_all(self):
        """Perform health check on all active proxies"""
        
        logger.info("Starting health check for all proxies...")
        
        healthy_count = 0
        for proxy in self.active_proxies[:]:  # Copy list to avoid modification during iteration
            is_healthy = await self.test_proxy_health(proxy)
            if is_healthy:
                healthy_count += 1
            else:
                await self.mark_proxy_failed(proxy, "Health check failed")
                
        logger.info(f"Health check complete: {healthy_count}/{len(self.active_proxies)} proxies healthy")
        
    def get_stats(self) -> Dict:
        """Get comprehensive proxy pool statistics"""
        
        total_requests = sum(p.get('requests_count', 0) for p in self.active_proxies)
        avg_success_rate = sum(p.get('success_rate', 0) for p in self.active_proxies) / len(self.active_proxies) if self.active_proxies else 0
        
        return {
            'provider': self.config.get('provider'),
            'active_proxies': len(self.active_proxies),
            'failed_proxies': len(self.failed_proxies),
            'current_proxy_index': self.current_index,
            'total_requests': total_requests,
            'average_success_rate': round(avg_success_rate, 1),
            'last_rotation': self.last_rotation,
            'time_since_rotation': time.time() - self.last_rotation,
            'proxies_detail': [
                {
                    'id': p['id'],
                    'provider': p['provider'],
                    'success_rate': p['success_rate'],
                    'requests_count': p['requests_count'],
                    'last_used': p['last_used']
                }
                for p in self.active_proxies
            ]
        }

# Factory function for easy initialization
async def create_proxy_manager(config: Dict = None) -> ProxyManager:
    """Create and initialize a proxy manager"""
    manager = ProxyManager(config)
    await manager.initialize()
    return manager
