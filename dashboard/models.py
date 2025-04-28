from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone
import json
from django.db.models.signals import post_save
from django.dispatch import receiver

# ... existing code ...

class ErrorReport(models.Model):
    """Model for storing extension error reports."""
    ERROR_TYPES = (
        ('api', 'API Error'),
        ('messaging', 'Messaging Error'),
        ('dom', 'DOM Error'),
        ('permissions', 'Permissions Error'),
        ('authentication', 'Authentication Error'),
        ('extension', 'Extension Error'),
        ('general', 'General Error'),
    )
    
    error_type = models.CharField(max_length=20, choices=ERROR_TYPES)
    error_message = models.TextField()
    error_metadata = models.JSONField(default=dict)
    browser = models.CharField(max_length=255)
    extension_version = models.CharField(max_length=20)
    timestamp = models.DateTimeField(default=timezone.now)
    resolved = models.BooleanField(default=False)
    resolution_notes = models.TextField(blank=True)
    user_agent = models.TextField(blank=True)
    
    def __str__(self):
        return f"{self.error_type}: {self.error_message[:50]}..."
    
    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['error_type']),
            models.Index(fields=['timestamp']),
            models.Index(fields=['resolved']),
            models.Index(fields=['extension_version']),
        ]
    
    def set_metadata(self, data):
        """Safely store metadata as JSON"""
        if isinstance(data, dict):
            self.error_metadata = data
        else:
            self.error_metadata = {"raw": str(data)}
    
    def get_metadata(self):
        """Retrieve metadata as a Python dict"""
        return self.error_metadata
    
    @classmethod
    def get_error_stats(cls, days=7):
        """Get error statistics for dashboard display"""
        start_date = timezone.now() - timezone.timedelta(days=days)
        
        stats = {
            'total': cls.objects.filter(timestamp__gte=start_date).count(),
            'by_type': {},
            'by_version': {},
            'by_day': {},
            'resolved': cls.objects.filter(timestamp__gte=start_date, resolved=True).count(),
        }
        
        # Count by type
        for error_type, _ in cls.ERROR_TYPES:
            stats['by_type'][error_type] = cls.objects.filter(
                timestamp__gte=start_date,
                error_type=error_type
            ).count()
        
        # Count by version
        versions = cls.objects.filter(timestamp__gte=start_date).values_list(
            'extension_version', flat=True).distinct()
        
        for version in versions:
            stats['by_version'][version] = cls.objects.filter(
                timestamp__gte=start_date,
                extension_version=version
            ).count()
        
        # Count by day
        for i in range(days):
            day = timezone.now() - timezone.timedelta(days=i)
            day_str = day.strftime('%Y-%m-%d')
            stats['by_day'][day_str] = cls.objects.filter(
                timestamp__date=day.date()
            ).count()
        
        return stats 

class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    bio = models.TextField(max_length=500, blank=True)
    preferences = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username}'s profile"

class SocialMediaAccount(models.Model):
    PLATFORM_CHOICES = [
        ('facebook', 'Facebook'),
        ('instagram', 'Instagram'),
        ('linkedin', 'LinkedIn'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE)
    platform = models.CharField(max_length=20, choices=PLATFORM_CHOICES)
    account_id = models.CharField(max_length=255)
    access_token = models.CharField(max_length=512)
    refresh_token = models.CharField(max_length=512, blank=True, null=True)
    token_expires_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ['user', 'platform', 'account_id']

    def __str__(self):
        return f"{self.user.username}'s {self.platform} account"

class ContentFilter(models.Model):
    FILTER_TYPES = [
        ('keyword', 'Keyword'),
        ('hashtag', 'Hashtag'),
        ('account', 'Account'),
        ('content_type', 'Content Type'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE)
    filter_type = models.CharField(max_length=20, choices=FILTER_TYPES)
    value = models.CharField(max_length=255)
    is_include = models.BooleanField(default=True)  # True for whitelist, False for blacklist
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ['user', 'filter_type', 'value']

    def __str__(self):
        return f"{self.user.username}'s {self.filter_type} filter: {self.value}"

class FilteredContent(models.Model):
    CONTENT_TYPES = [
        ('post', 'Post'),
        ('photo', 'Photo'),
        ('video', 'Video'),
        ('link', 'Link'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE)
    social_account = models.ForeignKey(SocialMediaAccount, on_delete=models.CASCADE)
    content_type = models.CharField(max_length=20, choices=CONTENT_TYPES)
    content_id = models.CharField(max_length=255)
    content_data = models.JSONField()
    engagement_data = models.JSONField(default=dict)
    is_archived = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ['social_account', 'content_id']

    def __str__(self):
        return f"{self.user.username}'s {self.content_type} from {self.social_account.platform}"

@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, if_created, **kwargs):
    if created:
        UserProfile.objects.create(user=instance)

@receiver(post_save, sender=User)
def save_user_profile(sender, instance, **kwargs):
    instance.userprofile.save() 