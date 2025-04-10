#!/usr/bin/env python
import os
import sys
import django

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config_project.settings')
django.setup()

# Now we can import Django components
from brandsensor.auth import APIKeyAuthentication

print("Import test successful!")
print("APIKeyAuthentication class:", APIKeyAuthentication) 