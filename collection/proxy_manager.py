"""
Proxy Manager - Advanced proxy rotation and management system

This module manages residential proxy pools, health checking, and rotation
to ensure undetectable data collection.
"""

import asyncio
import aiohttp
import random
import time
import logging
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, field
from datetime import datetime, timedelta
import json

logger = logging.getLogger(__name__)

@dataclass
class ProxyMetrics:
    """Metrics for proxy performance tracking"""
    success_count: int = 0
    failure_count: int = 0
    avg_response_time: float = 0.0
    last_used: Optional[datetime] = None
    last_success: Optional[datetime] = None
    last_failure: Optional[datetime] = None
    consecutive_failures: int = 0
    total_requests: int = 0
    blocked_platforms: set = field(default_factory=set)

@dataclass
class ProxyConfig:
    """Enhanced proxy configuration with health metrics"""
    host: str
    port: int
    username: Optional[str] = None
    password: Optional[str] = None
    country: Optional[str] = None
    provider: str = "residential"
    proxy_type: str = "http"  # http, socks5
    max_concurrent: int = 5
    cooldown_seconds: int = 30
    metrics: ProxyMetrics = field(default_factory=ProxyMetrics)
    is_active: bool = True

class ProxyManager:
    """
    Advanced proxy management system with health checking,
    rotation, and performance optimization.
    """
    
    def __init__(self, config_file: Optional[str] = None):
        """
        Initialize the proxy manager.
        
        Args:
            config_file: Path to proxy configuration file
        """
        self.proxies: List[ProxyConfig] = []
        self.current_proxy_index = 0
        self.health_check_interval = 300  # 5 minutes
        self.max_consecutive_failures = 3
        self.rotation_threshold = 10  # Rotate after N requests
        self.request_counts = {}
        
        # Platform-specific proxy pools
        self.platform_proxies = {
            'facebook': [],
            'instagram': [],
            'linkedin': [],
            'general': []
        }
        
        # Load configuration if provided
        if config_file:
            self.load_config(config_file)
        
        # Start background health checking
        self._health_check_task = None

    def load_config(self, config_file: str):
        """Load proxy configuration from file"""
        try:
            with open(config_file, 'r') as f:
                config = json.load(f)
            
            self.proxies = []
            for proxy_data in config.get('proxies', []):
                proxy = ProxyConfig(**proxy_data)
                self.proxies.append(proxy)
            
            logger.info(f"Loaded {len(self.proxies)} proxies from {config_file}")
            
        except Exception as e:
            logger.error(f"Error loading proxy config: {str(e)}")

    def add_proxy_pool(self, proxies: List[Dict[str, Any]]):
        """Add a list of proxies to the pool"""
        for proxy_data in proxies:
            proxy = ProxyConfig(**proxy_data)
            self.proxies.append(proxy)
        
        logger.info(f"Added {len(proxies)} proxies to pool")

    def add_brightdata_pool(self, username: str, password: str, endpoints: List[str]):
        """Add Bright Data residential proxy pool"""
        for endpoint in endpoints:
            host, port = endpoint.split(':')
            proxy = ProxyConfig(
                host=host,
                port=int(port),
                username=username,
                password=password,
                provider="brightdata",
                proxy_type="http"
            )
            self.proxies.append(proxy)
        
        logger.info(f"Added {len(endpoints)} Bright Data proxies")

    def add_oxylabs_pool(self, username: str, password: str, endpoints: List[str]):
        """Add Oxylabs residential proxy pool"""
        for endpoint in endpoints:
            host, port = endpoint.split(':')
            proxy = ProxyConfig(
                host=host,
                port=int(port),
                username=username,
                password=password,
                provider="oxylabs",
                proxy_type="http"
            )
            self.proxies.append(proxy)
        
        logger.info(f"Added {len(endpoints)} Oxylabs proxies")

    async def get_proxy_for_platform(self, platform: str) -> Optional[ProxyConfig]:
        """
        Get the best available proxy for a specific platform
        
        Args:
            platform: Target platform (facebook, instagram, linkedin)
            
        Returns:
            ProxyConfig or None if no suitable proxy available
        """
        # Filter out blocked proxies for this platform
        available_proxies = [
            p for p in self.proxies 
            if (p.is_active and 
                platform not in p.metrics.blocked_platforms and
                p.metrics.consecutive_failures < self.max_consecutive_failures)
        ]
        
        if not available_proxies:
            logger.warning(f"No available proxies for platform {platform}")
            return None
        
        # Sort by performance score
        available_proxies.sort(key=self._calculate_proxy_score, reverse=True)
        
        # Apply rotation logic
        best_proxy = self._select_proxy_with_rotation(available_proxies)
        
        # Update usage tracking
        best_proxy.metrics.last_used = datetime.now()
        self.request_counts[id(best_proxy)] = self.request_counts.get(id(best_proxy), 0) + 1
        
        return best_proxy

    def _calculate_proxy_score(self, proxy: ProxyConfig) -> float:
        """Calculate a performance score for proxy selection"""
        metrics = proxy.metrics
        
        # Base score
        score = 100.0
        
        # Success rate factor
        if metrics.total_requests > 0:
            success_rate = metrics.success_count / metrics.total_requests
            score *= success_rate
        
        # Response time factor (prefer faster proxies)
        if metrics.avg_response_time > 0:
            time_factor = max(0.1, 5.0 / metrics.avg_response_time)  # 5 seconds is baseline
            score *= time_factor
        
        # Consecutive failures penalty
        score *= (0.5 ** metrics.consecutive_failures)
        
        # Recent usage penalty (to encourage rotation)
        if metrics.last_used:
            minutes_since_use = (datetime.now() - metrics.last_used).total_seconds() / 60
            if minutes_since_use < 30:  # Penalize recent usage
                score *= 0.7
        
        # Provider-specific bonuses
        if proxy.provider in ['brightdata', 'oxylabs', 'luminati']:
            score *= 1.2  # Premium providers get bonus
        
        return score

    def _select_proxy_with_rotation(self, proxies: List[ProxyConfig]) -> ProxyConfig:
        """Select proxy with smart rotation logic"""
        # If we have high-scoring proxies, use weighted random selection
        if len(proxies) > 1:
            scores = [self._calculate_proxy_score(p) for p in proxies]
            total_score = sum(scores)
            
            if total_score > 0:
                # Weighted random selection
                rand_val = random.uniform(0, total_score)
                cumulative = 0
                
                for i, score in enumerate(scores):
                    cumulative += score
                    if rand_val <= cumulative:
                        return proxies[i]
        
        # Fallback to best proxy
        return proxies[0]

    async def test_proxy(self, proxy: ProxyConfig, timeout: int = 10) -> Tuple[bool, float]:
        """
        Test a proxy's connectivity and performance
        
        Args:
            proxy: Proxy configuration to test
            timeout: Request timeout in seconds
            
        Returns:
            Tuple of (is_working, response_time)
        """
        test_urls = [
            'http://httpbin.org/ip',
            'https://ipinfo.io/json',
            'http://ip-api.com/json'
        ]
        
        proxy_url = f"http://{proxy.username}:{proxy.password}@{proxy.host}:{proxy.port}"
        
        for test_url in test_urls:
            try:
                start_time = time.time()
                
                async with aiohttp.ClientSession() as session:
                    async with session.get(
                        test_url,
                        proxy=proxy_url,
                        timeout=aiohttp.ClientTimeout(total=timeout)
                    ) as response:
                        if response.status == 200:
                            response_time = time.time() - start_time
                            return True, response_time
                        
            except Exception as e:
                logger.debug(f"Proxy test failed for {proxy.host}:{proxy.port} - {str(e)}")
                continue
        
        return False, 0.0

    async def health_check_all_proxies(self):
        """Perform health check on all proxies"""
        logger.info("Starting proxy health check...")
        
        tasks = []
        for proxy in self.proxies:
            if proxy.is_active:
                task = self._health_check_proxy(proxy)
                tasks.append(task)
        
        if tasks:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            healthy_count = sum(1 for r in results if r is True)
            logger.info(f"Health check completed: {healthy_count}/{len(tasks)} proxies healthy")

    async def _health_check_proxy(self, proxy: ProxyConfig) -> bool:
        """Health check for individual proxy"""
        try:
            is_working, response_time = await self.test_proxy(proxy)
            
            if is_working:
                proxy.metrics.last_success = datetime.now()
                proxy.metrics.consecutive_failures = 0
                
                # Update average response time
                if proxy.metrics.avg_response_time == 0:
                    proxy.metrics.avg_response_time = response_time
                else:
                    # Exponential moving average
                    proxy.metrics.avg_response_time = (
                        0.7 * proxy.metrics.avg_response_time + 
                        0.3 * response_time
                    )
                
                return True
            else:
                proxy.metrics.last_failure = datetime.now()
                proxy.metrics.consecutive_failures += 1
                
                # Disable proxy if too many consecutive failures
                if proxy.metrics.consecutive_failures >= self.max_consecutive_failures:
                    proxy.is_active = False
                    logger.warning(f"Disabled proxy {proxy.host}:{proxy.port} due to consecutive failures")
                
                return False
                
        except Exception as e:
            logger.error(f"Health check error for {proxy.host}:{proxy.port}: {str(e)}")
            proxy.metrics.consecutive_failures += 1
            return False

    def mark_proxy_success(self, proxy: ProxyConfig, response_time: float):
        """Mark a successful request for proxy metrics"""
        proxy.metrics.success_count += 1
        proxy.metrics.total_requests += 1
        proxy.metrics.last_success = datetime.now()
        proxy.metrics.consecutive_failures = 0
        
        # Update average response time
        if proxy.metrics.avg_response_time == 0:
            proxy.metrics.avg_response_time = response_time
        else:
            proxy.metrics.avg_response_time = (
                0.8 * proxy.metrics.avg_response_time + 
                0.2 * response_time
            )

    def mark_proxy_failure(self, proxy: ProxyConfig, platform: Optional[str] = None):
        """Mark a failed request for proxy metrics"""
        proxy.metrics.failure_count += 1
        proxy.metrics.total_requests += 1
        proxy.metrics.last_failure = datetime.now()
        proxy.metrics.consecutive_failures += 1
        
        # Mark platform as blocked if specified
        if platform:
            proxy.metrics.blocked_platforms.add(platform)
            logger.warning(f"Marked proxy {proxy.host}:{proxy.port} as blocked for {platform}")
        
        # Disable proxy if too many failures
        if proxy.metrics.consecutive_failures >= self.max_consecutive_failures:
            proxy.is_active = False
            logger.warning(f"Disabled proxy {proxy.host}:{proxy.port} due to consecutive failures")

    def get_proxy_stats(self) -> Dict[str, Any]:
        """Get comprehensive proxy statistics"""
        total_proxies = len(self.proxies)
        active_proxies = len([p for p in self.proxies if p.is_active])
        
        total_requests = sum(p.metrics.total_requests for p in self.proxies)
        total_successes = sum(p.metrics.success_count for p in self.proxies)
        
        success_rate = (total_successes / total_requests * 100) if total_requests > 0 else 0
        
        provider_stats = {}
        for proxy in self.proxies:
            provider = proxy.provider
            if provider not in provider_stats:
                provider_stats[provider] = {
                    'total': 0, 'active': 0, 'success_rate': 0, 'avg_response_time': 0
                }
            
            provider_stats[provider]['total'] += 1
            if proxy.is_active:
                provider_stats[provider]['active'] += 1
        
        return {
            'total_proxies': total_proxies,
            'active_proxies': active_proxies,
            'total_requests': total_requests,
            'success_rate': success_rate,
            'provider_stats': provider_stats,
            'last_health_check': datetime.now().isoformat()
        }

    async def start_health_monitoring(self):
        """Start background health monitoring"""
        async def health_monitor():
            while True:
                try:
                    await self.health_check_all_proxies()
                    await asyncio.sleep(self.health_check_interval)
                except Exception as e:
                    logger.error(f"Health monitoring error: {str(e)}")
                    await asyncio.sleep(60)  # Short retry delay
        
        self._health_check_task = asyncio.create_task(health_monitor())
        logger.info("Started background proxy health monitoring")

    def stop_health_monitoring(self):
        """Stop background health monitoring"""
        if self._health_check_task:
            self._health_check_task.cancel()
            logger.info("Stopped background proxy health monitoring")

    def export_config(self, filename: str):
        """Export current proxy configuration to file"""
        config = {
            'proxies': [
                {
                    'host': p.host,
                    'port': p.port,
                    'username': p.username,
                    'password': p.password,
                    'country': p.country,
                    'provider': p.provider,
                    'proxy_type': p.proxy_type,
                    'is_active': p.is_active
                }
                for p in self.proxies
            ]
        }
        
        with open(filename, 'w') as f:
            json.dump(config, f, indent=2)
        
        logger.info(f"Exported proxy configuration to {filename}")

# Example usage and testing
async def test_proxy_manager():
    """Test function for proxy manager"""
    manager = ProxyManager()
    
    # Add some test proxies (replace with real ones)
    test_proxies = [
        {
            'host': 'proxy1.example.com',
            'port': 8080,
            'username': 'user1',
            'password': 'pass1',
            'provider': 'testprovider'
        }
    ]
    
    manager.add_proxy_pool(test_proxies)
    
    # Start health monitoring
    await manager.start_health_monitoring()
    
    try:
        # Test proxy selection
        proxy = await manager.get_proxy_for_platform('facebook')
        if proxy:
            print(f"Selected proxy: {proxy.host}:{proxy.port}")
        
        # Get stats
        stats = manager.get_proxy_stats()
        print(f"Proxy stats: {json.dumps(stats, indent=2)}")
        
        # Wait a bit for health check
        await asyncio.sleep(10)
        
    finally:
        manager.stop_health_monitoring()

if __name__ == "__main__":
    asyncio.run(test_proxy_manager()) 