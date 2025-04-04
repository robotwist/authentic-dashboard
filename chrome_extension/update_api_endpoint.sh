#!/bin/bash

# Update API endpoint URLs in Chrome extension files
# Usage: ./update_api_endpoint.sh https://your-app-name.herokuapp.com

if [ $# -ne 1 ]; then
    echo "Usage: ./update_api_endpoint.sh https://your-app-name.herokuapp.com"
    exit 1
fi

NEW_URL=$1

# Remove trailing slash if present
NEW_URL=${NEW_URL%/}

echo "Updating API endpoints to: $NEW_URL"

# Update popup.js
sed -i "s|http://localhost:8000|$NEW_URL|g" popup.js
echo "Updated popup.js"

# Update background.js
sed -i "s|http://localhost:8000|$NEW_URL|g" background.js
echo "Updated background.js"

# Update popup.html dashboard links
sed -i "s|http://localhost:8000/dashboard/|$NEW_URL/dashboard/|g" popup.html
sed -i "s|http://localhost:8000/ml-dashboard/|$NEW_URL/ml-dashboard/|g" popup.html
echo "Updated popup.html"

echo "All files updated successfully!"
echo "Remember to reload the extension in Chrome." 