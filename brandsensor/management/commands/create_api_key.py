from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth.models import User
from brandsensor.models import APIKey
import uuid

class Command(BaseCommand):
    help = 'Create an API key for a specified user or the first user if not specified'

    def add_arguments(self, parser):
        parser.add_argument('--username', type=str, help='Username to create key for')
        parser.add_argument('--name', type=str, default='Chrome Extension', 
                            help='Name for the API key (e.g., "Chrome Extension")')

    def handle(self, *args, **options):
        username = options.get('username')
        name = options.get('name')
        
        try:
            if username:
                user = User.objects.get(username=username)
                self.stdout.write(f"Creating API key for user: {username}")
            else:
                user = User.objects.first()
                if not user:
                    raise CommandError("No users found in the database")
                self.stdout.write(f"Creating API key for the first user: {user.username}")
            
            # Create a new API key
            api_key = APIKey.objects.create(
                user=user,
                name=name,
                key=uuid.uuid4().hex
            )
            
            self.stdout.write(self.style.SUCCESS(f"API key created successfully!"))
            self.stdout.write(f"Key: {api_key.key}")
            self.stdout.write(f"Include this key in your requests with the X-API-Key header.")
            
        except User.DoesNotExist:
            raise CommandError(f"User '{username}' does not exist")
        except Exception as e:
            raise CommandError(f"Error creating API key: {str(e)}") 