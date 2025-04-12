from django.contrib import admin
from .models import Brand, BehaviorLog, UserPreference, SocialPost, APIKey, SocialConnection, MLModel, MLPredictionLog, FilterPreset

@admin.register(Brand)
class BrandAdmin(admin.ModelAdmin):
    list_display = ('name', 'domain', 'trust_score')
    search_fields = ('name', 'domain')


@admin.register(BehaviorLog)
class BehaviorLogAdmin(admin.ModelAdmin):
    list_display = ('brand', 'user', 'behavior_type', 'count', 'created_at', 'platform', 'details')
    list_filter = ('behavior_type', 'created_at', 'platform')
    search_fields = ('brand__name', 'user__username', 'details')
    date_hierarchy = 'created_at'


@admin.register(UserPreference)
class UserPreferenceAdmin(admin.ModelAdmin):
    list_display = ('user', 'friends_only', 'family_only', 'interest_filter', 'approved_brands', 'hide_sponsored')
    list_filter = ('friends_only', 'family_only', 'hide_sponsored', 'bizfluencer_filter', 'high_sentiment_only')
    search_fields = ('user__username', 'interest_filter', 'approved_brands')
    fieldsets = (
        ('User Information', {
            'fields': ('user',)
        }),
        ('Basic Filters', {
            'fields': ('friends_only', 'family_only', 'interest_filter', 'approved_brands', 'hide_sponsored',
                      'show_verified_only', 'excluded_keywords', 'favorite_hashtags')
        }),
        ('Advanced Filters', {
            'fields': ('bizfluencer_filter', 'bizfluencer_threshold', 'high_sentiment_only', 
                       'sentiment_threshold', 'hide_job_posts', 'max_content_length', 'filter_sexual_content')
        }),
    )


@admin.register(SocialPost)
class SocialPostAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'platform', 'original_user', 'content_preview', 'is_friend', 
                   'is_family', 'is_sponsored', 'sentiment_score', 'created_at', 'collected_at')
    list_filter = ('platform', 'is_friend', 'is_family', 'is_sponsored', 'is_job_post', 
                  'verified', 'starred', 'hidden')
    search_fields = ('user__username', 'original_user', 'content', 'hashtags')
    date_hierarchy = 'collected_at'
    readonly_fields = ('content_hash', 'created_at', 'collected_at')
    list_per_page = 50
    
    def content_preview(self, obj):
        """Return a preview of the content text"""
        if obj.content:
            return obj.content[:75] + "..." if len(obj.content) > 75 else obj.content
        return ""
    content_preview.short_description = "Content"
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('user', 'platform', 'original_user', 'content', 'content_hash', 
                      'platform_id', 'created_at', 'collected_at', 'timestamp')
        }),
        ('Relationships', {
            'fields': ('is_friend', 'is_family', 'connection_degree')
        }),
        ('Content Analysis', {
            'fields': ('category', 'automated_category', 'user_category', 'sentiment_score', 
                      'bizfluencer_score', 'toxicity_score', 'authenticity_score', 
                      'positive_indicators', 'negative_indicators')
        }),
        ('Engagement Metrics', {
            'fields': ('likes', 'comments', 'shares', 'engagement_count', 'engagement_prediction')
        }),
        ('User Interaction', {
            'fields': ('rating', 'starred', 'hidden', 'relevance_score', 'user_sentiment')
        }),
        ('Content Flags', {
            'fields': ('is_sponsored', 'is_job_post', 'verified', 'content_length')
        }),
        ('Additional Content', {
            'fields': ('image_urls', 'image_analysis', 'hashtags', 'mentions', 'external_links')
        }),
    )


@admin.register(APIKey)
class APIKeyAdmin(admin.ModelAdmin):
    list_display = ('user', 'key', 'name', 'created_at', 'last_used', 'is_active')
    list_filter = ('is_active', 'created_at')
    search_fields = ('user__username', 'key', 'name')
    readonly_fields = ('key', 'created_at', 'last_used')


@admin.register(SocialConnection)
class SocialConnectionAdmin(admin.ModelAdmin):
    list_display = ('user', 'platform', 'platform_username', 'connection_type', 'trust_level')
    list_filter = ('platform', 'connection_type', 'trust_level')
    search_fields = ('user__username', 'platform_username', 'notes')


@admin.register(MLModel)
class MLModelAdmin(admin.ModelAdmin):
    list_display = ('name', 'model_type', 'version', 'is_active', 'accuracy', 'created_at')
    list_filter = ('model_type', 'is_active', 'created_at')
    search_fields = ('name', 'description')


@admin.register(MLPredictionLog)
class MLPredictionLogAdmin(admin.ModelAdmin):
    list_display = ('post', 'model', 'prediction_type', 'prediction_value', 'confidence', 'created_at')
    list_filter = ('prediction_type', 'created_at')
    search_fields = ('post__content', 'prediction_type')


@admin.register(FilterPreset)
class FilterPresetAdmin(admin.ModelAdmin):
    list_display = ('name', 'user', 'description', 'is_default', 'created_at')
    list_filter = ('is_default', 'created_at')
    search_fields = ('name', 'user__username', 'description')
