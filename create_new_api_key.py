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

def create_api_key():
    # Print all available users
    users = User.objects.all()
    if not users:
        print("No users found in the database. Please create a user first.")
        return
    
    print("Available users:")
    for idx, user in enumerate(users, 1):
        print(f"{idx}. {user.username}")
    
    # Ask which user to create the key for
    try:
        choice = int(input("\nEnter the number of the user to create a key for (or press Enter for #1): ") or "1")
        if choice < 1 or choice > len(users):
            print(f"Invalid choice. Please select a number between 1 and {len(users)}.")
            return
        selected_user = users[choice-1]
    except ValueError:
        print("Invalid input. Please enter a number.")
        return
    
    # Generate key name with timestamp
    key_name = f"Chrome Extension Key {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    
    # Generate a UUID-based API key
    api_key = str(uuid.uuid4()).replace('-', '')
    
    # Create and save the API key
    new_key = APIKey(
        user=selected_user,
        key=api_key,
        name=key_name,
        is_active=True
    )
    new_key.save()
    
    print("\n=== NEW API KEY CREATED ===")
    print(f"User: {selected_user.username}")
    print(f"Key Name: {key_name}")
    print(f"API Key: {api_key}")
    print("\nIMPORTANT: Copy this key and update your Chrome extension settings.")
    print("This key will not be displayed again.")

if __name__ == "__main__":
    create_api_key() 