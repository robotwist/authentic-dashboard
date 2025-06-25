from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from django.contrib.auth.models import User
from ..models import SocialPost, APIKey, BehaviorLog
from ..decorators import api_key_required
import json
import logging

logger = logging.getLogger(__name__)

def get_user_from_api_key(request):
    """Authenticate a request using the API key from the header"""
    api_key = request.headers.get('X-API-Key')
    
    if not api_key and request.GET.get('api_key'):
        api_key = request.GET.get('api_key')
    
    if not api_key:
        return None
        
    try:
        key_obj = APIKey.objects.get(key=api_key, is_active=True)
        key_obj.last_used = timezone.now()
        key_obj.save(update_fields=['last_used'])
        return key_obj.user
    except APIKey.DoesNotExist:
        return None

@csrf_exempt
@api_key_required
def api_log_behavior(request):
    """API endpoint for logging user behavior"""
    if request.method != 'POST':
        return JsonResponse({'error': 'Only POST method allowed'}, status=405)
    
    try:
        data = json.loads(request.body)
        user = get_user_from_api_key(request)
        
        if not user:
            return JsonResponse({'error': 'Invalid API key'}, status=401)
        
        # Log the behavior
        BehaviorLog.objects.create(
            user=user,
            behavior_type=data.get('behavior_type', 'unknown'),
            platform=data.get('platform', ''),
            details=data.get('details', {}),
            url=data.get('url', ''),
            timestamp=timezone.now()
        )
        
        return JsonResponse({'status': 'success'})
        
    except Exception as e:
        logger.error(f"Error logging behavior: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
def api_health_check(request):
    """Health check endpoint for API monitoring"""
    return JsonResponse({
        'status': 'healthy',
        'timestamp': timezone.now().isoformat(),
        'version': '1.0'
    })

@csrf_exempt  
def verify_api_key(request):
    """Verify API key validity"""
    user = get_user_from_api_key(request)
    
    if user:
        return JsonResponse({
            'valid': True,
            'user_id': user.id,
            'username': user.username
        })
    else:
        return JsonResponse({'valid': False}, status=401)
