#!/usr/bin/env python3
"""
Demo Preparation Script
Prepares a clean, professional demo environment with sample data
"""

import os
import sys
import django
from datetime import datetime, timedelta
import random

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config_project.settings')
django.setup()

from django.contrib.auth.models import User
from brandsensor.models import SocialPost, APIKey, BehaviorLog, UserPreference

def create_demo_data():
    """Create professional demo data"""
    print("🎬 Preparing Demo Environment...")
    
    # Create demo users
    print("👥 Creating demo users...")
    
    demo_user, created = User.objects.get_or_create(
        username='demo_user',
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
    
    # Create user preferences
    preferences, created = UserPreference.objects.get_or_create(
        user=demo_user,
        defaults={
            'email_notifications': True,
            'browser_notifications': False,
        }
    )
    
    # Create demo API key
    print("🔑 Creating demo API key...")
    api_key, created = APIKey.objects.get_or_create(
        user=demo_user,
        name='Demo API Key',
        defaults={
            'key': 'demo_api_key_12345',
            'is_active': True,
            'created_at': datetime.now(),
            'last_used': datetime.now()
        }
    )
    
    # Create sample social media posts
    print("📱 Creating sample social media posts...")
    
    sample_posts = [
        {
            'platform': 'facebook',
            'original_user': 'john_doe',
            'content': 'Just had an amazing coffee at the local cafe! The barista was so friendly and the atmosphere was perfect for getting work done. Sometimes the simple moments make the best days. ☕️ #LocalBusiness #CoffeeLovers',
            'authenticity_score': 92,
            'sentiment_score': 0.8,
            'likes': 23,
            'comments': 4,
            'shares': 2,
            'is_friend': True,
            'connection_degree': 1
        },
        {
            'platform': 'instagram',
            'original_user': 'sarah_travels',
            'content': 'Sunset from my hotel balcony in Barcelona 🌅 This trip has been incredible so far. The architecture here is breathtaking and the food... don\'t even get me started! Already planning my next visit. #Barcelona #Travel #Sunset',
            'authenticity_score': 89,
            'sentiment_score': 0.9,
            'likes': 156,
            'comments': 18,
            'shares': 12,
            'is_friend': False,
            'connection_degree': 2
        },
        {
            'platform': 'linkedin',
            'original_user': 'mike_techsolutions',
            'content': 'Excited to announce that our team just completed a major infrastructure upgrade that will improve our service reliability by 40%. Huge thanks to everyone who worked tirelessly on this project. Innovation happens when great people collaborate! #TechNews #Infrastructure #Teamwork',
            'authenticity_score': 87,
            'sentiment_score': 0.7,
            'likes': 89,
            'comments': 12,
            'shares': 24,
            'is_friend': False,
            'connection_degree': 3,
            'is_job_post': False,
            'category': 'professional'
        },
        {
            'platform': 'facebook',
            'original_user': 'marketing_guru_pro',
            'content': '🚀 AMAZING opportunity to make $5000/month working from home! No experience needed! Click the link in my bio to get started TODAY! Limited time offer - only 100 spots available! Don\'t miss out on this life-changing opportunity! 💰💰💰 #WorkFromHome #EasyMoney #LifeChanger',
            'authenticity_score': 12,
            'sentiment_score': 0.6,
            'likes': 3,
            'comments': 0,
            'shares': 1,
            'is_friend': False,
            'connection_degree': 0,
            'is_sponsored': True,
            'category': 'spam'
        },
        {
            'platform': 'instagram',
            'original_user': 'fitness_enthusiast_23',
            'content': 'Week 3 of my new workout routine and I\'m already seeing results! Started with just 15-minute walks and now I\'m doing 30-minute strength sessions. The key is consistency, not perfection. Small steps lead to big changes! 💪 #FitnessJourney #HealthyLifestyle #SmallSteps',
            'authenticity_score': 94,
            'sentiment_score': 0.8,
            'likes': 67,
            'comments': 9,
            'shares': 3,
            'is_friend': True,
            'connection_degree': 1
        },
        {
            'platform': 'linkedin',
            'original_user': 'data_scientist_jane',
            'content': 'Fascinating insights from the latest machine learning research paper on natural language processing. The implications for automated content analysis are significant. The field is evolving rapidly and it\'s exciting to be part of this transformation. What are your thoughts on the ethical considerations? #DataScience #MachineLearning #Ethics',
            'authenticity_score': 91,
            'sentiment_score': 0.6,
            'likes': 234,
            'comments': 45,
            'shares': 67,
            'is_friend': False,
            'connection_degree': 2,
            'category': 'professional'
        }
    ]
    
    # Clear existing demo posts
    SocialPost.objects.filter(user=demo_user).delete()
    
    # Create new sample posts
    for post_data in sample_posts:
        post = SocialPost.objects.create(
            user=demo_user,
            platform=post_data['platform'],
            original_user=post_data['original_user'],
            content=post_data['content'],
            authenticity_score=post_data['authenticity_score'],
            sentiment_score=post_data['sentiment_score'],
            likes=post_data['likes'],
            comments=post_data['comments'],
            shares=post_data['shares'],
            is_friend=post_data['is_friend'],
            connection_degree=post_data['connection_degree'],
            is_sponsored=post_data.get('is_sponsored', False),
            is_job_post=post_data.get('is_job_post', False),
            category=post_data.get('category', 'personal'),
            collected_at=datetime.now() - timedelta(hours=random.randint(1, 72)),
            created_at=datetime.now() - timedelta(hours=random.randint(1, 72))
        )
    
    # Create some behavior logs
    print("📊 Creating demo behavior logs...")
    
    behavior_types = ['collect_posts', 'view_dashboard', 'filter_posts', 'rate_post']
    
    for i in range(10):
        BehaviorLog.objects.create(
            user=demo_user,
            behavior_type=random.choice(behavior_types),
            platform=random.choice(['facebook', 'instagram', 'linkedin']),
            details={'demo': True, 'session': f'demo_session_{i}'},
            url=f'https://demo.example.com/page_{i}',
            timestamp=datetime.now() - timedelta(hours=random.randint(1, 48))
        )
    
    print("✅ Demo data created successfully!")
    
    # Print summary
    print("\n📋 Demo Environment Summary:")
    print(f"👤 Demo User: {demo_user.username} (password: demo123)")
    print(f"🔑 API Key: {api_key.key}")
    print(f"📱 Sample Posts: {SocialPost.objects.filter(user=demo_user).count()}")
    print(f"📊 Behavior Logs: {BehaviorLog.objects.filter(user=demo_user).count()}")
    
    return demo_user, api_key

def create_demo_instructions():
    """Create demo instructions file"""
    print("📝 Creating demo instructions...")
    
    instructions = '''# Demo Environment Instructions

## Demo Credentials
- **Username**: demo_user
- **Password**: demo123
- **API Key**: demo_api_key_12345

## Demo Flow

### 1. Django Admin Interface
- Navigate to: http://localhost:8001/admin/
- Login with demo credentials
- Showcase: User management, data models, API keys

### 2. Main Dashboard
- Navigate to: http://localhost:8001/dashboard/
- Show: Post filtering, authenticity scores, analytics

### 3. API Endpoints
- Health check: http://localhost:8001/api/health-check/
- Post stats: http://localhost:8001/api/post-stats/
- Behavior logs: http://localhost:8001/api/log/

### 4. Stealth Collection System
- Run: `python test_stealth_system.py`
- Show: Proxy management, anti-detection features

### 5. Technical Architecture
- Code walkthrough: modular views structure
- Database schema: sophisticated relationships
- ML processing: authenticity scoring algorithms

## Sample Data Overview

### Posts by Platform:
- Facebook: 2 posts (1 authentic, 1 spam)
- Instagram: 2 posts (both authentic)
- LinkedIn: 2 posts (both professional)

### Authenticity Score Distribution:
- High (90-100): 3 posts - Genuine, authentic content
- Medium (70-89): 2 posts - Good content with some promotional elements  
- Low (0-19): 1 post - Clear spam/manipulation

### Engagement Patterns:
- Authentic posts: Higher engagement, organic patterns
- Spam posts: Low engagement, suspicious patterns

## Key Demo Points

1. **Technical Sophistication**: Advanced Django architecture
2. **Stealth Capabilities**: Proxy management and anti-detection
3. **ML Intelligence**: Automated authenticity scoring
4. **Scalable Design**: Production-ready infrastructure
5. **Professional UI**: Clean, intuitive dashboard

## Legal Disclaimer
This demo showcases technical capabilities for legitimate business purposes including security research, academic use, and compliant business applications.
'''
    
    with open('DEMO_INSTRUCTIONS.md', 'w') as f:
        f.write(instructions)
    
    print("✅ Demo instructions created: DEMO_INSTRUCTIONS.md")

def clean_demo_environment():
    """Clean up any existing demo data"""
    print("🧹 Cleaning demo environment...")
    
    # Remove demo user and related data
    try:
        demo_user = User.objects.get(username='demo_user')
        SocialPost.objects.filter(user=demo_user).delete()
        BehaviorLog.objects.filter(user=demo_user).delete()
        APIKey.objects.filter(user=demo_user).delete()
        UserPreference.objects.filter(user=demo_user).delete()
        demo_user.delete()
        print("✅ Existing demo data cleaned")
    except User.DoesNotExist:
        print("ℹ️ No existing demo data found")

def main():
    """Main demo preparation function"""
    print("🎬 Authentic Dashboard - Demo Preparation")
    print("=" * 50)
    
    # Option to clean first
    clean_choice = input("Clean existing demo data? (y/N): ").strip().lower()
    if clean_choice == 'y':
        clean_demo_environment()
    
    # Create demo data
    demo_user, api_key = create_demo_data()
    
    # Create instructions
    create_demo_instructions()
    
    print("\n" + "=" * 50)
    print("🎉 Demo Environment Ready!")
    print("\n📝 Next Steps:")
    print("1. Start Django server: python manage.py runserver 8001")
    print("2. Review DEMO_INSTRUCTIONS.md for demo flow")
    print("3. Practice demo sequence 2-3 times")
    print("4. Set up screen recording software")
    print("5. Record professional demonstration")
    
    print(f"\n🚀 Ready to showcase your ${5000}-${100000} technical platform!")

if __name__ == "__main__":
    main() 