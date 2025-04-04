from django.urls import path
from . import views

urlpatterns = [
    path('dashboard/', views.dashboard, name='dashboard'),
    path('toggle-mode/', views.toggle_mode, name='toggle_mode'),
    path('onboarding/', views.onboarding, name='onboarding'),
    path('api/log/', views.api_log_behavior, name='api_log_behavior'),
    path('api/post/', views.api_log_post, name='api_log_post'),
    path('rate/<int:post_id>/', views.rate_post, name='rate_post'),
]
