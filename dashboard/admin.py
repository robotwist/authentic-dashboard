from django.contrib import admin
from .models import ErrorReport

@admin.register(ErrorReport)
class ErrorReportAdmin(admin.ModelAdmin):
    list_display = ('error_type', 'error_message_summary', 'extension_version', 'timestamp', 'resolved')
    list_filter = ('error_type', 'resolved', 'extension_version', 'timestamp')
    search_fields = ('error_message', 'browser', 'resolution_notes')
    readonly_fields = ('timestamp',)
    date_hierarchy = 'timestamp'
    
    fieldsets = (
        ('Error Information', {
            'fields': ('error_type', 'error_message', 'error_metadata', 'timestamp')
        }),
        ('Device Information', {
            'fields': ('browser', 'extension_version', 'user_agent')
        }),
        ('Resolution', {
            'fields': ('resolved', 'resolution_notes')
        }),
    )
    
    def error_message_summary(self, obj):
        """Truncate error message to 50 chars for display"""
        if len(obj.error_message) > 50:
            return f"{obj.error_message[:50]}..."
        return obj.error_message
    
    error_message_summary.short_description = 'Error Message'
    
    def has_add_permission(self, request):
        """Disable manual creation of error reports"""
        return False 