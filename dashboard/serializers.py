from rest_framework import serializers
from .models import ErrorReport

class ErrorReportSerializer(serializers.ModelSerializer):
    """Serializer for error reports from extension"""
    
    class Meta:
        model = ErrorReport
        fields = [
            'id', 'error_type', 'error_message', 'error_metadata',
            'browser', 'extension_version', 'timestamp', 
            'resolved', 'user_agent'
        ]
        read_only_fields = ['id', 'timestamp', 'resolved']
    
    def validate_error_metadata(self, value):
        """Ensure metadata is properly formatted"""
        if not isinstance(value, dict):
            raise serializers.ValidationError("Metadata must be a JSON object")
        return value
    
    def create(self, validated_data):
        """Create and return a new error report instance"""
        return ErrorReport.objects.create(**validated_data) 