from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('brandsensor', '0021_add_authenticity_score'),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 
                    FROM information_schema.columns 
                    WHERE table_name = 'brandsensor_socialpost' 
                    AND column_name = 'authenticity_score'
                ) THEN
                    ALTER TABLE brandsensor_socialpost ADD COLUMN authenticity_score REAL NULL;
                END IF;
            END $$;
            """,
            reverse_sql="SELECT 1;",  # No-op for reversed migration
        ),
    ]