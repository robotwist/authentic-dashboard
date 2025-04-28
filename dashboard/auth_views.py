from django.shortcuts import render, redirect
from django.contrib.auth import login, authenticate
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.conf import settings
from .models import UserProfile, SocialMediaAccount
from .forms import UserRegistrationForm, UserProfileForm
import requests
from datetime import datetime, timedelta

def register(request):
    if request.method == 'POST':
        form = UserRegistrationForm(request.POST)
        if form.is_valid():
            user = form.save()
            login(request, user)
            messages.success(request, 'Registration successful! Welcome to Authentic Dashboard.')
            return redirect('dashboard:profile')
    else:
        form = UserRegistrationForm()
    return render(request, 'dashboard/auth/register.html', {'form': form})

@login_required
def profile(request):
    if request.method == 'POST':
        form = UserProfileForm(request.POST, instance=request.user.userprofile)
        if form.is_valid():
            form.save()
            messages.success(request, 'Profile updated successfully!')
            return redirect('dashboard:profile')
    else:
        form = UserProfileForm(instance=request.user.userprofile)
    
    social_accounts = SocialMediaAccount.objects.filter(user=request.user)
    return render(request, 'dashboard/auth/profile.html', {
        'form': form,
        'social_accounts': social_accounts
    })

@login_required
def connect_facebook(request):
    """
    Initiate Facebook OAuth flow
    """
    redirect_uri = request.build_absolute_uri('/auth/facebook/callback/')
    facebook_auth_url = f"https://www.facebook.com/v12.0/dialog/oauth"
    params = {
        'client_id': settings.FACEBOOK_APP_ID,
        'redirect_uri': redirect_uri,
        'scope': 'public_profile,pages_show_list,pages_read_engagement'
    }
    auth_url = f"{facebook_auth_url}?{'&'.join(f'{k}={v}' for k, v in params.items())}"
    return redirect(auth_url)

@login_required
def connect_instagram(request):
    """
    Initiate Instagram OAuth flow
    """
    redirect_uri = request.build_absolute_uri('/auth/instagram/callback/')
    instagram_auth_url = "https://api.instagram.com/oauth/authorize"
    params = {
        'client_id': settings.INSTAGRAM_APP_ID,
        'redirect_uri': redirect_uri,
        'scope': 'basic',
        'response_type': 'code'
    }
    auth_url = f"{instagram_auth_url}?{'&'.join(f'{k}={v}' for k, v in params.items())}"
    return redirect(auth_url)

@login_required
def connect_linkedin(request):
    """
    Initiate LinkedIn OAuth flow
    """
    redirect_uri = request.build_absolute_uri('/auth/linkedin/callback/')
    linkedin_auth_url = "https://www.linkedin.com/oauth/v2/authorization"
    params = {
        'response_type': 'code',
        'client_id': settings.LINKEDIN_CLIENT_ID,
        'redirect_uri': redirect_uri,
        'scope': 'r_liteprofile r_emailaddress w_member_social'
    }
    auth_url = f"{linkedin_auth_url}?{'&'.join(f'{k}={v}' for k, v in params.items())}"
    return redirect(auth_url)

@login_required
def facebook_callback(request):
    """
    Handle Facebook OAuth callback
    """
    code = request.GET.get('code')
    if not code:
        messages.error(request, 'Failed to connect Facebook account.')
        return redirect('dashboard:profile')

    # Exchange code for access token
    redirect_uri = request.build_absolute_uri('/auth/facebook/callback/')
    response = requests.post('https://graph.facebook.com/v12.0/oauth/access_token', params={
        'client_id': settings.FACEBOOK_APP_ID,
        'client_secret': settings.FACEBOOK_APP_SECRET,
        'code': code,
        'redirect_uri': redirect_uri
    })

    if response.status_code == 200:
        data = response.json()
        access_token = data['access_token']
        
        # Get user's Facebook ID
        user_info = requests.get('https://graph.facebook.com/me', params={
            'access_token': access_token
        }).json()

        # Save or update social media account
        SocialMediaAccount.objects.update_or_create(
            user=request.user,
            platform='facebook',
            account_id=user_info['id'],
            defaults={
                'access_token': access_token,
                'token_expires_at': datetime.now() + timedelta(seconds=data.get('expires_in', 0))
            }
        )
        
        messages.success(request, 'Facebook account connected successfully!')
    else:
        messages.error(request, 'Failed to connect Facebook account.')

    return redirect('dashboard:profile')

# Similar callback handlers for Instagram and LinkedIn would go here 