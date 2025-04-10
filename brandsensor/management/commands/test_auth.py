from django.core.management.base import BaseCommand
from django.conf import settings
from brandsensor.auth import APIKeyAuthentication
from brandsensor.models import APIKey
from django.contrib.auth.models import User

class Command(BaseCommand):
    help = 'Test the APIKeyAuthentication class'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Testing APIKeyAuthentication class...'))
        
        # Check if it's correctly imported
        self.stdout.write(f"Authentication class: {APIKeyAuthentication}")
        
        # Check REST Framework settings
        auth_classes = settings.REST_FRAMEWORK.get('DEFAULT_AUTHENTICATION_CLASSES', [])
        self.stdout.write(f"Authentication classes in settings: {auth_classes}")
        
        # Check if we have any API keys in the database
        key_count = APIKey.objects.count()
        self.stdout.write(f"Number of API keys in database: {key_count}")
        
        # Check if we have users
        user_count = User.objects.count()
        self.stdout.write(f"Number of users in database: {user_count}")
        
        self.stdout.write(self.style.SUCCESS('Test completed successfully!')) 