from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('brandsensor', '0021_add_authenticity_score'),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
            SELECT CASE 
                WHEN COUNT(*) = 0 THEN
                    'ALTER TABLE brandsensor_socialpost ADD COLUMN authenticity_score REAL NULL;'
                ELSE
                    'SELECT 1;'
            END
            FROM pragma_table_info('brandsensor_socialpost') 
            WHERE name = 'authenticity_score';
            """,
            reverse_sql="SELECT 1;",  # No-op for reversed migration
        ),
    ] 