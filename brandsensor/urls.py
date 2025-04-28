from django.urls import path, include
from rest_framework import routers
from . import auth_views, dashboard_views, post_views, ml_views, api_views
from .auth_views import (
    facebook_auth, facebook_callback, facebook_token_auth,
    instagram_auth, linkedin_auth, threads_auth
)
from django.views.generic import TemplateView

# Set up REST Framework router
router = routers.DefaultRouter()
router.register(r'posts', api_views.SocialPostViewSet, basename='socialpost')
router.register(r'preferences', api_views.UserPreferenceViewSet, basename='userpreference')
router.register(r'presets', api_views.FilterPresetViewSet, basename='filterpreset')

urlpatterns = [
    # Auth related views
    path('', auth_views.landing, name='landing'),
    path('login/', auth_views.user_login, name='login'),
    path('logout/', auth_views.user_logout, name='logout'),
    path('register/', auth_views.user_register, name='register'),
    path('user-settings/', auth_views.user_settings, name='user_settings'),
    path('onboarding/', auth_views.onboarding, name='onboarding'),
    path('api-keys/', auth_views.api_keys, name='api_keys'),
    path('generate-api-key/', auth_views.generate_api_key, name='generate_api_key'),
    path('delete-api-key/<int:key_id>/', auth_views.delete_api_key, name='delete_api_key'),
    
    # Dashboard related views
    path('dashboard/', dashboard_views.dashboard, name='dashboard'),
    path('toggle-mode/', dashboard_views.toggle_mode, name='toggle_mode'),
    path('filter-presets/', dashboard_views.filter_presets, name='filter_presets'),
    path('apply-preset/<int:preset_id>/', dashboard_views.apply_preset, name='apply_preset'),
    path('analyze-images/', dashboard_views.analyze_images, name='analyze_images'),
    path('pure-feed/', dashboard_views.pure_feed, name='pure_feed'),
    
    # Post related views
    path('post/<int:post_id>/', post_views.post_detail, name='post_detail'),
    path('post/<int:post_id>/action/', post_views.post_action, name='post_action'),
    path('mark-family/<str:username>/<str:platform>/', post_views.mark_family, name='mark_family'),
    
    # ML related views
    path('ml-dashboard/', ml_views.ml_dashboard, name='ml_dashboard'),
    path('ml-insights/', ml_views.ml_insights, name='ml_insights'),
    path('api/process_ml/', ml_views.process_ml, name='process_ml'),
    path('api/process-ml/', ml_views.process_ml, name='process_ml_dash'),
    
    # API endpoints
    path('api/log/', api_views.log_behavior, name='api_log_behavior'),
    path('api/post/', api_views.log_post, name='api_log_post'),
    path('api/health-check/', api_views.api_health_check, name='api_health_check'),
    path('api/verify-key/', api_views.verify_api_key, name='verify_api_key'),
    path('api/collect-posts/', api_views.collect_posts, name='collect_posts'),
    path('api/post-stats/', api_views.post_stats, name='post_stats'),
    path('api/feedback/', api_views.feedback, name='feedback'),
    
    # Include REST Framework URLs
    path('api/', include(router.urls)),
    path('api-auth/', include('rest_framework.urls', namespace='rest_framework')),

    # Facebook OAuth
    path('auth/facebook/', facebook_auth, name='facebook_auth'),
    path('auth/facebook/callback/', facebook_callback, name='facebook_callback'),
    path('auth/facebook/token/', facebook_token_auth, name='facebook_token_auth'),
    
    # Instagram OAuth
    path('auth/instagram/', instagram_auth, name='instagram_auth'),
    
    # LinkedIn OAuth
    path('auth/linkedin/', linkedin_auth, name='linkedin_auth'),
    
    # Threads OAuth (if available)
    path('auth/threads/', threads_auth, name='threads_auth'),

    # Facebook specific views
    path('auth/facebook/login/', TemplateView.as_view(template_name='auth/facebook_login.html'), name='facebook_login_page'),
]
