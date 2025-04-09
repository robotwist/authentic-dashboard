# Generated by Django 5.2 on 2025-04-09 04:51

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("brandsensor", "0017_add_notification_fields"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="userpreference",
            name="browser_notifications",
        ),
        migrations.RemoveField(
            model_name="userpreference",
            name="email_notifications",
        ),
        migrations.RemoveField(
            model_name="userpreference",
            name="updated_at",
        ),
        migrations.AddField(
            model_name="userpreference",
            name="rating",
            field=models.IntegerField(
                blank=True,
                help_text="User rating for specific items (1-5 stars).",
                null=True,
            ),
        ),
    ]
