from django.db import models
from django.contrib.auth.models import User

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
    ]

    brand = models.ForeignKey(Brand, on_delete=models.CASCADE)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    behavior_type = models.CharField(max_length=50, choices=BEHAVIOR_TYPES)
    count = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.brand.name} - {self.behavior_type} ({self.count})"
from django.contrib.auth.models import User

class UserPreference(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    friends_only = models.BooleanField(default=False)
    # Add other future modes here like `family_only`, `interests`, etc.

    def __str__(self):
        return f"Preferences for {self.user.username}"

class SocialPost(models.Model):
    PLATFORM_CHOICES = [
        ('facebook', 'Facebook'),
        ('instagram', 'Instagram'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE)
    content = models.TextField()
    platform = models.CharField(max_length=20, choices=PLATFORM_CHOICES)
    is_friend = models.BooleanField(default=False)
    is_family = models.BooleanField(default=False)
    category = models.CharField(max_length=100, blank=True)  # e.g., "running", "parenting"
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.username} - {self.platform} post"
