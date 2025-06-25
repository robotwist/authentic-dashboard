"""
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
