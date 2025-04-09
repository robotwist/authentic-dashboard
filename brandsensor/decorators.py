from django.http import JsonResponse
from .models import APIKey
from django.utils.timezone import now

def api_key_required(view_func):
    """
    Decorator to validate API key and attach the user to the request.
    """
    def wrapper(request, *args, **kwargs):
        api_key = request.headers.get('X-API-Key') or request.GET.get('api_key')
        if not api_key:
            return JsonResponse({"error": "API key is required"}, status=401)

        try:
            key_obj = APIKey.objects.get(key=api_key, is_active=True)
            key_obj.last_used = now()
            key_obj.save(update_fields=['last_used'])
            request.user = key_obj.user
        except APIKey.DoesNotExist:
            return JsonResponse({"error": "Invalid API key"}, status=401)

        return view_func(request, *args, **kwargs)
    return wrapper