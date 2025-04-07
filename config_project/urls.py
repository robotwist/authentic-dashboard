"""
URL configuration for config_project project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from brandsensor import views as brandsensor_views
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', brandsensor_views.landing, name='landing'),
    path('dashboard/', brandsensor_views.dashboard, name='dashboard'),
    path('ml-dashboard/', brandsensor_views.ml_dashboard, name='ml_dashboard'),
    path('settings/', brandsensor_views.user_settings, name='user_settings'),
    path('toggle-mode/', brandsensor_views.toggle_mode, name='toggle_mode'),
    path('api/collect-posts/', brandsensor_views.collect_posts, name='collect_posts'),
    path('api/post-stats/', brandsensor_views.post_stats, name='post_stats'),
    path('api/feedback/', brandsensor_views.feedback, name='feedback'),
    
    # Post detail and actions
    path('post/<int:post_id>/', brandsensor_views.post_detail, name='post_detail'),
    path('post/<int:post_id>/action/', brandsensor_views.post_action, name='post_action'),
    path('mark-family/<str:username>/<str:platform>/', brandsensor_views.mark_family, name='mark_family'),
    
    # API Log endpoints (compatibility with older extension versions)
    path('api/post/', brandsensor_views.api_log_post, name='api_post'),
    path('api/log/post/', brandsensor_views.api_log_post, name='api_log_post'),
    path('api/log/behavior/', brandsensor_views.api_log_behavior, name='api_log_behavior'),
    
    # ML processing
    path('process-ml/', brandsensor_views.process_ml, name='process_ml'),
    
    # Added direct routes for the Chrome extension
    path('api/health-check/', brandsensor_views.api_health_check, name='api_health_check'),
    path('api/process-ml/', brandsensor_views.api_process_ml, name='process_ml_api'),
    path('api/verify-key/', brandsensor_views.verify_api_key, name='verify_api_key'),
    
    # Filter preset URLs
    path('filter-presets/', brandsensor_views.filter_presets, name='filter_presets'),
    path('apply-preset/<int:preset_id>/', brandsensor_views.apply_preset, name='apply_preset'),
    
    # Authentication URLs
    path('login/', brandsensor_views.user_login, name='login'),
    path('logout/', brandsensor_views.user_logout, name='logout'),
    path('register/', brandsensor_views.user_register, name='register'),
    
    # API key management
    path('api-keys/', brandsensor_views.api_keys, name='api_keys'),
    path('generate-api-key/', brandsensor_views.generate_api_key, name='generate_api_key'),
    path('delete-api-key/<int:key_id>/', brandsensor_views.delete_api_key, name='delete_api_key'),
    
    # Onboarding URL
    path('onboarding/', brandsensor_views.onboarding, name='onboarding'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
