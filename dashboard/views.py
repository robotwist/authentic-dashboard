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
    """Comprehensive health check endpoint for the extension"""
    return Response({
        "status": "ok",
        "message": "Server is healthy",
        "timestamp": timezone.now().isoformat(),
        "version": "1.0.0",
        "components": {
            "database": "connected",
            "api": "running"
        }
    })

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