#!/usr/bin/env python
"""
Database Optimization Script for Authentic Dashboard

This script:
1. Creates recommended indexes for ML workloads
2. Sets up PostgreSQL-specific optimizations if using PostgreSQL
3. Provides guidance on migrating from SQLite to PostgreSQL
"""
import os
import sys
import django
from django.db import connection
from django.conf import settings

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config_project.settings')
django.setup()

def get_db_type():
    """Return the database engine type currently in use"""
    engine = settings.DATABASES['default']['ENGINE']
    if 'sqlite' in engine:
        return 'sqlite'
    elif 'postgresql' in engine:
        return 'postgresql'
    else:
        return engine

def is_postgresql():
    """Check if PostgreSQL is the current database"""
    return get_db_type() == 'postgresql'

def create_ml_indexes():
    """Create recommended indexes for ML workloads"""
    with connection.cursor() as cursor:
        # Get the database type
        db_type = get_db_type()
        print(f"Database type: {db_type}")
        
        # Create indexes on fields commonly used in ML queries
        if is_postgresql():
            # PostgreSQL-specific optimized indexes
            print("Creating PostgreSQL-specific ML indexes...")
            try:
                # Index for text search on content
                cursor.execute("""
                CREATE INDEX IF NOT EXISTS brandsensor_socialpost_content_gin
                ON brandsensor_socialpost USING gin(to_tsvector('english', content));
                """)
                
                # Index for filtering posts by sentiment and engagement
                cursor.execute("""
                CREATE INDEX IF NOT EXISTS brandsensor_socialpost_ml_filters
                ON brandsensor_socialpost (user_id, sentiment_score, engagement_count)
                WHERE sentiment_score IS NOT NULL;
                """)
                
                # Index for image analysis
                cursor.execute("""
                CREATE INDEX IF NOT EXISTS brandsensor_socialpost_has_images
                ON brandsensor_socialpost (user_id, created_at)
                WHERE image_urls != '';
                """)
                
                # Index for platform-specific ML queries
                cursor.execute("""
                CREATE INDEX IF NOT EXISTS brandsensor_socialpost_platform_ml
                ON brandsensor_socialpost (user_id, platform, created_at)
                WHERE automated_category IS NOT NULL;
                """)
                
                print("PostgreSQL ML indexes created successfully.")
            except Exception as e:
                print(f"Error creating PostgreSQL indexes: {str(e)}")
        else:
            # Generic indexes for SQLite
            print("Creating generic indexes for SQLite...")
            try:
                # Basic indexes for ML queries
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_post_sentiment ON brandsensor_socialpost(sentiment_score);")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_post_category ON brandsensor_socialpost(automated_category);")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_post_user_platform ON brandsensor_socialpost(user_id, platform);")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_post_user_created ON brandsensor_socialpost(user_id, created_at);")
                
                print("SQLite indexes created successfully.")
            except Exception as e:
                print(f"Error creating SQLite indexes: {str(e)}")

def optimize_postgresql():
    """Apply PostgreSQL-specific optimizations"""
    if not is_postgresql():
        print("Not using PostgreSQL. Skipping PostgreSQL optimizations.")
        return
    
    with connection.cursor() as cursor:
        try:
            # Enable parallel query execution
            cursor.execute("SET max_parallel_workers_per_gather = 4;")
            
            # Analyze tables to update statistics
            cursor.execute("ANALYZE brandsensor_socialpost;")
            cursor.execute("ANALYZE brandsensor_mlpredictionlog;")
            
            # Create a materialized view for common ML queries
            cursor.execute("""
            CREATE MATERIALIZED VIEW IF NOT EXISTS ml_post_stats AS
            SELECT 
                user_id,
                platform,
                automated_category,
                DATE_TRUNC('day', created_at) AS day,
                COUNT(*) AS post_count,
                AVG(sentiment_score) AS avg_sentiment,
                AVG(engagement_count) AS avg_engagement,
                COUNT(CASE WHEN image_urls != '' THEN 1 END) AS images_count
            FROM brandsensor_socialpost
            WHERE sentiment_score IS NOT NULL
            GROUP BY user_id, platform, automated_category, DATE_TRUNC('day', created_at);
            
            CREATE UNIQUE INDEX IF NOT EXISTS ml_post_stats_idx ON ml_post_stats 
            (user_id, platform, automated_category, day);
            """)
            
            print("PostgreSQL optimizations applied successfully.")
        except Exception as e:
            print(f"Error applying PostgreSQL optimizations: {str(e)}")

def print_migration_guide():
    """Print guide for migrating from SQLite to PostgreSQL"""
    if is_postgresql():
        print("Already using PostgreSQL. No migration needed.")
        return
    
    print("\n" + "="*80)
    print("MIGRATION GUIDE: SQLite to PostgreSQL")
    print("="*80)
    print("\nFor optimal ML performance, we recommend migrating to PostgreSQL.")
    print("Follow these steps to migrate your data:")
    
    print("\n1. Install PostgreSQL and create a new database:")
    print("   $ sudo apt-get install postgresql postgresql-contrib")
    print("   $ sudo -u postgres createdb authentic_dashboard")
    print("   $ sudo -u postgres createuser -P youruser")
    
    print("\n2. Update your Django settings (config_project/settings.py):")
    print("""
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': 'authentic_dashboard',
            'USER': 'youruser',
            'PASSWORD': 'yourpassword',
            'HOST': 'localhost',
            'PORT': '5432',
        }
    }
    """)
    
    print("\n3. Install psycopg2:")
    print("   $ pip install psycopg2-binary")
    
    print("\n4. Use Django's dumpdata and loaddata commands:")
    print("   $ python manage.py dumpdata --exclude auth.permission --exclude contenttypes > data.json")
    print("   $ python manage.py migrate  # Create the schema in PostgreSQL")
    print("   $ python manage.py loaddata data.json")
    
    print("\n5. Run this optimization script again after migration:")
    print("   $ python optimize_db.py")
    
    print("\n6. For production environments, consider these settings:")
    print("""
    # PostgreSQL performance settings
    'OPTIONS': {
        'connect_timeout': 10,
        'client_encoding': 'UTF8',
        'default_transaction_isolation': 'read committed',
        'timezone': 'UTC',
    }
    """)
    print("="*80 + "\n")

def main():
    """Main function to run all optimizations"""
    print("Starting database optimization for ML workloads...")
    
    # Check current database
    db_type = get_db_type()
    print(f"Current database backend: {db_type}")
    
    # Create ML-specific indexes
    create_ml_indexes()
    
    # Apply PostgreSQL-specific optimizations if applicable
    if is_postgresql():
        optimize_postgresql()
    else:
        print_migration_guide()
    
    print("\nDatabase optimization completed successfully.")

if __name__ == "__main__":
    main() 