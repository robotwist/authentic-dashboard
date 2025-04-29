from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ErrorReportViewSet, error_analytics_view, ping, health_check
from . import views, auth_views

# Set up DRF router
router = DefaultRouter()
router.register(r'errors', ErrorReportViewSet)

app_name = 'dashboard'

urlpatterns = [
    # Authentication URLs
    path('register/', auth_views.register, name='register'),
    path('profile/', auth_views.profile, name='profile'),
    
    # Social Media Connection URLs
    path('connect/facebook/', auth_views.connect_facebook, name='connect_facebook'),
    path('connect/instagram/', auth_views.connect_instagram, name='connect_instagram'),
    path('connect/linkedin/', auth_views.connect_linkedin, name='connect_linkedin'),
    path('connect/threads/', auth_views.connect_threads, name='connect_threads'),
    
    # OAuth Callbacks
    path('auth/facebook/callback/', auth_views.facebook_callback, name='facebook_callback'),
    path('auth/instagram/callback/', auth_views.instagram_callback, name='instagram_callback'),
    path('auth/linkedin/callback/', auth_views.linkedin_callback, name='linkedin_callback'),
    path('auth/threads/callback/', auth_views.threads_callback, name='threads_callback'),
    
    # Platform Disconnection
    path('auth/facebook/disconnect/', auth_views.disconnect_platform, {'platform': 'facebook'}, name='disconnect_facebook'),
    path('auth/instagram/disconnect/', auth_views.disconnect_platform, {'platform': 'instagram'}, name='disconnect_instagram'),
    path('auth/linkedin/disconnect/', auth_views.disconnect_platform, {'platform': 'linkedin'}, name='disconnect_linkedin'),
    path('auth/threads/disconnect/', auth_views.disconnect_platform, {'platform': 'threads'}, name='disconnect_threads'),
    
    # Threads API Integration
    path('threads/', views.threads_dashboard, name='threads_dashboard'),
    path('threads/post/', views.threads_post, name='threads_post'),
    path('threads/thread/<str:thread_id>/', views.threads_thread_detail, name='thread_detail'),
    path('threads/embed/', views.thread_embed, name='thread_embed'),
    
    # Existing Dashboard URLs
    path('', error_analytics_view, name='index'),
    path('analytics/', views.error_analytics_view, name='analytics'),
    path('settings/', views.error_analytics_view, name='settings'),
    
    # Include the router URLs
    path('', include(router.urls)),
    # Analytics dashboard view
    path('analytics/<int:days>/', error_analytics_view, name='error_analytics'),
    path('analytics/', error_analytics_view, name='error_analytics_default'),
    # API health check endpoints
    path('ping/', ping, name='api_ping'),
    path('health/', health_check, name='health_check'),
] 