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
except ImportError:
    HAS_TORCH = False

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

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
    Analyze image aesthetics (placeholder for AVA model)
    In a real implementation, we would use a model trained on the AVA dataset
    """
    if not HAS_PIL:
        return {"aesthetic_score": 5.0}  # Default score
    
    try:
        # Simple aesthetic score based on image properties
        # In a real implementation, use a trained model instead
        width, height = image.size
        aspect_ratio = width / height
        
        # Ideal aspect ratios (approximate golden ratio)
        ideal_ratio = 1.618
        ratio_score = 10 - min(abs(aspect_ratio - ideal_ratio), abs(1/aspect_ratio - ideal_ratio)) * 5
        
        # Brightness and contrast assessment
        if HAS_NUMPY:
            import numpy as np
            img_array = np.array(image.convert('L'))
            brightness = img_array.mean() / 255  # Normalized to 0-1
            contrast = img_array.std() / 128     # Normalized
            
            # Higher scores for moderate brightness (not too dark or bright)
            brightness_score = 10 - abs(brightness - 0.5) * 10
            # Higher scores for good contrast
            contrast_score = min(contrast * 10, 10)
            
            final_score = (ratio_score + brightness_score + contrast_score) / 3
        else:
            # Simplified version without numpy
            final_score = ratio_score
            
        return {
            "aesthetic_score": round(final_score, 2),
            "aspect_ratio": round(aspect_ratio, 3),
        }
    except Exception as e:
        logger.error(f"Error analyzing image aesthetics: {str(e)}")
        return {"aesthetic_score": 5.0}  # Default on error

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
    results = {
        "success": False,
        "url": image_url,
        "error": None,
        "caption": None,
        "aesthetic_score": None,
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
    results["perceptual_hash"] = get_perceptual_hash(image)
    
    # Generate caption with BLIP
    if HAS_BLIP:
        results["caption"] = generate_image_caption(image)
    
    # Analyze with CLIP
    if HAS_CLIP:
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
    
    # Aesthetic analysis
    results["aesthetic_score"] = analyze_image_aesthetics(image)
    
    # Face analysis
    if HAS_DEEPFACE:
        results["faces"] = analyze_faces_in_image(image)
    
    # Object detection
    if HAS_YOLO:
        results["objects"] = detect_objects_in_image(image)
    
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