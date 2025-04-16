import os
import base64
import json
import uuid
import numpy as np
import cv2
from io import BytesIO
from PIL import Image
import torch
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from deepface import DeepFace
from deepface.commons import functions
from .tasks import process_face_analysis_async, detect_objects_async
from celery.result import AsyncResult
import logging
from django.shortcuts import render
from django.views.decorators.http import require_POST

# Set up logger
logger = logging.getLogger(__name__)

# Create a logger for error reports
error_logger = logging.getLogger('chrome_extension_errors')

# Configure YOLOv5
YOLO_MODEL = None  # Will be loaded on first use
YOLO_MODEL_PATH = os.path.join(settings.BASE_DIR, 'ml_processor/models/yolov5s.pt')

def load_yolo_model():
    """Load the YOLOv5 model (only once)"""
    global YOLO_MODEL
    if YOLO_MODEL is None:
        try:
            # Load YOLOv5 from torch hub
            YOLO_MODEL = torch.hub.load('ultralytics/yolov5', 'yolov5s', pretrained=True)
            YOLO_MODEL.eval()
            print("YOLOv5 model loaded successfully")
        except Exception as e:
            print(f"Error loading YOLOv5 model: {e}")
            # Fallback to local model if available
            if os.path.exists(YOLO_MODEL_PATH):
                YOLO_MODEL = torch.load(YOLO_MODEL_PATH)
                YOLO_MODEL.eval()
                print("YOLOv5 model loaded from local path")
    return YOLO_MODEL


def decode_image(image_data):
    """Decode various image formats from request data"""
    try:
        # Check if it's a base64 string
        if isinstance(image_data, str) and image_data.startswith('data:image'):
            # Extract the base64 part
            image_data = image_data.split(',')[1]
            image = Image.open(BytesIO(base64.b64decode(image_data)))
            return np.array(image)
        
        # Check if it's already base64 encoded without data URI prefix
        elif isinstance(image_data, str):
            try:
                image = Image.open(BytesIO(base64.b64decode(image_data)))
                return np.array(image)
            except:
                pass
        
        # Handle binary data
        elif isinstance(image_data, bytes):
            image = Image.open(BytesIO(image_data))
            return np.array(image)
        
        # Handle PIL Image
        elif isinstance(image_data, Image.Image):
            return np.array(image_data)
        
        # Handle numpy array
        elif isinstance(image_data, np.ndarray):
            return image_data
            
        raise ValueError("Unsupported image format")
    except Exception as e:
        raise ValueError(f"Error decoding image: {e}")


def save_temp_image(image_array):
    """Save numpy array as temporary image file"""
    temp_dir = os.path.join(settings.MEDIA_ROOT, 'temp')
    os.makedirs(temp_dir, exist_ok=True)
    
    # Generate a unique filename
    filename = f"{uuid.uuid4()}.jpg"
    filepath = os.path.join(temp_dir, filename)
    
    # Convert RGB to BGR for OpenCV
    if len(image_array.shape) == 3 and image_array.shape[2] == 3:
        image_array = cv2.cvtColor(image_array, cv2.COLOR_RGB2BGR)
    
    # Save the image
    cv2.imwrite(filepath, image_array)
    
    return filepath


@csrf_exempt
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def analyze_face(request):
    """
    Analyze faces in an image using DeepFace (async with Celery)
    
    POST parameters:
    - image: base64 encoded image or file upload
    - actions: comma-separated list of analyses to perform (default: all)
    - detector_backend: face detector to use (default: opencv)
    - async: boolean, if true process asynchronously (default: true)
        
    Returns:
    - If async=true: task_id and status
    - If async=false: facial analysis results
    """
    try:
        # Get the image from request
        if 'image' in request.FILES:
            image_file = request.FILES['image']
            image_array = decode_image(image_file.read())
        elif 'image' in request.data:
            image_array = decode_image(request.data['image'])
        else:
            return JsonResponse({
                'success': False,
                'error': 'No image provided'
            }, status=400)
            
        # Save the image temporarily
        temp_image_path = save_temp_image(image_array)
        
        # Get requested actions
        actions = request.data.get('actions', 'emotion,age,gender,race')
        actions = [action.strip() for action in actions.split(',')]
        
        # Get face detector backend
        detector_backend = request.data.get('detector_backend', 'opencv')
        
        # Check if async processing is requested (default to true)
        async_processing = request.data.get('async', 'true').lower() in ('true', 't', 'yes', 'y', '1')
        
        if async_processing:
            # Process asynchronously using Celery
            task = process_face_analysis_async.delay(
                temp_image_path, 
                request.user.id, 
                actions, 
                detector_backend
            )
            
            return JsonResponse({
                'success': True,
                'async': True,
                'task_id': task.id,
                'status': 'Processing started',
                'status_url': f'/api/task-status/{task.id}/'
            })
        else:
            # Process synchronously (original implementation)
            try:
                results = DeepFace.analyze(
                    img_path=temp_image_path,
                    actions=actions,
                    detector_backend=detector_backend,
                    enforce_detection=False
                )
                
                # DeepFace returns a list of dictionaries for each face
                if not isinstance(results, list):
                    results = [results]
                    
                # Format the results
                formatted_results = []
                for face_result in results:
                    face_data = {}
                    
                    # Extract region information
                    if 'region' in face_result:
                        face_data['region'] = face_result['region']
                    
                    # Extract emotion data if available
                    if 'emotion' in face_result and 'emotion' in actions:
                        face_data['emotion'] = {
                            emotion: float(score) 
                            for emotion, score in face_result['emotion'].items()
                        }
                        # Add dominant emotion
                        face_data['dominant_emotion'] = max(
                            face_data['emotion'].items(), 
                            key=lambda x: x[1]
                        )[0]
                    
                    # Extract age if available
                    if 'age' in face_result and 'age' in actions:
                        face_data['age'] = face_result['age']
                    
                    # Extract gender if available
                    if 'gender' in face_result and 'gender' in actions:
                        face_data['gender'] = {
                            'gender': face_result['gender'],
                            'confidence': float(face_result.get('gender_confidence', 0))
                        }
                    
                    # Extract race if available
                    if 'race' in face_result and 'race' in actions:
                        face_data['race'] = {
                            race: float(score)
                            for race, score in face_result['race'].items()
                        }
                        # Add dominant race
                        face_data['dominant_race'] = max(
                            face_data['race'].items(),
                            key=lambda x: x[1]
                        )[0]
                    
                    formatted_results.append(face_data)
                
                # Clean up temporary file
                if os.path.exists(temp_image_path):
                    os.remove(temp_image_path)
                
                return JsonResponse({
                    'success': True,
                    'async': False,
                    'faces_detected': len(formatted_results),
                    'results': formatted_results
                })
                
            except Exception as e:
                # Clean up temporary file in case of error
                if os.path.exists(temp_image_path):
                    os.remove(temp_image_path)
                
                return JsonResponse({
                    'success': False,
                    'error': f'Face analysis error: {str(e)}'
                }, status=500)
            
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Request processing error: {str(e)}'
        }, status=400)


@csrf_exempt
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def detect_objects(request):
    """
    Detect objects in an image using YOLOv5 (async with Celery)
    
    POST parameters:
    - image: base64 encoded image or file upload
    - confidence: minimum confidence threshold (default: 0.4)
    - include_boxes: whether to include bounding boxes (default: True)
    - async: boolean, if true process asynchronously (default: true)
    
    Returns:
    - If async=true: task_id and status
    - If async=false: detected objects list
    """
    try:
        # Get the image from request
        if 'image' in request.FILES:
            image_file = request.FILES['image']
            image_array = decode_image(image_file.read())
        elif 'image' in request.data:
            image_array = decode_image(request.data['image'])
        else:
            return JsonResponse({
                'success': False,
                'error': 'No image provided'
            }, status=400)
            
        # Save the image temporarily
        temp_image_path = save_temp_image(image_array)
        
        # Get confidence threshold
        confidence = float(request.data.get('confidence', 0.4))
        
        # Check if async processing is requested (default to true)
        async_processing = request.data.get('async', 'true').lower() in ('true', 't', 'yes', 'y', '1')
        
        if async_processing:
            # Process asynchronously using Celery
            task = detect_objects_async.delay(
                temp_image_path, 
                request.user.id, 
                confidence
            )
            
            return JsonResponse({
                'success': True,
                'async': True,
                'task_id': task.id,
                'status': 'Processing started',
                'status_url': f'/api/task-status/{task.id}/'
            })
            
        else:
            # Synchronous processing (original implementation)
            # Convert to PIL Image for YOLOv5
            image = Image.fromarray(image_array)
            
            # Load the YOLOv5 model
            model = load_yolo_model()
            if model is None:
                return JsonResponse({
                    'success': False,
                    'error': 'Failed to load YOLOv5 model'
                }, status=500)
            
            # Perform inference
            model.conf = confidence  # Set confidence threshold
            results = model(image)
            
            # Process results
            results_data = results.pandas().xyxy[0]  # Get results as pandas DataFrame
            
            # Format the output
            detections = []
            for i, row in results_data.iterrows():
                detection = {
                    'label': row['name'],
                    'confidence': float(row['confidence']),
                    'class_id': int(row['class'])
                }
                
                if include_boxes:
                    detection['box'] = {
                        'x1': float(row['xmin']),
                        'y1': float(row['ymin']),
                        'x2': float(row['xmax']),
                        'y2': float(row['ymax']),
                        'width': float(row['xmax'] - row['xmin']),
                        'height': float(row['ymax'] - row['ymin'])
                    }
                
                detections.append(detection)
            
            # Summarize object counts
            object_counts = results_data['name'].value_counts().to_dict()
            object_counts = {str(k): int(v) for k, v in object_counts.items()}
            
            # Prepare the response
            response = {
                'success': True,
                'detections': detections,
                'object_counts': object_counts,
                'total_objects': len(detections),
                'image_dimensions': {
                    'width': image.width,
                    'height': image.height
                }
            }
            
            return JsonResponse(response)
            
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Object detection error: {str(e)}'
        }, status=500)


@csrf_exempt
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def task_status(request, task_id):
    """
    Check the status of a Celery task
    
    Returns:
    - status: The current status of the task
    - result: The result if the task is complete
    """
    task_result = AsyncResult(task_id)
    
    response = {
        'task_id': task_id,
        'status': task_result.status,
    }
    
    # Only include result if task is complete
    if task_result.status == 'SUCCESS':
        response['result'] = task_result.result
    elif task_result.status == 'FAILURE':
        response['error'] = str(task_result.result)
        
    return JsonResponse(response)


@csrf_exempt
@require_POST
def error_report(request):
    """
    Endpoint for receiving error reports from the Chrome extension.
    
    Expected POST parameters:
    - report: JSON string with error details
    - extension_version: Version of the Chrome extension
    - browser: Browser information
    - timestamp: Time when the error occurred
    
    Returns:
    - JSON response with status, message, and report_id
    """
    try:
        # Extract parameters from the request
        report_data = json.loads(request.POST.get('report', '{}'))
        extension_version = request.POST.get('extension_version', 'unknown')
        browser = request.POST.get('browser', 'unknown')
        timestamp = request.POST.get('timestamp', 'unknown')
        
        # Generate a unique report ID
        report_id = str(uuid.uuid4())
        
        # Log the error report with metadata
        error_logger.error(
            f"Chrome Extension Error Report (ID: {report_id})\n"
            f"Version: {extension_version}\n"
            f"Browser: {browser}\n"
            f"Timestamp: {timestamp}\n"
            f"Details: {json.dumps(report_data, indent=2)}"
        )
        
        return JsonResponse({
            'status': 'success',
            'message': 'Error report received successfully',
            'report_id': report_id
        })
    except Exception as e:
        logger.exception("Failed to process error report")
        return JsonResponse({
            'status': 'error',
            'message': f'Failed to process error report: {str(e)}',
            'report_id': None
        }, status=500) 