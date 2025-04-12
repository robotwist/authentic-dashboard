# Diagnostic Test Instructions

## 1. Reload Your Extension

1. Go to chrome://extensions
2. Find the 'Authentic Dashboard' extension
3. Click the 'Reload' button (circular arrow icon)

## 2. Test on Facebook or Other Social Media Sites

1. Navigate to Facebook (or any other social media site)
2. Open Chrome DevTools (F12 or right-click and select 'Inspect')
3. Go to the 'Console' tab
4. Look for the '=== TESTING API CONNECTIONS ===' output
5. You should see that direct fetch fails with CSP error, but the safe call succeeds

## 3. If Issues Persist

1. Check that the background script is running properly
2. Ensure the Django server is running on localhost:8000
3. Verify that all API calls are now going through the background script

