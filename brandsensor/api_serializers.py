from rest_framework import serializers
from .models import SocialPost, UserPreference, Brand, BehaviorLog, APIKey, FilterPreset, MLPredictionLog

class SocialPostSerializer(serializers.ModelSerializer):
    """Serializer for social posts"""
    class Meta:
        model = SocialPost
        fields = [
            'id', 'content', 'platform', 'original_user', 'is_friend', 'is_family', 
            'category', 'created_at', 'collected_at', 'verified', 'image_urls',
            'likes', 'comments', 'shares', 'engagement_count', 'rating', 'starred',
            'hidden', 'timestamp', 'hashtags', 'mentions', 'external_links', 
            'is_sponsored', 'is_job_post', 'content_length', 'sentiment_score',
            'positive_indicators', 'negative_indicators', 'toxicity_score',
            'automated_category', 'relevance_score', 'bizfluencer_score'
        ]
        read_only_fields = ['id', 'created_at']

class BrandSerializer(serializers.ModelSerializer):
    """Serializer for brands"""
    class Meta:
        model = Brand
        fields = ['id', 'name', 'domain', 'trust_score']

class BehaviorLogSerializer(serializers.ModelSerializer):
    """Serializer for behavior logs"""
    class Meta:
        model = BehaviorLog
        fields = ['id', 'user', 'brand', 'behavior_type', 'count', 'created_at', 'platform', 'details']
        read_only_fields = ['id', 'created_at']

class APIKeySerializer(serializers.ModelSerializer):
    """Serializer for API keys"""
    class Meta:
        model = APIKey
        fields = ['id', 'user', 'key', 'name', 'is_active', 'created_at', 'last_used']
        read_only_fields = ['id', 'created_at', 'last_used']
        extra_kwargs = {'key': {'write_only': True}}  # Don't expose API key in responses

class UserPreferenceSerializer(serializers.ModelSerializer):
    """Serializer for user preferences"""
    class Meta:
        model = UserPreference
        fields = [
            'id', 'user', 'friends_only', 'family_only', 'interest_filter', 
            'approved_brands', 'hide_sponsored', 'show_verified_only',
            'excluded_keywords', 'favorite_hashtags', 'bizfluencer_filter',
            'bizfluencer_threshold', 'high_sentiment_only', 'sentiment_threshold',
            'hide_job_posts', 'max_content_length', 'filter_sexual_content',
            'email_notifications', 'browser_notifications'
        ]

class FilterPresetSerializer(serializers.ModelSerializer):
    """Serializer for filter presets"""
    class Meta:
        model = FilterPreset
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']

class MLPredictionLogSerializer(serializers.ModelSerializer):
    """Serializer for ML prediction logs"""
    class Meta:
        model = MLPredictionLog
        fields = ['id', 'post', 'prediction_type', 'prediction_value', 'confidence', 'raw_output', 'created_at']
        read_only_fields = ['id', 'created_at']
