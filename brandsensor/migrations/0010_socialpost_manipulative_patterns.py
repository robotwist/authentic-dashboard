# Generated by Django 5.1.7 on 2025-04-07 05:03

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('brandsensor', '0009_remove_socialpost_original_url'),
    ]

    operations = [
        migrations.AddField(
            model_name='socialpost',
            name='manipulative_patterns',
            field=models.TextField(blank=True, null=True),
        ),
    ]
