import os
import sys
import traceback

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config_project.settings')

try:
    import django
    print(f"Django version: {django.__version__}")
    print(f"Django path: {django.__file__}")
    
    django.setup()
    print("Django setup completed successfully")
    
    from django.core.management import execute_from_command_line
    print("Management commands imported successfully")
    
    # Try to run the server
    print("Attempting to run the server...")
    execute_from_command_line(['manage.py', 'runserver', '127.0.0.1:8000'])
    
except Exception as e:
    print(f"Error: {e}")
    traceback.print_exc()
    print("\nPython path:")
    for path in sys.path:
        print(f"  {path}") 