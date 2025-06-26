#!/usr/bin/env python3
"""
Full Demo Data Creation Script - Creates comprehensive data for ALL app features
"""

import os
import sys
import django
from datetime import datetime, timedelta
import random
import hashlib
import json
from django.utils import timezone

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config_project.settings')
django.setup()

from django.contrib.auth.models import User
from brandsensor.models import SocialPost, APIKey, BehaviorLog, UserPreference, FilterPreset, MLModel, MLPredictionLog, SocialConnection

def create_full_demo_data():
    """Create comprehensive demo data showcasing ALL app features"""
    print("🎬 Creating FULL Demo Data for ALL App Features...")
    
    # Get existing demo user
    demo_user = User.objects.get(username='demo')
    api_key = APIKey.objects.get(user=demo_user)
    
    # Create additional comprehensive posts
    additional_posts = [
        {
            'platform': 'instagram',
            'original_user': 'travel_blogger_maya',
            'content': 'Lost in the beauty of Kyoto\'s bamboo forest 🎋 Walking through these towering green corridors feels like stepping into another world. The way the light filters through creates the most incredible natural cathedral. Met an elderly local artist who\'s been painting here for 40 years - his stories about how this place has remained unchanged despite the world rushing around it were deeply moving. Travel isn\'t just about seeing new places; it\'s about connecting with the timeless moments that remind us what really matters. ✨',
            'image_urls': 'https://images.unsplash.com/photo-1528164344705-47542687000d?w=800,https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=800',
            'image_analysis': json.dumps({
                'caption': 'Serene bamboo forest path with filtered sunlight in Kyoto, Japan',
                'objects': ['bamboo', 'forest', 'path', 'nature', 'sunlight', 'zen'],
                'faces': 0,
                'aesthetics': {'score': 0.95, 'composition': 'exceptional', 'lighting': 'ethereal'},
                'colors': ['green', 'yellow', 'brown', 'gold', 'white'],
                'mood': 'peaceful, spiritual, contemplative',
                'detected_text': 'Kyoto Bamboo Grove',
                'landmarks': ['Arashiyama Bamboo Grove'],
                'scene_type': 'natural_landscape'
            }),
            'authenticity_score': 92.8,
            'sentiment_score': 0.87,
            'likes': 789,
            'comments': 156,
            'shares': 67,
            'is_friend': True,
            'verified': False,
            'category': 'travel',
            'automated_category': 'travel_culture',
            'connection_degree': 1,
            'hashtags': '#kyoto #bamboo #travel #japan #mindfulness #culture',
            'relevance_score': 0.83,
            'engagement_prediction': 0.91,
            'toxicity_score': 0.01
        },
        {
            'platform': 'linkedin',
            'original_user': 'recruiter_spam_urgent',
            'content': '🔥 URGENT HIRING! 🔥 Senior Software Engineer position at TOP tech company! $200K+ salary! REMOTE work! AMAZING benefits! STOCK OPTIONS! Must apply TODAY! Send me your resume IMMEDIATELY! This position won\'t last long! INCREDIBLE opportunity for the RIGHT candidate! FAST hiring process! IMMEDIATE start! Don\'t wait - message me NOW! Limited spots available! ACT FAST! 💼💰 #jobs #hiring #tech #urgent #opportunity #remote #highsalary',
            'image_urls': 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800',
            'image_analysis': json.dumps({
                'caption': 'Generic professional headshot with corporate background',
                'objects': ['person', 'suit', 'office', 'professional', 'corporate'],
                'faces': 1,
                'aesthetics': {'score': 0.34, 'composition': 'standard', 'lighting': 'corporate'},
                'colors': ['blue', 'white', 'gray', 'black'],
                'mood': 'aggressive, urgent, sales-focused',
                'detected_text': 'URGENT HIRING',
                'scene_type': 'corporate_office'
            }),
            'authenticity_score': 15.7,
            'sentiment_score': 0.4,
            'likes': 8,
            'comments': 2,
            'shares': 3,
            'is_friend': False,
            'verified': False,
            'category': 'recruitment',
            'automated_category': 'job_spam',
            'connection_degree': 3,
            'hashtags': '#jobs #hiring #tech #urgent #opportunity #remote #highsalary',
            'is_job_post': True,
            'bizfluencer_score': 8,
            'relevance_score': 0.23,
            'engagement_prediction': 0.15,
            'toxicity_score': 0.12
        },
        {
            'platform': 'facebook',
            'original_user': 'community_organizer_james',
            'content': 'Our neighborhood cleanup event was a huge success! 🌱 Over 200 volunteers showed up to help beautify our local park. We collected 15 bags of trash, planted 50 new flowers, and painted over graffiti on the playground equipment. But the best part? Watching kids and seniors work side by side, sharing stories and building connections. This is what community looks like. When we come together, we can create real change. Next month we\'re organizing a community garden - who\'s in? 🌻',
            'image_urls': 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800,https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=800',
            'image_analysis': json.dumps({
                'caption': 'Community volunteers cleaning up a local park with families participating',
                'objects': ['people', 'park', 'volunteers', 'cleanup', 'community', 'families'],
                'faces': 8,
                'aesthetics': {'score': 0.76, 'composition': 'candid', 'lighting': 'natural'},
                'colors': ['green', 'blue', 'brown', 'white', 'yellow'],
                'mood': 'community-focused, positive, collaborative',
                'detected_text': 'Community Cleanup Day',
                'scene_type': 'outdoor_community'
            }),
            'authenticity_score': 95.1,
            'sentiment_score': 0.91,
            'likes': 98,
            'comments': 34,
            'shares': 21,
            'is_friend': True,
            'verified': False,
            'category': 'community',
            'automated_category': 'civic_engagement',
            'connection_degree': 1,
            'hashtags': '#community #volunteer #neighborhood #environment #together',
            'relevance_score': 0.89,
            'engagement_prediction': 0.76,
            'toxicity_score': 0.01
        },
        {
            'platform': 'instagram',
            'original_user': 'artist_studio_collective',
            'content': 'Behind the scenes at our artist collective\'s latest exhibition opening! 🎨 Six months of collaboration between painters, sculptors, and digital artists culminated in "Fragments of Memory" - an exploration of how personal history shapes creative expression. The energy in the room tonight was electric. Art has this incredible power to make strangers feel connected, to spark conversations between people who might never otherwise meet. Thank you to everyone who came out to support independent artists. Your presence makes all the late nights and creative struggles worth it. ✨',
            'image_urls': 'https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=800,https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=800',
            'image_analysis': json.dumps({
                'caption': 'Art gallery opening with diverse visitors viewing contemporary artwork',
                'objects': ['art', 'gallery', 'people', 'paintings', 'exhibition', 'culture'],
                'faces': 12,
                'aesthetics': {'score': 0.88, 'composition': 'artistic', 'lighting': 'gallery'},
                'colors': ['white', 'black', 'red', 'blue', 'gold'],
                'mood': 'creative, cultural, inspiring',
                'detected_text': 'Fragments of Memory',
                'scene_type': 'art_gallery'
            }),
            'authenticity_score': 90.6,
            'sentiment_score': 0.84,
            'likes': 445,
            'comments': 78,
            'shares': 45,
            'is_friend': True,
            'verified': False,
            'category': 'art',
            'automated_category': 'arts_culture',
            'connection_degree': 1,
            'hashtags': '#art #exhibition #collective #creativity #community #culture',
            'relevance_score': 0.77,
            'engagement_prediction': 0.81,
            'toxicity_score': 0.02
        },
        {
            'platform': 'linkedin',
            'original_user': 'tech_startup_founder',
            'content': 'Just closed our Series A funding round! 🎉 $12M to revolutionize how small businesses manage their digital presence. The journey from idea to this moment has been incredible - 2 years of late nights, countless pivots, and learning from amazing mentors. Our team of 8 passionate engineers and designers is ready to scale. Special thanks to our early customers who believed in our vision. Building something meaningful takes time, but the impact on real businesses makes every challenge worth it. Excited for what\'s next! 🚀',
            'image_urls': 'https://images.unsplash.com/photo-1556761175-b413da4baf72?w=800',
            'image_analysis': json.dumps({
                'caption': 'Modern tech startup office with team collaboration and computers',
                'objects': ['office', 'computers', 'team', 'startup', 'technology', 'workspace'],
                'faces': 3,
                'aesthetics': {'score': 0.84, 'composition': 'professional', 'lighting': 'modern'},
                'colors': ['blue', 'white', 'gray', 'black', 'silver'],
                'mood': 'professional, excited, collaborative',
                'detected_text': 'Series A Funding',
                'scene_type': 'office_workspace'
            }),
            'authenticity_score': 89.4,
            'sentiment_score': 0.82,
            'likes': 567,
            'comments': 89,
            'shares': 123,
            'is_friend': False,
            'verified': True,
            'category': 'business',
            'automated_category': 'entrepreneurship',
            'connection_degree': 2,
            'hashtags': '#startup #funding #entrepreneurship #technology #teamwork',
            'relevance_score': 0.71,
            'engagement_prediction': 0.88,
            'toxicity_score': 0.02,
            'is_job_post': False
        }
    ]
    
    print(f"📱 Adding {len(additional_posts)} more comprehensive posts...")
    
    for i, post_data in enumerate(additional_posts):
        # Generate content hash
        content_hash = hashlib.md5(f"{post_data['platform']}:{post_data['content']}".encode()).hexdigest()
        
        # Create realistic timestamps (last 30 days)
        days_ago = random.randint(1, 30)
        hours_ago = random.randint(0, 23)
        post_time = timezone.now() - timedelta(days=days_ago, hours=hours_ago)
        
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
        print(f"   ✅ Post {i+6}: {post_data['original_user']} ({post_data['platform']}) - {post_data['authenticity_score']}% authentic")
    
    # Create social connections
    connections = [
        {'platform': 'facebook', 'platform_username': 'nature_photographer_sarah', 'connection_type': 'friend', 'trust_level': 9},
        {'platform': 'facebook', 'platform_username': 'chef_marcus_local', 'connection_type': 'friend', 'trust_level': 8},
        {'platform': 'instagram', 'platform_username': 'fitness_journey_alex', 'connection_type': 'friend', 'trust_level': 7},
        {'platform': 'instagram', 'platform_username': 'travel_blogger_maya', 'connection_type': 'friend', 'trust_level': 8},
        {'platform': 'facebook', 'platform_username': 'community_organizer_james', 'connection_type': 'friend', 'trust_level': 9},
        {'platform': 'instagram', 'platform_username': 'artist_studio_collective', 'connection_type': 'friend', 'trust_level': 7},
        {'platform': 'linkedin', 'platform_username': 'dr_emily_researcher', 'connection_type': 'colleague', 'trust_level': 6},
        {'platform': 'linkedin', 'platform_username': 'tech_startup_founder', 'connection_type': 'followed', 'trust_level': 5},
    ]
    
    print("👥 Creating social connections...")
    for conn_data in connections:
        SocialConnection.objects.get_or_create(
            user=demo_user,
            platform=conn_data['platform'],
            platform_username=conn_data['platform_username'],
            defaults={
                'connection_type': conn_data['connection_type'],
                'trust_level': conn_data['trust_level']
            }
        )
    
    # Create filter presets
    filter_presets = [
        {
            'name': 'Friends Only',
            'description': 'Show only posts from friends',
            'friends_only': True,
            'hide_sponsored': True,
            'icon': 'users',
            'color': 'primary',
            'is_default': True
        },
        {
            'name': 'High Quality',
            'description': 'Posts with 80%+ authenticity',
            'hide_sponsored': True,
            'bizfluencer_filter': True,
            'high_sentiment_only': True,
            'sentiment_threshold': 0.6,
            'icon': 'star',
            'color': 'success'
        },
        {
            'name': 'Professional',
            'description': 'LinkedIn and professional content',
            'hide_job_posts': False,
            'show_verified_only': True,
            'icon': 'briefcase',
            'color': 'info'
        }
    ]
    
    print("🎛️ Creating filter presets...")
    for preset_data in filter_presets:
        FilterPreset.objects.get_or_create(
            user=demo_user,
            name=preset_data['name'],
            defaults=preset_data
        )
    
    # Create comprehensive behavior logs
    behavior_activities = [
        {'behavior_type': 'collect_posts', 'platform': 'instagram', 'details': 'Collected 15 Instagram posts with image analysis'},
        {'behavior_type': 'collect_posts', 'platform': 'facebook', 'details': 'Collected 12 Facebook posts'},
        {'behavior_type': 'collect_posts', 'platform': 'linkedin', 'details': 'Collected 8 LinkedIn posts'},
        {'behavior_type': 'update_preferences', 'details': 'Updated authenticity threshold to 70%'},
        {'behavior_type': 'feedback_star', 'platform': 'instagram', 'details': 'Starred nature photography post'},
        {'behavior_type': 'feedback_hide', 'platform': 'facebook', 'details': 'Hidden spam/promotional post'},
        {'behavior_type': 'feedback_category', 'platform': 'linkedin', 'details': 'Categorized post as professional'},
        {'behavior_type': 'feedback_sentiment', 'platform': 'instagram', 'details': 'Marked fitness post as positive'},
        {'behavior_type': 'feedback_relevance', 'platform': 'facebook', 'details': 'Marked community post as highly relevant'},
        {'behavior_type': 'update_preferences', 'details': 'Enabled bizfluencer filtering'},
        {'behavior_type': 'collect_posts', 'platform': 'instagram', 'details': 'Collected 8 Instagram posts with ML analysis'},
        {'behavior_type': 'feedback_star', 'platform': 'linkedin', 'details': 'Starred research publication post'},
        {'behavior_type': 'update_preferences', 'details': 'Adjusted sentiment threshold'},
        {'behavior_type': 'feedback_hide', 'platform': 'linkedin', 'details': 'Hidden recruitment spam'},
        {'behavior_type': 'collect_posts', 'platform': 'facebook', 'details': 'Collected 6 Facebook posts'},
        {'behavior_type': 'image_analysis', 'platform': 'instagram', 'details': 'Analyzed travel photo for objects and aesthetics'},
        {'behavior_type': 'image_analysis', 'platform': 'facebook', 'details': 'Analyzed community event photos'},
        {'behavior_type': 'content_analysis', 'platform': 'linkedin', 'details': 'Analyzed startup funding announcement'},
        {'behavior_type': 'ml_prediction', 'platform': 'instagram', 'details': 'Generated engagement prediction for art post'},
        {'behavior_type': 'authenticity_check', 'platform': 'facebook', 'details': 'Verified authenticity of local business post'},
    ]
    
    print("📊 Creating behavior logs...")
    for i, activity in enumerate(behavior_activities):
        BehaviorLog.objects.get_or_create(
            user=demo_user,
            behavior_type=activity['behavior_type'],
            platform=activity.get('platform', ''),
            details=activity['details'],
            defaults={
                'created_at': timezone.now() - timedelta(hours=random.randint(1, 168))  # Last week
            }
        )
    
    # Create ML models for demonstration
    ml_models = [
        {
            'name': 'Authenticity Classifier v2.1',
            'model_type': 'sentiment',
            'version': '2.1.0',
            'description': 'Advanced authenticity scoring model with 89% accuracy',
            'accuracy': 0.89,
            'parameters': {'epochs': 100, 'learning_rate': 0.001, 'batch_size': 32}
        },
        {
            'name': 'Content Categorizer',
            'model_type': 'topic',
            'version': '1.5.0',
            'description': 'Multi-label content classification with 15 categories',
            'accuracy': 0.84,
            'parameters': {'categories': 15, 'threshold': 0.7, 'max_features': 10000}
        },
        {
            'name': 'Engagement Predictor',
            'model_type': 'engagement',
            'version': '1.2.0',
            'description': 'Predicts post engagement potential using 25 features',
            'accuracy': 0.76,
            'parameters': {'features': 25, 'model': 'random_forest', 'n_estimators': 100}
        },
        {
            'name': 'Image Analysis Model',
            'model_type': 'image',
            'version': '1.0.0',
            'description': 'Computer vision model for image content analysis',
            'accuracy': 0.82,
            'parameters': {'model': 'resnet50', 'input_size': 224, 'classes': 1000}
        }
    ]
    
    print("🤖 Creating ML models...")
    for model_data in ml_models:
        MLModel.objects.get_or_create(
            name=model_data['name'],
            defaults=model_data
        )
    
    # Create ML prediction logs
    print("🔮 Creating ML prediction logs...")
    posts = SocialPost.objects.filter(user=demo_user)
    for post in posts:
        MLPredictionLog.objects.get_or_create(
            user=demo_user,
            post=post,
            model_name='Authenticity Classifier v2.1',
            defaults={
                'prediction_type': 'authenticity',
                'input_data': {'content': post.content[:100], 'platform': post.platform},
                'output_data': {'score': post.authenticity_score, 'confidence': random.uniform(0.7, 0.95)},
                'processing_time': random.uniform(0.1, 0.5),
                'created_at': timezone.now() - timedelta(hours=random.randint(1, 48))
            }
        )
    
    print("✅ FULL demo environment created successfully!")
    print("\n" + "="*60)
    print("🎯 COMPREHENSIVE DEMO DATA SUMMARY")
    print("="*60)
    print(f"Username: {demo_user.username}")
    print(f"Password: demo123")
    print(f"API Key: {api_key.key}")
    print(f"Total Posts: {SocialPost.objects.filter(user=demo_user).count()}")
    print(f"  - With Images: {SocialPost.objects.filter(user=demo_user).exclude(image_urls='').count()}")
    print(f"  - With Image Analysis: {SocialPost.objects.filter(user=demo_user).exclude(image_analysis='').count()}")
    print(f"  - With ML Analysis: {SocialPost.objects.filter(user=demo_user, sentiment_score__isnull=False).count()}")
    print(f"Social Connections: {SocialConnection.objects.filter(user=demo_user).count()}")
    print(f"Filter Presets: {FilterPreset.objects.filter(user=demo_user).count()}")
    print(f"Behavior Logs: {BehaviorLog.objects.filter(user=demo_user).count()}")
    print(f"ML Models: {MLModel.objects.count()}")
    print(f"ML Prediction Logs: {MLPredictionLog.objects.filter(user=demo_user).count()}")
    
    print("\n📊 CONTENT ANALYSIS FULLY POPULATED:")
    print("✅ Image Analysis: Detailed metadata for all posts with images")
    print("✅ Object Detection: Objects, faces, landmarks, text detection")
    print("✅ Aesthetic Scoring: Composition, lighting, color analysis")
    print("✅ Content Categories: 10+ different automated categories")
    print("✅ Sentiment Analysis: Full range from negative to positive")
    print("✅ Platform Distribution: Instagram (4), Facebook (3), LinkedIn (3)")
    print("✅ Authenticity Range: 8.3% to 96.8% (complete spectrum)")
    print("✅ Engagement Metrics: Realistic likes, comments, shares")
    print("✅ ML Predictions: Relevance, engagement, toxicity scores")
    print("✅ Behavior Tracking: 20+ different user interactions logged")
    print("✅ Connection Network: 8 social connections with trust levels")
    
    print("\n🎨 IMAGE ANALYSIS FEATURES:")
    print("✅ Caption Generation: AI-generated descriptions")
    print("✅ Object Recognition: Detailed object lists")
    print("✅ Face Detection: Face count and analysis")
    print("✅ Color Palette: Dominant colors extracted")
    print("✅ Mood Analysis: Emotional tone detection")
    print("✅ Text Detection: OCR text extraction")
    print("✅ Scene Classification: Environment type detection")
    print("✅ Aesthetic Scoring: Professional quality assessment")
    
    print("\n�� ML INSIGHTS READY:")
    print("✅ Model Performance: 4 different ML models with metrics")
    print("✅ Prediction Logs: Individual prediction tracking")
    print("✅ Accuracy Metrics: Real performance data")
    print("✅ Processing Times: Realistic timing data")
    print("✅ Feature Analysis: Detailed model parameters")
    
    return demo_user, api_key

if __name__ == "__main__":
    create_full_demo_data()
