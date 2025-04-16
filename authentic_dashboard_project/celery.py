import os
from celery import Celery

# Set the default Django settings module
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'authentic_dashboard_project.settings')

# Create the Celery application
app = Celery('authentic_dashboard_project')

# Load configuration from Django settings, namespace='CELERY' means
# all celery-related settings should have a `CELERY_` prefix
app.config_from_object('django.conf:settings', namespace='CELERY')

# Automatically discover tasks in all installed apps
app.autodiscover_tasks()

@app.task(bind=True)
def debug_task(self):
    print(f'Request: {self.request!r}') 