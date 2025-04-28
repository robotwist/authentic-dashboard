#!/usr/bin/env python
import os
import sys
import subprocess
import django
from django.core.management import call_command
from pathlib import Path

def setup_database():
    """Set up the database with initial migrations and create a superuser if needed."""
    try:
        # Setup Django environment
        sys.path.append(str(Path(__file__).resolve().parent.parent))
        os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config_project.settings')
        django.setup()

        # Check if database exists and is accessible
        from django.db import connection
        connection.ensure_connection()
        print("✓ Database connection successful")

        # Run migrations
        print("Running migrations...")
        call_command('migrate')
        print("✓ Migrations complete")

        # Create superuser if it doesn't exist
        from django.contrib.auth import get_user_model
        User = get_user_model()
        if not User.objects.filter(is_superuser=True).exists():
            print("Creating superuser...")
            username = os.getenv('DJANGO_SUPERUSER_USERNAME', 'admin')
            email = os.getenv('DJANGO_SUPERUSER_EMAIL', 'admin@example.com')
            password = os.getenv('DJANGO_SUPERUSER_PASSWORD', 'admin')
            User.objects.create_superuser(username, email, password)
            print("✓ Superuser created")

        # Install or update dependencies
        print("Checking dependencies...")
        subprocess.run([sys.executable, '-m', 'pip', 'install', '-r', 'requirements.txt'])
        print("✓ Dependencies updated")

        print("\nDatabase setup complete! 🎉")
        print(f"You can now log in to the admin interface with:")
        print(f"Username: {username}")
        print(f"Password: {password}")
        print("\nMake sure to change these credentials in production!")

    except Exception as e:
        print(f"Error during database setup: {str(e)}")
        sys.exit(1)

if __name__ == '__main__':
    setup_database() 