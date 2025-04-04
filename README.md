# Authentic Dashboard

Ultimate Directive
I think the ultimate directive that should guide development could be:
> "Restore user sovereignty over the digital experience by creating transparent tools that prioritize genuine human satisfaction rather than engagement metrics."
This directive emphasizes:
User control ("sovereignty")
Transparency in how content is filtered
Human-centered design (satisfaction vs engagement)
Ethical technology principles

A personalized dashboard experience layered on top of social platforms like Facebook, Instagram, and LinkedIn. This project reclaims the user experience by giving people the ability to filter and reframe their online environment based on what they actually want to see.



## Description

Cursory reseach shows that people rate their time on social platforms as a 2 or 3 out of 10, yet they use these sites daily. The AuthD project is a response to that contradiction — a tool to make these platforms livable again. It lets users bypass algorithmic feeds and manipulative design by creating modes that display only the content they value. This isn't a boycott — it's a lens for clarity. It takes what the user tries to do in practice and quantizes it and gives the user soveriegnty over their own viewing.

This is part of a broader effort to build, simply, an internet worth using, a cleaner, more humane internet unsubverterd by anyone other than the user's wishes. The dashboard is paired with a Chrome extension that scans platform content using custom sensors to detect and log behavior patterns like spam, buzzwords, urgency traps, promotional language, and more.

Our Founder characterized AD providing "an honest algo that reflects what will give them a 10/10 experience" - where our users say that's absolutely on point. What makes this project special is that unlike platform algorithms optimized for engagement and ad revenue, Authentic Dashboard is optimized for genuine user satisfaction and wellbeing.

## Features

- **Friends Only Mode**: Filter your feed to show content only from your first-degree friends.
- **Family Only Mode**: Focus only on posts from your chosen family group.
- **Interest Modes**: Tailor your feed around specific topics like "Running Shoes Mode," displaying posts from trusted sources, brands, and communities you've approved.
- **Brand Trust Filter**: A mode that blocks promotional noise and only shows content from selected brands you've vetted.
- **Bizfluencer Detection**: A LinkedIn-specific sensor that detects performative buzzword-heavy posts and filters them out.
- **Sensor-based Content Logging**: Chrome extension detects manipulative or unwanted content patterns and logs them to a Django backend.
- **Authenticity-Driven UI**: Users see their social content reframed through a personal lens rather than the algorithm's.
- **Machine Learning Insights**: Analyze sentiment, predict engagement, detect toxicity, and classify content.

## Project Structure

```
authentic_dashboard_project/
├── chrome_extension/        # Browser extension with sensors and content analysis
│   ├── manifest.json
│   ├── popup.js / popup.html
│   ├── content.js
│   └── background.js
├── config_project/          # Django project settings
├── brandsensor/             # Django app (models, views, templates)
│   ├── management/
│   │   └── commands/
│   │       └── create_api_key.py  # Command to generate API keys
│   ├── migrations/
│   ├── templates/
│   │   └── brandsensor/
│   ├── ml_processor.py      # Machine learning module
│   ├── models.py
│   ├── views.py
│   └── urls.py
├── manage.py
├── requirements.txt
├── Procfile                 # For Heroku deployment
└── README.md
```

## Getting Started

### Backend Setup

1. Clone the repository
   ```bash
   git clone https://github.com/yourusername/authentic_dashboard_project.git
   cd authentic_dashboard_project
   ```

2. Create and activate a virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Run migrations:
   ```bash
   python manage.py migrate
   ```

5. Create a test user:
   ```bash
   python manage.py createsuperuser
   ```

6. Generate an API key for Chrome extension authentication:
   ```bash
   python manage.py create_api_key --username youruser
   ```
   
   Make note of the generated API key - you'll need it for the Chrome extension.

7. Run the development server:
   ```bash
   python manage.py runserver
   ```

### Chrome Extension Setup

1. Navigate to `chrome://extensions/` in Chrome
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `chrome_extension` directory
4. Click on the extension icon and enter your API key in the settings
5. Visit Facebook, Instagram, or LinkedIn to start collecting data

## Authentication System

The project uses a simple API key authentication system for the Chrome extension to communicate with the Django backend:

1. Each user has one or more API keys associated with their account
2. The Chrome extension sends the API key with each request in the `X-API-Key` header
3. The backend validates the API key and associates the data with the correct user

During development, if no API key is provided and DEBUG mode is enabled, the system will default to using the first user in the database to make testing easier.

## Deployment

### Backend Deployment (Heroku)

1. Create a Heroku account and install the Heroku CLI
2. Log in to Heroku:
   ```bash
   heroku login
   ```

3. Create a new Heroku app:
   ```bash
   heroku create your-app-name
   ```

4. Set environment variables:
   ```bash
   heroku config:set DJANGO_SECRET_KEY=your_secret_key
   heroku config:set DJANGO_DEBUG=False
   heroku config:set ALLOWED_HOSTS=your-app-name.herokuapp.com
   heroku config:set CORS_ALLOWED_ORIGINS=https://your-app-name.herokuapp.com,chrome-extension://*
   ```

5. Add a PostgreSQL database:
   ```bash
   heroku addons:create heroku-postgresql:hobby-dev
   ```

6. Deploy the app:
   ```bash
   git push heroku main
   ```

7. Create a superuser on Heroku:
   ```bash
   heroku run python manage.py createsuperuser
   ```

8. Generate an API key:
   ```bash
   heroku run python manage.py create_api_key --username youruser
   ```

### Chrome Extension Deployment

1. Update the API endpoint URLs in the extension:
   - Edit `popup.js` and `background.js` to replace `http://localhost:8000` with your deployed backend URL
   - Update the dashboard links in `popup.html` to point to your deployed dashboard

2. Zip the extension directory for distribution:
   ```bash
   cd chrome_extension
   zip -r ../authentic-dashboard-extension.zip *
   ```

3. Upload to Chrome Web Store (for distribution) or continue using in Developer Mode

## Testing Without User Authentication

During development, you can test the system without full user authentication:

1. Make sure DEBUG is set to True in settings.py
2. Create at least one user in the system
3. The API will default to using the first user when no API key is provided (in DEBUG mode only)

## Technologies Used

- **Backend**: Python / Django
- **Database**: SQLite (development), PostgreSQL (production)
- **Frontend**: JavaScript, HTML/CSS (Django templates)
- **Chrome Extension**: JavaScript, Chrome Extension APIs
- **Machine Learning**: Basic ML algorithms for content analysis (sentiment analysis, topic classification)
- **Deployment**: Heroku ready

## Next Steps

- Implement comprehensive user authentication
- Add more machine learning models for better content categorization
- Expand to more social platforms
- Create a mobile application
- Build a weekly "authenticity digest" or vibe score report

## License

MIT License

## Attribution

Created by [Your Name]. Inspired by ongoing conversations about authenticity, digital overload, and the need for a better online experience.
