from django.urls import path, include
from rest_framework import routers

# Import from new modular views structure
from .views import (
    auth_views, 
    dashboard_views, 
    post_views, 
    ml_views, 
    api_views,
    management_views
)

# Legacy imports for backward compatibility
from . import views as legacy_views

from django.views.generic import TemplateView

# Set up REST Framework router if needed
# router = routers.DefaultRouter()
# Note: REST framework views need to be created separately if needed

urlpatterns = [
    # Landing page
    path('', legacy_views.landing, name='landing'),
    
    # Authentication views
    path('login/', auth_views.user_login, name='login'),
    path('logout/', auth_views.user_logout, name='logout'),
    path('register/', auth_views.user_register, name='register'),
    
    # Dashboard views
    path('dashboard/', dashboard_views.dashboard, name='dashboard'),
    path('toggle-mode/', dashboard_views.toggle_mode, name='toggle_mode'),
    path('onboarding/', dashboard_views.onboarding, name='onboarding'),
    
    # Post views
    path('post/<int:post_id>/', post_views.post_detail, name='post_detail'),
    path('post/<int:post_id>/action/', post_views.post_action, name='post_action'),
    path('mark-family/<str:username>/<str:platform>/', post_views.mark_family, name='mark_family'),
    path('pure-feed/', post_views.pure_feed, name='pure_feed'),
    
    # ML views
    path('ml-dashboard/', ml_views.ml_dashboard, name='ml_dashboard'),
    path('ml-insights/', ml_views.ml_insights, name='ml_insights'),
    path('process-ml/', ml_views.process_ml, name='process_ml'),
    
    # Management views
    path('user-settings/', management_views.user_settings, name='user_settings'),
    path('api-keys/', management_views.api_keys, name='api_keys'),
    path('generate-api-key/', management_views.generate_api_key, name='generate_api_key'),
    path('delete-api-key/<int:key_id>/', management_views.delete_api_key, name='delete_api_key'),
    path('filter-presets/', management_views.filter_presets, name='filter_presets'),
    path('export-data/', management_views.export_data, name='export_data'),
    
    # API endpoints
    path('api/log-behavior/', api_views.api_log_behavior, name='api_log_behavior'),
    path('api/log-post/', api_views.api_log_post, name='api_log_post'),
    path('api/collect-posts/', api_views.collect_posts, name='collect_posts'),
    path('api/post-stats/', api_views.post_stats, name='post_stats'),
    path('api/feedback/', api_views.feedback, name='feedback'),
    path('api/health-check/', api_views.api_health_check, name='api_health_check'),
    path('api/verify-key/', api_views.verify_api_key, name='verify_api_key'),
    path('api/process-ml/', api_views.api_process_ml, name='api_process_ml'),
    
    # Legacy endpoints for backward compatibility
    path('api/log/', api_views.api_log_behavior, name='api_log_behavior_legacy'),
    path('api/post/', api_views.api_log_post, name='api_log_post_legacy'),
    
    # Facebook OAuth (if these views exist in auth_views)
    # path('auth/facebook/', auth_views.facebook_auth, name='facebook_auth'),
    # path('auth/facebook/callback/', auth_views.facebook_callback, name='facebook_callback'),
    # path('auth/facebook/token/', auth_views.facebook_token_auth, name='facebook_token_auth'),
    
    # Instagram OAuth
    # path('auth/instagram/', auth_views.instagram_auth, name='instagram_auth'),
    
    # LinkedIn OAuth
    # path('auth/linkedin/', auth_views.linkedin_auth, name='linkedin_auth'),
    
    # Threads OAuth
    # path('auth/threads/', auth_views.threads_auth, name='threads_auth'),
    # path('auth/threads/callback/', auth_views.threads_callback, name='threads_callback'),

    # Facebook specific views
    path('auth/facebook/login/', TemplateView.as_view(template_name='auth/facebook_login.html'), name='facebook_login_page'),
]
