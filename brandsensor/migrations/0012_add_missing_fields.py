# Generated manually by Claude

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('brandsensor', '0011_remove_socialpost_manipulative_patterns_and_more'),
    ]

    operations = [
        # Ensure SocialPost fields exist
        migrations.AlterField(
            model_name='socialpost',
            name='platform_id',
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
        migrations.AlterField(
            model_name='socialpost',
            name='engagement_count',
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name='socialpost',
            name='user_category',
            field=models.CharField(blank=True, default='', max_length=100),
            preserve_default=False,
        ),
        
        # Ensure UserPreference has filter_sexual_content
        migrations.AddField(
            model_name='userpreference',
            name='filter_sexual_content',
            field=models.BooleanField(default=False),
        ),
        
        # Add platform_id index if it doesn't exist
        migrations.AddIndex(
            model_name='socialpost',
            index=models.Index(fields=['platform_id'], name='bs_platfor_id_idx'),
        ),

        # Add filter_sexual_content to FilterPreset
        migrations.AddField(
            model_name='filterpreset',
            name='filter_sexual_content',
            field=models.BooleanField(default=False),
        ),
    ] 