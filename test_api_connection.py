#!/usr/bin/env python3
"""
Test script for API connection to the dashboard server.
This simulates what the Chrome extension would do, but without
the Content Security Policy limitations of browser environments.
"""

import requests

API_KEY = "42ad72779a934c2d8005992bbecb6772"
BASE_URL = "http://localhost:8000"

def test_health_check():
    """Test the health check endpoint that doesn't require auth"""
    url = f"{BASE_URL}/api/health-check/"
    print(f"Testing non-authenticated endpoint: {url}")
    
    try:
        response = requests.get(url)
        print(f"Status code: {response.status_code}")
        print(f"Response: {response.text}")
        return response.status_code == 200
    except Exception as e:
        print(f"Error: {str(e)}")
        return False

def test_authenticated_endpoint():
    """Test an endpoint that requires authentication"""
    url = f"{BASE_URL}/api/verify-key/"
    print(f"\nTesting authenticated endpoint: {url}")
    
    headers = {
        "X-API-Key": API_KEY
    }
    
    try:
        response = requests.get(url, headers=headers)
        print(f"Status code: {response.status_code}")
        print(f"Response: {response.text}")
        return response.status_code == 200
    except Exception as e:
        print(f"Error: {str(e)}")
        return False

def main():
    print("API Connection Test")
    print("-----------------")
    
    health_check_result = test_health_check()
    auth_result = test_authenticated_endpoint()
    
    print("\nSummary:")
    print(f"Health check endpoint: {'SUCCESS' if health_check_result else 'FAILED'}")
    print(f"Authenticated endpoint: {'SUCCESS' if auth_result else 'FAILED'}")
    
    if health_check_result and auth_result:
        print("\nBoth tests passed! Your API server is working correctly.")
        print("\nIf your Chrome extension is still having trouble, it's likely due to:")
        print("1. Content Security Policy in the browser")
        print("2. Extension not using proper message passing from content to background script")
        print("\nSolution:")
        print("Make sure ALL API calls go through the background script, not the content script")
    elif not health_check_result:
        print("\nThe health check failed. Check if your server is running.")
    else:
        print("\nThe authenticated endpoint failed. Check your API key.")
    
    return 0 if health_check_result and auth_result else 1

if __name__ == "__main__":
    sys.exit(main()) 