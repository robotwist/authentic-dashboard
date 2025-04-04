from django.urls import path
from . import views

urlpatterns = [
    path('dashboard/', views.dashboard, name='dashboard'),
    path('onboarding/', views.onboarding, name='onboarding'),
    path('toggle-mode/', views.toggle_mode, name='toggle_mode'),
    
    # New detailed post view and actions
    path('post/<int:post_id>/', views.post_detail, name='post_detail'),
    path('post/<int:post_id>/action/', views.post_action, name='post_action'),
    path('mark-family/<str:username>/<str:platform>/', views.mark_family, name='mark_family'),
    
    # API endpoints for Chrome extension
    path('api/log/', views.api_log_behavior, name='api_log_behavior'),
    path('api/post/', views.api_log_post, name='api_log_post'),
    
    # Machine learning endpoints
    path('api/process_ml/', views.process_ml, name='process_ml'),
    
    # New ML Dashboard
    path('ml-dashboard/', views.ml_dashboard, name='ml_dashboard'),
]
