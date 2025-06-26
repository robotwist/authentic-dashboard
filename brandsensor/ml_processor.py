"""
ML Processor for analyzing social media posts.
Demo mode - simplified version to avoid startup issues.
"""

import os
import logging
import re
from collections import Counter
from datetime import datetime, timedelta
from django.utils import timezone
from django.db.models import Q
import requests
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# Demo mode - simplified functions
def process_user_posts(user_id, limit=100):
    """Process unprocessed posts for a user - demo version"""
    return []

def process_post(post):
    """Process a single post - demo version"""
    # Just return the post unchanged
    return post

def calculate_authenticity_score(post):
    """Calculate authenticity score - demo version"""
    return 0.75

def analyze_sentiment(text, use_transformer=True):
    """Analyze sentiment - demo version"""
    return {
        'sentiment_score': 0.5,
        'positive_indicators': 1,
        'negative_indicators': 0,
        'method': 'demo'
    }

def extract_keywords(text, max_keywords=10):
    """Extract keywords - demo version"""
    if not text:
        return []
    # Simple keyword extraction - just return first few words
    words = text.split()[:max_keywords]
    return [word.lower().strip('.,!?') for word in words if len(word) > 3]

def classify_topics(text):
    """Classify topics - demo version"""
    return {'personal': 0.8}, 'personal'

def calculate_toxicity(text):
    """Calculate toxicity - demo version"""
    return 0.1

def process_post_images(post):
    """Process post images - demo version"""
    return []

def process_social_post(post_id):
    """Process a social post - demo version"""
    return True

def process_image_analysis(post):
    """Process image analysis - demo version"""
    return []