# Setting Up the Authentic Dashboard ML Environment

This guide provides instructions for setting up the machine learning (ML) environment for Authentic Dashboard, including image analysis capabilities.

## Prerequisites

- Python 3.8 or higher
- `pip` (Python package manager)
- Git
- PostgreSQL (recommended for production)

## Step 1: Clone the Repository

```bash
git clone <repository-url>
cd authentic_dashboard_project
```

## Step 2: Create a Virtual Environment

```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Linux/macOS:
source venv/bin/activate
# On Windows:
venv\Scripts\activate
```

## Step 3: Install Core Dependencies

```bash
# Install core requirements
pip install -r requirements.txt
```

## Step 4: Install Optional ML Dependencies

Depending on your needs, you can install additional ML packages:

```bash
# Deep learning frameworks
pip install torch torchvision torchaudio
pip install transformers sentence-transformers

# Image analysis tools
pip install Pillow opencv-python

# Optional: Face analysis
pip install deepface

# Optional: Object detection
pip install yolov5

# Optional: Recommender systems
pip install lightfm surprise

# Optional: Graph neural networks
pip install dgl torch-geometric

# Optional: FastAI
pip install fastai
```

## Step 5: Configure Database

For optimal ML performance, we recommend using PostgreSQL:

```bash
# Install PostgreSQL client
pip install psycopg2-binary

# Run database optimization script
python optimize_db.py
```

Follow the instructions in the script output to migrate from SQLite to PostgreSQL if needed.

## Step 6: Download Pre-trained Models

Some ML models require downloading pre-trained weights:

```bash
# Create model directory
mkdir -p media/ml_models

# Download CLIP model
python -c "from transformers import CLIPModel, CLIPProcessor; model = CLIPModel.from_pretrained('openai/clip-vit-base-patch32'); processor = CLIPProcessor.from_pretrained('openai/clip-vit-base-patch32'); model.save_pretrained('media/ml_models/clip'); processor.save_pretrained('media/ml_models/clip')"

# Download BLIP model
python -c "from transformers import BlipProcessor, BlipForConditionalGeneration; model = BlipForConditionalGeneration.from_pretrained('Salesforce/blip-image-captioning-base'); processor = BlipProcessor.from_pretrained('Salesforce/blip-image-captioning-base'); model.save_pretrained('media/ml_models/blip'); processor.save_pretrained('media/ml_models/blip')"

# Download YOLOv5 model (if using object detection)
python -c "import yolov5; model = yolov5.load('yolov5s'); model.save('media/ml_models/yolov5s.pt')"
```

## Step 7: Update Django Settings

Make sure your `settings.py` includes proper configuration for ML models:

```python
# settings.py additions

# ML Models configuration
ML_MODELS_DIR = os.path.join(BASE_DIR, 'media/ml_models')
ENABLE_IMAGE_ANALYSIS = True  # Set to False to disable image analysis features
ML_PROCESSING_BATCH_SIZE = 100  # Max number of posts to process in a single batch
```

## Step 8: Run Django Migrations

```bash
python manage.py migrate
```

## Step 9: Test Your Installation

You can verify your ML installation with:

```bash
python manage.py test brandsensor.tests.test_ml
```

## Hardware Requirements

For optimal performance with image analysis:

- **Minimum**: 4GB RAM, 2 CPU cores, 10GB storage
- **Recommended**: 8GB+ RAM, 4+ CPU cores, GPU with 4GB+ VRAM, 20GB+ storage
- **Production**: 16GB+ RAM, 8+ CPU cores, GPU with 8GB+ VRAM, 100GB+ SSD storage

## Troubleshooting

If you encounter issues with PyTorch or GPU support:

```bash
# Verify PyTorch installation and GPU support
python -c "import torch; print('CUDA available:', torch.cuda.is_available()); print('PyTorch version:', torch.__version__)"

# For CUDA issues, you may need a specific PyTorch version:
pip install torch==1.9.0+cu111 torchvision==0.10.0+cu111 -f https://download.pytorch.org/whl/torch_stable.html
```

For other ML libraries, check their documentation for specific installation requirements.

## Scaling for Production

For production environments:
- Consider using PostgreSQL with proper indexing
- Use a dedicated server or cloud instance with GPU support
- Implement background task processing with Celery
- Set up model caching and lazy loading

## Next Steps

Once your ML environment is set up, you can:
1. Go to the ML Insights page to view analytics
2. Collect posts using the Chrome extension
3. View processed results in the dashboard 