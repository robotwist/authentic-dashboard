from django.shortcuts import render
from .models import SocialPost, UserPreference
from django.views.decorators.csrf import csrf_exempt
from django.shortcuts import redirect

@csrf_exempt
def toggle_mode(request):
    if request.method == "POST":
        pref, _ = UserPreference.objects.get_or_create(user=request.user)
        pref.friends_only = 'friends_only' in request.POST
        pref.save()
    return redirect('dashboard')


def dashboard(request):
    if not request.user.is_authenticated:
        return render(request, "brandsensor/login_required.html")

    try:
        preferences = UserPreference.objects.get(user=request.user)
    except UserPreference.DoesNotExist:
        preferences = UserPreference.objects.create(user=request.user)

    posts = SocialPost.objects.all().order_by('-created_at')

    # Apply "Friends Only Mode" filter
    if preferences.friends_only:
        posts = posts.filter(is_friend=True)

    context = {
        "posts": posts,
        "preferences": preferences,
    }
    return render(request, "brandsensor/dashboard.html", context)
