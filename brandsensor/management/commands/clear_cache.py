"""
Management command to handle Redis cache operations
"""
from django.core.management.base import BaseCommand, CommandError
from django.core.cache import cache
from django.contrib.auth.models import User
import hashlib

class Command(BaseCommand):
    help = 'Manage the Redis cache for the system'
    
    def add_arguments(self, parser):
        parser.add_argument(
            '--all',
            action='store_true',
            dest='all',
            default=False,
            help='Clear all caches',
        )
        
        parser.add_argument(
            '--user',
            action='store',
            dest='user_id',
            default=None,
            help='Clear cache for a specific user (by user ID)',
        )
        
        parser.add_argument(
            '--view',
            action='store',
            dest='view_name',
            default=None,
            help='Clear cache for a specific view (dashboard, ml_dashboard, post_stats)',
        )
        
        parser.add_argument(
            '--stats',
            action='store_true',
            dest='stats',
            default=False,
            help='Show cache statistics',
        )
    
    def handle(self, *args, **options):
        if options['stats']:
            self.show_stats()
            return
            
        if options['all']:
            self.stdout.write(self.style.WARNING('Clearing all cache entries...'))
            cache.clear()
            self.stdout.write(self.style.SUCCESS('All cache entries cleared successfully'))
            return
            
        if options['user_id']:
            try:
                user_id = int(options['user_id'])
                user = User.objects.get(id=user_id)
                self.clear_user_cache(user)
                return
            except User.DoesNotExist:
                raise CommandError(f'User with ID {user_id} does not exist')
            except ValueError:
                raise CommandError(f'Invalid user ID: {options["user_id"]}')
        
        if options['view_name']:
            view_name = options['view_name']
            if view_name not in ['dashboard', 'ml_dashboard', 'post_stats']:
                raise CommandError(f'Invalid view name: {view_name}')
            
            self.clear_view_cache(view_name)
            return
            
        # If no options provided, show help
        self.stdout.write(self.style.WARNING('No options provided. Use --help for usage information.'))
    
    def clear_user_cache(self, user):
        """Clear all cache entries for a specific user"""
        self.stdout.write(self.style.WARNING(f'Clearing cache for user: {user.username} (ID: {user.id})'))
        
        # Clear dashboard cache
        dashboard_pattern = f"cached_{hashlib.md5(f'dashboard_{user.id}'.encode()).hexdigest()}"
        dashboard_keys = cache.keys(f"{dashboard_pattern}*")
        
        # Clear ML dashboard cache
        ml_pattern = f"cached_{hashlib.md5(f'ml_dashboard_{user.id}'.encode()).hexdigest()}"
        ml_keys = cache.keys(f"{ml_pattern}*")
        
        # Clear post stats cache
        stats_pattern = f"cached_{hashlib.md5(f'post_stats_{user.id}'.encode()).hexdigest()}"
        stats_keys = cache.keys(f"{stats_pattern}*")
        
        # Combine all keys and delete
        all_keys = dashboard_keys + ml_keys + stats_keys
        if all_keys:
            cache.delete_many(all_keys)
            self.stdout.write(self.style.SUCCESS(f'Cleared {len(all_keys)} cache entries for user {user.username}'))
        else:
            self.stdout.write(self.style.SUCCESS(f'No cache entries found for user {user.username}'))
    
    def clear_view_cache(self, view_name):
        """Clear all cache entries for a specific view"""
        self.stdout.write(self.style.WARNING(f'Clearing cache for view: {view_name}'))
        
        # Get all keys for this view (across all users)
        keys = cache.keys(f"cached_*{view_name}*")
        if keys:
            cache.delete_many(keys)
            self.stdout.write(self.style.SUCCESS(f'Cleared {len(keys)} cache entries for {view_name}'))
        else:
            self.stdout.write(self.style.SUCCESS(f'No cache entries found for {view_name}'))
    
    def show_stats(self):
        """Show cache statistics"""
        self.stdout.write(self.style.WARNING('Cache Statistics'))
        
        # Count total keys
        all_keys = cache.keys('*')
        total = len(all_keys)
        
        # Count keys by view type
        dashboard_keys = cache.keys('cached_*dashboard*')
        ml_keys = cache.keys('cached_*ml_dashboard*')
        stats_keys = cache.keys('cached_*post_stats*')
        other_keys = total - len(dashboard_keys) - len(ml_keys) - len(stats_keys)
        
        self.stdout.write(f'Total cache entries: {total}')
        self.stdout.write(f'Dashboard cache entries: {len(dashboard_keys)}')
        self.stdout.write(f'ML Dashboard cache entries: {len(ml_keys)}')
        self.stdout.write(f'Post Stats cache entries: {len(stats_keys)}')
        self.stdout.write(f'Other cache entries: {other_keys}') 