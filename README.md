# Authentic Dashboard

A sophisticated social media content aggregation and filtering platform that helps users manage and curate their social media feeds through intelligent filtering and organization.

## Features

- User authentication and profile management
- Social media platform integration:
  - Facebook
  - Instagram
  - LinkedIn
  - Threads
- Advanced content filtering:
  - Keyword-based filtering
  - Hashtag filtering
  - Account-based filtering
  - Content type filtering
- Customizable dashboard
- Real-time content updates
- Analytics and insights

## Technology Stack

- Backend: Django 4.x
- Database: PostgreSQL
- Cache: Redis
- Frontend: HTML/CSS/JavaScript
- Authentication: OAuth2 for social media platforms
- ML/AI: Custom filtering algorithms

## Setup

1. Clone the repository:
```bash
git clone https://github.com/yourusername/authentic_dashboard.git
cd authentic_dashboard
```

2. Create and activate virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

5. Run migrations:
```bash
python manage.py migrate
```

6. Create superuser:
```bash
python manage.py createsuperuser
```

7. Run the development server:
```bash
python manage.py runserver
```

## Social Media Platform Setup

### Facebook
1. Create a Facebook Developer account
2. Create a new app in the Facebook Developers Console
3. Configure OAuth settings
4. Add the app credentials to .env

### Instagram
1. Create an Instagram Basic Display API app
2. Configure OAuth settings
3. Add the app credentials to .env

### LinkedIn
1. Create a LinkedIn Developer account
2. Create a new app
3. Configure OAuth settings
4. Add the app credentials to .env

### Threads
1. Create a Meta Developer account
2. Create a new app in the Meta Developers Console
3. Add the "Access the Threads API" use case
4. Configure the required permissions:
   - threads_basic
   - threads_content_publish (for posting content)
   - threads_manage_insights (for analytics)
   - threads_manage_replies (for reply management)
   - threads_read_replies (for accessing replies)
   - threads_keyword_search (for search functionality)
5. Set up OAuth redirect URIs
6. Add the app credentials to .env

## API Capabilities

### Threads API
The Threads API integration allows:
- Creating and publishing posts
- Replying to posts
- Reposting and quoting public posts
- Keyword search functionality
- Analytics and insights on post performance
- Media upload support for images and videos
- Real-time updates via webhook integrations
- Poll creation functionality
- Post deletion
- Fetching mentions where a profile has been tagged
- Embedding Threads content in websites via oEmbed
- Geographic restrictions (geo-gating) for posts
- Support for alt text for accessibility
- Share metrics for tracking off-platform sharing

Note: The Threads API has rate limits of 250 posts and 1,000 replies per 24 hours.

## Documentation

For more detailed documentation on API implementations and features:

- [Threads API Features](docs/threads_api_features.md) - Comprehensive guide with implementation examples
- [Threads API Updates](docs/threads_api_updates.md) - Summary of recent API updates and changes

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Thanks to all contributors
- Built with Django and modern web technologies
- Inspired by the need for better social media content management
