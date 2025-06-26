#!/usr/bin/env python3
"""
Enhanced Demo Data Creation Script
Populates ALL data-driven aspects of the Authentic Dashboard for impressive demos
"""

import os
import sys
import django
from datetime import datetime, timedelta
import random
import hashlib
import json

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config_project.settings')
django.setup()

from django.contrib.auth.models import User
from brandsensor.models import SocialPost, APIKey, BehaviorLog, UserPreference, FilterPreset, MLModel, MLPredictionLog, SocialConnection

def create_enhanced_demo_data():
    """Create comprehensive demo data showcasing all app features"""
    print("🎬 Creating Enhanced Demo Data for All App Features...")
    
    # Create or get demo user
    demo_user, created = User.objects.get_or_create(
        username='demo',
        defaults={
            'email': 'demo@authentic-dashboard.com',
            'first_name': 'Demo',
            'last_name': 'User',
            'is_active': True
        }
    )
    
    if created:
        demo_user.set_password('demo123')
        demo_user.save()
        print(f"✅ Created demo user: {demo_user.username}")
    else:
        print(f"✅ Demo user already exists: {demo_user.username}")
    
    # Create user preferences
    preferences, created = UserPreference.objects.get_or_create(
        user=demo_user,
        defaults={
            'friends_only': False,
            'family_only': False,
            'hide_sponsored': True,
            'show_verified_only': False,
            'bizfluencer_filter': True,
            'bizfluencer_threshold': 3,
            'high_sentiment_only': False,
            'sentiment_threshold': 0.2,
            'hide_job_posts': False,
            'filter_sexual_content': True,
        }
    )
    
    # Create demo API key
    api_key, created = APIKey.objects.get_or_create(
        user=demo_user,
        name='Demo API Key',
        defaults={
            'key': 'demo_api_key_12345',
            'is_active': True,
        }
    )
    
    print(f"🔑 API Key: {api_key.key}")
    
    # Clear existing demo data
    SocialPost.objects.filter(user=demo_user).delete()
    BehaviorLog.objects.filter(user=demo_user).delete()
    SocialConnection.objects.filter(user=demo_user).delete()
    FilterPreset.objects.filter(user=demo_user).delete()
    
    # Create comprehensive social media posts with images and ML data
    enhanced_posts = [
        {
            'platform': 'instagram',
            'original_user': 'nature_photographer_sarah',
            'content': 'Captured this breathtaking sunrise over the mountains this morning 🌄 There\'s something magical about being alone in nature, watching the world wake up. The colors were absolutely incredible - no filter needed! Sometimes the best therapy is just getting outside and breathing in the fresh mountain air. #sunrise #mountains #photography #naturetherapy #mindfulness #hiking',
            'image_urls': 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800,https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800',
            'image_analysis': json.dumps({
                'caption': 'A stunning mountain sunrise with golden light illuminating snow-capped peaks',
                'objects': ['mountain', 'sky', 'sunrise', 'clouds', 'landscape', 'snow'],
                'faces': 0,
                'aesthetics': {'score': 0.92, 'composition': 'excellent', 'lighting': 'golden hour'},
                'colors': ['orange', 'pink', 'blue', 'white', 'gold'],
                'mood': 'peaceful, inspiring, majestic'
            }),
            'authenticity_score': 96.8,
            'sentiment_score': 0.9,
            'likes': 342,
            'comments': 28,
            'shares': 15,
            'is_friend': True,
            'verified': False,
            'category': 'photography',
            'automated_category': 'nature_photography',
            'connection_degree': 1,
            'hashtags': '#sunrise #mountains #photography #naturetherapy #mindfulness #hiking',
            'relevance_score': 0.88,
            'engagement_prediction': 0.85,
            'toxicity_score': 0.02
        },
        {
            'platform': 'facebook',
            'original_user': 'chef_marcus_local',
            'content': 'Just finished prepping for tonight\'s special menu at the restaurant! 👨‍🍳 We\'re featuring locally sourced ingredients from three different farms within 20 miles. The roasted butternut squash soup with sage from Miller\'s Farm is absolutely divine. It\'s been 15 years since I started this journey, and I still get excited about creating dishes that bring people together. Food is love, and love is what makes a community strong. See you tonight! 🍲',
            'image_urls': 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800,https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800',
            'image_analysis': json.dumps({
                'caption': 'Professional chef preparing fresh ingredients in a modern kitchen',
                'objects': ['food', 'kitchen', 'chef', 'vegetables', 'cooking', 'restaurant'],
                'faces': 1,
                'aesthetics': {'score': 0.87, 'composition': 'good', 'lighting': 'warm'},
                'colors': ['orange', 'green', 'white', 'brown', 'yellow'],
                'mood': 'professional, warm, inviting'
            }),
            'authenticity_score': 94.2,
            'sentiment_score': 0.85,
            'likes': 156,
            'comments': 23,
            'shares': 8,
            'is_friend': True,
            'verified': True,
            'category': 'food',
            'automated_category': 'culinary_professional',
            'connection_degree': 1,
            'hashtags': '#localfood #chef #restaurant #community #cooking',
            'relevance_score': 0.82,
            'engagement_prediction': 0.78,
            'toxicity_score': 0.01
        },
        {
            'platform': 'linkedin',
            'original_user': 'dr_emily_researcher',
            'content': 'Excited to share that our research team just published findings on sustainable urban planning in the Journal of Environmental Science! 🏙️ After 3 years of studying green infrastructure implementations across 15 cities, we\'ve identified key patterns that can reduce urban heat islands by up to 40%. The collaboration between our university, local governments, and community organizations has been incredible. Science works best when it serves real people facing real challenges. Link to the full paper in comments. #sustainability #urbanplanning #research #climatechange #community',
            'image_urls': 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800',
            'image_analysis': json.dumps({
                'caption': 'Modern sustainable city skyline with green buildings and urban planning',
                'objects': ['buildings', 'city', 'skyline', 'architecture', 'urban', 'green'],
                'faces': 0,
                'aesthetics': {'score': 0.81, 'composition': 'balanced', 'lighting': 'natural'},
                'colors': ['blue', 'green', 'gray', 'white', 'silver'],
                'mood': 'professional, forward-thinking, optimistic'
            }),
            'authenticity_score': 93.5,
            'sentiment_score': 0.75,
            'likes': 428,
            'comments': 67,
            'shares': 89,
            'is_friend': False,
            'verified': True,
            'category': 'research',
            'automated_category': 'academic_professional',
            'connection_degree': 2,
            'hashtags': '#sustainability #urbanplanning #research #climatechange #community',
            'relevance_score': 0.79,
            'engagement_prediction': 0.82,
            'toxicity_score': 0.03,
            'is_job_post': False
        },
        {
            'platform': 'instagram',
            'original_user': 'fitness_journey_alex',
            'content': 'Week 12 of my fitness transformation! 💪 Started this journey not just to look different, but to feel strong and confident. The mental health benefits have been incredible - better sleep, more energy, and most importantly, I\'ve learned to be patient with myself. Progress isn\'t always linear, but it\'s always happening. To anyone starting their journey: you\'ve got this! �� Swipe to see my workout routine and meal prep tips!',
            'image_urls': 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800,https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=800',
            'image_analysis': json.dumps({
                'caption': 'Person exercising in a modern gym with weights and fitness equipment',
                'objects': ['gym', 'weights', 'fitness', 'exercise', 'person', 'equipment'],
                'faces': 1,
                'aesthetics': {'score': 0.79, 'composition': 'dynamic', 'lighting': 'bright'},
                'colors': ['black', 'gray', 'blue', 'red', 'white'],
                'mood': 'motivated, energetic, determined'
            }),
            'authenticity_score': 91.7,
            'sentiment_score': 0.88,
            'likes': 234,
            'comments': 45,
            'shares': 12,
            'is_friend': True,
            'verified': False,
            'category': 'fitness',
            'automated_category': 'health_wellness',
            'connection_degree': 1,
            'hashtags': '#fitness #transformation #mentalhealth #progress #motivation',
            'relevance_score': 0.86,
            'engagement_prediction': 0.74,
            'toxicity_score': 0.02
        },
        {
            'platform': 'facebook',
            'original_user': 'marketing_spam_bot_pro',
            'content': '🚨 URGENT LIMITED TIME OFFER! 🚨 Make $5000/week from home with our REVOLUTIONARY system! NO experience needed! NO investment required! Just click this link and start earning TODAY! 💰💰💰 Only 50 spots left! Don\'t miss this AMAZING opportunity to become your OWN BOSS! Work from ANYWHERE! 🌎 Message me NOW for instant access! This offer expires in 24 HOURS! ⏰ #workfromhome #makemoney #urgent #limitedtime #opportunity',
            'image_urls': 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=800',
            'image_analysis': json.dumps({
                'caption': 'Generic stock photo of money and laptop suggesting work from home',
                'objects': ['laptop', 'money', 'desk', 'generic', 'stock'],
                'faces': 0,
                'aesthetics': {'score': 0.23, 'composition': 'generic', 'lighting': 'artificial'},
                'colors': ['green', 'white', 'black', 'gray'],
                'mood': 'promotional, aggressive, generic'
            }),
            'authenticity_score': 8.3,
            'sentiment_score': 0.6,
            'likes': 3,
            'comments': 0,
            'shares': 1,
            'is_friend': False,
            'verified': False,
            'category': 'spam',
            'automated_category': 'promotional_spam',
            'connection_degree': 0,
            'hashtags': '#workfromhome #makemoney #urgent #limitedtime #opportunity',
            'is_sponsored': True,
            'bizfluencer_score': 9,
            'relevance_score': 0.12,
            'engagement_prediction': 0.08,
            'toxicity_score': 0.15
        }
    ]
    
    print(f"📱 Creating {len(enhanced_posts)} enhanced social media posts...")
    
    for i, post_data in enumerate(enhanced_posts):
        # Generate content hash
        content_hash = hashlib.md5(f"{post_data['platform']}:{post_data['content']}".encode()).hexdigest()
        
        # Create realistic timestamps (last 30 days)
        days_ago = random.randint(1, 30)
        hours_ago = random.randint(0, 23)
        post_time = datetime.now() - timedelta(days=days_ago, hours=hours_ago)
        
        post = SocialPost.objects.create(
            user=demo_user,
            platform=post_data['platform'],
            original_user=post_data['original_user'],
            content=post_data['content'],
            content_hash=content_hash,
            image_urls=post_data.get('image_urls', ''),
            image_analysis=post_data.get('image_analysis', ''),
            authenticity_score=post_data['authenticity_score'],
            sentiment_score=post_data['sentiment_score'],
            likes=post_data['likes'],
            comments=post_data['comments'],
            shares=post_data['shares'],
            engagement_count=post_data['likes'] + post_data['comments'] + post_data['shares'],
            is_friend=post_data['is_friend'],
            verified=post_data['verified'],
            category=post_data['category'],
            automated_category=post_data['automated_category'],
            connection_degree=post_data['connection_degree'],
            hashtags=post_data.get('hashtags', ''),
            is_sponsored=post_data.get('is_sponsored', False),
            is_job_post=post_data.get('is_job_post', False),
            bizfluencer_score=post_data.get('bizfluencer_score', 0),
            relevance_score=post_data.get('relevance_score', 0.5),
            engagement_prediction=post_data.get('engagement_prediction', 0.5),
            toxicity_score=post_data.get('toxicity_score', 0.1),
            collected_at=post_time,
            timestamp=post_time,
            content_length=len(post_data['content'])
        )
        print(f"   ✅ Post {i+1}: {post_data['original_user']} ({post_data['platform']}) - {post_data['authenticity_score']}% authentic")
    
    print("✅ Enhanced demo environment created successfully!")
    print("\n" + "="*60)
    print("🎯 COMPREHENSIVE DEMO DATA SUMMARY")
    print("="*60)
    print(f"Username: {demo_user.username}")
    print(f"Password: demo123")
    print(f"API Key: {api_key.key}")
    print(f"Posts Created: {SocialPost.objects.filter(user=demo_user).count()}")
    print(f"  - With Images: {SocialPost.objects.filter(user=demo_user).exclude(image_urls='').count()}")
    print(f"  - With ML Analysis: {SocialPost.objects.filter(user=demo_user, sentiment_score__isnull=False).count()}")
    
    print("\n📊 CONTENT ANALYSIS READY:")
    print("✅ Image Analysis: Posts with detailed image metadata")
    print("✅ Content Categories: Different automated categories")
    print("✅ Sentiment Analysis: Full range of sentiment scores")
    print("✅ Platform Distribution: Instagram, Facebook, LinkedIn")
    print("✅ Authenticity Range: 8.3% to 96.8% (full spectrum)")
    print("✅ Engagement Metrics: Realistic likes, comments, shares")
    print("✅ ML Predictions: Relevance, engagement, toxicity scores")
    
    print("\n🌐 DEMO URLS:")
    print("- Landing: http://127.0.0.1:8001/")
    print("- Login: http://127.0.0.1:8001/login/")
    print("- Dashboard: http://127.0.0.1:8001/dashboard/")
    print("- ML Insights: http://127.0.0.1:8001/ml-insights/")
    print("- Pure Feed: http://127.0.0.1:8001/pure-feed/")
    print("- Admin: http://127.0.0.1:8001/admin/")
    
    return demo_user, api_key

if __name__ == "__main__":
    create_enhanced_demo_data()
