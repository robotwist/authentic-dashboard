# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('brandsensor', '0018_remove_userpreference_browser_notifications_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='socialpost',
            name='image_analysis',
            field=models.TextField(blank=True, null=True),
        ),
    ] 