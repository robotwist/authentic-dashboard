#!/bin/bash

# Configuration script for the Authentic Dashboard Chrome extension
# This script updates the API key and endpoint in the extension's storage

API_KEY="42ad72779a934c2d8005992bbecb6772"
API_ENDPOINT="http://localhost:8000"

echo "Configuring Chrome extension with:"
echo "API Key: $API_KEY"
echo "API Endpoint: $API_ENDPOINT"

# Update the default API key in popup.js
sed -i "s|apiKey: '.*'|apiKey: '$API_KEY'|g" chrome_extension/popup.js

# Update API endpoint URLs in manifest.json and make sure localhost:8000 is included
if ! grep -q "http://localhost:8000/" chrome_extension/manifest.json; then
    echo "Adding localhost:8000 to host_permissions in manifest.json"
    sed -i 's|"host_permissions": \[|"host_permissions": \[\n      "http://localhost:8000/",|' chrome_extension/manifest.json
fi

# Ensure the API endpoint is set as the default in api_client.js
sed -i "s|currentEndpoint: '.*'|currentEndpoint: '$API_ENDPOINT'|g" chrome_extension/api_client.js

echo "Configuration complete! Next steps:"
echo "1. Go to chrome://extensions/"
echo "2. Enable Developer mode"
echo "3. Click 'Load unpacked' and select the chrome_extension directory"
echo "4. Click on the extension icon and check the settings"

# Make the script executable
chmod +x configure_extension.sh

echo "Done!" 