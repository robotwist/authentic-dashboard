# Threads API Updates - April 2025

## Summary of Changes

We've updated our Threads API integration to include the latest features released by Meta. This document provides a quick overview of what's been added to our codebase.

## Updated Files

1. **README.md**
   - Added new permissions: `threads_keyword_search`
   - Added new features: polls, post deletion, mentions, embeds, geo-restrictions, alt text, share metrics

2. **dashboard/utils/social_api.py**
   - Added new methods to the `ThreadsAPI` class:
     - `create_poll()` - Create posts with polls
     - `get_mentions()` - Get threads where the user has been mentioned
     - `get_embed_code()` - Generate embed code for threads
     - `create_thread_with_georestrictions()` - Post with geographic restrictions
     - `upload_media_with_alt_text()` - Upload media with accessibility text

3. **New Documentation**
   - Added `docs/threads_api_features.md` with comprehensive examples and usage guidelines

## How to Use the New Features

All new features are accessible through the existing `ThreadsAPI` class. Here's a simple example of using the poll creation feature:

```python
from dashboard.utils.social_api import ThreadsAPI

threads_api = ThreadsAPI(access_token)
response = threads_api.create_poll(
    text="What's your favorite feature?",
    options=["Polls", "Search", "Embeds", "Alt Text"],
    duration_hours=48
)
```

## Required Permissions

When setting up your Meta app, ensure you request these permissions:
- `threads_basic`
- `threads_content_publish`
- `threads_manage_insights`
- `threads_read_replies`
- `threads_manage_replies`
- `threads_keyword_search` (new)

## Important Changes to API Base URL

Note that the Threads API base URL has been updated from `https://graph.threads.meta.com/` to `https://graph.threads.net/`. This change is reflected in our codebase.

## Additional Resources

- Complete documentation: See `docs/threads_api_features.md`
- Meta's official documentation: [Threads API Docs](https://developers.facebook.com/docs/threads/)
- Changelog: [Meta Threads API Changelog](https://developers.facebook.com/docs/threads/changelog/)

## Related Documentation

- [Threads API Features](threads_api_features.md) - Comprehensive guide to all Threads API features
- [Project README](../README.md) - Main project documentation with setup instructions
- [Documentation Index](README.md) - Overview of all available documentation 