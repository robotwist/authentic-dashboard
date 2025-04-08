# Generated manually by Claude

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('brandsensor', '0012_add_missing_fields'),
    ]

    operations = [
        # Add filter_sexual_content to FilterPreset
        migrations.AddField(
            model_name='filterpreset',
            name='filter_sexual_content',
            field=models.BooleanField(default=False),
        ),
    ] 