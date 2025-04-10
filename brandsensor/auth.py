from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from django.utils import timezone
from .models import APIKey

class APIKeyAuthentication(BaseAuthentication):
    """
    Custom authentication class for API key authentication.
    This class is used by the REST Framework to authenticate requests
    using the X-API-Key header or api_key query parameter.
    """
    def authenticate(self, request):
        api_key = request.META.get('HTTP_X_API_KEY') or request.query_params.get('api_key')
        
        if not api_key:
            return None  # No API key provided, let other authentication methods handle it
            
        try:
            key_obj = APIKey.objects.get(key=api_key, is_active=True)
            
            # Update last_used timestamp
            key_obj.last_used = timezone.now()
            key_obj.save(update_fields=['last_used'])
            
            return (key_obj.user, key_obj)  # Return (user, auth) tuple
        except APIKey.DoesNotExist:
            raise AuthenticationFailed('Invalid API key') 