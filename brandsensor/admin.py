from django.contrib import admin
from .models import Brand, BehaviorLog, UserPreference, SocialPost

@admin.register(Brand)
class BrandAdmin(admin.ModelAdmin):
    list_display = ('name', 'domain', 'trust_score')
    search_fields = ('name', 'domain')


@admin.register(BehaviorLog)
class BehaviorLogAdmin(admin.ModelAdmin):
    list_display = ('brand', 'user', 'behavior_type', 'count', 'created_at')
    list_filter = ('behavior_type', 'created_at')
    search_fields = ('brand__name', 'user__username')


@admin.register(UserPreference)
class UserPreferenceAdmin(admin.ModelAdmin):
    list_display = ('user', 'friends_only', 'family_only', 'interest_filter', 'approved_brands')
    list_filter = ('friends_only', 'family_only')
    search_fields = ('user__username', 'interest_filter', 'approved_brands')


@admin.register(SocialPost)
class SocialPostAdmin(admin.ModelAdmin):
    list_display = ('user', 'platform', 'is_friend', 'is_family', 'category', 'created_at')
    list_filter = ('platform', 'is_friend', 'is_family', 'category')
    search_fields = ('user__username', 'content')
