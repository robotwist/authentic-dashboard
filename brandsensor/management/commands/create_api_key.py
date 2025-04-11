from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from brandsensor.models import APIKey
import uuid

class Command(BaseCommand):
    help = 'Creates a new API key for a specified user'

    def add_arguments(self, parser):
        parser.add_argument('username', type=str, help='Username to create API key for')
        parser.add_argument('--name', type=str, default='Chrome Extension Key', help='Name for the API key')

    def handle(self, *args, **options):
        username = options['username']
        key_name = options['name']
        
        try:
            user = User.objects.get(username=username)
            
            # Generate a new UUID-based key
            api_key = str(uuid.uuid4()).replace('-', '')
            
            # Create and save the new API key
            new_key = APIKey(
                user=user,
                key=api_key,
                name=key_name,
                is_active=True
            )
            new_key.save()
            
            self.stdout.write(self.style.SUCCESS(f'Successfully created new API key for {username}'))
            self.stdout.write(f'Key: {api_key}')
            self.stdout.write(f'Name: {key_name}')
            self.stdout.write('Please update your Chrome extension with this key.')
            
        except User.DoesNotExist:
            self.stdout.write(self.style.ERROR(f'User {username} does not exist'))
            available_users = User.objects.all().values_list('username', flat=True)
            if available_users:
                self.stdout.write('Available users:')
                for username in available_users:
                    self.stdout.write(f' - {username}')
            else:
                self.stdout.write('No users available. Please create a user first.') 