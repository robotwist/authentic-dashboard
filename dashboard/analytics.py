from django.db.models import Count, F, Q
from django.utils import timezone
from datetime import timedelta
from .models import ErrorReport
import logging

# Set up logger
logger = logging.getLogger(__name__)

def generate_error_trend_report(days=30):
    """Generate a comprehensive error trend report"""
    try:
        end_date = timezone.now()
        start_date = end_date - timedelta(days=days)
        
        # Get all error reports within date range
        reports = ErrorReport.objects.filter(
            timestamp__gte=start_date,
            timestamp__lte=end_date
        )
        
        # Basic stats
        total_errors = reports.count()
        resolved_errors = reports.filter(resolved=True).count()
        unresolved_errors = total_errors - resolved_errors
        
        # Error frequency by type
        errors_by_type = reports.values('error_type').annotate(
            count=Count('id')
        ).order_by('-count')
        
        # Error frequency by version
        errors_by_version = reports.values('extension_version').annotate(
            count=Count('id')
        ).order_by('-count')
        
        # Trend over time (daily counts)
        daily_errors = []
        for i in range(days):
            day = end_date - timedelta(days=i)
            day_start = day.replace(hour=0, minute=0, second=0, microsecond=0)
            day_end = day_start + timedelta(days=1)
            count = reports.filter(timestamp__gte=day_start, timestamp__lt=day_end).count()
            daily_errors.append({
                'date': day_start.date().isoformat(),
                'count': count
            })
        
        # Calculate priority scores for unresolved errors
        priority_errors = []
        unresolved = reports.filter(resolved=False)
        
        # Make sure ErrorReport.ERROR_TYPES exists before using it
        error_types = getattr(ErrorReport, 'ERROR_TYPES', [('api', 'API Error'), ('general', 'General Error')])
        
        for error_type, _ in error_types:
            type_errors = unresolved.filter(error_type=error_type)
            if type_errors.exists():
                # Calculate priority score based on frequency, recency, and impact
                count = type_errors.count()
                latest = type_errors.latest('timestamp')
                recency_factor = 1.0  # Base recency factor
                
                # If error occurred in last 24 hours, increase recency factor
                if latest.timestamp > (timezone.now() - timedelta(hours=24)):
                    recency_factor = 2.0
                    
                # If error has many occurrences in short time, increase priority
                recent_count = type_errors.filter(
                    timestamp__gte=timezone.now() - timedelta(days=3)
                ).count()
                
                # Priority score formula
                priority_score = (count * 0.5) + (recent_count * 0.8) + (recency_factor * 1.0)
                
                priority_errors.append({
                    'error_type': error_type,
                    'count': count,
                    'recent_count': recent_count,
                    'latest_timestamp': latest.timestamp,
                    'priority_score': round(priority_score, 2),
                    'sample_message': latest.error_message[:100],
                    'id': latest.id
                })
        
        # Sort by priority score
        priority_errors.sort(key=lambda x: x['priority_score'], reverse=True)
        
        return {
            'total_errors': total_errors,
            'resolved_errors': resolved_errors,
            'unresolved_errors': unresolved_errors,
            'resolution_rate': round((resolved_errors / total_errors * 100) if total_errors else 0, 2),
            'errors_by_type': list(errors_by_type),
            'errors_by_version': list(errors_by_version),
            'daily_trend': daily_errors,
            'priority_errors': priority_errors
        }
    except Exception as e:
        logger.error(f"Error generating error trend report: {e}")
        # Return minimal report data to prevent template rendering errors
        return {
            'total_errors': 0,
            'resolved_errors': 0,
            'unresolved_errors': 0,
            'resolution_rate': 0,
            'errors_by_type': [],
            'errors_by_version': [],
            'daily_trend': [],
            'priority_errors': []
        } 