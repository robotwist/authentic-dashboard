"""
Stealth Social Media Collector - Undetectable Data Collection System

This module implements advanced anti-detection techniques to collect social media
data without being detected by platform security systems.
"""

import asyncio
import random
import time
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from urllib.parse import urljoin

from playwright.async_api import async_playwright, Browser, Page, BrowserContext
import requests
from fake_useragent import UserAgent

logger = logging.getLogger(__name__)

@dataclass
class ProxyConfig:
    """Configuration for proxy rotation"""
    host: str
    port: int
    username: Optional[str] = None
    password: Optional[str] = None
    country: Optional[str] = None
    provider: str = "residential"

@dataclass
class BrowserFingerprint:
    """Browser fingerprint configuration"""
    user_agent: str
    viewport: Dict[str, int]
    timezone: str
    language: str
    platform: str
    webgl_vendor: str
    webgl_renderer: str

class StealthCollector:
    """
    Advanced stealth collector that mimics human browsing behavior
    and evades detection through multiple layers of obfuscation.
    """
    
    def __init__(self, 
                 proxy_pool: List[ProxyConfig] = None,
                 max_pages_per_session: int = 50,
                 session_duration_minutes: int = 30):
        """
        Initialize the stealth collector.
        
        Args:
            proxy_pool: List of proxy configurations
            max_pages_per_session: Maximum pages to visit per session
            session_duration_minutes: Maximum session duration
        """
        self.proxy_pool = proxy_pool or []
        self.max_pages_per_session = max_pages_per_session
        self.session_duration_minutes = session_duration_minutes
        
        self.browser = None
        self.context = None
        self.current_proxy = None
        self.session_start_time = None
        self.pages_visited = 0
        
        # Human behavior simulation
        self.ua = UserAgent()
        self.reading_speeds = {
            'fast': (1.5, 3.0),      # seconds per 100 chars
            'normal': (2.0, 4.0),
            'slow': (3.0, 6.0)
        }
        
        # Platform-specific configurations
        self.platform_configs = {
            'facebook': {
                'base_url': 'https://www.facebook.com',
                'feed_url': 'https://www.facebook.com/',
                'warmup_pages': ['/marketplace', '/groups', '/events'],
                'post_selectors': [
                    'div[data-pagelet^="FeedUnit"]',
                    'div[data-testid="fbfeed_story"]',
                    'div[role="article"]'
                ]
            },
            'instagram': {
                'base_url': 'https://www.instagram.com',
                'feed_url': 'https://www.instagram.com/',
                'warmup_pages': ['/explore/', '/reels/'],
                'post_selectors': [
                    'article[role="presentation"]',
                    'div[class*="x1lliihq"]'
                ]
            },
            'linkedin': {
                'base_url': 'https://www.linkedin.com',
                'feed_url': 'https://www.linkedin.com/feed/',
                'warmup_pages': ['/jobs/', '/mynetwork/', '/notifications/'],
                'post_selectors': [
                    'div[data-urn]',
                    '.feed-shared-update-v2'
                ]
            }
        }

    async def initialize(self):
        """Initialize browser with anti-detection measures"""
        playwright = await async_playwright().start()
        
        # Select random proxy
        if self.proxy_pool:
            self.current_proxy = random.choice(self.proxy_pool)
        
        # Generate realistic browser fingerprint
        fingerprint = self._generate_browser_fingerprint()
        
        # Launch browser with stealth configuration
        self.browser = await playwright.chromium.launch(
            headless=True,
            args=[
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-features=VizDisplayCompositor',
                f'--user-agent={fingerprint.user_agent}',
                '--disable-blink-features=AutomationControlled',
                '--no-first-run',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
            ]
        )
        
        # Create context with proxy if available
        context_options = {
            'viewport': fingerprint.viewport,
            'user_agent': fingerprint.user_agent,
            'timezone_id': fingerprint.timezone,
            'locale': fingerprint.language,
            'extra_http_headers': {
                'Accept-Language': f'{fingerprint.language},en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Upgrade-Insecure-Requests': '1'
            }
        }
        
        if self.current_proxy:
            context_options['proxy'] = {
                'server': f'http://{self.current_proxy.host}:{self.current_proxy.port}',
                'username': self.current_proxy.username,
                'password': self.current_proxy.password
            }
        
        self.context = await self.browser.new_context(**context_options)
        
        # Add stealth scripts to every page
        await self.context.add_init_script("""
            // Remove webdriver property
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });
            
            // Mock plugins
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5],
            });
            
            // Mock languages
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en'],
            });
            
            // Override chrome property
            window.chrome = {
                runtime: {},
            };
            
            // Mock permissions
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );
        """)
        
        self.session_start_time = datetime.now()
        self.pages_visited = 0
        
        logger.info("Stealth collector initialized successfully")

    def _generate_browser_fingerprint(self) -> BrowserFingerprint:
        """Generate a realistic browser fingerprint"""
        # Common screen resolutions
        viewports = [
            {'width': 1920, 'height': 1080},
            {'width': 1366, 'height': 768},
            {'width': 1440, 'height': 900},
            {'width': 1536, 'height': 864},
            {'width': 1280, 'height': 720}
        ]
        
        # Common timezones
        timezones = [
            'America/New_York', 'America/Los_Angeles', 'America/Chicago',
            'Europe/London', 'Europe/Berlin', 'Europe/Paris',
            'Asia/Tokyo', 'Australia/Sydney'
        ]
        
        # Common languages
        languages = ['en-US', 'en-GB', 'es-ES', 'fr-FR', 'de-DE']
        
        # WebGL configurations
        webgl_configs = [
            {'vendor': 'Google Inc.', 'renderer': 'ANGLE (Intel, Intel(R) HD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11-27.20.100.8935)'},
            {'vendor': 'Google Inc.', 'renderer': 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB Direct3D11 vs_5_0 ps_5_0, D3D11-27.21.14.5671)'},
            {'vendor': 'Google Inc.', 'renderer': 'ANGLE (AMD, AMD Radeon RX 580 Series Direct3D11 vs_5_0 ps_5_0, D3D11-27.20.22012.1)'}
        ]
        
        viewport = random.choice(viewports)
        webgl = random.choice(webgl_configs)
        
        return BrowserFingerprint(
            user_agent=self.ua.random,
            viewport=viewport,
            timezone=random.choice(timezones),
            language=random.choice(languages),
            platform='Win32',
            webgl_vendor=webgl['vendor'],
            webgl_renderer=webgl['renderer']
        )

    async def collect_from_platform(self, platform: str, max_posts: int = 50) -> List[Dict]:
        """
        Collect posts from a platform using stealth techniques
        
        Args:
            platform: Platform to collect from
            max_posts: Maximum number of posts to collect
            
        Returns:
            List of collected posts
        """
        if platform not in self.platform_configs:
            raise ValueError(f"Unsupported platform: {platform}")
        
        config = self.platform_configs[platform]
        
        try:
            # Create new page
            page = await self.context.new_page()
            
            # Set additional stealth measures
            await self._setup_page_stealth(page)
            
            # Warmup browsing - visit other pages first
            await self._warmup_session(page, platform)
            
            # Navigate to main feed
            await self._human_navigate(page, config['feed_url'])
            
            # Wait for content to load with human-like patience
            await self._human_wait(page, random.uniform(3, 8))
            
            # Collect posts with realistic behavior
            posts = await self._collect_posts_stealthily(page, platform, max_posts)
            
            # Random additional browsing to mask intent
            await self._post_collection_browsing(page, platform)
            
            await page.close()
            return posts
            
        except Exception as e:
            logger.error(f"Error in stealth collection for {platform}: {str(e)}")
            return []

    async def _setup_page_stealth(self, page: Page):
        """Setup additional stealth measures for the page"""
        # Block unnecessary resources to reduce fingerprinting
        await page.route("**/*.{png,jpg,jpeg,gif,svg,woff,woff2}", lambda route: route.abort())
        
        # Intercept and modify requests
        def handle_request(route):
            headers = route.request.headers
            # Remove automation headers
            headers.pop('sec-ch-ua', None)
            headers.pop('sec-ch-ua-mobile', None)
            headers.pop('sec-ch-ua-platform', None)
            route.continue_(headers=headers)
        
        await page.route("**/*", handle_request)

    async def _warmup_session(self, page: Page, platform: str):
        """Perform warmup browsing to establish realistic session"""
        config = self.platform_configs[platform]
        
        # Visit 1-3 warmup pages
        warmup_count = random.randint(1, 3)
        warmup_pages = random.sample(config['warmup_pages'], min(warmup_count, len(config['warmup_pages'])))
        
        for warmup_page in warmup_pages:
            url = urljoin(config['base_url'], warmup_page)
            await self._human_navigate(page, url)
            
            # Simulate reading/browsing time
            reading_time = random.uniform(10, 30)
            await self._simulate_reading(page, reading_time)
            
            # Random scrolling
            await self._human_scroll(page, random.randint(2, 5))
            
            self.pages_visited += 1

    async def _human_navigate(self, page: Page, url: str):
        """Navigate to URL with human-like behavior"""
        # Random delay before navigation
        await asyncio.sleep(random.uniform(0.5, 2.0))
        
        # Navigate with realistic timeout
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        except Exception as e:
            logger.warning(f"Navigation timeout for {url}: {str(e)}")
        
        # Random post-navigation delay
        await asyncio.sleep(random.uniform(1.0, 3.0))

    async def _human_wait(self, page: Page, duration: float):
        """Wait with occasional mouse movements and activity"""
        start_time = time.time()
        
        while time.time() - start_time < duration:
            # Random mouse movement
            x = random.randint(100, 800)
            y = random.randint(100, 600)
            await page.mouse.move(x, y)
            
            # Small wait
            await asyncio.sleep(random.uniform(0.5, 1.5))

    async def _simulate_reading(self, page: Page, duration: float):
        """Simulate reading behavior on the page"""
        reading_style = random.choice(['fast', 'normal', 'slow'])
        
        # Scroll down occasionally while "reading"
        scroll_intervals = max(1, int(duration / 5))
        
        for i in range(scroll_intervals):
            await asyncio.sleep(duration / scroll_intervals)
            
            # Random scroll
            if random.random() < 0.7:  # 70% chance of scrolling
                await self._human_scroll(page, 1)

    async def _human_scroll(self, page: Page, scroll_count: int):
        """Perform human-like scrolling"""
        for _ in range(scroll_count):
            # Random scroll distance
            scroll_distance = random.randint(200, 800)
            
            # Smooth scrolling with easing
            await page.evaluate(f"""
                window.scrollBy({{
                    top: {scroll_distance},
                    behavior: 'smooth'
                }});
            """)
            
            # Wait between scrolls
            await asyncio.sleep(random.uniform(1.0, 3.0))

    async def _collect_posts_stealthily(self, page: Page, platform: str, max_posts: int) -> List[Dict]:
        """Collect posts using stealth techniques"""
        config = self.platform_configs[platform]
        posts = []
        
        # Try multiple selectors for resilience
        post_elements = []
        for selector in config['post_selectors']:
            try:
                elements = await page.query_selector_all(selector)
                if elements:
                    post_elements = elements
                    break
            except Exception:
                continue
        
        if not post_elements:
            logger.warning(f"No post elements found for {platform}")
            return []
        
        # Collect posts with human-like behavior
        for i, element in enumerate(post_elements[:max_posts]):
            try:
                # Scroll element into view naturally
                await element.scroll_into_view_if_needed()
                await asyncio.sleep(random.uniform(0.5, 1.5))
                
                # Extract post data
                post_data = await self._extract_post_data(page, element, platform)
                if post_data:
                    posts.append(post_data)
                
                # Simulate reading time based on content length
                if post_data.get('content'):
                    reading_time = len(post_data['content']) / 100 * random.uniform(1.5, 3.0)
                    await asyncio.sleep(min(reading_time, 10))  # Cap at 10 seconds
                
                # Occasional interactions (very sparingly)
                if random.random() < 0.05:  # 5% chance
                    await self._simulate_interaction(page, element)
                
            except Exception as e:
                logger.warning(f"Error extracting post {i}: {str(e)}")
                continue
        
        return posts

    async def _extract_post_data(self, page: Page, element, platform: str) -> Optional[Dict]:
        """Extract post data from element"""
        try:
            # Extract text content
            content = await element.inner_text()
            if not content or len(content.strip()) < 10:
                return None
            
            # Basic post data
            post_data = {
                'platform': platform,
                'content': content.strip(),
                'collected_at': datetime.now().isoformat(),
                'content_length': len(content),
            }
            
            # Platform-specific extraction
            if platform == 'facebook':
                post_data.update(await self._extract_facebook_data(element))
            elif platform == 'instagram':
                post_data.update(await self._extract_instagram_data(element))
            elif platform == 'linkedin':
                post_data.update(await self._extract_linkedin_data(element))
            
            return post_data
            
        except Exception as e:
            logger.error(f"Error extracting post data: {str(e)}")
            return None

    async def _extract_facebook_data(self, element) -> Dict:
        """Extract Facebook-specific post data"""
        data = {}
        
        try:
            # Try to find author
            author_element = await element.query_selector('strong[dir="auto"], a[role="link"] strong')
            if author_element:
                data['original_user'] = await author_element.inner_text()
            
            # Check for sponsored content
            sponsored_indicators = ['Sponsored', 'Promoted', 'Advertisement']
            text = await element.inner_text()
            data['is_sponsored'] = any(indicator in text for indicator in sponsored_indicators)
            
        except Exception:
            pass
            
        return data

    async def _extract_instagram_data(self, element) -> Dict:
        """Extract Instagram-specific post data"""
        data = {}
        
        try:
            # Try to find username
            username_element = await element.query_selector('a[href*="/"] span, div[dir="auto"] span')
            if username_element:
                data['original_user'] = await username_element.inner_text()
                
        except Exception:
            pass
            
        return data

    async def _extract_linkedin_data(self, element) -> Dict:
        """Extract LinkedIn-specific post data"""
        data = {}
        
        try:
            # Try to find author
            author_element = await element.query_selector('.feed-shared-actor__name, .feed-shared-actor__title')
            if author_element:
                data['original_user'] = await author_element.inner_text()
            
            # Check for job postings
            text = await element.inner_text()
            job_indicators = ['is hiring', 'job opening', 'We are looking for', 'Apply now']
            data['is_job_post'] = any(indicator.lower() in text.lower() for indicator in job_indicators)
            
        except Exception:
            pass
            
        return data

    async def _simulate_interaction(self, page: Page, element):
        """Occasionally simulate user interactions"""
        interaction_type = random.choice(['hover', 'click_safe_area'])
        
        try:
            if interaction_type == 'hover':
                await element.hover()
                await asyncio.sleep(random.uniform(0.5, 2.0))
            elif interaction_type == 'click_safe_area':
                # Click on a safe area (not buttons/links)
                box = await element.bounding_box()
                if box:
                    x = box['x'] + box['width'] * 0.1
                    y = box['y'] + box['height'] * 0.1
                    await page.mouse.click(x, y)
                    
        except Exception:
            pass  # Ignore interaction errors

    async def _post_collection_browsing(self, page: Page, platform: str):
        """Perform additional browsing after collection to mask intent"""
        if random.random() < 0.3:  # 30% chance
            config = self.platform_configs[platform]
            
            # Visit one more page
            if config['warmup_pages']:
                extra_page = random.choice(config['warmup_pages'])
                url = urljoin(config['base_url'], extra_page)
                await self._human_navigate(page, url)
                await self._simulate_reading(page, random.uniform(5, 15))

    async def should_rotate_session(self) -> bool:
        """Check if session should be rotated"""
        session_duration = datetime.now() - self.session_start_time
        
        return (
            session_duration.total_seconds() > self.session_duration_minutes * 60 or
            self.pages_visited >= self.max_pages_per_session
        )

    async def rotate_session(self):
        """Rotate to new session with different fingerprint"""
        if self.context:
            await self.context.close()
        
        # Re-initialize with new fingerprint
        await self.initialize()
        
        logger.info("Session rotated successfully")

    async def close(self):
        """Clean up resources"""
        if self.context:
            await self.context.close()
        if self.browser:
            await self.browser.close()
        
        logger.info("Stealth collector closed")

# Usage example and testing functions
async def test_stealth_collector():
    """Test function for the stealth collector"""
    collector = StealthCollector()
    
    try:
        await collector.initialize()
        
        # Test collection from Facebook
        posts = await collector.collect_from_platform('facebook', max_posts=5)
        
        print(f"Collected {len(posts)} posts")
        for post in posts:
            print(f"- {post.get('original_user', 'Unknown')}: {post.get('content', '')[:100]}...")
        
    finally:
        await collector.close()

if __name__ == "__main__":
    asyncio.run(test_stealth_collector()) 