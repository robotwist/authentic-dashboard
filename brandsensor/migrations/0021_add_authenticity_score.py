from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('brandsensor', '0020_merge_20250411_0417'),
    ]

    operations = [
        migrations.AddField(
            model_name='socialpost',
            name='authenticity_score',
            field=models.FloatField(blank=True, null=True),
        ),
    ] 