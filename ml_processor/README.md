# ML Processor

This module provides machine learning capabilities for facial analysis and object detection.

## Features

- **Face Analysis**: Detect and analyze faces in images using DeepFace
  - Emotion detection
  - Age estimation
  - Gender classification
  - Race/ethnicity classification
  
- **Object Detection**: Detect and classify objects in images using YOLOv5

## Installation

1. Install required dependencies:

```bash
pip install deepface opencv-python pillow torch torchvision
```

2. For YOLOv5 (optional - will be downloaded automatically on first use):

```bash
# Download YOLOv5 model
mkdir -p ml_processor/models
wget -O ml_processor/models/yolov5s.pt https://github.com/ultralytics/yolov5/releases/download/v6.1/yolov5s.pt
```

## API Usage

### Face Analysis

**Endpoint**: `/ml/analyze-face/`

**Method**: POST

**Authentication**: Required

**Parameters**:
- `image`: Base64 encoded image or file upload
- `actions`: (Optional) Comma-separated list of analyses to perform (default: all)
  - Possible values: emotion, age, gender, race
- `detector_backend`: (Optional) Face detector to use (default: opencv)
  - Possible values: opencv, ssd, mtcnn, retinaface, mediapipe

**Example Request**:
```javascript
// Using fetch API
const response = await fetch('/ml/analyze-face/', {
  method: 'POST',
  headers: {
    'Authorization': 'Token YOUR_API_TOKEN',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    image: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABA...',
    actions: 'emotion,age,gender',
    detector_backend: 'retinaface'
  })
});

const data = await response.json();
console.log(data);
```

**Example Response**:
```json
{
  "success": true,
  "faces_detected": 1,
  "results": [
    {
      "region": {
        "x": 142,
        "y": 78,
        "w": 195,
        "h": 195
      },
      "emotion": {
        "angry": 0.02,
        "disgust": 0.01,
        "fear": 0.03,
        "happy": 0.85,
        "sad": 0.04,
        "surprise": 0.03,
        "neutral": 0.02
      },
      "dominant_emotion": "happy",
      "age": 34,
      "gender": {
        "gender": "Woman",
        "confidence": 0.99
      }
    }
  ]
}
```

### Object Detection

**Endpoint**: `/ml/detect-objects/`

**Method**: POST

**Authentication**: Required

**Parameters**:
- `image`: Base64 encoded image or file upload
- `confidence`: (Optional) Minimum confidence threshold (default: 0.4)
- `include_boxes`: (Optional) Whether to include bounding boxes (default: true)

**Example Request**:
```javascript
// Using fetch API
const response = await fetch('/ml/detect-objects/', {
  method: 'POST',
  headers: {
    'Authorization': 'Token YOUR_API_TOKEN',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    image: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABA...',
    confidence: 0.5,
    include_boxes: true
  })
});

const data = await response.json();
console.log(data);
```

**Example Response**:
```json
{
  "success": true,
  "detections": [
    {
      "label": "person",
      "confidence": 0.93,
      "class_id": 0,
      "box": {
        "x1": 234.5,
        "y1": 123.2,
        "x2": 374.1,
        "y2": 412.6,
        "width": 139.6,
        "height": 289.4
      }
    },
    {
      "label": "car",
      "confidence": 0.87,
      "class_id": 2,
      "box": {
        "x1": 45.3,
        "y1": 301.8,
        "x2": 125.4,
        "y2": 348.2,
        "width": 80.1,
        "height": 46.4
      }
    }
  ],
  "object_counts": {
    "person": 1,
    "car": 1
  },
  "total_objects": 2,
  "image_dimensions": {
    "width": 640,
    "height": 480
  }
}
```

## Technical Details

- DeepFace is used for facial analysis, providing pre-trained models for emotion, age, gender, and race detection.
- YOLOv5 is used for object detection, which can identify 80 common object categories.
- Temporary files are created during processing but cleaned up afterward.
- Both endpoints require authentication for security reasons. 