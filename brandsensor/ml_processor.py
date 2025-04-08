"""
Machine Learning module for Authentic Dashboard

This module provides ML-powered analysis of social media content:
- Sentiment analysis
- Topic classification
- Toxicity detection
- Engagement prediction
- Content relevance scoring

Ultimate Directive

"Restore user sovereignty over the digital experience by creating transparent tools that prioritize genuine human satisfaction rather than engagement metrics."

This directive emphasizes:

User control ("sovereignty")
Transparency in how content is filtered
Human-centered design (satisfaction vs engagement)
Ethical technology principles
"""

import json
import re
from collections import Counter
from datetime import datetime
from django.utils import timezone
from django.db.models import Avg
from .models import SocialPost, MLModel, MLPredictionLog, UserPreference
from django.db.utils import IntegrityError

# Try to import numpy, but fallback to basic calculations if not available
try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False
    # Simple function to mimic numpy's mean functionality
    def mean(values):
        if not values:
            return 0
        return sum(values) / len(values)
    
    # Simple function to mimic numpy's random functions
    def random_float(min_val=0, max_val=1):
        import random
        return random.uniform(min_val, max_val)

# Dictionary of stop words to filter out from text analysis
STOP_WORDS = {
    'a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'by',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'can', 'could', 'may',
    'might', 'must', 'in', 'of', 'from', 'with', 'about', 'as', 'for', 'this', 'that',
    'these', 'those', 'it', 'its', 'i', 'my', 'me', 'mine', 'you', 'your', 'yours'
}

# Topic categories for classification
TOPIC_CATEGORIES = [
    'travel', 'food', 'health', 'fitness', 'technology', 'business', 'finance',
    'entertainment', 'news', 'politics', 'sports', 'fashion', 'art', 'education',
    'personal', 'promotional', 'family', 'pets', 'gaming', 'music'
]

# Category keyword associations (simplified)
CATEGORY_KEYWORDS = {
    'travel': ['travel', 'vacation', 'trip', 'beach', 'destination', 'hotel', 'flight', 'adventure'],
    'food': ['food', 'recipe', 'cooking', 'meal', 'restaurant', 'delicious', 'eat', 'dinner', 'lunch'],
    'health': ['health', 'wellness', 'medical', 'doctor', 'hospital', 'medicine', 'disease', 'healthy'],
    'fitness': ['fitness', 'workout', 'gym', 'exercise', 'training', 'muscle', 'cardio', 'running'],
    'technology': ['tech', 'technology', 'computer', 'software', 'hardware', 'app', 'digital', 'ai', 'programming'],
    'business': ['business', 'company', 'startup', 'entrepreneur', 'industry', 'corporate', 'office'],
    'finance': ['finance', 'money', 'investing', 'stock', 'market', 'bank', 'financial', 'economics', 'cash'],
    'entertainment': ['entertainment', 'movie', 'tv', 'show', 'film', 'series', 'actor', 'actress', 'celebrity'],
    'news': ['news', 'breaking', 'latest', 'update', 'report', 'journalist', 'media', 'headline'],
    'politics': ['politics', 'government', 'election', 'political', 'campaign', 'policy', 'vote', 'democracy'],
    'sports': ['sports', 'game', 'team', 'player', 'coach', 'league', 'championship', 'match', 'tournament'],
    'fashion': ['fashion', 'style', 'trend', 'clothing', 'outfit', 'dress', 'shoes', 'accessory', 'model'],
    'art': ['art', 'artist', 'painting', 'museum', 'gallery', 'creative', 'design', 'drawing'],
    'education': ['education', 'school', 'university', 'college', 'student', 'teacher', 'learn', 'study', 'course'],
    'personal': ['life', 'personal', 'reflection', 'journey', 'experience', 'story', 'thought', 'feeling'],
    'promotional': ['promotion', 'discount', 'sale', 'offer', 'deal', 'limited', 'exclusive', 'buy', 'shop'],
    'family': ['family', 'kid', 'child', 'parent', 'mother', 'father', 'baby', 'son', 'daughter'],
    'pets': ['pet', 'dog', 'cat', 'animal', 'puppy', 'kitten', 'adoption', 'veterinarian'],
    'gaming': ['game', 'gaming', 'video game', 'player', 'console', 'playstation', 'xbox', 'nintendo', 'streamer'],
    'music': ['music', 'song', 'artist', 'album', 'band', 'concert', 'festival', 'playlist', 'singer']
}

# Toxicity indicators (simplified)
TOXICITY_INDICATORS = [
    # Offensive content
    'offensive', 'inappropriate', 'rude', 'vulgar', 'explicit',
    # Harmful or dangerous content
    'dangerous', 'harmful', 'unsafe', 'risky',
    # Deceptive content
    'scam', 'fake', 'fraud', 'hoax', 'misleading', 'deceptive',
    # Common profanity (censored examples)
    'f***', 's***', 'b****', 'a**',
    # Discriminatory terms (general indicators)
    'racist', 'sexist', 'discriminatory', 'hateful'
]

# Sentiment lexicon (simplified)
SENTIMENT_LEXICON = {
    'positive': [
        'good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'terrific',
        'outstanding', 'exceptional', 'impressive', 'remarkable', 'splendid', 'perfect',
        'happy', 'glad', 'joy', 'delighted', 'pleased', 'satisfied', 'content',
        'love', 'adore', 'like', 'enjoy', 'appreciate', 'admire', 'praise',
        'beautiful', 'gorgeous', 'pretty', 'lovely', 'attractive', 'charming',
        'exciting', 'thrilling', 'exhilarating', 'inspiring', 'motivated',
        'success', 'achievement', 'accomplishment', 'victory', 'triumph',
        'recommended', 'worth', 'valuable', 'beneficial', 'helpful', 'useful'
    ],
    'negative': [
        'bad', 'terrible', 'horrible', 'awful', 'dreadful', 'poor', 'inferior',
        'disappointing', 'unpleasant', 'unsatisfactory', 'inadequate', 'substandard',
        'sad', 'unhappy', 'depressed', 'miserable', 'gloomy', 'heartbroken',
        'hate', 'dislike', 'despise', 'detest', 'loathe', 'abhor',
        'ugly', 'hideous', 'unattractive', 'repulsive', 'revolting',
        'boring', 'dull', 'tedious', 'monotonous', 'tiresome',
        'failure', 'defeat', 'loss', 'setback', 'downfall',
        'waste', 'useless', 'worthless', 'pointless', 'meaningless',
        'problem', 'issue', 'trouble', 'difficulty', 'complication'
    ]
}

def preprocess_text(text):
    """Clean and preprocess text for analysis"""
    if not text:
        return []
    
    # Convert to lowercase
    text = text.lower()
    
    # Remove URLs
    text = re.sub(r'https?://\S+|www\.\S+', '', text)
    
    # Remove mentions (@username)
    text = re.sub(r'@\w+', '', text)
    
    # Remove special characters
    text = re.sub(r'[^\w\s]', '', text)
    
    # Tokenize and remove stop words
    tokens = [word for word in text.split() if word not in STOP_WORDS and len(word) > 2]
    
    return tokens

def analyze_sentiment(text, use_lexicon=True):
    """
    Analyze the sentiment of the given text
    Returns a dictionary with sentiment score and indicators
    """
    if not text:
        return {
            'sentiment_score': 0.0,
            'positive_indicators': 0,
            'negative_indicators': 0
        }
    
    # Check if text is a post object
    if hasattr(text, 'sentiment_score') and text.sentiment_score is not None:
        return {
            'sentiment_score': text.sentiment_score,
            'positive_indicators': text.positive_indicators,
            'negative_indicators': text.negative_indicators
        }
    
    tokens = preprocess_text(text.lower())
    positive_count = 0
    negative_count = 0
    
    if use_lexicon:
        # Use the sentiment lexicon for analysis
        for word in tokens:
            if word in SENTIMENT_LEXICON['positive']:
                positive_count += 1
            elif word in SENTIMENT_LEXICON['negative']:
                negative_count += 1
    
    # Calculate sentiment score
    total = positive_count + negative_count
    if total == 0:
        sentiment_score = 0.0
    else:
        sentiment_score = (positive_count - negative_count) / total
    
    return {
        'sentiment_score': sentiment_score,
        'positive_indicators': positive_count,
        'negative_indicators': negative_count
    }

def classify_topics(text):
    """
    Classify the text into one or more topics
    Returns a dictionary of topic scores
    """
    if not text:
        return {}, ""
    
    tokens = preprocess_text(text.lower())
    if not tokens:
        return {}, ""
    
    # Count word frequency
    word_counts = Counter(tokens)
    
    # Calculate topic scores
    topic_scores = {}
    for topic, keywords in CATEGORY_KEYWORDS.items():
        score = sum(word_counts.get(keyword, 0) for keyword in keywords)
        if score > 0:
            topic_scores[topic] = score
    
    # Normalize scores
    total_score = sum(topic_scores.values())
    if total_score > 0:
        for topic in topic_scores:
            topic_scores[topic] /= total_score
    
    # Get the top topic
    top_topic = max(topic_scores.items(), key=lambda x: x[1])[0] if topic_scores else ""
    
    return topic_scores, top_topic

def calculate_toxicity(text):
    """
    Calculate a toxicity score for the text
    Returns a value between 0 (not toxic) and 1 (highly toxic)
    """
    if not text:
        return 0.0
    
    text_lower = text.lower()
    toxicity_count = 0
    
    # Check for toxicity indicators
    for indicator in TOXICITY_INDICATORS:
        if indicator in text_lower:
            toxicity_count += 1
    
    # Normalize score between 0 and 1
    return min(1.0, toxicity_count / 10)

def predict_engagement(post):
    """
    Predict the engagement level for a post
    Returns a score between 0 (low engagement) and 1 (high engagement)
    """
    # Basic engagement calculation based on likes, comments, shares
    base_score = (post.likes + (post.comments * 2) + (post.shares * 3)) / 100
    
    # Factor in content length (longer posts often get less engagement)
    length_factor = min(1.0, 1000 / max(100, post.content_length)) if post.content_length else 1.0
    
    # Factor in sentiment (positive content tends to get more engagement)
    sentiment_factor = (post.sentiment_score + 1) / 2 if post.sentiment_score is not None else 0.5
    
    # Calculate engagement score (capped at 1.0)
    engagement_score = min(1.0, base_score * length_factor * sentiment_factor)
    
    return engagement_score

def calculate_relevance(post, user_id):
    """
    Calculate how relevant a post is to a specific user based on their preferences
    Returns a score between 0 (not relevant) and 1 (highly relevant)
    """
    try:
        preferences = UserPreference.objects.get(user_id=user_id)
    except UserPreference.DoesNotExist:
        # If no preferences, everything is equally relevant
        return 0.5
    
    relevance_score = 0.5  # Start with neutral relevance
    
    # Check if post matches user interests
    if preferences.interest_filter:
        interests = preferences.interest_filter.split(',')
        for interest in interests:
            interest = interest.strip().lower()
            if interest and (
                interest in post.content.lower() or 
                interest in post.category.lower() or
                interest in post.hashtags.lower()
            ):
                relevance_score += 0.2
    
    # Check if post has favorite hashtags
    if preferences.favorite_hashtags and post.hashtags:
        fav_hashtags = preferences.favorite_hashtags.split(',')
        post_hashtags = post.hashtags.split(',')
        
        for hashtag in fav_hashtags:
            hashtag = hashtag.strip().lower()
            if hashtag and any(hashtag in ph.lower() for ph in post_hashtags):
                relevance_score += 0.15
    
    # Posts from friends are more relevant
    if post.is_friend:
        relevance_score += 0.1
    
    # Posts from family are most relevant
    if post.is_family:
        relevance_score += 0.2
    
    # Sponsored content is generally less relevant
    if post.is_sponsored:
        relevance_score -= 0.3
    
    # Bizfluencer content might be less relevant
    if post.bizfluencer_score > 2:
        relevance_score -= (post.bizfluencer_score * 0.05)
    
    # Cap relevance between 0 and 1
    return max(0.0, min(1.0, relevance_score))

def process_post(post):
    """
    Process a post with all available ML functions
    Updates the post with ML-derived fields
    """
    # Skip if already processed
    if (post.automated_category and post.sentiment_score is not None and 
        post.relevance_score is not None and post.toxicity_score is not None):
        return post
    
    # Analyze sentiment if not already done
    if post.sentiment_score is None:
        sentiment_result = analyze_sentiment(post.content)
        post.sentiment_score = sentiment_result['sentiment_score']
        post.positive_indicators = sentiment_result['positive_indicators']
        post.negative_indicators = sentiment_result['negative_indicators']
    
    # Classify topics if not already done
    if not post.automated_category:
        topic_scores, top_topic = classify_topics(post.content)
        post.automated_category = top_topic
        post.topic_vector = json.dumps(topic_scores)
    
    # Calculate toxicity score
    if post.toxicity_score is None:
        post.toxicity_score = calculate_toxicity(post.content)
    
    # Predict engagement
    if post.engagement_prediction is None:
        post.engagement_prediction = predict_engagement(post)
    
    # Calculate relevance score for the user
    if post.relevance_score is None:
        post.relevance_score = calculate_relevance(post, post.user_id)
    
    # Save the updated post with error handling for duplicate content
    try:
        post.save()
    except IntegrityError as e:
        # Log the error but continue processing other posts
        print(f"IntegrityError processing post: {str(e)}")
        # If this is a duplicate post, try to find the existing post and return that
        if 'unique constraint' in str(e).lower() and post.content_hash:
            try:
                existing_post = SocialPost.objects.get(
                    user_id=post.user_id, 
                    content_hash=post.content_hash
                )
                return existing_post
            except SocialPost.DoesNotExist:
                pass
    
    return post

def process_unprocessed_posts(limit=100):
    """
    Process posts that haven't been analyzed yet
    Limits the number of posts processed at once for performance
    """
    # Query posts that haven't been fully processed
    unprocessed_posts = SocialPost.objects.filter(
        automated_category='',
        sentiment_score__isnull=True
    ).order_by('-collected_at')[:limit]
    
    processed_count = 0
    for post in unprocessed_posts:
        try:
            process_post(post)
            processed_count += 1
        except Exception as e:
            # Log the error but continue with other posts
            print(f"Error processing post {post.id}: {str(e)}")
    
    return processed_count

def process_user_posts(user_id, limit=100):
    """Process all posts for a specific user"""
    unprocessed_posts = SocialPost.objects.filter(
        user_id=user_id
    ).order_by('-collected_at')[:limit]
    
    processed_count = 0
    for post in unprocessed_posts:
        try:
            process_post(post)
            processed_count += 1
        except IntegrityError as e:
            # Log the error but continue with other posts
            print(f"IntegrityError processing post {post.id}: {str(e)}")
        except Exception as e:
            # Log the error but continue with other posts
            print(f"Error processing post {post.id}: {str(e)}")
    
    return processed_count 