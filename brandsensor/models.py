from django.db import models
from django.contrib.auth.models import User
import json
import hashlib
from django.utils import timezone


class Brand(models.Model):
    name = models.CharField(max_length=255)
    domain = models.URLField(unique=True)
    trust_score = models.IntegerField(default=100)

    def __str__(self):
        return self.name


class BehaviorLog(models.Model):
    BEHAVIOR_TYPES = [
        ('popup', 'Popup'),
        ('tracker', 'Tracker'),
        ('urgency', 'Urgency Message'),
        ('buzzwords', 'Buzzwords'),
        # Additional action types used in views
        ('collect_posts', 'Collect Posts'),
        ('update_preferences', 'Update Preferences'),
        ('feedback_category', 'Feedback Category'),
        ('feedback_sentiment', 'Feedback Sentiment'),
        ('feedback_relevance', 'Feedback Relevance'),
        ('feedback_hide', 'Feedback Hide'),
        ('feedback_star', 'Feedback Star'),
        ('delete_api_key', 'Delete API Key'),
    ]

    brand = models.ForeignKey(Brand, on_delete=models.CASCADE, null=True, blank=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    behavior_type = models.CharField(max_length=50, choices=BEHAVIOR_TYPES)
    count = models.IntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    
    # Additional fields for app action logging
    platform = models.CharField(max_length=20, blank=True, null=True)
    action = models.CharField(max_length=50, blank=True, null=True)  # For backward compatibility
    details = models.TextField(blank=True, null=True)  # Additional information

    def __str__(self):
        if self.brand:
            return f"{self.brand.name} - {self.behavior_type} ({self.count})"
        return f"{self.user.username} - {self.behavior_type} - {self.details or ''}"
        
    def save(self, *args, **kwargs):
        # For backward compatibility: if action is provided but behavior_type is not,
        # copy action to behavior_type
        if self.action and not self.behavior_type:
            self.behavior_type = self.action
        
        super().save(*args, **kwargs)


class UserPreference(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    friends_only = models.BooleanField(default=False)
    family_only = models.BooleanField(default=False)
    interest_filter = models.CharField(max_length=100, blank=True)  # e.g., "running"
    approved_brands = models.TextField(blank=True)  # comma-separated list
    hide_sponsored = models.BooleanField(default=True)  # Hide sponsored/ad content
    show_verified_only = models.BooleanField(default=False)  # Show only verified accounts
    excluded_keywords = models.TextField(blank=True)  # Terms to filter out (comma-separated)
    favorite_hashtags = models.TextField(blank=True)  # Preferred hashtags (comma-separated)
    # New preferences
    bizfluencer_filter = models.BooleanField(default=False)  # Filter out "bizfluencer" content
    bizfluencer_threshold = models.IntegerField(default=3)  # Threshold score for filtering
    high_sentiment_only = models.BooleanField(default=False)  # Show only positive content
    sentiment_threshold = models.FloatField(default=0.2)  # Threshold for positive content
    hide_job_posts = models.BooleanField(default=False)  # Hide job postings
    max_content_length = models.IntegerField(default=2000, null=True, blank=True)  # Max post length to show
    filter_sexual_content = models.BooleanField(default=False)  # Filter out sexual content
    rating = models.IntegerField(null=True, blank=True, help_text="User rating for specific items (1-5 stars).")

    def __str__(self):
        return f"Preferences for {self.user.username}"


class SocialPost(models.Model):
    PLATFORM_CHOICES = [
        ('facebook', 'Facebook'),
        ('instagram', 'Instagram'),
        ('linkedin', 'LinkedIn'),
        ('twitter', 'Twitter'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE)
    content = models.TextField()
    content_hash = models.CharField(max_length=64, blank=True, null=True, db_index=True)  # Hash of content for duplicate detection
    platform = models.CharField(max_length=20, choices=PLATFORM_CHOICES)
    platform_id = models.CharField(max_length=100, blank=True, null=True)  # Unique identifier from the platform
    original_user = models.CharField(max_length=100, default="unknown")  # The actual username from the platform
    is_friend = models.BooleanField(default=False)
    is_family = models.BooleanField(default=False)
    category = models.CharField(max_length=255, blank=True)  # e.g., "running", "parenting", hashtags
    created_at = models.DateTimeField(auto_now_add=True)
    collected_at = models.DateTimeField(null=True, blank=True)  # When the post was collected
    
    # Additional fields to support enhanced filtering
    verified = models.BooleanField(default=False)
    image_urls = models.TextField(blank=True)  # Comma-separated list of image URLs
    image_analysis = models.TextField(blank=True, null=True)  # JSON data for image analysis results
    likes = models.IntegerField(default=0)
    comments = models.IntegerField(default=0)
    shares = models.IntegerField(default=0)
    engagement_count = models.IntegerField(default=0)  # Total engagement (sum of likes, comments, shares)
    rating = models.IntegerField(default=0)  # User's custom rating/score
    starred = models.BooleanField(default=False)  # User can star important posts
    hidden = models.BooleanField(default=False)  # Allow users to hide specific posts
    
    # Enhanced metadata from sensors
    timestamp = models.DateTimeField(null=True, blank=True)  # Original post timestamp
    hashtags = models.TextField(blank=True)  # Extracted hashtags
    mentions = models.TextField(blank=True)  # @mentions extracted from content
    external_links = models.TextField(blank=True)  # External links in the post
    content_length = models.IntegerField(default=0)  # Length of the post content
    
    # Flags for specific content types
    is_sponsored = models.BooleanField(default=False)  # Detected as sponsored/ad content
    is_job_post = models.BooleanField(default=False)  # Detected as a job posting
    
    # LinkedIn-specific fields
    connection_degree = models.IntegerField(null=True, blank=True)  # 1st, 2nd, 3rd connection
    bizfluencer_score = models.IntegerField(default=0)  # Score for bizfluencer language
    
    # Machine learning fields
    sentiment_score = models.FloatField(null=True, blank=True)  # Sentiment analysis (-1 to 1)
    positive_indicators = models.IntegerField(default=0)  # Count of positive terms
    negative_indicators = models.IntegerField(default=0)  # Count of negative terms
    automated_category = models.CharField(max_length=100, blank=True)  # AI-detected category
    topic_vector = models.TextField(blank=True)  # JSON serialized topic vector
    
    # User feedback and corrections
    user_category = models.CharField(max_length=100, blank=True)  # User-corrected category
    user_sentiment = models.FloatField(null=True, blank=True)  # User-provided sentiment
    
    # Predictions and inferences (filled by ML pipeline)
    engagement_prediction = models.FloatField(null=True, blank=True)  # Predicted engagement score
    relevance_score = models.FloatField(null=True, blank=True)  # Relevance to user interests
    toxicity_score = models.FloatField(null=True, blank=True)  # Content toxicity score
    authenticity_score = models.FloatField(null=True, blank=True)  # Pure Feed score (0-100)
    
    def __str__(self):
        return f"{self.original_user} - {self.platform} post"
    
    def save(self, *args, **kwargs):
        # Generate content hash if not provided
        if not self.content_hash and self.content:
            # Create a hash from the content and platform info to identify duplicates
            content_to_hash = f"{self.platform}:{self.content}"
            self.content_hash = hashlib.md5(content_to_hash.encode('utf-8')).hexdigest()
        
        # Process sentiment indicators if provided
        if not self.pk and hasattr(self, 'sentiment_indicators') and self.sentiment_indicators:
            if isinstance(self.sentiment_indicators, str):
                try:
                    indicators = json.loads(self.sentiment_indicators)
                    self.positive_indicators = indicators.get('positive', 0)
                    self.negative_indicators = indicators.get('negative', 0)
                except (json.JSONDecodeError, AttributeError):
                    pass
            elif isinstance(self.sentiment_indicators, dict):
                self.positive_indicators = self.sentiment_indicators.get('positive', 0)
                self.negative_indicators = self.sentiment_indicators.get('negative', 0)
        
        # Set timestamp if not provided
        if not self.timestamp:
            self.timestamp = timezone.now()
            
        super().save(*args, **kwargs)

    class Meta:
        ordering = ['-collected_at', '-created_at']
        indexes = [
            models.Index(fields=['platform']),
            models.Index(fields=['is_friend']),
            models.Index(fields=['is_family']),
            models.Index(fields=['verified']),
            models.Index(fields=['category']),
            models.Index(fields=['sentiment_score']),
            models.Index(fields=['bizfluencer_score']),
            models.Index(fields=['is_sponsored']),
            models.Index(fields=['is_job_post']),
            models.Index(fields=['content_hash']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'content_hash'],
                name='unique_content_per_user'
            ),
        ]


class SocialConnection(models.Model):
    """Store relationships between users and platform contacts"""
    TYPE_CHOICES = [
        ('friend', 'Friend'),
        ('family', 'Family'),
        ('acquaintance', 'Acquaintance'),
        ('colleague', 'Colleague'),
        ('followed', 'Followed'),
    ]
    
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='connections')
    platform = models.CharField(max_length=20, choices=SocialPost.PLATFORM_CHOICES)
    platform_username = models.CharField(max_length=100)  # The username on the platform
    connection_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    notes = models.TextField(blank=True)
    trust_level = models.IntegerField(default=5)  # 1-10 scale
    
    class Meta:
        unique_together = ['user', 'platform', 'platform_username']
        
    def __str__(self):
        return f"{self.user.username} -> {self.platform_username} ({self.connection_type})"


class MLModel(models.Model):
    """Storage for trained machine learning models"""
    MODEL_TYPES = [
        ('sentiment', 'Sentiment Analysis'),
        ('topic', 'Topic Classification'),
        ('toxicity', 'Toxicity Detection'),
        ('engagement', 'Engagement Prediction'),
        ('relevance', 'Relevance Scoring'),
    ]
    
    name = models.CharField(max_length=100)
    model_type = models.CharField(max_length=20, choices=MODEL_TYPES)
    version = models.CharField(max_length=20)
    description = models.TextField(blank=True)
    file_path = models.FileField(upload_to='ml_models/')
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)
    accuracy = models.FloatField(null=True, blank=True)  # Model accuracy from testing
    parameters = models.JSONField(default=dict, blank=True)  # Store model hyperparameters
    
    class Meta:
        unique_together = ['model_type', 'version']
        
    def __str__(self):
        return f"{self.name} v{self.version} ({self.model_type})"


class MLPredictionLog(models.Model):
    """Log of predictions made by ML models"""
    post = models.ForeignKey(SocialPost, on_delete=models.CASCADE, related_name='ml_logs')
    model = models.ForeignKey(MLModel, on_delete=models.SET_NULL, null=True)
    prediction_type = models.CharField(max_length=20)
    prediction_value = models.FloatField()
    confidence = models.FloatField(null=True, blank=True)
    raw_output = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"{self.prediction_type} prediction for post {self.post.id}"


class FilterPreset(models.Model):
    """Saved filter combinations for quick application"""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='filter_presets')
    name = models.CharField(max_length=50)
    description = models.TextField(blank=True)
    
    # Base filters
    friends_only = models.BooleanField(default=False)
    family_only = models.BooleanField(default=False)
    interest_filter = models.CharField(max_length=100, blank=True)
    approved_brands = models.TextField(blank=True)
    hide_sponsored = models.BooleanField(default=True)
    show_verified_only = models.BooleanField(default=False)
    excluded_keywords = models.TextField(blank=True)
    favorite_hashtags = models.TextField(blank=True)
    
    # Advanced filters
    bizfluencer_filter = models.BooleanField(default=False)
    bizfluencer_threshold = models.IntegerField(default=3)
    high_sentiment_only = models.BooleanField(default=False)
    sentiment_threshold = models.FloatField(default=0.2)
    hide_job_posts = models.BooleanField(default=False)
    max_content_length = models.IntegerField(default=2000, null=True, blank=True)
    filter_sexual_content = models.BooleanField(default=False)  # Filter out sexual content
    
    # Additional metadata
    icon = models.CharField(max_length=50, default='filter')  # Font Awesome icon name
    color = models.CharField(max_length=20, default='primary')  # CSS color class
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def apply_to_preferences(self, preferences):
        """Apply this preset to a UserPreference object"""
        # Base filters
        preferences.friends_only = self.friends_only
        preferences.family_only = self.family_only
        preferences.interest_filter = self.interest_filter
        preferences.approved_brands = self.approved_brands
        preferences.hide_sponsored = self.hide_sponsored
        preferences.show_verified_only = self.show_verified_only
        preferences.excluded_keywords = self.excluded_keywords
        preferences.favorite_hashtags = self.favorite_hashtags
        
        # Advanced filters
        preferences.bizfluencer_filter = self.bizfluencer_filter
        preferences.bizfluencer_threshold = self.bizfluencer_threshold
        preferences.high_sentiment_only = self.high_sentiment_only
        preferences.sentiment_threshold = self.sentiment_threshold
        preferences.hide_job_posts = self.hide_job_posts
        preferences.max_content_length = self.max_content_length
        preferences.filter_sexual_content = self.filter_sexual_content
        
        return preferences
    
    def save(self, *args, **kwargs):
        # If this preset is being set as default, clear default flag on other presets
        if self.is_default:
            FilterPreset.objects.filter(
                user=self.user, 
                is_default=True
            ).exclude(id=self.id).update(is_default=False)
            
        super().save(*args, **kwargs)
    
    class Meta:
        unique_together = ['user', 'name']
        ordering = ['-is_default', 'name']
        
    def __str__(self):
        return f"{self.name} ({self.user.username})"


# Simple API key for Chrome extension authentication during testing
class APIKey(models.Model):
    """Simple API key for authenticating Chrome extension requests"""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='api_keys')
    key = models.CharField(max_length=64, unique=True)
    name = models.CharField(max_length=100)  # A name for the key (e.g., "Chrome Extension")
    created_at = models.DateTimeField(auto_now_add=True)
    last_used = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    
    def __str__(self):
        return f"{self.name} - {self.user.username}"
    
    def save(self, *args, **kwargs):
        # Generate a random key if one doesn't exist
        if not self.key:
            import uuid
            self.key = uuid.uuid4().hex
        
        super().save(*args, **kwargs)
