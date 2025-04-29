# Threads API Integration Guide

This guide covers the latest features of the Threads API and how to use them within the Authentic Dashboard application.

## Latest API Features (April 2025)

The Threads API has been updated with several new features that are now integrated into our application:

- **Poll Creation**: Create polls with 2-4 options and customizable duration
- **Post Deletion**: Delete posts that you've previously created
- **Keyword Search**: Search for content by keywords across the Threads platform
- **Mentions Retrieval**: Get threads where your account has been mentioned
- **Embed Support**: Generate embed codes to display Threads content on websites
- **Geographic Restrictions**: Limit the visibility of posts to specific countries
- **Accessibility Support**: Add alt text to media attachments
- **Share Metrics**: Access analytics on how often your posts are shared outside Threads
- **Carousel Support**: Create posts with up to 20 images, videos, or mixed media

## Required Permissions

To use these features, your Meta app needs the following permissions:

- `threads_basic` - Required for all API access
- `threads_content_publish` - For creating posts, polls, and replies
- `threads_manage_insights` - For accessing analytics and metrics
- `threads_read_replies` - For viewing replies to posts
- `threads_manage_replies` - For managing replies
- `threads_keyword_search` - For searching Threads content

## Examples

### Creating a Poll

```python
from dashboard.utils.social_api import ThreadsAPI

# Initialize the API client
threads_api = ThreadsAPI(access_token)

# Create a poll
response = threads_api.create_poll(
    text="What's your favorite feature of the new Threads API?",
    options=["Polls", "Search", "Embeds", "Alt Text Support"],
    duration_hours=48
)

# Get the poll ID
poll_id = response.get('id')
```

### Searching for Content

```python
# Search for threads containing specific keywords
results = threads_api.search_threads(
    query="authentic dashboard",
    limit=25
)

# Process the results
threads = results.get('data', [])
for thread in threads:
    print(f"Thread: {thread.get('text')}")
    print(f"By: {thread.get('user', {}).get('username')}")
    print(f"Likes: {thread.get('like_count')}")
    print("-" * 40)
```

### Getting Mentions

```python
# Get threads where the user has been mentioned
mentions = threads_api.get_mentions(limit=10)

# Process the mentions
for mention in mentions.get('data', []):
    print(f"Mentioned by: {mention.get('user', {}).get('username')}")
    print(f"Content: {mention.get('text')}")
    print(f"Link: {mention.get('permalink')}")
    print("-" * 40)
```

### Embedding a Thread

```python
# Get the embed code for a thread
embed = threads_api.get_embed_code(
    thread_url="https://threads.net/username/post/123456789"
)

# The embed HTML can be used in your templates
embed_html = embed.get('html')
```

### Creating a Post with Geographic Restrictions

```python
# Post only visible in the US and Canada
response = threads_api.create_thread_with_georestrictions(
    text="This announcement is for North American users only!",
    countries=["US", "CA"]
)
```

### Uploading Media with Alt Text

```python
# Upload an image with descriptive alt text
media_id = threads_api.upload_media_with_alt_text(
    media_path="/path/to/image.jpg",
    alt_text="A beautiful mountain landscape at sunset with purple and orange skies"
)

# Use the media ID in a new post
if media_id:
    threads_api.create_thread(
        text="Enjoying the view! #nature #sunset",
        media_ids=[media_id]
    )
```

## API Rate Limits

Be aware of these rate limits when integrating with the Threads API:

- 250 posts per 24 hours
- 1,000 replies per 24 hours
- 500 character limit per text post
- 200 API calls per hour
- 500 search queries per 7-day period

## Webhook Integration

Threads provides real-time webhooks for content updates. To enable webhooks:

1. Configure the webhook URL in your application settings:
   ```python
   THREADS_WEBHOOKS_ENABLED = True
   THREADS_WEBHOOK_VERIFY_TOKEN = 'your-secure-token'
   THREADS_WEBHOOK_CALLBACK_URL = 'https://yourdomain.com/webhooks/threads/'
   ```

2. Subscribe to relevant topics:
   - `threads` - Updates about your posts
   - `mentions` - Notifications when you're mentioned
   - `comments` - Notifications about replies

## Troubleshooting

If you encounter issues with the Threads API:

1. Verify your access token is valid and hasn't expired
2. Check that your app has the required permissions
3. Ensure you're not exceeding rate limits
4. For search and embedding issues, verify your app has been approved for advanced access
5. Test using the Meta API Explorer before implementing in production

## Related Documentation

- [Threads API Updates](threads_api_updates.md) - Summary of recent updates to the Threads API implementation
- [Project README](../README.md) - Main project documentation with setup instructions 
- [Documentation Index](README.md) - Overview of all available documentation

For more details, consult the [official Threads API documentation](https://developers.facebook.com/docs/threads/). 