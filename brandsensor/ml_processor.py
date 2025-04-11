"""
Machine Learning module for Authentic Dashboard

This module provides ML-powered analysis of social media content:
- Sentiment analysis
- Topic classification
- Toxicity detection
- Engagement prediction
- Content relevance scoring
- Image analysis with CLIP, BLIP, AVA, DeepFace
- Perceptual hashing for image similarity

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
import logging
import base64
import hashlib
from io import BytesIO
from collections import Counter
from datetime import datetime
from django.utils import timezone
from django.db.models import Avg
from .models import SocialPost, MLModel, MLPredictionLog, UserPreference
from django.db.utils import IntegrityError
from django.conf import settings
import requests
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# Try to import the required libraries, fallback to basic functionality if not available
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

# Try to import additional image analysis libraries
try:
    import torch
    HAS_TORCH = True
    logger.info("PyTorch is available for advanced image processing")
except ImportError:
    HAS_TORCH = False
    logger.info("PyTorch is not available, advanced image processing will be limited")

try:
    from PIL import Image
    HAS_PIL = True
    logger.info("Pillow (PIL) is available for basic image processing")
except ImportError:
    HAS_PIL = False
    logger.info("Pillow (PIL) is not available, image processing will be disabled")

# Check for transformers library
try:
    from transformers import pipeline, AutoProcessor, AutoModelForZeroShotImageClassification
    HAS_TRANSFORMERS = True
except ImportError:
    HAS_TRANSFORMERS = False

# Image model flags
HAS_CLIP = False
HAS_BLIP = False
HAS_DEEPFACE = False
HAS_YOLO = False

# Only try to load these if we have torch and PIL
if HAS_TORCH and HAS_PIL and HAS_TRANSFORMERS:
    try:
        # Initialize CLIP model for image-text matching
        from transformers import CLIPProcessor, CLIPModel
        CLIP_MODEL = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
        CLIP_PROCESSOR = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
        HAS_CLIP = True
        logger.info("CLIP model loaded successfully")
    except Exception as e:
        logger.warning(f"Failed to load CLIP model: {str(e)}")

    try:
        # Initialize BLIP model for image captioning
        from transformers import BlipProcessor, BlipForConditionalGeneration
        BLIP_PROCESSOR = BlipProcessor.from_pretrained("Salesforce/blip-image-captioning-base")
        BLIP_MODEL = BlipForConditionalGeneration.from_pretrained("Salesforce/blip-image-captioning-base")
        HAS_BLIP = True
        logger.info("BLIP model loaded successfully")
    except Exception as e:
        logger.warning(f"Failed to load BLIP model: {str(e)}")

try:
    # Try to import DeepFace for face analysis
    from deepface import DeepFace
    HAS_DEEPFACE = True
    logger.info("DeepFace loaded successfully")
except Exception as e:
    logger.warning(f"DeepFace not available: {str(e)}")

try:
    # Try to import YOLOv5 for object detection
    import yolov5
    YOLO_MODEL = yolov5.load('yolov5s')
    HAS_YOLO = True
    logger.info("YOLOv5 loaded successfully")
except Exception as e:
    logger.warning(f"YOLOv5 not available: {str(e)}")

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

def calculate_image_authenticity(image_results):
    """
    Calculate an authenticity factor from image analysis results
    Returns a value from -20 to +20 to adjust authenticity score
    """
    if not image_results or len(image_results) == 0:
        return 0
        
    # Start with neutral factor
    authenticity_factor = 0
    
    # Analyze aesthetic scores
    avg_aesthetic = 0
    aesthetic_count = 0
    
    for result in image_results:
        # Get aesthetic score
        aesthetic_score = 0
        
        # Handle different result formats
        if isinstance(result.get('aesthetic_score'), dict):
            aesthetic_value = result.get('aesthetic_score', {}).get('aesthetic_score', 0)
            if aesthetic_value:
                aesthetic_score = float(aesthetic_value)
        elif result.get('aesthetic_score'):
            aesthetic_score = float(result.get('aesthetic_score', 0))
            
        if aesthetic_score > 0:
            avg_aesthetic += aesthetic_score
            aesthetic_count += 1
    
    # Calculate average aesthetic score
    if aesthetic_count > 0:
        avg_aesthetic = avg_aesthetic / aesthetic_count
        
        # Convert 1-10 aesthetic score to authenticity factor
        # Higher quality images get a positive boost
        if avg_aesthetic > 7:  # Excellent quality
            authenticity_factor += 15
        elif avg_aesthetic > 5:  # Good quality
            authenticity_factor += 10
        elif avg_aesthetic < 3:  # Poor quality
            authenticity_factor -= 5
    
    # In the future, add more factors like:
    # - Natural vs. artificial images
    # - Professional stock photos vs. personal photos
    # - Corporate vs. personal content in images
    
    return authenticity_factor

def calculate_authenticity_score(post):
    """
    Calculate the Pure Feed authenticity score for a post.
    
    Returns a score from 0-100 where:
    90-100: Pure soul. Vulnerable, funny, deep, unique.
    70-89: Insightful, honest, charmingly human.
    40-69: Neutral. Meh. Safe but not manipulative.
    20-39: Performative, cringe, bland, try-hard.
    0-19: Obvious spam, ads, outrage bait, AI slop.
    """
    # Start with a neutral score
    score = 50
    
    # Negative signals reduce authenticity
    
    # 1. Sponsored/ad content is a strong negative
    if post.is_sponsored:
        score -= 30
    
    # 2. Bizfluencer content reduces authenticity
    if post.bizfluencer_score:
        score -= min(30, post.bizfluencer_score * 3)
    
    # 3. High toxicity reduces authenticity
    if post.toxicity_score:
        score -= min(20, post.toxicity_score * 50)
    
    # 4. Very promotional content is less authentic
    if post.content and any(term in post.content.lower() for term in 
                          ['buy now', 'limited time', 'exclusive offer', 'discount', 'sale', 'promo']):
        score -= 15
    
    # 5. Excessive use of hashtags tends to be less authentic
    if post.hashtags:
        hashtag_count = len(post.hashtags.split(','))
        if hashtag_count > 5:
            score -= min(15, hashtag_count)
    
    # Positive signals increase authenticity
    
    # 1. Personal, vulnerable content is more authentic
    if post.content and any(term in post.content.lower() for term in 
                          ['i feel', 'i think', 'my experience', 'i learned', 'i realized']):
        score += 15
    
    # 2. Content from family and close friends is often more authentic
    if post.is_family:
        score += 20
    elif post.is_friend:
        score += 10
    
    # 3. Content with humor tends to be more authentic
    if post.content and any(term in post.content.lower() for term in 
                          ['lol', 'haha', '😂', '🤣', 'funny', 'joke', 'lmao']):
        score += 10
    
    # 4. Positive sentiment content might be more authentic
    if post.sentiment_score:
        # Convert from -1 to 1 scale to 0 to 10 boost
        sentiment_boost = ((post.sentiment_score + 1) / 2) * 10
        score += sentiment_boost
    
    # 5. Questions and engagement with followers can be more authentic
    if post.content and ('?' in post.content or any(term in post.content.lower() for term in 
                                              ['what do you think', 'what about you', 'your thoughts'])):
        score += 10
        
    # 6. Process image analysis if available
    try:
        if hasattr(post, 'image_analysis') and post.image_analysis:
            import json
            image_data = json.loads(post.image_analysis)
            
            # Extract image factors that influence authenticity
            if isinstance(image_data, dict):
                # Use the authenticity factor from image analysis
                if 'authenticity_factor' in image_data:
                    score += image_data['authenticity_factor']
                
                # Add points for high aesthetic quality
                if 'avg_aesthetic_score' in image_data:
                    aesthetic_score = image_data['avg_aesthetic_score']
                    if aesthetic_score > 7:
                        score += 10
                    elif aesthetic_score > 5:
                        score += 5
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"Error processing image analysis for authenticity: {str(e)}")
    
    # Ensure score stays within 0-100 range
    score = max(0, min(100, score))
    
    return score

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
    Process a post with ML algorithms to extract insights.
    Returns the post with ML predictions.
    """
    # Skip if the post has already been processed fully
    if (post.sentiment_score is not None and 
        post.relevance_score is not None and 
        post.automated_category is not None and
        post.toxicity_score is not None):
        return post
    
    try:
        # Extract content from the post
        content = post.content
        
        # Skip processing if the post has no content
        if not content or len(content) < 10:
            return post
        
        # Analyze sentiment
        if post.sentiment_score is None:
            sentiment_result = analyze_sentiment(content)
            post.sentiment_score = sentiment_result.get('sentiment_score', 0)
            post.positive_indicators = sentiment_result.get('positive_indicators', 0)
            post.negative_indicators = sentiment_result.get('negative_indicators', 0)
        
        # Classify topics and categories
        if post.automated_category is None:
            topics = classify_topics(content)
            if topics:
                primary_topic = max(topics.items(), key=lambda x: x[1])
                post.automated_category = primary_topic[0]
                
                # Store all topics with scores above a threshold as tags
                threshold = 0.2
                topic_tags = [topic for topic, score in topics.items() if score >= threshold]
                post.automated_tags = ','.join(topic_tags)
        
        # Calculate toxicity score
        if post.toxicity_score is None:
            post.toxicity_score = calculate_toxicity(content)
        
        # Calculate predicted engagement score (0-100 scale)
        if post.engagement_prediction is None:
            post.engagement_prediction = predict_engagement(post)
        
        # Calculate relevance score (personalized to user)
        if post.relevance_score is None:
            post.relevance_score = calculate_relevance(post, post.user_id)
        
        # Calculate authenticity score (Pure Feed score)
        if post.authenticity_score is None:
            post.authenticity_score = calculate_authenticity_score(post)
        
        # Process post images - Activate this feature
        if (post.image_urls and not post.image_analysis) or (post.image_urls and not post.image_caption):
            process_post_images(post)
        
        # Save the processed post
        post.ml_processed = True
        post.ml_processed_at = timezone.now()
        post.save()
        
        # Log the ML processing
        MLPredictionLog.objects.create(
            post=post,
            prediction_type='sentiment',
            prediction_value=post.sentiment_score,
            confidence=0.8,
            raw_output=json.dumps({
                'sentiment': post.sentiment_score,
                'positive': post.positive_indicators,
                'negative': post.negative_indicators
            })
        )
        
        return post
        
    except Exception as e:
        logger.error(f"Error processing post {post.id}: {str(e)}")
        # Don't re-raise the exception, just return the post as is
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

# New image analysis functions

def fetch_image_from_url(image_url):
    """Fetch an image from URL and return as PIL Image object"""
    if not HAS_PIL:
        logger.warning("PIL not available for image processing")
        return None
        
    try:
        response = requests.get(image_url, timeout=10)
        if response.status_code == 200:
            img = Image.open(BytesIO(response.content))
            return img
        else:
            logger.warning(f"Failed to fetch image from {image_url} - Status code: {response.status_code}")
            return None
    except Exception as e:
        logger.error(f"Error fetching image from {image_url}: {str(e)}")
        return None

def get_perceptual_hash(image):
    """Generate a perceptual hash for an image for similarity comparison"""
    if not HAS_PIL:
        return None
        
    try:
        # Resize to 32x32 and convert to grayscale
        img = image.resize((32, 32), Image.LANCZOS).convert('L')
        
        # Convert to numpy array if available
        if HAS_NUMPY:
            import numpy as np
            pixels = np.array(img)
            # Calculate average pixel value
            avg_pixel = pixels.mean()
            # Create hash (1 if pixel value > avg, 0 otherwise)
            diff = pixels > avg_pixel
            # Convert to a 64-character hexadecimal string
            hash_value = ''.join('1' if d else '0' for d in diff.flatten())
            hash_hex = hex(int(hash_value, 2))[2:].zfill(16)
            return hash_hex
        else:
            # Fallback without numpy
            pixels = list(img.getdata())
            avg_pixel = sum(pixels) / len(pixels)
            hash_value = ''.join('1' if p > avg_pixel else '0' for p in pixels)
            hash_hex = hex(int(hash_value[:64], 2))[2:].zfill(16)
            return hash_hex
    except Exception as e:
        logger.error(f"Error generating perceptual hash: {str(e)}")
        return None

def analyze_image_with_clip(image, text_queries):
    """
    Use CLIP to analyze image alignment with text queries
    Returns relevance scores for each query
    """
    if not HAS_CLIP or not HAS_TORCH:
        logger.warning("CLIP model not available")
        return {}
        
    try:
        # Prepare text and image inputs
        inputs = CLIP_PROCESSOR(
            text=text_queries,
            images=image,
            return_tensors="pt",
            padding=True
        )
        
        # Get model predictions
        with torch.no_grad():
            outputs = CLIP_MODEL(**inputs)
            logits_per_image = outputs.logits_per_image
            probs = logits_per_image.softmax(dim=1)
        
        # Process results
        results = {}
        for i, query in enumerate(text_queries):
            results[query] = probs[0][i].item()
            
        return results
    except Exception as e:
        logger.error(f"Error analyzing image with CLIP: {str(e)}")
        return {}

def generate_image_caption(image):
    """Generate caption for image using BLIP"""
    if not HAS_BLIP or not HAS_TORCH:
        logger.warning("BLIP model not available")
        return "Image caption unavailable"
        
    try:
        # Process the image
        inputs = BLIP_PROCESSOR(image, return_tensors="pt")
        
        # Generate caption
        with torch.no_grad():
            generated_ids = BLIP_MODEL.generate(**inputs, max_length=30)
            caption = BLIP_PROCESSOR.decode(generated_ids[0], skip_special_tokens=True)
            
        return caption
    except Exception as e:
        logger.error(f"Error generating caption with BLIP: {str(e)}")
        return "Error generating caption"

def analyze_image_aesthetics(image):
    """
    Analyze the aesthetic quality of an image
    Returns a score from 1-10
    Works with basic PIL, no ML required
    """
    try:
        if not HAS_PIL:
            return {"aesthetic_score": 5.0, "reason": "PIL not available"}
            
        # Get basic image stats
        width, height = image.size
        aspect_ratio = width / height if height > 0 else 0
        
        # Convert to RGB if not already
        if image.mode != 'RGB':
            try:
                image = image.convert('RGB')
            except Exception:
                return {"aesthetic_score": 5.0, "reason": "Failed to convert to RGB"}
        
        # Get image statistics - simple technical quality metrics
        # These are basic properties that correlate with perceived image quality
        try:
            # Calculate image statistics
            pixels = list(image.getdata())
            
            # Calculate color diversity (number of unique colors as percentage)
            unique_colors = len(set(pixels))
            color_diversity = min(1.0, unique_colors / 10000) if len(pixels) > 0 else 0
            
            # Calculate contrast - simple approximation using min/max values
            brightness_values = [sum(p)/3 for p in pixels]
            contrast = (max(brightness_values) - min(brightness_values)) / 255 if brightness_values else 0
            
            # Calculate resolution quality score
            resolution_score = min(1.0, (width * height) / (1920 * 1080))
            
            # Calculate aspect ratio quality (preference for standard ratios)
            aspect_ratio_quality = 0.5
            # Common aspect ratios: 1:1 (square), 4:3, 16:9, 3:2
            if 0.9 < aspect_ratio < 1.1:  # Square
                aspect_ratio_quality = 0.9
            elif 1.3 < aspect_ratio < 1.4:  # 4:3
                aspect_ratio_quality = 0.85
            elif 1.7 < aspect_ratio < 1.8:  # 16:9
                aspect_ratio_quality = 0.95
            elif 1.4 < aspect_ratio < 1.5:  # 3:2
                aspect_ratio_quality = 0.9
            
            # Calculate final score (1-10 scale)
            aesthetic_score = (
                3.0 +  # Base score
                (color_diversity * 2) +  # 0-2 points for color diversity
                (contrast * 2) +  # 0-2 points for contrast
                (resolution_score * 2) +  # 0-2 points for resolution
                aspect_ratio_quality  # 0-1 points for aspect ratio
            )
            
            # Ensure score is in range 1-10
            aesthetic_score = max(1.0, min(10.0, aesthetic_score))
            
            return {
                "aesthetic_score": aesthetic_score,
                "details": {
                    "width": width,
                    "height": height,
                    "aspect_ratio": aspect_ratio,
                    "color_diversity": color_diversity,
                    "contrast": contrast,
                    "resolution": resolution_score
                }
            }
            
        except Exception as e:
            logger.warning(f"Error calculating image statistics: {str(e)}")
            return {"aesthetic_score": 5.0, "reason": f"Error in statistics: {str(e)}"}
            
    except Exception as e:
        logger.warning(f"Error in aesthetic analysis: {str(e)}")
        return {"aesthetic_score": 5.0, "reason": str(e)}

def analyze_faces_in_image(image):
    """Analyze faces in the image using DeepFace"""
    if not HAS_DEEPFACE:
        return []
    
    try:
        # Save image to temp file for DeepFace
        temp_path = "/tmp/temp_image.jpg"
        image.save(temp_path)
        
        # Analyze with DeepFace
        face_analysis = DeepFace.analyze(
            img_path=temp_path,
            actions=['age', 'gender', 'emotion'],
            enforce_detection=False
        )
        
        # Process results
        if isinstance(face_analysis, list):
            return face_analysis
        else:
            return [face_analysis]
    except Exception as e:
        logger.error(f"Error analyzing faces: {str(e)}")
        return []

def detect_objects_in_image(image):
    """Detect objects in the image using YOLOv5"""
    if not HAS_YOLO:
        return []
    
    try:
        # Process the image with YOLOv5
        results = YOLO_MODEL(image)
        
        # Extract detected objects
        objects = []
        for pred in results.pred[0]:
            x1, y1, x2, y2, conf, cls = pred
            label = results.names[int(cls)]
            objects.append({
                'label': label,
                'confidence': float(conf),
                'box': [float(x1), float(y1), float(x2), float(y2)]
            })
            
        return objects
    except Exception as e:
        logger.error(f"Error detecting objects: {str(e)}")
        return []

def analyze_image(image_url):
    """
    Complete image analysis function
    Returns a dictionary with all analysis results
    """
    # If we're missing basic dependencies, return a basic result
    if not HAS_PIL:
        return {
            "success": False,
            "url": image_url,
            "error": "Required image processing libraries not available",
            "caption": None,
            "aesthetic_score": {"aesthetic_score": 5.0},  # Default neutral score
            "perceptual_hash": None,
            "clip_scores": None,
            "faces": None,
            "objects": None
        }
    
    results = {
        "success": False,
        "url": image_url,
        "error": None,
        "caption": None,
        "aesthetic_score": {"aesthetic_score": 5.0},  # Default neutral score
        "perceptual_hash": None,
        "clip_scores": None,
        "faces": None,
        "objects": None
    }
    
    # Validate URL
    try:
        parsed_url = urlparse(image_url)
        if not parsed_url.scheme or not parsed_url.netloc:
            results["error"] = "Invalid URL format"
            return results
    except Exception:
        results["error"] = "URL parsing error"
        return results
    
    # Fetch the image
    image = fetch_image_from_url(image_url)
    if image is None:
        results["error"] = "Failed to fetch image"
        return results
    
    # Run analyses
    results["success"] = True
    
    # Generate perceptual hash
    try:
        results["perceptual_hash"] = get_perceptual_hash(image)
    except Exception as e:
        logger.warning(f"Error generating perceptual hash: {str(e)}")
    
    # Generate caption with BLIP
    if HAS_BLIP:
        try:
            results["caption"] = generate_image_caption(image)
        except Exception as e:
            logger.warning(f"Error generating image caption: {str(e)}")
    
    # Analyze with CLIP
    if HAS_CLIP:
        try:
            # Categories to check image against
            categories = [
                "a photo of food", 
                "a selfie", 
                "a landscape photo",
                "a product advertisement", 
                "a screenshot", 
                "a meme",
                "professional photography", 
                "artificial image",
                "a photo of a person", 
                "a photo of an animal",
                "a photo of text", 
                "a graph or chart"
            ]
            results["clip_scores"] = analyze_image_with_clip(image, categories)
        except Exception as e:
            logger.warning(f"Error analyzing image with CLIP: {str(e)}")
    
    # Aesthetic analysis
    try:
        results["aesthetic_score"] = analyze_image_aesthetics(image)
    except Exception as e:
        logger.warning(f"Error analyzing image aesthetics: {str(e)}")
    
    # Face analysis
    if HAS_DEEPFACE:
        try:
            results["faces"] = analyze_faces_in_image(image)
        except Exception as e:
            logger.warning(f"Error analyzing faces: {str(e)}")
    
    # Object detection
    if HAS_YOLO:
        try:
            results["objects"] = detect_objects_in_image(image)
        except Exception as e:
            logger.warning(f"Error detecting objects: {str(e)}")
    
    return results

def process_post_images(post):
    """Process all images in a post"""
    if not post.image_urls:
        return []
    
    # Parse image URLs
    try:
        image_urls = [url.strip() for url in post.image_urls.split(',') if url.strip()]
    except Exception:
        return []
    
    results = []
    for url in image_urls[:5]:  # Limit to first 5 images
        try:
            analysis = analyze_image(url)
            results.append(analysis)
            
            # If this is the first successful image analysis, store it in the post
            if analysis['success'] and not post.image_analysis:
                # Store the analysis results as JSON
                post.image_analysis = json.dumps(analysis)
                
                # If we have a caption, store it
                if analysis.get('caption'):
                    post.image_caption = analysis.get('caption')
                    
                # Update authenticity score based on image quality if not already set
                if post.authenticity_score is None and analysis.get('aesthetic_score'):
                    aesthetic_score = analysis.get('aesthetic_score', {}).get('aesthetic_score', 5.0)
                    # Aesthetic score is 1-10, convert to 0-20 boost for authenticity
                    aesthetic_boost = (aesthetic_score - 1) * 2.5  # Convert 1-10 to 0-20 scale
                    
                    # Calculate base authenticity score if needed
                    if post.authenticity_score is None:
                        post.authenticity_score = calculate_authenticity_score(post)
                    
                    # Add the boost from image quality (max 20 points)
                    post.authenticity_score += min(20, aesthetic_boost)
                    # Ensure we don't exceed 100
                    post.authenticity_score = min(100, post.authenticity_score)
                
                # Save the post with the image analysis
                post.save()
                
        except Exception as e:
            logger.error(f"Error analyzing image {url}: {str(e)}")
    
    return results

def process_social_post(post_id):
    """
    Enhanced processing function for social media posts
    Adds text analysis and image analysis capabilities
    """
    try:
        post = SocialPost.objects.get(id=post_id)
    except SocialPost.DoesNotExist:
        logger.error(f"Post with ID {post_id} not found")
        return None
    
    try:
        # Process text content
        if post.content:
            # Sentiment analysis
            sentiment_results = analyze_sentiment(post.content)
            post.sentiment_score = sentiment_results['sentiment_score']
            post.positive_indicators = sentiment_results['positive_indicators']
            post.negative_indicators = sentiment_results['negative_indicators']
            
            # Topic classification
            topics = classify_topics(post.content)
            if topics:
                post.automated_category = topics[0]['category']  # Set primary category
                
                # Store full topic analysis in ML prediction log
                prediction_log = MLPredictionLog(
                    post=post,
                    prediction_type='topic_classification',
                    prediction_value=topics[0]['score'],
                    raw_output=json.dumps(topics)
                )
                prediction_log.save()
        
        # Process images if available
        if post.image_urls:
            image_results = process_post_images(post)
            if image_results:
                # Store image analysis in ML prediction log
                prediction_log = MLPredictionLog(
                    post=post,
                    prediction_type='image_analysis',
                    prediction_value=image_results[0].get('aesthetic_score', {}).get('aesthetic_score', 5.0),
                    raw_output=json.dumps(image_results)
                )
                prediction_log.save()
        
        # Save updated post
        post.save()
        return post
    except Exception as e:
        logger.error(f"Error processing post {post_id}: {str(e)}")
        return None

def process_image_analysis(post):
    """
    Process images from a post for ML analysis
    Returns a dictionary of results
    """
    if not post.image_urls:
        return None
    
    image_urls = post.image_urls.split(',')
    if not image_urls:
        return None
    
    from .utils import download_image
    
    # Log that we're starting image processing
    logger.info(f"Processing {len(image_urls)} images for post {post.id}")
    
    all_results = []
    
    try:
        # Only process the first few images to avoid overloading
        for i, url in enumerate(image_urls[:3]):  # Limit to 3 images
            url = url.strip()
            if not url:
                continue
                
            # Try to download the image
            try:
                image_path = download_image(url)
                if not image_path:
                    logger.warning(f"Failed to download image from {url}")
                    continue
            except Exception as e:
                logger.warning(f"Error downloading image from {url}: {str(e)}")
                continue
            
            # Try to open the image with PIL
            try:
                if not HAS_PIL:
                    logger.warning("PIL not available, skipping image analysis")
                    continue
                    
                from PIL import Image
                image = Image.open(image_path)
                
                # Process the image
                results = analyze_image(image)
                results['url'] = url
                all_results.append(results)
                
                # Log success
                logger.info(f"Successfully analyzed image {i+1} for post {post.id}")
                
            except Exception as e:
                logger.warning(f"Error analyzing image: {str(e)}")
                # Continue to next image
                continue
            finally:
                # Clean up downloaded image file
                try:
                    import os
                    if os.path.exists(image_path):
                        os.remove(image_path)
                except:
                    pass
    except Exception as e:
        logger.error(f"Error in overall image processing: {str(e)}")
    
    # If we have at least one successful result, return combined analysis
    if all_results:
        # Get the average aesthetic score
        avg_aesthetic_score = sum(r.get('aesthetic_score', {}).get('aesthetic_score', 5.0) if isinstance(r.get('aesthetic_score'), dict) else r.get('aesthetic_score', 5.0) for r in all_results) / len(all_results)
        
        # Combine all results
        combined_results = {
            "images_analyzed": len(all_results),
            "avg_aesthetic_score": avg_aesthetic_score,
            "authenticity_factor": calculate_image_authenticity(all_results),
            "detailed_results": all_results
        }
        
        return combined_results
    
    return None