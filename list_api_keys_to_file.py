#!/usr/bin/env python3
import os
import django

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config_project.settings')
django.setup()

# Now import Django models
from brandsensor.models import APIKey

# Output file path
output_file = '/tmp/api_keys_list.txt'

with open(output_file, 'w') as f:
    f.write("=== ACTIVE API KEYS ===\n\n")
    
    # Get all active API keys
    active_keys = APIKey.objects.filter(is_active=True)
    
    if not active_keys:
        f.write("No active API keys found.\n")
    else:
        f.write(f"Found {active_keys.count()} active API keys:\n\n")
        
        for key in active_keys:
            f.write(f"Key ID: {key.id}\n")
            f.write(f"User: {key.user.username}\n")
            f.write(f"Name: {key.name}\n")
            f.write(f"Key: {key.key}\n")
            f.write(f"Created: {key.created_at}\n")
            f.write(f"Last Used: {key.last_used or 'Never'}\n")
            f.write(f"Active: {key.is_active}\n")
            f.write("\n" + "-"*50 + "\n\n")
    
    f.write("\n=== INSTRUCTIONS ===\n")
    f.write("1. Copy one of the API keys listed above\n")
    f.write("2. Open your Chrome extension settings\n")
    f.write("3. Paste the API key in the API Key field\n")
    f.write("4. Click Save to update the extension\n")
    f.write("5. Try collecting posts again\n")

print(f"API keys have been listed in: {output_file}")
print(f"Run: cat {output_file} to view the keys") 