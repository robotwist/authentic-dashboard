#!/usr/bin/env python3
import os
import uuid
import django
from datetime import datetime
import secrets
from dotenv import load_dotenv
from django.core.management import execute_from_command_line

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config_project.settings')
django.setup()

# Now import Django models
from django.contrib.auth.models import User
from brandsensor.models import APIKey

# Get the first user (or create admin if none exists)
try:
    user = User.objects.first()
    if not user:
        print("No users found. Creating admin user...")
        from django.contrib.auth.models import User
        User.objects.create_superuser('admin', 'admin@example.com', 'admin')
        user = User.objects.get(username='admin')
        print("Created admin user with username 'admin' and password 'admin'")
    
    # Generate key name with timestamp
    key_name = f"Chrome Extension Key {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    
    # Generate a UUID-based API key
    api_key = str(uuid.uuid4()).replace('-', '')
    
    # Create and save the API key
    new_key = APIKey(
        user=user,
        key=api_key,
        name=key_name,
        is_active=True
    )
    new_key.save()
    
    print("\n=== NEW API KEY CREATED ===")
    print(f"User: {user.username}")
    print(f"Key Name: {key_name}")
    print(f"API Key: {api_key}")
    print("\nIMPORTANT: Copy this key and update your Chrome extension settings.")
    print("This key will not be displayed again.")
    
except Exception as e:
    print(f"Error creating API key: {str(e)}")

def generate_api_key():
    # Generate a secure API key
    api_key = secrets.token_urlsafe(32)
    
    # Update .env file
    env_path = os.path.join(os.path.dirname(__file__), '.env')
    with open(env_path, 'r') as f:
        lines = f.readlines()
    
    with open(env_path, 'w') as f:
        for line in lines:
            if line.startswith('DEFAULT_API_KEY='):
                f.write(f'DEFAULT_API_KEY={api_key}\n')
            else:
                f.write(line)
    
    print(f"\nGenerated API Key: {api_key}")
    print("\nThe .env file has been updated with the new API key.")
    print("Please use this key in your Chrome extension settings.")

if __name__ == '__main__':
    generate_api_key() 