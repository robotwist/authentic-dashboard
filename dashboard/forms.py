from django import forms
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.models import User
from .models import UserProfile, ContentFilter

class UserRegistrationForm(UserCreationForm):
    email = forms.EmailField(required=True)
    
    class Meta:
        model = User
        fields = ('username', 'email', 'password1', 'password2')

    def save(self, commit=True):
        user = super().save(commit=False)
        user.email = self.cleaned_data['email']
        if commit:
            user.save()
        return user

class UserProfileForm(forms.ModelForm):
    class Meta:
        model = UserProfile
        fields = ('bio',)
        widgets = {
            'bio': forms.Textarea(attrs={'rows': 4}),
        }

class ContentFilterForm(forms.ModelForm):
    class Meta:
        model = ContentFilter
        fields = ('filter_type', 'value', 'is_include')
        widgets = {
            'value': forms.TextInput(attrs={'placeholder': 'Enter keyword, hashtag, or account name'}),
        }

    def clean(self):
        cleaned_data = super().clean()
        filter_type = cleaned_data.get('filter_type')
        value = cleaned_data.get('value')

        if filter_type == 'hashtag' and not value.startswith('#'):
            cleaned_data['value'] = f'#{value}'

        return cleaned_data 