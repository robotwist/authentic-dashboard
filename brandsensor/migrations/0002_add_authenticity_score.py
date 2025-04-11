from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('brandsensor', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='socialpost',
            name='authenticity_score',
            field=models.FloatField(blank=True, null=True),
        ),
    ] 