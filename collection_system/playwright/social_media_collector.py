"""
Social Media Collector - Autonomous data collection from social platforms
"""

import asyncio
import json
import logging
import os
import re
import time
from datetime import datetime
from typing import Dict, List, Optional, Tuple, Any, Callable

from playwright.async_api import async_playwright, Browser, Page, BrowserContext, ElementHandle
from .selector_manager import SelectorManager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("social_collector.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("social_collector")

class SocialMediaCollector:
    """
    Autonomous social media post collector using Playwright.
    This class intelligently adapts to DOM changes in social media platforms
    and collects posts in a reliable, resilient manner.
    """
    
    # Platform URL patterns
    PLATFORM_URLS = {
        "facebook": "https://www.facebook.com/",
        "instagram": "https://www.instagram.com/",
        "linkedin": "https://www.linkedin.com/feed/",
        "twitter": "https://twitter.com/home"
    }
    
    def __init__(self, data_dir: str = ".", headless: bool = True):
        """
        Initialize the social media collector.
        
        Args:
            data_dir: Directory to store data
            headless: Whether to run browser in headless mode
        """
        self.data_dir = data_dir
        self.headless = headless
        self.browser = None
        self.context = None
        self.selector_manager = SelectorManager(data_dir)
        self.api_key = None
        self.api_endpoint = None
        
        # Create data directory if it doesn't exist
        os.makedirs(data_dir, exist_ok=True)
    
    async def initialize(self):
        """Initialize the browser and context."""
        playwright = await async_playwright().start()
        self.browser = await playwright.chromium.launch(headless=self.headless)
        self.context = await self.browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36"
        )
        
        # Set default navigation timeout to 60 seconds
        self.context.set_default_timeout(60000)
    
    async def close(self):
        """Close browser and context."""
        if self.context:
            await self.context.close()
        if self.browser:
            await self.browser.close()
    
    def set_api_config(self, api_key: str, api_endpoint: str):
        """
        Set API configuration for sending collected data.
        
        Args:
            api_key: API key for authentication
            api_endpoint: API endpoint URL
        """
        self.api_key = api_key
        self.api_endpoint = api_endpoint
    
    async def collect_from_platform(self, platform: str, max_posts: int = 20) -> List[Dict]:
        """
        Collect posts from a specific social media platform.
        
        Args:
            platform: Platform to collect from (facebook, instagram, etc.)
            max_posts: Maximum number of posts to collect
            
        Returns:
            List of collected posts
        """
        if platform not in self.PLATFORM_URLS:
            raise ValueError(f"Unsupported platform: {platform}")
        
        logger.info(f"Starting collection from {platform}")
        
        # Create a new page
        page = await self.context.new_page()
        
        try:
            # Navigate to the platform URL
            await page.goto(self.PLATFORM_URLS[platform], wait_until="domcontentloaded")
            
            # Wait for content to load
            await asyncio.sleep(5)
            
            # Handle login if needed
            if await self._check_login_required(page, platform):
                logger.info(f"Login required for {platform}")
                await self._handle_login(page, platform)
            
            # Wait for feed to load
            await self._wait_for_feed(page, platform)
            
            # Collect posts
            posts = await self._collect_posts(page, platform, max_posts)
            
            logger.info(f"Collected {len(posts)} posts from {platform}")
            return posts
            
        except Exception as e:
            logger.error(f"Error collecting from {platform}: {str(e)}")
            return []
        finally:
            await page.close()
    
    async def _check_login_required(self, page: Page, platform: str) -> bool:
        """
        Check if login is required.
        
        Args:
            page: Playwright page
            platform: Platform name
            
        Returns:
            True if login is required, False otherwise
        """
        # Platform-specific login detection
        try:
            if platform == "facebook":
                # Check for login form
                return await page.locator("input[name='email'], form#login_form").count() > 0
                
            elif platform == "instagram":
                # Check for login button
                return await page.locator("button:has-text('Log In')").count() > 0
                
            elif platform == "linkedin":
                # Check for login form
                return await page.locator("input#username, .login-form").count() > 0
                
            elif platform == "twitter":
                # Check for login form
                return await page.locator("input[name='text'], form[action$='/login']").count() > 0
                
            return False
        except Exception as e:
            logger.error(f"Error checking login for {platform}: {str(e)}")
            return False
    
    async def _handle_login(self, page: Page, platform: str):
        """
        Handle login for the platform.
        
        Args:
            page: Playwright page
            platform: Platform name
        """
        # Load credentials from environment variables or configuration file
        # (Implementation depends on how you want to manage credentials)
        logger.info(f"Login not implemented for {platform}. Please log in manually.")
        
        # This would be implemented according to how you store credentials
        # For now, we'll simulate a manual login with a wait
        await asyncio.sleep(30)  # Wait for manual login
    
    async def _wait_for_feed(self, page: Page, platform: str):
        """
        Wait for the feed to load.
        
        Args:
            page: Playwright page
            platform: Platform name
        """
        try:
            # Get post selector for the platform
            post_selector = self.selector_manager.get_selector(platform, "post")
            
            # Wait for at least one post to appear
            await page.wait_for_selector(post_selector, timeout=30000)
            
            # Report success with this selector
            self.selector_manager.report_success(platform, "post", post_selector)
            
        except Exception as e:
            logger.error(f"Error waiting for feed on {platform}: {str(e)}")
            
            # Try alternative selectors
            if platform in self.selector_manager.selectors:
                for alt_selector in self.selector_manager.selectors[platform]["post"]:
                    if alt_selector != post_selector:
                        try:
                            logger.info(f"Trying alternative selector: {alt_selector}")
                            await page.wait_for_selector(alt_selector, timeout=10000)
                            
                            # If successful, update working selector
                            self.selector_manager.report_success(platform, "post", alt_selector)
                            return
                        except:
                            # Report failure with this selector
                            self.selector_manager.report_failure(platform, "post", alt_selector)
            
            # If we're here, all selectors failed
            raise Exception(f"Failed to detect feed on {platform}")
    
    async def _collect_posts(self, page: Page, platform: str, max_posts: int) -> List[Dict]:
        """
        Collect posts from the current page.
        
        Args:
            page: Playwright page
            platform: Platform name
            max_posts: Maximum number of posts to collect
            
        Returns:
            List of collected posts
        """
        posts = []
        attempts = 0
        max_attempts = 5
        
        while len(posts) < max_posts and attempts < max_attempts:
            try:
                # Get post selector
                post_selector = self.selector_manager.get_selector(platform, "post")
                
                # Find all post elements
                post_elements = await page.locator(post_selector).all()
                logger.info(f"Found {len(post_elements)} post elements on {platform}")
                
                # Process each post
                for element in post_elements[:max_posts]:
                    try:
                        post_data = await self._extract_post_data(page, element, platform)
                        if post_data and self._is_valid_post(post_data):
                            posts.append(post_data)
                            if len(posts) >= max_posts:
                                break
                    except Exception as e:
                        logger.error(f"Error extracting post data: {str(e)}")
                
                # If we don't have enough posts, scroll down and try again
                if len(posts) < max_posts:
                    await self._scroll_down(page)
                    await asyncio.sleep(2)  # Wait for new posts to load
            
            except Exception as e:
                logger.error(f"Error collecting posts: {str(e)}")
                
                # Report failure with this selector
                self.selector_manager.report_failure(platform, "post", post_selector)
                
                # Try an alternative selector
                if platform in self.selector_manager.selectors:
                    for alt_selector in self.selector_manager.selectors[platform]["post"]:
                        if alt_selector != post_selector:
                            try:
                                logger.info(f"Trying alternative post selector: {alt_selector}")
                                alt_elements = await page.locator(alt_selector).all()
                                if len(alt_elements) > 0:
                                    # If successful, update working selector
                                    self.selector_manager.report_success(platform, "post", alt_selector)
                                    break
                            except:
                                # Report failure with this selector
                                self.selector_manager.report_failure(platform, "post", alt_selector)
            
            attempts += 1
        
        return posts
    
    async def _extract_post_data(self, page: Page, post_element: ElementHandle, platform: str) -> Dict:
        """
        Extract data from a post element.
        
        Args:
            page: Playwright page
            post_element: Element handle for the post
            platform: Platform name
            
        Returns:
            Dictionary with post data
        """
        try:
            post_data = {
                "platform": platform,
                "collected_at": datetime.now().isoformat(),
                "platform_id": await self._extract_post_id(post_element, platform),
                "content": "",
                "original_user": "",
                "timestamp": "",
                "likes": 0,
                "comments": 0,
                "shares": 0,
                "is_sponsored": False,
                "is_job_post": False,
                "is_friend": False
            }
            
            # Extract content
            content_selector = self.selector_manager.get_selector(platform, "post_content")
            try:
                content_element = await post_element.query_selector(content_selector)
                if content_element:
                    post_data["content"] = await content_element.text_content() or ""
                    # Report success with this selector
                    self.selector_manager.report_success(platform, "post_content", content_selector)
                    
                    # Check if content is too short, try alternative selectors
                    if len(post_data["content"].strip()) < 10:
                        for alt_selector in self.selector_manager.selectors[platform]["post_content"]:
                            if alt_selector != content_selector:
                                try:
                                    alt_element = await post_element.query_selector(alt_selector)
                                    if alt_element:
                                        alt_content = await alt_element.text_content() or ""
                                        if len(alt_content.strip()) > len(post_data["content"].strip()):
                                            post_data["content"] = alt_content
                                            # Report success with alternative selector
                                            self.selector_manager.report_success(platform, "post_content", alt_selector)
                                except:
                                    pass
            except Exception as e:
                logger.error(f"Error extracting content: {str(e)}")
                self.selector_manager.report_failure(platform, "post_content", content_selector)
            
            # Extract author
            author_selector = self.selector_manager.get_selector(platform, "post_author")
            try:
                author_element = await post_element.query_selector(author_selector)
                if author_element:
                    post_data["original_user"] = await author_element.text_content() or ""
                    self.selector_manager.report_success(platform, "post_author", author_selector)
            except Exception as e:
                logger.error(f"Error extracting author: {str(e)}")
                self.selector_manager.report_failure(platform, "post_author", author_selector)
            
            # Extract timestamp
            timestamp_selector = self.selector_manager.get_selector(platform, "post_timestamp")
            try:
                timestamp_element = await post_element.query_selector(timestamp_selector)
                if timestamp_element:
                    post_data["timestamp"] = await timestamp_element.text_content() or ""
                    self.selector_manager.report_success(platform, "post_timestamp", timestamp_selector)
            except Exception as e:
                logger.error(f"Error extracting timestamp: {str(e)}")
                self.selector_manager.report_failure(platform, "post_timestamp", timestamp_selector)
            
            # Check if sponsored (platform-specific)
            post_data["is_sponsored"] = await self._check_if_sponsored(post_element, platform)
            
            # Check if job post (platform-specific)
            post_data["is_job_post"] = await self._check_if_job_post(post_element, platform)
            
            # Extract engagement stats
            stats = await self._extract_engagement_stats(post_element, platform)
            if stats:
                post_data.update(stats)
            
            # Perform platform-specific post processing
            post_data = await self._post_process(post_data, platform, post_element)
            
            return post_data
            
        except Exception as e:
            logger.error(f"Error in _extract_post_data: {str(e)}")
            return {}
    
    async def _extract_post_id(self, post_element: ElementHandle, platform: str) -> str:
        """
        Extract unique ID from post.
        
        Args:
            post_element: Element handle for the post
            platform: Platform name
            
        Returns:
            Post ID or empty string if not found
        """
        try:
            if platform == "facebook":
                # Try to get data-ft attribute which often contains post ID
                data_ft = await post_element.get_attribute("data-ft")
                if data_ft:
                    try:
                        data = json.loads(data_ft)
                        if "content_owner_id_new" in data:
                            return f"fb_{data['content_owner_id_new']}"
                    except:
                        pass
                
                # Try to get from sharing link
                share_link = await post_element.query_selector("a[href*='/posts/'], a[href*='/permalink/']")
                if share_link:
                    href = await share_link.get_attribute("href")
                    if href:
                        # Extract ID from URL
                        match = re.search(r'/posts/(\d+)|/permalink/(\d+)', href)
                        if match:
                            post_id = match.group(1) or match.group(2)
                            return f"fb_{post_id}"
            
            elif platform == "instagram":
                # Try to get from post link
                post_link = await post_element.query_selector("a[href*='/p/']")
                if post_link:
                    href = await post_link.get_attribute("href")
                    if href:
                        # Extract ID from URL
                        match = re.search(r'/p/([^/]+)', href)
                        if match:
                            return f"ig_{match.group(1)}"
            
            elif platform == "linkedin":
                # Try to get from data-urn attribute
                data_urn = await post_element.get_attribute("data-urn")
                if data_urn:
                    return f"li_{data_urn}"
                
                # Try to get from article id
                article_id = await post_element.get_attribute("data-id")
                if article_id:
                    return f"li_{article_id}"
            
            elif platform == "twitter":
                # Try to get from article data-testid
                article_id = await post_element.get_attribute("data-testid")
                if article_id and article_id == "tweet":
                    # Try to get from tweet link
                    tweet_link = await post_element.query_selector("a[href*='/status/']")
                    if tweet_link:
                        href = await tweet_link.get_attribute("href")
                        if href:
                            # Extract ID from URL
                            match = re.search(r'/status/(\d+)', href)
                            if match:
                                return f"tw_{match.group(1)}"
            
            # Generate a fallback ID based on content
            content = await post_element.text_content() or ""
            if content:
                import hashlib
                content_hash = hashlib.md5(content.encode()).hexdigest()
                return f"{platform[0:2]}_{content_hash[:16]}"
            
            # Generate a random ID as last resort
            import uuid
            return f"{platform[0:2]}_{uuid.uuid4().hex[:16]}"
            
        except Exception as e:
            logger.error(f"Error extracting post ID: {str(e)}")
            return ""
    
    async def _check_if_sponsored(self, post_element: ElementHandle, platform: str) -> bool:
        """
        Check if a post is sponsored.
        
        Args:
            post_element: Element handle for the post
            platform: Platform name
            
        Returns:
            True if post is sponsored, False otherwise
        """
        try:
            sponsored_indicators = {
                "facebook": [
                    "span:has-text('Sponsored')",
                    "span:has-text('Suggested for you')",
                    "span:has-text('Paid partnership')"
                ],
                "instagram": [
                    "span:has-text('Sponsored')",
                    "span:has-text('Paid partnership')"
                ],
                "linkedin": [
                    "span:has-text('Promoted')",
                    "span:has-text('Sponsored')"
                ],
                "twitter": [
                    "span:has-text('Promoted')",
                    "span:has-text('Ad')"
                ]
            }
            
            if platform in sponsored_indicators:
                for indicator in sponsored_indicators[platform]:
                    if await post_element.query_selector(indicator) is not None:
                        return True
            
            # Also check for sponsored keywords in the post text
            content = await post_element.text_content() or ""
            sponsored_keywords = [
                "#ad", "sponsored", "promoted", "paid partnership", "paid promotion",
                "in partnership with", "in collaboration with"
            ]
            content_lower = content.lower()
            for keyword in sponsored_keywords:
                if keyword in content_lower:
                    return True
            
            return False
            
        except Exception as e:
            logger.error(f"Error checking if sponsored: {str(e)}")
            return False
    
    async def _check_if_job_post(self, post_element: ElementHandle, platform: str) -> bool:
        """
        Check if a post is a job posting.
        
        Args:
            post_element: Element handle for the post
            platform: Platform name
            
        Returns:
            True if post is a job posting, False otherwise
        """
        try:
            job_indicators = {
                "facebook": [
                    "span:has-text('Job')",
                    "span:has-text('Hiring')",
                    "span:has-text('We're hiring')"
                ],
                "instagram": [
                    "span:has-text('Job')",
                    "span:has-text('Hiring')"
                ],
                "linkedin": [
                    "div:has-text('is hiring')",
                    "span:has-text('Job')",
                    "a:has-text('Apply now')",
                    "button:has-text('Apply')"
                ],
                "twitter": [
                    "span:has-text('Job')",
                    "span:has-text('Hiring')",
                    "span:has-text('We're hiring')"
                ]
            }
            
            if platform in job_indicators:
                for indicator in job_indicators[platform]:
                    if await post_element.query_selector(indicator) is not None:
                        return True
            
            # Also check for job keywords in the post text
            content = await post_element.text_content() or ""
            job_keywords = [
                "we're hiring", "we are hiring", "job opening", "job opportunity",
                "apply now", "job application", "position available", "join our team"
            ]
            content_lower = content.lower()
            for keyword in job_keywords:
                if keyword in content_lower:
                    return True
            
            return False
            
        except Exception as e:
            logger.error(f"Error checking if job post: {str(e)}")
            return False
    
    async def _extract_engagement_stats(self, post_element: ElementHandle, platform: str) -> Dict:
        """
        Extract engagement statistics from post.
        
        Args:
            post_element: Element handle for the post
            platform: Platform name
            
        Returns:
            Dictionary with engagement statistics
        """
        try:
            stats = {
                "likes": 0,
                "comments": 0,
                "shares": 0
            }
            
            # Get engagement stats selector
            stats_selector = self.selector_manager.get_selector(platform, "engagement_stats")
            
            try:
                stats_elements = await post_element.query_selector_all(stats_selector)
                
                if stats_elements:
                    # Report success with this selector
                    self.selector_manager.report_success(platform, "engagement_stats", stats_selector)
                    
                    # Platform-specific parsing
                    if platform == "facebook":
                        for element in stats_elements:
                            text = await element.text_content() or ""
                            if "like" in text.lower() or "reaction" in text.lower():
                                stats["likes"] = self._parse_count(text)
                            elif "comment" in text.lower():
                                stats["comments"] = self._parse_count(text)
                            elif "share" in text.lower():
                                stats["shares"] = self._parse_count(text)
                    
                    elif platform == "instagram":
                        if len(stats_elements) >= 2:
                            stats["likes"] = self._parse_count(await stats_elements[0].text_content() or "")
                            stats["comments"] = self._parse_count(await stats_elements[1].text_content() or "")
                    
                    elif platform == "linkedin":
                        for element in stats_elements:
                            text = await element.text_content() or ""
                            aria_label = await element.get_attribute("aria-label") or ""
                            
                            if "reaction" in text.lower() or "like" in text.lower() or "reaction" in aria_label.lower():
                                stats["likes"] = self._parse_count(text)
                            elif "comment" in text.lower() or "comment" in aria_label.lower():
                                stats["comments"] = self._parse_count(text)
                            elif "share" in text.lower() or "share" in aria_label.lower():
                                stats["shares"] = self._parse_count(text)
                    
                    elif platform == "twitter":
                        for element in stats_elements:
                            aria_label = await element.get_attribute("aria-label") or ""
                            
                            if "like" in aria_label.lower():
                                stats["likes"] = self._parse_count(aria_label)
                            elif "repl" in aria_label.lower():
                                stats["comments"] = self._parse_count(aria_label)
                            elif "retweet" in aria_label.lower():
                                stats["shares"] = self._parse_count(aria_label)
            
            except Exception as e:
                logger.error(f"Error extracting engagement stats: {str(e)}")
                self.selector_manager.report_failure(platform, "engagement_stats", stats_selector)
                
                # Try alternative selectors
                if platform in self.selector_manager.selectors:
                    for alt_selector in self.selector_manager.selectors[platform]["engagement_stats"]:
                        if alt_selector != stats_selector:
                            try:
                                alt_elements = await post_element.query_selector_all(alt_selector)
                                if alt_elements:
                                    # If successful, update working selector
                                    self.selector_manager.report_success(platform, "engagement_stats", alt_selector)
                                    break
                            except:
                                # Report failure with this selector
                                self.selector_manager.report_failure(platform, "engagement_stats", alt_selector)
            
            # Calculate total engagement
            stats["engagement_count"] = stats["likes"] + stats["comments"] + stats["shares"]
            
            return stats
            
        except Exception as e:
            logger.error(f"Error in _extract_engagement_stats: {str(e)}")
            return {}
    
    def _parse_count(self, text: str) -> int:
        """
        Parse count from text like "5 likes", "2K comments", etc.
        
        Args:
            text: Text to parse
            
        Returns:
            Integer count value
        """
        try:
            # Extract number and multiplier (K, M, etc.)
            match = re.search(r'([\d,\.]+)([KkMmBb])?', text)
            if not match:
                return 0
            
            count_str = match.group(1).replace(',', '')
            multiplier = match.group(2).lower() if match.group(2) else ''
            
            count = float(count_str)
            
            if multiplier == 'k':
                count *= 1000
            elif multiplier == 'm':
                count *= 1000000
            elif multiplier == 'b':
                count *= 1000000000
            
            return int(count)
            
        except Exception as e:
            logger.error(f"Error parsing count from '{text}': {str(e)}")
            return 0
    
    async def _post_process(self, post_data: Dict, platform: str, post_element: ElementHandle) -> Dict:
        """
        Perform platform-specific post-processing.
        
        Args:
            post_data: Post data dictionary
            platform: Platform name
            post_element: Element handle for the post
            
        Returns:
            Processed post data
        """
        # Clean and format content
        if "content" in post_data:
            post_data["content"] = re.sub(r'\s+', ' ', post_data["content"]).strip()
            
            # Calculate content length
            post_data["content_length"] = len(post_data["content"])
        
        # Clean author name
        if "original_user" in post_data:
            post_data["original_user"] = post_data["original_user"].strip()
        
        # Extract hashtags
        if "content" in post_data and post_data["content"]:
            hashtags = re.findall(r'#(\w+)', post_data["content"])
            if hashtags:
                post_data["hashtags"] = ",".join(hashtags)
        
        # Extract mentions
        if "content" in post_data and post_data["content"]:
            mentions = re.findall(r'@(\w+)', post_data["content"])
            if mentions:
                post_data["mentions"] = ",".join(mentions)
        
        # Extract external links
        if "content" in post_data and post_data["content"]:
            links = re.findall(r'https?://\S+', post_data["content"])
            if links:
                post_data["external_links"] = ",".join(links)
        
        # Identify if post is from a friend (platform specific)
        # For example, on Facebook friends often have a "Add Friend" or "Friends" button
        if platform == "facebook":
            friend_indicators = ["span:has-text('Friends')", "a:has-text('Friends')"]
            for indicator in friend_indicators:
                if await post_element.query_selector(indicator) is not None:
                    post_data["is_friend"] = True
                    break
        
        # Add more platform-specific processing as needed
        
        return post_data
    
    def _is_valid_post(self, post_data: Dict) -> bool:
        """
        Check if post data is valid for collection.
        
        Args:
            post_data: Post data dictionary
            
        Returns:
            True if post is valid, False otherwise
        """
        # Ensure we have required fields
        if not post_data.get("content") or len(post_data.get("content", "").strip()) < 5:
            return False
        
        # Ensure we have a platform ID
        if not post_data.get("platform_id"):
            return False
        
        return True
    
    async def _scroll_down(self, page: Page):
        """
        Scroll down the page to load more content.
        
        Args:
            page: Playwright page
        """
        await page.evaluate("window.scrollBy(0, 800)")
    
    async def send_posts_to_api(self, posts: List[Dict]) -> Dict:
        """
        Send collected posts to the API.
        
        Args:
            posts: List of post dictionaries
            
        Returns:
            API response dictionary
        """
        if not posts:
            return {"success": False, "message": "No posts to send"}
        
        if not self.api_key or not self.api_endpoint:
            return {"success": False, "message": "API configuration not set"}
        
        try:
            # Make a POST request to the API
            import aiohttp
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.api_endpoint,
                    json={"posts": posts, "platform": posts[0]["platform"]},
                    headers={"X-API-Key": self.api_key, "Content-Type": "application/json"}
                ) as response:
                    if response.status == 200:
                        result = await response.json()
                        logger.info(f"Successfully sent {len(posts)} posts to API")
                        return {"success": True, "message": f"Sent {len(posts)} posts", "response": result}
                    else:
                        error_text = await response.text()
                        logger.error(f"API error: {response.status} - {error_text}")
                        return {"success": False, "message": f"API error: {response.status}", "error": error_text}
                        
        except Exception as e:
            logger.error(f"Error sending posts to API: {str(e)}")
            return {"success": False, "message": f"Error: {str(e)}"}
    
    async def run_collection_job(self, platforms: List[str], posts_per_platform: int = 20) -> Dict:
        """
        Run a collection job for multiple platforms.
        
        Args:
            platforms: List of platforms to collect from
            posts_per_platform: Maximum posts to collect per platform
            
        Returns:
            Dictionary with job results
        """
        results = {}
        total_posts = 0
        total_sent = 0
        
        # Initialize browser if needed
        if not self.browser or not self.context:
            await self.initialize()
        
        # Collect from each platform
        for platform in platforms:
            try:
                # Collect posts
                posts = await self.collect_from_platform(platform, posts_per_platform)
                results[platform] = {"collected": len(posts)}
                total_posts += len(posts)
                
                # Send to API if configured
                if posts and self.api_key and self.api_endpoint:
                    api_result = await self.send_posts_to_api(posts)
                    results[platform]["api_result"] = api_result
                    
                    if api_result.get("success"):
                        total_sent += len(posts)
                
            except Exception as e:
                logger.error(f"Error in collection job for {platform}: {str(e)}")
                results[platform] = {"error": str(e)}
        
        # Summary
        results["summary"] = {
            "total_collected": total_posts,
            "total_sent": total_sent,
            "platforms": len(platforms),
            "timestamp": datetime.now().isoformat()
        }
        
        return results

# Helper function to run collection as a standalone script
async def main():
    """Run collector as a standalone script."""
    # Parse command line arguments
    import argparse
    parser = argparse.ArgumentParser(description="Social Media Post Collector")
    parser.add_argument("--platforms", nargs="+", default=["facebook", "linkedin"],
                        help="Platforms to collect from")
    parser.add_argument("--posts", type=int, default=20,
                        help="Number of posts to collect per platform")
    parser.add_argument("--headless", action="store_true", help="Run in headless mode")
    parser.add_argument("--api-key", help="API key for sending data")
    parser.add_argument("--api-endpoint", help="API endpoint for sending data")
    args = parser.parse_args()
    
    # Create collector
    collector = SocialMediaCollector(headless=args.headless)
    
    # Set API configuration if provided
    if args.api_key and args.api_endpoint:
        collector.set_api_config(args.api_key, args.api_endpoint)
    
    try:
        # Initialize
        await collector.initialize()
        
        # Run collection job
        results = await collector.run_collection_job(args.platforms, args.posts)
        
        # Print results
        print(json.dumps(results, indent=2))
        
    finally:
        # Clean up
        await collector.close()

if __name__ == "__main__":
    # Run main function
    asyncio.run(main()) 