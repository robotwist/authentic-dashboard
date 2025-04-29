import requests
from datetime import datetime, timedelta
from django.conf import settings
from config_project.social_auth_settings import (
    FACEBOOK_CONFIG,
    INSTAGRAM_CONFIG,
    LINKEDIN_CONFIG,
    THREADS_CONFIG,
    OAUTH_CONFIG,
    TOKEN_CONFIG,
    RATE_LIMITS
)

class SocialAPIClient:
    """Base class for social media API interactions"""
    
    def __init__(self, platform, access_token=None):
        self.platform = platform.lower()
        self.access_token = access_token
        self.config = self._get_config()
        self.rate_limits = RATE_LIMITS.get(platform.upper(), {})
        
    def _get_config(self):
        configs = {
            'facebook': FACEBOOK_CONFIG,
            'instagram': INSTAGRAM_CONFIG,
            'linkedin': LINKEDIN_CONFIG,
            'threads': THREADS_CONFIG
        }
        return configs.get(self.platform)
    
    def _make_request(self, method, endpoint, params=None, data=None, headers=None):
        """Make an API request with rate limiting and error handling"""
        if not headers:
            headers = {}
        
        if self.access_token:
            headers['Authorization'] = f'Bearer {self.access_token}'
        
        url = f"{self.config['API_BASE_URL']}{endpoint}"
        
        try:
            response = requests.request(
                method,
                url,
                params=params,
                json=data,
                headers=headers
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            # Log error and handle rate limits
            self._handle_error(e)
            raise
    
    def _handle_error(self, error):
        """Handle API errors and rate limits"""
        if hasattr(error.response, 'status_code'):
            if error.response.status_code == 429:  # Too Many Requests
                # Implement exponential backoff
                pass
            elif error.response.status_code == 401:  # Unauthorized
                # Token might be expired
                self._refresh_token()
    
    def _refresh_token(self):
        """Refresh the access token if possible"""
        # Implement token refresh logic
        pass

class FacebookAPI(SocialAPIClient):
    def __init__(self, access_token=None):
        super().__init__('facebook', access_token)
    
    def get_user_profile(self):
        """Get the user's Facebook profile"""
        return self._make_request(
            'GET',
            'me',
            params={'fields': self.config['FIELDS']}
        )
    
    def get_page_posts(self, page_id, limit=25):
        """Get posts from a Facebook page"""
        return self._make_request(
            'GET',
            f'{page_id}/posts',
            params={
                'limit': limit,
                'fields': 'id,message,created_time,type,shares,reactions.summary(true)'
            }
        )

class InstagramAPI(SocialAPIClient):
    def __init__(self, access_token=None):
        super().__init__('instagram', access_token)
    
    def get_user_profile(self):
        """Get the user's Instagram profile"""
        return self._make_request(
            'GET',
            'me',
            params={'fields': 'id,username,account_type,media_count'}
        )
    
    def get_user_media(self, limit=25):
        """Get the user's Instagram media"""
        return self._make_request(
            'GET',
            'me/media',
            params={
                'fields': 'id,caption,media_type,media_url,permalink,timestamp',
                'limit': limit
            }
        )

class LinkedInAPI(SocialAPIClient):
    def __init__(self, access_token=None):
        super().__init__('linkedin', access_token)
    
    def get_user_profile(self):
        """Get the user's LinkedIn profile"""
        return self._make_request(
            'GET',
            'me',
            params={'projection': '(id,firstName,lastName,profilePicture)'}
        )
    
    def get_user_posts(self, limit=25):
        """Get the user's LinkedIn posts"""
        return self._make_request(
            'GET',
            'me/posts',
            params={'count': limit}
        )

class ThreadsAPI(SocialAPIClient):
    def __init__(self, access_token=None):
        super().__init__('threads', access_token)
    
    def get_user_profile(self):
        """Get the user's Threads profile"""
        return self._make_request(
            'GET',
            'me',
            params={'fields': self.config['FIELDS']}
        )
    
    def get_user_threads(self, limit=25):
        """Get the user's Threads posts"""
        return self._make_request(
            'GET',
            'me/threads',
            params={
                'fields': 'id,text,created_time,permalink,like_count,reply_count,repost_count,quote_count',
                'limit': limit
            }
        )
    
    def create_thread(self, text, link=None, media_ids=None):
        """
        Create a new thread
        
        Args:
            text: The text content of the thread
            link: Optional URL to include
            media_ids: Optional list of media IDs to attach
        """
        data = {
            'text': text
        }
        
        if link:
            data['link'] = link
            
        if media_ids:
            data['media_ids'] = media_ids
            
        return self._make_request(
            'POST',
            'me/threads',
            data=data
        )
    
    def upload_media(self, media_path, media_type='image'):
        """
        Upload media to use in a thread
        
        Args:
            media_path: Path to the media file
            media_type: Type of media ('image' or 'video')
            
        Returns:
            Media ID to use in thread creation
        """
        import os
        
        # Check if file exists
        if not os.path.exists(media_path):
            raise FileNotFoundError(f"Media file not found: {media_path}")
            
        # Get file size
        file_size = os.path.getsize(media_path)
        
        # Check constraints
        constraints = self.config['MEDIA_CONSTRAINTS']
        if media_type.lower() == 'image':
            constraints = constraints['IMAGE']
        elif media_type.lower() == 'video':
            constraints = constraints['VIDEO']
        else:
            raise ValueError(f"Unsupported media type: {media_type}")
            
        # Validate file size
        if file_size > constraints['MAX_SIZE']:
            raise ValueError(f"File size ({file_size} bytes) exceeds maximum allowed ({constraints['MAX_SIZE']} bytes)")
            
        # Extract file extension
        _, file_extension = os.path.splitext(media_path)
        file_extension = file_extension.lstrip('.').lower()
        
        # Validate file format
        if file_extension not in constraints['SUPPORTED_FORMATS']:
            raise ValueError(f"Unsupported file format: {file_extension}. Supported formats: {', '.join(constraints['SUPPORTED_FORMATS'])}")
            
        # Initiate upload session
        init_data = {
            'media_type': media_type.upper(),
            'product': 'THREADS'
        }
        
        session_response = self._make_request(
            'POST',
            'me/media',
            data=init_data
        )
        
        upload_session_id = session_response.get('id')
        if not upload_session_id:
            raise Exception("Failed to create media upload session")
            
        # Upload the file
        with open(media_path, 'rb') as media_file:
            files = {'source': (os.path.basename(media_path), media_file)}
            headers = {'Authorization': f'Bearer {self.access_token}'}
            
            url = f"{self.config['API_BASE_URL']}me/media"
            params = {'upload_phase': 'transfer', 'media_id': upload_session_id}
            
            response = requests.post(
                url,
                params=params,
                files=files,
                headers=headers
            )
            response.raise_for_status()
            
        # Finalize upload
        finalize_data = {
            'media_id': upload_session_id,
            'upload_phase': 'finish'
        }
        
        finalize_response = self._make_request(
            'POST',
            'me/media',
            data=finalize_data
        )
        
        return upload_session_id
    
    def reply_to_thread(self, thread_id, text, media_ids=None):
        """
        Reply to an existing thread
        
        Args:
            thread_id: ID of the thread to reply to
            text: The text content of the reply
            media_ids: Optional list of media IDs to attach
        """
        data = {
            'text': text
        }
        
        if media_ids:
            data['media_ids'] = media_ids
            
        return self._make_request(
            'POST',
            f'threads/{thread_id}/replies',
            data=data
        )
    
    def repost_thread(self, thread_id):
        """
        Repost an existing thread (without adding text)
        
        Args:
            thread_id: ID of the thread to repost
        """
        return self._make_request(
            'POST',
            f'threads/{thread_id}/reposts',
            data={}
        )
    
    def quote_thread(self, thread_id, text):
        """
        Quote an existing thread with additional text
        
        Args:
            thread_id: ID of the thread to quote
            text: The text content to add to the quote
        """
        data = {
            'text': text
        }
        
        return self._make_request(
            'POST',
            f'threads/{thread_id}/quotes',
            data=data
        )
    
    def like_thread(self, thread_id):
        """
        Like a thread
        
        Args:
            thread_id: ID of the thread to like
        """
        return self._make_request(
            'POST',
            f'threads/{thread_id}/likes',
            data={}
        )
    
    def unlike_thread(self, thread_id):
        """
        Remove like from a thread
        
        Args:
            thread_id: ID of the thread to unlike
        """
        return self._make_request(
            'DELETE',
            f'threads/{thread_id}/likes'
        )
    
    def get_thread_insights(self, thread_id):
        """
        Get engagement insights for a thread
        
        Args:
            thread_id: ID of the thread
        """
        return self._make_request(
            'GET',
            f'threads/{thread_id}/insights',
            params={
                'metric': 'likes,replies,reposts,quotes,impressions,reach,saves,profile_visits'
            }
        )
    
    def get_thread_replies(self, thread_id, limit=25):
        """
        Get replies to a thread
        
        Args:
            thread_id: ID of the thread
            limit: Maximum number of replies to return
        """
        return self._make_request(
            'GET',
            f'threads/{thread_id}/replies',
            params={
                'fields': 'id,text,created_time,like_count,user{id,username,profile_pic_url}',
                'limit': limit
            }
        )
    
    def search_threads(self, query, limit=25):
        """
        Search for threads by keyword
        
        Args:
            query: Search term
            limit: Maximum number of results to return
        """
        return self._make_request(
            'GET',
            'threads/search',
            params={
                'q': query,
                'fields': 'id,text,created_time,permalink,like_count,reply_count,user{id,username}',
                'limit': limit
            }
        )
    
    def get_trending_topics(self, limit=10):
        """
        Get trending topics on Threads
        
        Args:
            limit: Maximum number of trending topics to return
        """
        return self._make_request(
            'GET',
            'trending/threads',
            params={
                'limit': limit
            }
        )
        
    def delete_thread(self, thread_id):
        """
        Delete a thread
        
        Args:
            thread_id: ID of the thread to delete
        """
        return self._make_request(
            'DELETE',
            f'threads/{thread_id}'
        )
        
    def get_thread(self, thread_id):
        """
        Get details about a specific thread
        
        Args:
            thread_id: ID of the thread
        """
        return self._make_request(
            'GET',
            f'threads/{thread_id}',
            params={
                'fields': 'id,text,created_time,permalink,like_count,reply_count,repost_count,quote_count,media{media_type,media_url},user{id,username,profile_pic_url}'
            }
        )
        
    def create_poll(self, text, options, duration_hours=24, link=None, media_ids=None):
        """
        Create a new thread with a poll
        
        Args:
            text: The text content of the thread
            options: List of poll options (2-4 options required)
            duration_hours: Poll duration in hours (1-168)
            link: Optional URL to include
            media_ids: Optional list of media IDs to attach
        """
        if not 2 <= len(options) <= 4:
            raise ValueError("Poll must have between 2 and 4 options")
            
        if not 1 <= duration_hours <= 168:
            raise ValueError("Poll duration must be between 1 and 168 hours")
            
        data = {
            'text': text,
            'poll': {
                'options': options,
                'duration': duration_hours * 3600  # Convert to seconds
            }
        }
        
        if link:
            data['link'] = link
            
        if media_ids:
            data['media_ids'] = media_ids
            
        return self._make_request(
            'POST',
            'me/threads',
            data=data
        )
        
    def get_mentions(self, limit=25):
        """
        Get threads where the user has been mentioned
        
        Args:
            limit: Maximum number of mentions to return
        """
        return self._make_request(
            'GET',
            'me/mentions',
            params={
                'fields': 'id,text,created_time,permalink,user{id,username,profile_pic_url}',
                'limit': limit
            }
        )
        
    def get_embed_code(self, thread_url):
        """
        Get oEmbed code for embedding a thread on a website
        
        Args:
            thread_url: URL of the thread to embed
        """
        return self._make_request(
            'GET',
            'https://graph.threads.net/oembed',
            params={
                'url': thread_url,
                'omitscript': False
            }
        )
        
    def create_thread_with_georestrictions(self, text, countries, link=None, media_ids=None):
        """
        Create a new thread with geographic restrictions
        
        Args:
            text: The text content of the thread
            countries: List of country codes to restrict to (ISO 3166-1 alpha-2)
            link: Optional URL to include
            media_ids: Optional list of media IDs to attach
        """
        data = {
            'text': text,
            'geo_restrictions': {
                'countries': countries
            }
        }
        
        if link:
            data['link'] = link
            
        if media_ids:
            data['media_ids'] = media_ids
            
        return self._make_request(
            'POST',
            'me/threads',
            data=data
        )
        
    def upload_media_with_alt_text(self, media_path, alt_text, media_type='image'):
        """
        Upload media with alt text for accessibility
        
        Args:
            media_path: Path to the media file
            alt_text: Alternative text for the media
            media_type: Type of media ('image' or 'video')
        """
        # First create a media upload session
        media_id = self.upload_media(media_path, media_type)
        
        # Add alt text to the media
        if media_id:
            self._make_request(
                'POST',
                f'me/media/{media_id}',
                data={
                    'alt_text': alt_text
                }
            )
            
        return media_id 