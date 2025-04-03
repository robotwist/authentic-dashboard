from django.urls import path
from .views import dashboard
from .views import toggle_mode

urlpatterns = []

urlpatterns += [
    path('toggle-mode/', toggle_mode, name='toggle_mode'),
    path('dashboard/', dashboard, name='dashboard'),
]
