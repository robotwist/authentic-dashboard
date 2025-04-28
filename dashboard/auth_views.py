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
def connect_threads(request):
    """
    Initiate Threads OAuth flow
    """
    # Check if Threads is enabled
    if not hasattr(settings, 'THREADS_ENABLED') or not settings.THREADS_ENABLED:
        messages.error(request, 'Threads integration is not currently available.')
        return redirect('dashboard:profile')
        
    redirect_uri = request.build_absolute_uri('/auth/threads/callback/')
    threads_auth_url = f"https://www.facebook.com/{settings.FACEBOOK_API_VERSION}/dialog/oauth"
    
    # Get all available scopes from the Threads config
    from config_project.social_auth_settings import THREADS_CONFIG
    scopes = ','.join(THREADS_CONFIG.get('SCOPE', [
        'threads_basic',
        'threads_content_publish',
        'threads_manage_insights',
        'threads_read_replies',
        'threads_manage_replies'
    ]))
    
    params = {
        'client_id': getattr(settings, 'THREADS_APP_ID', settings.FACEBOOK_APP_ID),
        'redirect_uri': redirect_uri,
        'scope': scopes,
        'response_type': 'code',
        'state': 'threads'  # Used to verify the callback
    }
    
    auth_url = f"{threads_auth_url}?{'&'.join(f'{k}={v}' for k, v in params.items())}"
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

@login_required
def instagram_callback(request):
    """
    Handle Instagram OAuth callback
    """
    code = request.GET.get('code')
    if not code:
        messages.error(request, 'Failed to connect Instagram account.')
        return redirect('dashboard:profile')

    # Exchange code for access token
    redirect_uri = request.build_absolute_uri('/auth/instagram/callback/')
    response = requests.post('https://api.instagram.com/oauth/access_token', data={
        'client_id': settings.INSTAGRAM_APP_ID,
        'client_secret': settings.INSTAGRAM_APP_SECRET,
        'code': code,
        'redirect_uri': redirect_uri,
        'grant_type': 'authorization_code'
    })

    if response.status_code == 200:
        data = response.json()
        access_token = data.get('access_token')
        user_id = data.get('user_id')
        
        if access_token and user_id:
            # Get more details about the user
            try:
                user_response = requests.get('https://graph.instagram.com/me', params={
                    'fields': 'id,username',
                    'access_token': access_token
                })
                user_data = user_response.json()
                username = user_data.get('username', 'Unknown')
                
                # Save or update social media account
                SocialMediaAccount.objects.update_or_create(
                    user=request.user,
                    platform='instagram',
                    account_id=user_id,
                    defaults={
                        'access_token': access_token,
                        'token_expires_at': datetime.now() + timedelta(days=60)  # Instagram tokens last for 60 days
                    }
                )
                
                messages.success(request, f'Instagram account (@{username}) connected successfully!')
            except Exception as e:
                messages.error(request, f'Error retrieving Instagram user details: {str(e)}')
        else:
            messages.error(request, 'Failed to get access token from Instagram.')
    else:
        try:
            error_data = response.json()
            error_message = error_data.get('error_message', 'Unknown error')
            messages.error(request, f'Instagram API error: {error_message}')
        except:
            messages.error(request, f'Failed to connect Instagram account. Status: {response.status_code}')

    return redirect('dashboard:profile')

@login_required
def linkedin_callback(request):
    """
    Handle LinkedIn OAuth callback
    """
    code = request.GET.get('code')
    if not code:
        messages.error(request, 'Failed to connect LinkedIn account.')
        return redirect('dashboard:profile')

    # Exchange code for access token
    redirect_uri = request.build_absolute_uri('/auth/linkedin/callback/')
    response = requests.post('https://www.linkedin.com/oauth/v2/accessToken', data={
        'grant_type': 'authorization_code',
        'code': code,
        'redirect_uri': redirect_uri,
        'client_id': settings.LINKEDIN_CLIENT_ID,
        'client_secret': settings.LINKEDIN_CLIENT_SECRET
    })

    if response.status_code == 200:
        data = response.json()
        access_token = data.get('access_token')
        expires_in = data.get('expires_in', 0)
        
        if access_token:
            # Get LinkedIn profile information
            try:
                headers = {'Authorization': f'Bearer {access_token}'}
                user_response = requests.get(
                    'https://api.linkedin.com/v2/me',
                    headers=headers
                )
                user_data = user_response.json()
                user_id = user_data.get('id')
                
                if user_id:
                    # Save or update social media account
                    SocialMediaAccount.objects.update_or_create(
                        user=request.user,
                        platform='linkedin',
                        account_id=user_id,
                        defaults={
                            'access_token': access_token,
                            'token_expires_at': datetime.now() + timedelta(seconds=expires_in)
                        }
                    )
                    
                    messages.success(request, 'LinkedIn account connected successfully!')
                else:
                    messages.error(request, 'Failed to get user ID from LinkedIn.')
            except Exception as e:
                messages.error(request, f'Error retrieving LinkedIn profile: {str(e)}')
        else:
            messages.error(request, 'Failed to get access token from LinkedIn.')
    else:
        try:
            error_data = response.json()
            error_message = error_data.get('error_description', 'Unknown error')
            messages.error(request, f'LinkedIn API error: {error_message}')
        except:
            messages.error(request, f'Failed to connect LinkedIn account. Status: {response.status_code}')

    return redirect('dashboard:profile')

@login_required
def threads_callback(request):
    """
    Handle Threads OAuth callback
    """
    code = request.GET.get('code')
    state = request.GET.get('state')
    
    # Verify state (security check)
    if not code or state != 'threads':
        messages.error(request, 'Failed to connect Threads account. Invalid callback parameters.')
        return redirect('dashboard:profile')
    
    # Exchange authorization code for access token
    try:
        threads_app_id = getattr(settings, 'THREADS_APP_ID', settings.FACEBOOK_APP_ID)
        threads_app_secret = getattr(settings, 'THREADS_APP_SECRET', settings.FACEBOOK_APP_SECRET)
        
        redirect_uri = request.build_absolute_uri('/auth/threads/callback/')
        token_url = f"https://graph.facebook.com/{settings.FACEBOOK_API_VERSION}/oauth/access_token"
        
        response = requests.post(token_url, data={
            'client_id': threads_app_id,
            'client_secret': threads_app_secret,
            'code': code,
            'redirect_uri': redirect_uri,
            'grant_type': 'authorization_code'
        })
        
        response.raise_for_status()
        token_data = response.json()
        
        # Get access token and expiry
        access_token = token_data.get('access_token')
        expires_in = token_data.get('expires_in', 0)
        
        if not access_token:
            messages.error(request, 'Failed to obtain access token for Threads.')
            return redirect('dashboard:profile')
        
        # Get user data from Threads API
        from dashboard.utils.social_api import ThreadsAPI
        from config_project.social_auth_settings import THREADS_CONFIG
        
        try:
            # Initialize ThreadsAPI client with the access token
            threads_api = ThreadsAPI(access_token)
            
            # Get profile information
            profile_data = threads_api.get_user_profile()
            
            if not profile_data.get('id'):
                raise ValueError("Could not retrieve user ID from Threads API")
            
            # Extract user information
            user_id = profile_data.get('id')
            username = profile_data.get('username', 'Unknown')
            name = profile_data.get('name', username)
            profile_pic = profile_data.get('profile_pic_url', '')
            follower_count = profile_data.get('follower_count', 0)
            following_count = profile_data.get('following_count', 0)
            
            # Create or update account in our database
            account, created = SocialMediaAccount.objects.update_or_create(
                user=request.user,
                platform='threads',
                account_id=user_id,
                defaults={
                    'access_token': access_token,
                    'token_expires_at': datetime.now() + timedelta(seconds=expires_in),
                    'is_active': True,
                    'username': username,
                    'display_name': name,
                    'profile_picture': profile_pic,
                    'metadata': {
                        'follower_count': follower_count,
                        'following_count': following_count,
                        'is_private': profile_data.get('is_private', False),
                        'is_verified': profile_data.get('is_verified', False),
                        'biography': profile_data.get('biography', ''),
                        'scopes_granted': THREADS_CONFIG.get('SCOPE', [])
                    }
                }
            )
            
            action = "updated" if not created else "connected"
            messages.success(request, f'Threads account @{username} successfully {action}!')
            
            # Try fetching a few threads to confirm API is working
            try:
                recent_threads = threads_api.get_user_threads(limit=5)
                thread_count = len(recent_threads.get('data', []))
                if thread_count > 0:
                    messages.info(request, f'Successfully retrieved {thread_count} recent threads.')
            except Exception:
                # Non-critical error, don't need to show to user
                pass
            
        except ValueError as ve:
            messages.error(request, f'Error with Threads user data: {str(ve)}')
        except Exception as e:
            messages.error(request, f'Error retrieving Threads user profile: {str(e)}')
        
    except requests.exceptions.HTTPError as http_err:
        # Handle specific HTTP errors
        try:
            error_data = response.json()
            error_message = error_data.get('error', {}).get('message', 'Unknown API error')
            error_code = error_data.get('error', {}).get('code', 'Unknown error code')
            messages.error(request, f'Threads API error ({error_code}): {error_message}')
        except:
            messages.error(request, f'HTTP error connecting to Threads: {str(http_err)}')
    except requests.exceptions.RequestException as e:
        messages.error(request, f'Failed to connect Threads account: {str(e)}')
    except Exception as e:
        messages.error(request, f'An unexpected error occurred while connecting your Threads account: {str(e)}')
    
    return redirect('dashboard:profile')

@login_required
def disconnect_platform(request, platform):
    """
    Disconnect a social media platform
    
    Args:
        platform: The platform to disconnect (facebook, instagram, linkedin)
    """
    try:
        # Find and delete the social media account
        account = SocialMediaAccount.objects.filter(
            user=request.user,
            platform=platform
        ).first()
        
        if account:
            account.delete()
            messages.success(request, f'Your {platform.title()} account has been disconnected.')
        else:
            messages.info(request, f'No connected {platform.title()} account found.')
            
    except Exception as e:
        messages.error(request, f'Error disconnecting {platform.title()} account: {str(e)}')
        
    return redirect('dashboard:profile') 