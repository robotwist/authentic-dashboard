"""
Django settings for config_project project.

Generated by 'django-admin startproject' using Django 5.0.2.

For more information on this file, see
https://docs.djangoproject.com/en/5.0/topics/settings/

For the full list of settings and their values, see
https://docs.djangoproject.com/en/5.0/ref/settings/
"""

from pathlib import Path

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent


# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/5.0/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = 'django-insecure-+lbcqx)%o0hj)5n5!9@o=n-z38-#(qur=u!q7e*5ggt^p^rjn_'

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = True

ALLOWED_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]']


# Application definition

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',  # Django REST Framework
    'brandsensor',
    'brandsensor.templatetags',  # Add templatetags as a separate app for custom filters
    'corsheaders',  # Enable CORS for cross-origin requests
    'ml_processor',  # ML processing module for face analysis and object detection
    'dashboard',  # Dashboard app for Chrome extension error reporting and analytics
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',  # This must come before CommonMiddleware
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

# CORS settings
# Changed from CORS_ALLOW_ALL_ORIGINS to specific allowed origins for security
CORS_ALLOWED_ORIGINS = [
    'chrome-extension://*',  # Allow all Chrome extensions
    'http://localhost:8000',
    'http://127.0.0.1:8000',
    'http://0.0.0.0:8000',
    # Add production domains if needed
]
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_METHODS = [
    'GET',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'OPTIONS',
]
CORS_ALLOW_HEADERS = [
    'accept',
    'accept-encoding',
    'authorization',
    'content-type',
    'dnt',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
    'x-api-key',  # Allow the API key header
]

# Add CORS_URLS_REGEX to limit CORS to specific URL patterns if needed
CORS_URLS_REGEX = r'^/api/.*$'  # Only apply CORS to /api/ endpoints

ROOT_URLCONF = 'config_project.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
            'builtins': [
                'django.templatetags.static',
                'brandsensor.templatetags.custom_filters',
            ],
        },
    },
]

WSGI_APPLICATION = 'config_project.wsgi.application'


# Database
# https://docs.djangoproject.com/en/5.0/ref/settings/#databases

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}


# Password validation
# https://docs.djangoproject.com/en/5.0/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Internationalization
# https://docs.djangoproject.com/en/5.0/topics/i18n/

LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'UTC'

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/5.0/howto/static-files/

STATIC_URL = 'static/'

# Media files (Uploads, Images processed by ML)
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Default primary key field type
# https://docs.djangoproject.com/en/5.0/ref/settings/#default-auto-field

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Redis Cache configuration
try:
    import django_redis
    CACHES = {
        "default": {
            "BACKEND": "django_redis.cache.RedisCache",
            "LOCATION": "redis://127.0.0.1:6379/1",
            "OPTIONS": {
                "CLIENT_CLASS": "django_redis.client.DefaultClient",
                "SOCKET_CONNECT_TIMEOUT": 5,  # seconds
                "SOCKET_TIMEOUT": 5,  # seconds
            }
        }
    }

    # Use Redis for session storage
    SESSION_ENGINE = "django.contrib.sessions.backends.cache"
    SESSION_CACHE_ALIAS = "default"
except ImportError:
    # Fallback to local memory cache if django_redis is not installed
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
            'LOCATION': 'unique-snowflake',
        }
    }

# Cache timeout settings (in seconds)
CACHE_TTL = 60 * 15  # 15 minutes default
CACHE_TTL_SHORT = 60 * 5  # 5 minutes for frequently changing data
CACHE_TTL_LONG = 60 * 60 * 24  # 24 hours for static data

# Authentication settings
LOGIN_URL = '/login/'
LOGIN_REDIRECT_URL = '/dashboard/'
LOGOUT_REDIRECT_URL = '/'

# Django REST Framework settings
REST_FRAMEWORK = {
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.SessionAuthentication',
        # Removing or commenting out the problematic import
        # 'brandsensor.api_views.APIKeyAuthentication',
        'brandsensor.auth.APIKeyAuthentication',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
}

# Celery Configuration
CELERY_BROKER_URL = 'redis://localhost:6379/0'  # Use Redis as the broker
CELERY_RESULT_BACKEND = 'redis://localhost:6379/0'
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 30 * 60  # 30 minutes
CELERY_TASK_SOFT_TIME_LIMIT = 25 * 60  # 25 minutes
