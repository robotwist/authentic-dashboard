#!/usr/bin/env python
import os
import sys
import django

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config_project.settings')
django.setup()

# Import models after setup
from django.db import connection

def check_column_exists(table_name, column_name):
    """Check if a column exists in a table"""
    with connection.cursor() as cursor:
        try:
            # For SQLite, check if column exists by querying the schema
            cursor.execute(
                f"SELECT sql FROM sqlite_master WHERE type='table' AND name='{table_name}';"
            )
            create_stmt = cursor.fetchone()[0]
            print(f"Table definition: {create_stmt}")
            
            # Try to get data from the column
            cursor.execute(f"SELECT COUNT(*) FROM {table_name} WHERE {column_name} IS NOT NULL;")
            count = cursor.fetchone()[0]
            print(f"Column {column_name} exists with {count} non-null values")
            return True
        except Exception as e:
            print(f"Error checking column {column_name} in {table_name}: {str(e)}")
            return False

def add_missing_column(table_name, column_name, column_type="FLOAT"):
    """Add a missing column to a table if it doesn't exist"""
    with connection.cursor() as cursor:
        try:
            cursor.execute(
                f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type} NULL;"
            )
            print(f"Added column {column_name} to {table_name}")
            return True
        except Exception as e:
            print(f"Error adding column {column_name} to {table_name}: {str(e)}")
            return False

if __name__ == "__main__":
    # Check for authenticity_score column in brandsensor_socialpost table
    print("Checking authenticity_score column...")
    if not check_column_exists('brandsensor_socialpost', 'authenticity_score'):
        print("Column authenticity_score missing, attempting to add it...")
        add_missing_column('brandsensor_socialpost', 'authenticity_score')
    else:
        print("Column authenticity_score exists")
    
    # Add checks for other columns here if needed 