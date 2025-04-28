import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# Database Configuration
if os.getenv('DB_NAME') and os.getenv('DB_USER'):
    # Use PostgreSQL if database environment variables are set
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.getenv('DB_NAME'),
            'USER': 'robwistrand',
            'PASSWORD': 'postgres',
            'HOST': 'localhost',
            'PORT': '5432',
        }
    }
else:
    # Fall back to SQLite if no database environment variables
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    } 