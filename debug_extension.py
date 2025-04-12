#!/usr/bin/env python3
import json
import sys
import os
import datetime

# Function to read Chrome extension settings from local storage
def parse_extension_settings(storage_path):
    """Parse Chrome extension settings from local storage file"""
    try:
        with open(storage_path, 'r') as f:
            data = json.load(f)
            
        print("Extension settings found:")
        print("=" * 50)
        
        # Extract settings
        if 'settings' in data:
            settings = data['settings']
            print("API Key:", settings.get('apiKey', 'Not set'))
            print("API Endpoint:", settings.get('apiEndpoint', 'Not set'))
            print("Auto Scan:", settings.get('autoScan', False))
            print("Show Notifications:", settings.get('showNotifications', True))
            print("Advanced ML:", settings.get('advancedML', True))
        else:
            print("No settings found in storage")
            
        # Extract API availability status
        if 'apiAvailable' in data:
            print("API Available:", data['apiAvailable'])
        if 'apiLastCheck' in data:
            last_check = datetime.datetime.fromtimestamp(data['apiLastCheck']/1000.0)
            print("API Last Check:", last_check)
            
        # Extract scan history
        if 'scanHistory' in data:
            scan_history = data['scanHistory']
            print("\nScan History:")
            print("-" * 50)
            for scan in scan_history[-5:]:  # Show last 5 scans
                print(f"Time: {scan.get('timestamp')}")
                print(f"Platform: {scan.get('platform')}")
                print(f"Posts: {scan.get('postCount')}")
                print(f"Errors: {scan.get('errors', 0)}")
                print("-" * 30)
        
        # Extract stats
        if 'stats' in data:
            stats = data['stats']
            print("\nCollection Stats:")
            print("-" * 50)
            for date, day_stats in stats.items():
                print(f"Date: {date}")
                print(f"Total Posts: {day_stats.get('totalPosts', 0)}")
                if 'platforms' in day_stats:
                    for platform, count in day_stats['platforms'].items():
                        print(f"  {platform.capitalize()}: {count}")
                print("-" * 30)
        
        return True
    except (json.JSONDecodeError, FileNotFoundError) as e:
        print(f"Error parsing settings: {e}")
        return False

# Main function
def main():
    print("Debugging Chrome Extension Settings")
    print("=" * 50)
    
    # Check default settings path locations based on OS
    if sys.platform.startswith('linux'):
        home = os.path.expanduser("~")
        chrome_dirs = [
            os.path.join(home, ".config/google-chrome/Default/Local Storage/leveldb"),
            os.path.join(home, ".config/chromium/Default/Local Storage/leveldb"),
            os.path.join(home, ".config/BraveSoftware/Brave-Browser/Default/Local Storage/leveldb")
        ]
    elif sys.platform == "darwin":  # macOS
        home = os.path.expanduser("~")
        chrome_dirs = [
            os.path.join(home, "Library/Application Support/Google/Chrome/Default/Local Storage/leveldb"),
            os.path.join(home, "Library/Application Support/Chromium/Default/Local Storage/leveldb"),
            os.path.join(home, "Library/Application Support/BraveSoftware/Brave-Browser/Default/Local Storage/leveldb")
        ]
    elif sys.platform == "win32":  # Windows
        home = os.path.expandvars("%LOCALAPPDATA%")
        chrome_dirs = [
            os.path.join(home, "Google/Chrome/User Data/Default/Local Storage/leveldb"),
            os.path.join(home, "Chromium/User Data/Default/Local Storage/leveldb"),
            os.path.join(home, "BraveSoftware/Brave-Browser/User Data/Default/Local Storage/leveldb")
        ]
    else:
        print(f"Unsupported platform: {sys.platform}")
        return
    
    # Additional path if a custom path is provided
    if len(sys.argv) > 1:
        chrome_dirs.insert(0, sys.argv[1])
    
    # Try each path
    for chrome_dir in chrome_dirs:
        print(f"\nChecking directory: {chrome_dir}")
        if os.path.exists(chrome_dir):
            print("Directory found, searching for extension storage...")
            
            # Search for files containing the extension name
            for filename in os.listdir(chrome_dir):
                if "authentic" in filename.lower():
                    path = os.path.join(chrome_dir, filename)
                    print(f"Found potential extension storage: {path}")
                    parse_extension_settings(path)
        else:
            print("Directory not found")
    
    print("\nDebugging complete")
    print("=" * 50)
    print("NOTE: If extension settings were not found, check the browser's")
    print("extension debug page at chrome://extensions/ and look for")
    print("'Authentic Dashboard' to verify it's installed and enabled.")

if __name__ == "__main__":
    main() 