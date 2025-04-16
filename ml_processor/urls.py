from django.urls import path
from . import views

urlpatterns = [
    path('analyze-face/', views.analyze_face, name='analyze_face'),
    path('detect-objects/', views.detect_objects, name='detect_objects'),
    path('task-status/<str:task_id>/', views.task_status, name='task_status'),
    path('error-report/', views.error_report, name='error_report'),
] 