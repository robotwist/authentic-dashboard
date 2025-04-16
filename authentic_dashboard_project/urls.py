from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from dashboard.views import ping, health_check

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('brandsensor.urls')),
    path('ml/', include('ml_processor.urls')),  # Include ML processor URLs
    path('dashboard-api/', include('dashboard.urls')),  # Include dashboard API URLs
    path('ping/', ping, name='root_ping'),  # Root level ping endpoint
    path('health-check/', health_check, name='root_health_check'),  # Root level health check
    path('api/health-check/', health_check, name='api_root_health_check'),  # API health check
]

# Serve media files during development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT) 