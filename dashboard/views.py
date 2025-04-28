from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny
from django.shortcuts import render
from .models import ErrorReport
from .serializers import ErrorReportSerializer
from django.db.models import Count
from django.utils import timezone
from datetime import timedelta
import json
import logging
from .analytics import generate_error_trend_report
from django.http import JsonResponse
from django.db import connection
from django.core.cache import cache
from redis.exceptions import RedisError
import psutil
import os

# Set up logger
logger = logging.getLogger(__name__)

@api_view(['GET'])
@permission_classes([AllowAny])
def ping(request):
    """Simple endpoint for API health checks"""
    return Response({"status": "ok", "message": "API is running"})

@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    """
    Health check endpoint that monitors:
    - Database connection
    - Redis connection
    - System resources
    - Application status
    """
    health_status = {
        'status': 'healthy',
        'database': {'status': 'healthy'},
        'cache': {'status': 'healthy'},
        'system': {
            'cpu_usage': psutil.cpu_percent(),
            'memory_usage': psutil.virtual_memory().percent,
            'disk_usage': psutil.disk_usage('/').percent
        }
    }

    # Check database
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
    except Exception as e:
        health_status['database'] = {
            'status': 'unhealthy',
            'error': str(e)
        }
        health_status['status'] = 'degraded'

    # Check Redis
    try:
        cache.set('health_check', 'ok', timeout=10)
        cache.get('health_check')
    except RedisError as e:
        health_status['cache'] = {
            'status': 'unhealthy',
            'error': str(e)
        }
        health_status['status'] = 'degraded'

    # Add version info
    health_status['version'] = {
        'commit': os.getenv('GIT_COMMIT', 'unknown'),
        'environment': os.getenv('DJANGO_ENV', 'development')
    }

    status_code = 200 if health_status['status'] == 'healthy' else 503
    return JsonResponse(health_status, status=status_code)

class ErrorReportViewSet(viewsets.ModelViewSet):
    """ViewSet for handling extension error reports"""
    queryset = ErrorReport.objects.all().order_by('-timestamp')
    serializer_class = ErrorReportSerializer
    
    def create(self, request, *args, **kwargs):
        """Handle error report submissions from extension"""
        # Ensure metadata is handled properly
        if 'error_metadata' in request.data and isinstance(request.data['error_metadata'], str):
            try:
                request.data['error_metadata'] = json.loads(request.data['error_metadata'])
            except json.JSONDecodeError:
                return Response(
                    {"error": "Invalid metadata format. Must be valid JSON."},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        
        headers = self.get_success_headers(serializer.data)
        return Response(
            serializer.data, 
            status=status.HTTP_201_CREATED, 
            headers=headers
        )
    
    @action(detail=False, methods=['get'])
    def statistics(self, request):
        """Return error statistics for dashboard displays"""
        days = int(request.query_params.get('days', 7))
        try:
            stats = ErrorReport.get_error_stats(days)
            return Response(stats)
        except Exception as e:
            logger.error(f"Error getting error statistics: {e}")
            return Response(
                {"error": "Could not retrieve statistics", "detail": str(e)}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        """Mark an error report as resolved"""
        error_report = self.get_object()
        error_report.resolved = True
        
        if 'resolution_notes' in request.data:
            error_report.resolution_notes = request.data['resolution_notes']
            
        error_report.save()
        serializer = self.get_serializer(error_report)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def analytics(self, request):
        """Return error analytics dashboard data"""
        days = int(request.query_params.get('days', 30))
        try:
            report = generate_error_trend_report(days)
            return Response(report)
        except Exception as e:
            logger.error(f"Error in dashboard analytics: {e}")
            return Response(
                {"error": "Could not generate analytics report", "detail": str(e)}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


def error_analytics_view(request, days=30):
    """Render HTML analytics dashboard"""
    try:
        report = generate_error_trend_report(days)
        return render(request, 'dashboard/analytics.html', {
            'report': report,
            'days': days
        })
    except Exception as e:
        logger.error(f"Error rendering analytics dashboard: {e}")
        return render(request, 'dashboard/error.html', {
            'error': str(e),
            'title': 'Analytics Error',
            'days': days
        }) 