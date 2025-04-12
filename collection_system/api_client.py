"""
API Client for sending collected posts to the Authentic Dashboard backend
"""

import aiohttp
import asyncio
import json
import logging
import os
import time
from typing import Dict, List, Any, Optional

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("api_client.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("api_client")

class AuthenticDashboardClient:
    """
    Client for interacting with the Authentic Dashboard API.
    Handles authentication, sending posts, and checking API status.
    """
    
    def __init__(self, base_url: str = "http://localhost:8000", api_key: Optional[str] = None):
        """
        Initialize the API client.
        
        Args:
            base_url: Base URL for the API
            api_key: API key for authentication
        """
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.session = None
        self.rate_limit_delay = 1.0  # seconds between requests
        self.last_request_time = 0
        self.max_retries = 3
        self.retry_delay = 2.0  # seconds between retries
    
    async def initialize(self):
        """Initialize the client session."""
        if self.session is None or self.session.closed:
            self.session = aiohttp.ClientSession(
                headers=self._get_headers()
            )
    
    async def close(self):
        """Close the client session."""
        if self.session and not self.session.closed:
            await self.session.close()
    
    def _get_headers(self) -> Dict[str, str]:
        """
        Get request headers including authentication.
        
        Returns:
            Dictionary of headers
        """
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "Authentic Dashboard Collector/1.0"
        }
        
        if self.api_key:
            headers["Authorization"] = f"Token {self.api_key}"
        
        return headers
    
    async def _respect_rate_limit(self):
        """Respect rate limiting by adding delay between requests."""
        current_time = time.time()
        time_since_last_request = current_time - self.last_request_time
        
        if time_since_last_request < self.rate_limit_delay:
            delay = self.rate_limit_delay - time_since_last_request
            await asyncio.sleep(delay)
        
        self.last_request_time = time.time()
    
    async def _make_request(self, method: str, endpoint: str, data: Optional[Dict] = None) -> Dict:
        """
        Make an API request with retry logic.
        
        Args:
            method: HTTP method (GET, POST, etc.)
            endpoint: API endpoint (path after base URL)
            data: Request data (for POST, PUT, etc.)
        
        Returns:
            API response as a dictionary
        
        Raises:
            Exception: If the request fails after retries
        """
        await self.initialize()
        
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        
        for attempt in range(self.max_retries):
            try:
                # Respect rate limit
                await self._respect_rate_limit()
                
                async with getattr(self.session, method.lower())(url, json=data) as response:
                    # Check if response is JSON
                    content_type = response.headers.get("Content-Type", "")
                    if "application/json" in content_type:
                        result = await response.json()
                    else:
                        result = {"status": response.status, "text": await response.text()}
                    
                    # Check if request was successful
                    if response.status < 400:
                        return result
                    else:
                        error_message = result.get("detail", str(result))
                        logger.error(f"API error ({response.status}): {error_message}")
                        
                        # Check for specific error codes
                        if response.status == 401:
                            raise Exception("Authentication failed. Check your API key.")
                        elif response.status == 429:
                            # Rate limited, increase delay
                            self.rate_limit_delay *= 2
                            logger.warning(f"Rate limited. Increasing delay to {self.rate_limit_delay} seconds.")
                        
                        # If not the last attempt, retry
                        if attempt < self.max_retries - 1:
                            retry_after = self.retry_delay * (2 ** attempt)
                            logger.info(f"Retrying in {retry_after} seconds (attempt {attempt + 1}/{self.max_retries})")
                            await asyncio.sleep(retry_after)
                        else:
                            raise Exception(f"Request failed after {self.max_retries} attempts: {error_message}")
            
            except aiohttp.ClientError as e:
                logger.error(f"Request error: {str(e)}")
                
                # If not the last attempt, retry
                if attempt < self.max_retries - 1:
                    retry_after = self.retry_delay * (2 ** attempt)
                    logger.info(f"Retrying in {retry_after} seconds (attempt {attempt + 1}/{self.max_retries})")
                    await asyncio.sleep(retry_after)
                else:
                    raise Exception(f"Request failed after {self.max_retries} attempts: {str(e)}")
    
    async def verify_api_key(self) -> bool:
        """
        Verify API key is valid.
        
        Returns:
            True if API key is valid, False otherwise
        """
        try:
            result = await self._make_request("GET", "api/verify-key/")
            return result.get("valid", False)
        except Exception as e:
            logger.error(f"API key verification failed: {str(e)}")
            return False
    
    async def health_check(self) -> Dict:
        """
        Check API health status.
        
        Returns:
            Health check response
        """
        try:
            return await self._make_request("GET", "api/health-check/")
        except Exception as e:
            logger.error(f"Health check failed: {str(e)}")
            return {"status": "error", "message": str(e)}
    
    async def send_posts(self, posts: List[Dict], platform: str, user_id: Optional[str] = None) -> Dict:
        """
        Send collected posts to the API.
        
        Args:
            posts: List of post dictionaries
            platform: Social media platform
            user_id: User ID for attribution
        
        Returns:
            API response
        """
        if not posts:
            logger.warning("No posts to send")
            return {"status": "warning", "message": "No posts to send", "posts_sent": 0}
        
        payload = {
            "platform": platform,
            "posts": posts
        }
        
        if user_id:
            payload["user_id"] = user_id
        
        try:
            result = await self._make_request("POST", "api/collect-posts/", payload)
            logger.info(f"Successfully sent {len(posts)} posts to API")
            return result
        except Exception as e:
            logger.error(f"Failed to send posts: {str(e)}")
            return {"status": "error", "message": str(e), "posts_sent": 0}
    
    async def get_post_stats(self, user_id: Optional[str] = None) -> Dict:
        """
        Get post statistics from API.
        
        Args:
            user_id: User ID for filtering
        
        Returns:
            Post statistics
        """
        endpoint = "api/post-stats/"
        if user_id:
            endpoint += f"?user_id={user_id}"
        
        try:
            return await self._make_request("GET", endpoint)
        except Exception as e:
            logger.error(f"Failed to get post stats: {str(e)}")
            return {"status": "error", "message": str(e)}
    
    async def send_feedback(self, post_id: str, feedback_type: str, value: Any, user_id: Optional[str] = None) -> Dict:
        """
        Send feedback for a post.
        
        Args:
            post_id: Post ID
            feedback_type: Type of feedback (e.g., "authenticity", "relevance")
            value: Feedback value
            user_id: User ID for attribution
        
        Returns:
            API response
        """
        payload = {
            "post_id": post_id,
            "feedback_type": feedback_type,
            "value": value
        }
        
        if user_id:
            payload["user_id"] = user_id
        
        try:
            return await self._make_request("POST", "api/feedback/", payload)
        except Exception as e:
            logger.error(f"Failed to send feedback: {str(e)}")
            return {"status": "error", "message": str(e)}
    
    async def batch_update_posts(self, updates: List[Dict]) -> Dict:
        """
        Send batch updates for multiple posts.
        
        Args:
            updates: List of update dictionaries with post_id and updates
        
        Returns:
            API response
        """
        try:
            return await self._make_request("POST", "api/batch-update-posts/", {"updates": updates})
        except Exception as e:
            logger.error(f"Failed to batch update posts: {str(e)}")
            return {"status": "error", "message": str(e)}
    
    async def process_ml(self) -> Dict:
        """
        Trigger ML processing on collected posts.
        
        Returns:
            API response with processing results
        """
        try:
            return await self._make_request("POST", "api/process-ml/")
        except Exception as e:
            logger.error(f"Failed to trigger ML processing: {str(e)}")
            return {"status": "error", "message": str(e)}


# Helper function to test the API client
async def test_client(base_url: str, api_key: Optional[str] = None):
    """Test API client functionality."""
    client = AuthenticDashboardClient(base_url, api_key)
    
    try:
        # Initialize client
        await client.initialize()
        
        # Check health
        health = await client.health_check()
        print(f"Health check: {health}")
        
        # Verify API key
        if api_key:
            valid = await client.verify_api_key()
            print(f"API key valid: {valid}")
        
        # Get post stats
        stats = await client.get_post_stats()
        print(f"Post stats: {stats}")
        
    except Exception as e:
        print(f"Error testing client: {str(e)}")
    finally:
        # Close client
        await client.close()

if __name__ == "__main__":
    # Get API URL and key from environment variables or use defaults
    api_url = os.environ.get("AUTHENTIC_API_URL", "http://localhost:8000")
    api_key = os.environ.get("AUTHENTIC_API_KEY", None)
    
    # Run test
    asyncio.run(test_client(api_url, api_key)) 