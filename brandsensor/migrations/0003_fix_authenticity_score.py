from django.db import migrations

class Migration(migrations.Migration):

    dependencies = [
        ('brandsensor', '0002_add_authenticity_score'),
    ]

    operations = [
        migrations.RunSQL(
            """
            -- Check if authenticity_score column exists, add it if not
            SELECT CASE 
                WHEN COUNT(*) = 0 THEN
                    -- Alter the table to add the missing column
                    -- Using text version first as SQLite can be picky with alters
                    'ALTER TABLE brandsensor_socialpost ADD COLUMN authenticity_score REAL NULL;'
                ELSE
                    'SELECT 1;' -- Do nothing if column exists
            END
            FROM pragma_table_info('brandsensor_socialpost') 
            WHERE name = 'authenticity_score';
            """,
            reverse_sql="""SELECT 1;"""  # No-op for reversed migration
        ),
    ] 