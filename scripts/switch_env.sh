#!/bin/bash

# Switch environment script for Authentic Dashboard
# Usage: ./switch_env.sh [dev|prod]

# Create scripts directory if it doesn't exist
mkdir -p $(dirname "$0")

if [ "$1" == "prod" ] || [ "$1" == "production" ]; then
    echo "Switching to production environment..."
    
    # Make backup of current .env if it exists
    if [ -f ".env" ]; then
        cp .env .env.backup
    fi
    
    # Copy production environment
    cp .env.production .env
    
    echo "Now using production environment with domain: https://authenticdashboard.com"
    echo "Remember to set proper values for secrets in .env file!"
    
elif [ "$1" == "dev" ] || [ "$1" == "development" ]; then
    echo "Switching to development environment..."
    
    # Make backup of current .env if it exists
    if [ -f ".env" ]; then
        cp .env .env.backup
    fi
    
    # Copy development environment if it exists, otherwise restore from backup
    if [ -f ".env.development" ]; then
        cp .env.development .env
    else
        # If no development file exists but we have a backup, restore from backup
        if [ -f ".env.backup" ]; then
            cp .env.backup .env
        fi
    fi
    
    echo "Now using development environment with domain: http://localhost:8000"
    
else
    echo "Usage: ./switch_env.sh [dev|prod]"
    echo "  dev, development: Switch to development environment"
    echo "  prod, production: Switch to production environment"
    exit 1
fi

# Make the script executable
chmod +x "$0"

# Inform about restart
echo "For changes to take effect, restart your Django application" 