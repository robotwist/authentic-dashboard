from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import json

from .models import SocialPost, UserPreference, Brand, BehaviorLog
from django.contrib.auth.models import User

# ------------------------------
# Dashboard and User Preference Views
# ------------------------------

@login_required
def dashboard(request):
    """
    Renders the dashboard with curated social posts and recent behavior logs.
    Applies filtering based on the user's preferences.
    """
    try:
        preferences = request.user.userpreference
    except UserPreference.DoesNotExist:
        return redirect('onboarding')

    # Get social posts for this user. For demo, we filter by the logged-in user.
    posts = SocialPost.objects.filter(user=request.user).order_by('-created_at')

    # Apply filters from user preferences
    if preferences.friends_only:
        posts = posts.filter(is_friend=True)
    if preferences.family_only:
        posts = posts.filter(is_family=True)
    if preferences.interest_filter:
        posts = posts.filter(category__icontains=preferences.interest_filter)
    if preferences.approved_brands:
        approved = [b.strip().lower() for b in preferences.approved_brands.split(',')]
        posts = posts.filter(user__username__in=approved)

    # Get recent behavior logs (limit to 20 for display)
    logs = BehaviorLog.objects.filter(user=request.user).order_by('-created_at')[:20]

    context = {
        "posts": posts,
        "preferences": preferences,
        "logs": logs,
    }
    return render(request, "brandsensor/dashboard.html", context)


@login_required
def toggle_mode(request):
    """
    Updates user preferences based on the form submission from the dashboard.
    """
    if request.method == "POST":
        preferences, _ = UserPreference.objects.get_or_create(user=request.user)
        preferences.friends_only = 'friends_only' in request.POST
        preferences.family_only = 'family_only' in request.POST
        preferences.interest_filter = request.POST.get('interest_filter', '').strip()
        preferences.approved_brands = request.POST.get('approved_brands', '').strip()
        preferences.save()
    return redirect('dashboard')


@login_required
def onboarding(request):
    """
    Handles first-time setup for new users.
    On POST, saves the user's filter preferences and redirects to the dashboard.
    """
    if request.method == "POST":
        preferences, _ = UserPreference.objects.get_or_create(user=request.user)
        preferences.friends_only = 'friends_only' in request.POST
        preferences.family_only = 'family_only' in request.POST
        preferences.interest_filter = request.POST.get('interest_filter', '').strip()
        preferences.approved_brands = request.POST.get('approved_brands', '').strip()
        preferences.save()
        return redirect('dashboard')
    return render(request, "brandsensor/onboarding.html")


# ------------------------------
# API Endpoints for Chrome Extension
# ------------------------------

@csrf_exempt
def api_log_behavior(request):
    """
    Accepts POST requests with behavior log data from the Chrome extension.
    For now, logs are associated with the first user (temporary for testing).
    """
    if request.method != "POST":
        return JsonResponse({"error": "Only POST allowed"}, status=405)
    try:
        data = json.loads(request.body)
        # Temporary: use the first user until real authentication is implemented
        user = User.objects.first()
        brand_name = data.get("brand", "")
        brand_domain = data.get("domain", "")
        behavior_type = data.get("behavior_type")
        count = data.get("count", 1)

        if not brand_domain or not behavior_type:
            return JsonResponse({"error": "Missing required fields"}, status=400)

        brand, _ = Brand.objects.get_or_create(
            name=brand_name or brand_domain,
            domain=brand_domain
        )

        BehaviorLog.objects.create(
            user=user,
            brand=brand,
            behavior_type=behavior_type,
            count=count
        )

        return JsonResponse({"status": "logged"})
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


@csrf_exempt
def api_log_post(request):
    """
    Accepts POST requests with social post data scraped by the Chrome extension.
    Logs the data to the SocialPost model under the first user (for testing).
    """
    if request.method != "POST":
        return JsonResponse({"error": "Only POST allowed"}, status=405)
    try:
        data = json.loads(request.body)
        user = User.objects.first()  # Temporary: replace with real user authentication

        SocialPost.objects.create(
            user=user,
            content=data.get("content", ""),
            platform=data.get("platform", ""),
            is_friend=data.get("is_friend", False),
            is_family=data.get("is_family", False),
            category=data.get("category", ""),
            # If you have an image_url field in your model, include it here; otherwise, omit it.
            # image_url=data.get("image_url", "")
        )

        return JsonResponse({"status": "post saved"})
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


@login_required
def rate_post(request, post_id):
    """
    Allows a user to rate a SocialPost via an upvote or downvote.
    Assumes the SocialPost model has a 'rating' field.
    """
    if request.method == "POST":
        action = request.POST.get('action')
        try:
            post = SocialPost.objects.get(id=post_id)
            if action == "upvote":
                post.rating += 1
            elif action == "downvote":
                post.rating -= 1
            post.save()
        except SocialPost.DoesNotExist:
            return redirect('dashboard')
    return redirect('dashboard')
