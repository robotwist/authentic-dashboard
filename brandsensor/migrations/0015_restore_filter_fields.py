# Generated by Django 5.1.7 on 2025-04-08 19:56

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("brandsensor", "0014_add_content_hash_field"),
    ]

    operations = [
        migrations.AddField(
            model_name="filterpreset",
            name="filter_sexual_content",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="userpreference",
            name="filter_sexual_content",
            field=models.BooleanField(default=False),
        ),
    ]
