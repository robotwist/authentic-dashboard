# Authentic Dashboard

A personalized dashboard experience layered on top of social platforms like Facebook, Instagram, and LinkedIn. This project reclaims the user experience by giving people the ability to filter and reframe their online environment based on what they actually want to see.

## Description

People rate their time on social platforms as a 2 or 3 out of 10, yet they use them daily. This project is a response to that contradiction — a tool to make these platforms livable again. It lets users bypass algorithmic feeds and manipulative design by creating modes that display only the content they value. This isn’t a boycott — it’s a lens for clarity.

This is part of a broader effort to build a cleaner, more humane internet. The dashboard is paired with a Chrome extension that scans platform content using custom sensors to detect and log behavior patterns like spam, buzzwords, urgency traps, promotional language, and more.

## Features

- **Friends Only Mode**: Filter your feed to show content only from your first-degree friends.
- **Family Only Mode** *(in development)*: Focus only on posts from your chosen family group.
- **Interest Modes**: Tailor your feed around specific topics like “Running Shoes Mode,” displaying posts from trusted sources, brands, and communities you’ve approved.
- **Brand Trust Filter**: A mode that blocks promotional noise and only shows content from selected brands you've vetted.
- **Bizfluencer Detection**: A LinkedIn-specific sensor that detects performative buzzword-heavy posts and filters them out.
- **Sensor-based Content Logging**: Chrome extension detects manipulative or unwanted content patterns and logs them to a Django backend.
- **Authenticity-Driven UI**: Users see their social content reframed through a personal lens rather than the algorithm’s.

## Project Structure

authentic_dashboard_project/ ├── chrome_extension/ # Browser extension with sensors and content analysis │ ├── manifest.json │ ├── popup.js / popup.html │ ├── content.js │ └── sensors/ ├── config_project/ # Django project settings ├── brandsensor/ # Django app (models, views, templates) ├── templates/ │ └── brandsensor/dashboard.html ├── manage.py ├── db.sqlite3 ├── requirements.txt ├── venv/ └── README.md


## Getting Started

1. Clone the repository
2. Create and activate a virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
Dashboard UI
The dashboard is rendered through Django templates and reflects your current filter settings (like Friends Only Mode). Data is logged from the Chrome extension and displayed in the interface, helping users understand and shape their feed experience.

Technologies Used
Python / Django

PostgreSQL (or SQLite for local testing)

JavaScript (Vanilla + Chrome Extension APIs)

HTML/CSS (Django templates)

Git + GitHub for version control

Goals
Perfect and popularize a personalized dashboard experience that actually makes people happy and serves them well.

Let people experience a version of social media that shows only what they want.

Provide actionable insight from sensor data (who/what is worth engaging with).

Build toward a broader movement to reframe and reclaim the internet.

Next Steps
Add additional modes (Family Only, Interests, Trusted Creators)

Allow users to define their own sensor rules

Build a weekly “authenticity digest” or vibe score report

Deploy online for others to install and use with real accounts

Explore open collaboration with others interested in the ethical web

License
MIT License (or add your preferred license)

Attribution
Created by [Your Name]. Inspired by ongoing conversations about authenticity, digital overload, and the need for a better online experience.

yaml
Copy
Edit

---

Let me know if you’d like:
- A section for collaborators or a contributors table
- To swap SQLite for Postgres and update the setup instructions
- A polished project pitch for your course presentation

And I’ll keep pushing it forward with you, one clean, rebellious filter at a time.
