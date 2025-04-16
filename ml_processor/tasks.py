from celery import shared_task
from celery.utils.log import get_task_logger
import time
import traceback

logger = get_task_logger(__name__)

@shared_task(bind=True, max_retries=3, default_retry_delay=300)
def process_face_analysis_async(self, image_path, user_id, actions=None, detector_backend='opencv'):
    """
    Asynchronously process facial analysis on an image
    
    Args:
        image_path: Path to the image to process
        user_id: The ID of the user requesting the analysis
        actions: List of analysis types (emotion, age, gender, race)
        detector_backend: Face detector backend to use
    """
    try:
        from deepface import DeepFace
        
        logger.info(f"Starting face analysis for image: {image_path}")
        start_time = time.time()
        
        if actions is None:
            actions = ['emotion', 'age', 'gender', 'race']
        
        # Perform the analysis
        results = DeepFace.analyze(
            img_path=image_path,
            actions=actions,
            detector_backend=detector_backend,
            enforce_detection=False
        )
        
        processing_time = time.time() - start_time
        logger.info(f"Face analysis completed in {processing_time:.2f} seconds")
        
        # Return the results
        return {
            'success': True,
            'processing_time': processing_time,
            'user_id': user_id,
            'results': results
        }
    except Exception as e:
        logger.error(f"Error in face analysis task: {str(e)}")
        logger.error(traceback.format_exc())
        
        # Retry the task if appropriate
        if self.request.retries < self.max_retries:
            logger.info(f"Retrying task, attempt {self.request.retries + 1} of {self.max_retries}")
            raise self.retry(exc=e)
            
        # Return error if all retries failed
        return {
            'success': False,
            'error': str(e)
        }

@shared_task(bind=True, max_retries=3, default_retry_delay=300)
def detect_objects_async(self, image_path, user_id, confidence=0.4):
    """
    Asynchronously detect objects in an image using YOLOv5
    
    Args:
        image_path: Path to the image to process
        user_id: The ID of the user requesting the detection
        confidence: Minimum confidence threshold
    """
    try:
        import torch
        from PIL import Image
        import os
        
        logger.info(f"Starting object detection for image: {image_path}")
        start_time = time.time()
        
        # Load YOLOv5 model
        model = torch.hub.load('ultralytics/yolov5', 'yolov5s', pretrained=True)
        model.eval()
        
        # Process the image if it exists
        if not os.path.exists(image_path):
            return {'success': False, 'error': 'Image file not found'}
            
        # Load image
        image = Image.open(image_path)
        
        # Perform detection
        results = model(image)
        results.conf = confidence  # Set confidence threshold
        
        # Process results
        detections = results.pandas().xyxy[0]
        
        # Extract relevant information
        objects = []
        for _, row in detections.iterrows():
            objects.append({
                'name': row['name'],
                'confidence': float(row['confidence']),
                'bounding_box': {
                    'x1': float(row['xmin']),
                    'y1': float(row['ymin']),
                    'x2': float(row['xmax']),
                    'y2': float(row['ymax']),
                }
            })
        
        processing_time = time.time() - start_time
        logger.info(f"Object detection completed in {processing_time:.2f} seconds")
        
        # Return the results
        return {
            'success': True,
            'processing_time': processing_time,
            'user_id': user_id,
            'objects_found': len(objects),
            'objects': objects
        }
    except Exception as e:
        logger.error(f"Error in object detection task: {str(e)}")
        logger.error(traceback.format_exc())
        
        # Retry the task if appropriate
        if self.request.retries < self.max_retries:
            logger.info(f"Retrying task, attempt {self.request.retries + 1} of {self.max_retries}")
            raise self.retry(exc=e)
            
        # Return error if all retries failed
        return {
            'success': False,
            'error': str(e)
        }

@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def analyze_post_content_async(self, post_id):
    """
    Asynchronously analyze a social post's content (text and images)
    
    Args:
        post_id: The ID of the post to analyze
    """
    try:
        from django.apps import apps
        import json
        
        SocialPost = apps.get_model('brandsensor', 'SocialPost')
        
        logger.info(f"Starting analysis for post ID: {post_id}")
        start_time = time.time()
        
        # Get the post
        post = SocialPost.objects.get(id=post_id)
        
        # Process text content
        from brandsensor.ml_processor import analyze_sentiment, extract_keywords
        
        # Analyze sentiment
        sentiment_results = analyze_sentiment(post.content)
        post.sentiment_score = sentiment_results.get('sentiment', 0)
        post.positive_indicators = sentiment_results.get('positive_count', 0)
        post.negative_indicators = sentiment_results.get('negative_count', 0)
        
        # Extract keywords and categorize
        keywords = extract_keywords(post.content)
        if keywords:
            # Store categories and hashtags
            if 'categories' in keywords:
                post.automated_category = ','.join(keywords['categories'][:3])
            if 'hashtags' in keywords:
                post.hashtags = ','.join(keywords['hashtags'])
                
        # Process images if available
        if post.image_urls:
            image_analysis = {}
            image_urls = post.image_urls.split(',')
            
            for url in image_urls[:3]:  # Process up to 3 images
                # Placeholder for image analysis results
                # In a real implementation, you would download the image and process it
                image_analysis[url] = {
                    'pending': True,
                    'task_id': 'pending'  # Would be a real task ID in implementation
                }
            
            # Store the image analysis results (placeholder)
            post.image_analysis = json.dumps(image_analysis)
            
        # Save the post with updated information
        post.save()
        
        processing_time = time.time() - start_time
        logger.info(f"Post analysis completed in {processing_time:.2f} seconds")
        
        # Return the results
        return {
            'success': True,
            'processing_time': processing_time,
            'post_id': post_id,
            'sentiment': post.sentiment_score
        }
    except Exception as e:
        logger.error(f"Error in post analysis task: {str(e)}")
        logger.error(traceback.format_exc())
        
        # Retry the task if appropriate
        if self.request.retries < self.max_retries:
            logger.info(f"Retrying task, attempt {self.request.retries + 1} of {self.max_retries}")
            raise self.retry(exc=e)
            
        # Return error if all retries failed
        return {
            'success': False,
            'error': str(e)
        } 