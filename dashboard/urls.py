from django.urls import path, include
from rest_framework import routers
from .views import ErrorReportViewSet, error_analytics_view, ping, health_check

# Set up DRF router
router = routers.DefaultRouter()
router.register(r'error-reports', ErrorReportViewSet, basename='error-report')

urlpatterns = [
    # Include the router URLs
    path('', include(router.urls)),
    # Analytics dashboard view
    path('analytics/<int:days>/', error_analytics_view, name='error_analytics'),
    path('analytics/', error_analytics_view, name='error_analytics_default'),
    # API health check endpoints
    path('ping/', ping, name='api_ping'),
    path('health-check/', health_check, name='api_health_check'),
] 