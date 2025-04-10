import requests
import json

# Define the API endpoint
url = "http://127.0.0.1:8000/collect_posts/"

# Define the headers (replace with a valid API key if required)
headers = {
    "Content-Type": "application/json",
    "X-API-Key": "906e114dfc2840c58669bb11531681a5"
}

# Define the payload
payload = {
    "posts": [
        {
            "content": "This is a test post content.",
            "platform": "Twitter",
            "user": "test_user",
            "platform_id": "12345",
            "is_friend": True,
            "is_family": False,
            "category": "test_category",
            "verified": True,
            "likes": 10,
            "comments": 5,
            "shares": 2,
            "timestamp": "2025-04-09T12:00:00Z",
            "hashtags": "#test",
            "mentions": "@test_user",
            "external_links": "http://example.com",
            "is_sponsored": False,
            "is_job_post": False,
            "content_length": 100,
            "connection_degree": 1,
            "bizfluencer_score": 0.5,
            "sentiment_score": 0.8
        }
    ],
    "platform": "Twitter"
}

# Send the POST request
response = requests.post(url, headers=headers, data=json.dumps(payload))

# Print the response
print("Status Code:", response.status_code)
try:
    print("Response Body:", response.json())
except ValueError:
    print("Response Body (non-JSON):", response.text)