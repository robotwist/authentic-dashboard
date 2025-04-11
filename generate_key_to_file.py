#!/usr/bin/env python3
import os
import sys
import uuid
import django
from datetime import datetime

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config_project.settings')
django.setup()

# Now import Django models
from django.contrib.auth.models import User
from brandsensor.models import APIKey

# Output file
output_file = 'api_key_output.txt'

with open(output_file, 'w') as f:
    # Get all users
    users = list(User.objects.all())
    
    if not users:
        f.write("No users found in the database. Please create a user first.\n")
        sys.exit(1)
    
    f.write("Available users:\n")
    for user in users:
        f.write(f"- {user.username}\n")
    
    # Use the first user
    selected_user = users[0]
    
    # Generate key name with timestamp
    key_name = f"Chrome Extension Key {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    
    # Generate a UUID-based API key
    api_key = str(uuid.uuid4()).replace('-', '')
    
    # Create and save the API key
    try:
        new_key = APIKey(
            user=selected_user,
            key=api_key,
            name=key_name,
            is_active=True
        )
        new_key.save()
        
        f.write("\n=== NEW API KEY CREATED ===\n")
        f.write(f"User: {selected_user.username}\n")
        f.write(f"Key Name: {key_name}\n")
        f.write(f"API Key: {api_key}\n")
        f.write("\nIMPORTANT: Copy this key and update your Chrome extension settings.\n")
    except Exception as e:
        f.write(f"\nError creating API key: {str(e)}\n")

# Print confirmation to console
print(f"API key information has been written to {output_file}") 