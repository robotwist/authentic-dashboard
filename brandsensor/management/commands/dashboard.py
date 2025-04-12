from django.core.management.base import BaseCommand, CommandError
from brandsensor.models import SocialPost, BehaviorLog, UserPreference, APIKey, MLModel
from django.contrib.auth.models import User
from django.utils import timezone
from django.db import models
from datetime import timedelta
import os

class Command(BaseCommand):
    help = 'Shows a dashboard of system status and collection metrics'

    def add_arguments(self, parser):
        parser.add_argument('--days', type=int, default=7, help='Days to include in stats (default: 7)')
        parser.add_argument('--user', type=str, help='Username to filter stats by')

    def handle(self, *args, **options):
        days = options['days']
        username = options.get('user')
        
        # Set up terminal colors
        HEADER = '\033[95m'
        BLUE = '\033[94m'
        GREEN = '\033[92m'
        YELLOW = '\033[93m'
        RED = '\033[91m'
        ENDC = '\033[0m'
        BOLD = '\033[1m'
        
        # Clear screen
        os.system('clear' if os.name != 'nt' else 'cls')
        
        # Print header
        self.stdout.write(f"\n{HEADER}{BOLD}{'=' * 80}{ENDC}")
        self.stdout.write(f"{HEADER}{BOLD}{'BRANDSENSOR DASHBOARD':^80}{ENDC}")
        self.stdout.write(f"{HEADER}{BOLD}{'=' * 80}{ENDC}\n")
        
        # Date range
        date_from = timezone.now() - timedelta(days=days)
        date_to = timezone.now()
        date_str = f"From {date_from.strftime('%Y-%m-%d')} to {date_to.strftime('%Y-%m-%d')}"
        self.stdout.write(f"{BLUE}Date Range: {date_str}{ENDC}\n")
        
        # User filter
        target_user = None
        if username:
            try:
                target_user = User.objects.get(username=username)
                self.stdout.write(f"{BLUE}Filtered by User: {target_user.username}{ENDC}\n")
            except User.DoesNotExist:
                self.stdout.write(f"{RED}User '{username}' does not exist. Showing all users.{ENDC}\n")
                
        # System Status
        self.stdout.write(f"\n{BOLD}System Status{ENDC}")
        self.stdout.write(f"{'-' * 50}")
        
        user_count = User.objects.count()
        active_keys = APIKey.objects.filter(is_active=True).count()
        total_posts = SocialPost.objects.count()
        recent_posts = SocialPost.objects.filter(collected_at__gte=date_from).count()
        ml_models = MLModel.objects.filter(is_active=True).count()
        
        self.stdout.write(f"Users: {user_count}")
        self.stdout.write(f"Active API Keys: {active_keys}")
        self.stdout.write(f"Total Posts: {total_posts}")
        self.stdout.write(f"Posts in selected period: {recent_posts}")
        self.stdout.write(f"Active ML Models: {ml_models}")
        
        # Collection Stats
        self.stdout.write(f"\n{BOLD}Collection Statistics{ENDC}")
        self.stdout.write(f"{'-' * 50}")
        
        # Posts by platform
        platform_query = SocialPost.objects.values('platform').annotate(
            count=models.Count('id')
        ).order_by('-count')
        
        if target_user:
            platform_query = platform_query.filter(user=target_user)
        
        self.stdout.write(f"{BOLD}Posts by Platform:{ENDC}")
        
        for platform in platform_query:
            platform_name = platform['platform'].capitalize()
            count = platform['count']
            percent = (count / total_posts) * 100 if total_posts > 0 else 0
            self.stdout.write(f"  {platform_name}: {count} ({percent:.1f}%)")
            
        # Recent collection activity
        self.stdout.write(f"\n{BOLD}Recent Collection Activity:{ENDC}")
        
        collection_logs = BehaviorLog.objects.filter(
            behavior_type='collect_posts',
            created_at__gte=date_from
        ).order_by('-created_at')[:10]
        
        if target_user:
            collection_logs = collection_logs.filter(user=target_user)
        
        if collection_logs:
            for log in collection_logs:
                self.stdout.write(
                    f"  {log.created_at.strftime('%Y-%m-%d %H:%M')} - "
                    f"{log.user.username}: {log.details or f'Collected {log.count} posts'}"
                )
        else:
            self.stdout.write(f"  {YELLOW}No collection activity in this period{ENDC}")
            
        # ML Processing Stats
        self.stdout.write(f"\n{BOLD}ML Processing{ENDC}")
        self.stdout.write(f"{'-' * 50}")
        
        processed_posts = SocialPost.objects.filter(
            sentiment_score__isnull=False
        ).count()
        
        if target_user:
            processed_posts = SocialPost.objects.filter(
                user=target_user,
                sentiment_score__isnull=False
            ).count()
        
        processing_percent = (processed_posts / total_posts) * 100 if total_posts > 0 else 0
        self.stdout.write(f"Processed Posts: {processed_posts} of {total_posts} ({processing_percent:.1f}%)")
        
        # User activity
        self.stdout.write(f"\n{BOLD}Top Users by Activity{ENDC}")
        self.stdout.write(f"{'-' * 50}")
        
        user_activity = BehaviorLog.objects.filter(
            created_at__gte=date_from
        ).values('user__username').annotate(
            count=models.Count('id')
        ).order_by('-count')[:5]
        
        if user_activity:
            for activity in user_activity:
                self.stdout.write(f"  {activity['user__username']}: {activity['count']} actions")
        else:
            self.stdout.write(f"  {YELLOW}No user activity in this period{ENDC}")
            
        # API Health
        self.stdout.write(f"\n{BOLD}API Key Health{ENDC}")
        self.stdout.write(f"{'-' * 50}")
        
        # List recently used API keys
        recent_keys = APIKey.objects.filter(
            last_used__isnull=False
        ).order_by('-last_used')[:5]
        
        if target_user:
            recent_keys = recent_keys.filter(user=target_user)
        
        if recent_keys:
            self.stdout.write(f"{BOLD}Recently Used API Keys:{ENDC}")
            for key in recent_keys:
                days_ago = (timezone.now() - key.last_used).days if key.last_used else "Never"
                self.stdout.write(
                    f"  {key.name} ({key.user.username}): Last used "
                    f"{days_ago} days ago" if isinstance(days_ago, int) else days_ago
                )
        else:
            self.stdout.write(f"  {YELLOW}No API key activity found{ENDC}")
            
        # Inactive keys
        inactive_keys = APIKey.objects.filter(
            is_active=True, 
            last_used__lt=date_from
        ).count()
        
        if inactive_keys > 0:
            self.stdout.write(f"  {YELLOW}Warning: {inactive_keys} active API keys not used in the last {days} days{ENDC}")
            
        # Footer
        self.stdout.write(f"\n{HEADER}{BOLD}{'=' * 80}{ENDC}")
        self.stdout.write(f"{GREEN}Run 'python manage.py dashboard --days=30' to see data for a different period{ENDC}")
        self.stdout.write(f"{GREEN}Run 'python manage.py dashboard --user=username' to filter by user{ENDC}")
        self.stdout.write(f"{HEADER}{BOLD}{'=' * 80}{ENDC}\n") 