"""
Selector Manager - Intelligent CSS selector adaptation system
"""

import json
import os
import time
import logging
from datetime import datetime
from typing import Dict, List, Optional, Tuple, Any

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("selector_manager.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("selector_manager")

class SelectorManager:
    """
    Manages and adapts selectors for social media platforms.
    This class maintains a collection of working selectors, detects when they fail,
    and attempts to find alternative selectors through various strategies.
    """
    
    # Selector storage file path
    SELECTOR_FILE = "selectors.json"
    
    # Default selectors for various platforms
    DEFAULT_SELECTORS = {
        "facebook": {
            "post": [
                "div[role='article']",
                "div.x1yztbdb:not([aria-hidden])",
                "div[data-pagelet^='FeedUnit']"
            ],
            "post_content": [
                "div[data-ad-preview='message']",
                "div.xdj266r",
                "div.x1iorvi4"
            ],
            "post_author": [
                "h3.x1heor9g",
                "span.x193iq5w a",
                "h4 span"
            ],
            "post_timestamp": [
                "span.x4k7w5x a",
                "span.x1i10hfl span",
                "a.x1i10hfl abbr"
            ],
            "engagement_stats": [
                "div.x78zum5 span.x1e558r4",
                "div[aria-label*='reactions']",
                "span.x1e558r4"
            ]
        },
        "instagram": {
            "post": [
                "article._aatb",
                "div._ab6k:not([aria-hidden])",
                "article[role='presentation']"
            ],
            "post_content": [
                "div._a9zs",
                "span._aacl",
                "h1._aacl"
            ],
            "post_author": [
                "a._aaqt",
                "span._aap6 a",
                "div._aaqt"
            ],
            "post_timestamp": [
                "time._aaqe",
                "div._aacl time",
                "a time"
            ],
            "engagement_stats": [
                "section._ae5m button span",
                "section._aamu span._aaql",
                "div._aacl span._aacr"
            ]
        },
        "linkedin": {
            "post": [
                "div.feed-shared-update-v2",
                "div[data-urn]",
                "div.feed-shared-card"
            ],
            "post_content": [
                "div.feed-shared-update-v2__description",
                "span.break-words",
                "div.feed-shared-text"
            ],
            "post_author": [
                "span.feed-shared-actor__name",
                "a.app-aware-link span[aria-hidden]",
                "span.feed-shared-actor__title"
            ],
            "post_timestamp": [
                "span.feed-shared-actor__sub-description",
                "span.visually-hidden",
                "time.feed-shared-actor__sub-description"
            ],
            "engagement_stats": [
                "span.social-details-social-counts__reactions-count",
                "span.social-details-social-counts__count-value",
                "li.social-details-social-counts__item span"
            ]
        },
        "twitter": {
            "post": [
                "article[data-testid='tweet']",
                "div[data-testid='cellInnerDiv']",
                "div[data-testid='tweet']"
            ],
            "post_content": [
                "div[data-testid='tweetText']",
                "div[lang]",
                "div[data-ad-preview='message']"
            ],
            "post_author": [
                "div[data-testid='User-Name'] span.css-901oao",
                "a[role='link'] span.css-901oao",
                "span[data-testid='UserName']"
            ],
            "post_timestamp": [
                "time",
                "a[href*='/status/'] time",
                "span[data-testid='timestamp']"
            ],
            "engagement_stats": [
                "div[data-testid='like']",
                "div[data-testid='reply']",
                "div[role='group'] div[data-testid]"
            ]
        }
    }
    
    def __init__(self, data_dir: str = "."):
        """
        Initialize the selector manager.
        
        Args:
            data_dir: Directory to store selector data
        """
        self.data_dir = data_dir
        self.selectors = {}
        self.working_selectors = {}
        self.selector_performance = {}
        self.last_updated = {}
        
        # Ensure the data directory exists
        os.makedirs(data_dir, exist_ok=True)
        
        # Load existing selectors or initialize with defaults
        self._load_selectors()
    
    def _get_selector_file_path(self) -> str:
        """Get the full path to the selector JSON file."""
        return os.path.join(self.data_dir, self.SELECTOR_FILE)
    
    def _load_selectors(self):
        """Load selectors from file or initialize with defaults."""
        file_path = self._get_selector_file_path()
        
        if os.path.exists(file_path):
            try:
                with open(file_path, 'r') as f:
                    data = json.load(f)
                    self.selectors = data.get('selectors', {})
                    self.working_selectors = data.get('working_selectors', {})
                    self.selector_performance = data.get('selector_performance', {})
                    self.last_updated = data.get('last_updated', {})
                logger.info(f"Loaded selectors from {file_path}")
            except (json.JSONDecodeError, IOError) as e:
                logger.error(f"Error loading selectors: {e}")
                self._initialize_defaults()
        else:
            logger.info("No selector file found, initializing defaults")
            self._initialize_defaults()
    
    def _initialize_defaults(self):
        """Initialize selectors with default values."""
        self.selectors = self.DEFAULT_SELECTORS.copy()
        self.working_selectors = {}
        self.selector_performance = {}
        self.last_updated = {}
        
        # Initialize working selectors with the first selector from each category
        for platform, categories in self.selectors.items():
            self.working_selectors[platform] = {}
            self.selector_performance[platform] = {}
            for category, selector_list in categories.items():
                if selector_list:
                    self.working_selectors[platform][category] = selector_list[0]
                    self.selector_performance[platform][category] = {
                        selector: {"success": 0, "failure": 0, "last_success": None}
                        for selector in selector_list
                    }
        
        self.last_updated = {platform: datetime.now().isoformat() for platform in self.selectors}
        self._save_selectors()
    
    def _save_selectors(self):
        """Save selectors to file."""
        file_path = self._get_selector_file_path()
        
        data = {
            'selectors': self.selectors,
            'working_selectors': self.working_selectors,
            'selector_performance': self.selector_performance,
            'last_updated': self.last_updated
        }
        
        try:
            with open(file_path, 'w') as f:
                json.dump(data, f, indent=2)
            logger.info(f"Saved selectors to {file_path}")
        except IOError as e:
            logger.error(f"Error saving selectors: {e}")
    
    def get_selector(self, platform: str, category: str) -> str:
        """
        Get the current working selector for a platform and category.
        
        Args:
            platform: Social media platform (facebook, instagram, etc.)
            category: Element category (post, post_content, etc.)
            
        Returns:
            Current working selector string
        """
        if (platform in self.working_selectors and 
            category in self.working_selectors[platform]):
            return self.working_selectors[platform][category]
        
        # If no working selector, try to get the first one from defaults
        if (platform in self.selectors and 
            category in self.selectors[platform] and
            self.selectors[platform][category]):
            selector = self.selectors[platform][category][0]
            # Initialize working selector
            if platform not in self.working_selectors:
                self.working_selectors[platform] = {}
            self.working_selectors[platform][category] = selector
            self._save_selectors()
            return selector
        
        # If still not found, raise an error
        raise ValueError(f"No selector found for {platform}/{category}")
    
    def report_success(self, platform: str, category: str, selector: str, count: int = 1):
        """
        Report that a selector was used successfully.
        
        Args:
            platform: Social media platform
            category: Element category
            selector: The selector that worked
            count: Number of successful uses (default: 1)
        """
        if platform not in self.selector_performance:
            self.selector_performance[platform] = {}
        
        if category not in self.selector_performance[platform]:
            self.selector_performance[platform][category] = {}
        
        if selector not in self.selector_performance[platform][category]:
            self.selector_performance[platform][category][selector] = {
                "success": 0, "failure": 0, "last_success": None
            }
        
        # Update performance metrics
        self.selector_performance[platform][category][selector]["success"] += count
        self.selector_performance[platform][category][selector]["last_success"] = datetime.now().isoformat()
        
        # Ensure this is the working selector
        if (platform not in self.working_selectors or
            category not in self.working_selectors[platform] or
            self.working_selectors[platform][category] != selector):
            
            if platform not in self.working_selectors:
                self.working_selectors[platform] = {}
            
            self.working_selectors[platform][category] = selector
            logger.info(f"Updated working selector for {platform}/{category}: {selector}")
        
        # Save changes
        self.last_updated[platform] = datetime.now().isoformat()
        self._save_selectors()
    
    def report_failure(self, platform: str, category: str, selector: str):
        """
        Report that a selector failed to work.
        
        Args:
            platform: Social media platform
            category: Element category
            selector: The selector that failed
        """
        if platform not in self.selector_performance:
            self.selector_performance[platform] = {}
        
        if category not in self.selector_performance[platform]:
            self.selector_performance[platform][category] = {}
        
        if selector not in self.selector_performance[platform][category]:
            self.selector_performance[platform][category][selector] = {
                "success": 0, "failure": 0, "last_success": None
            }
        
        # Update performance metrics
        self.selector_performance[platform][category][selector]["failure"] += 1
        
        # If this was the working selector, try to find a better one
        if (platform in self.working_selectors and
            category in self.working_selectors[platform] and
            self.working_selectors[platform][category] == selector):
            
            self._find_alternative_selector(platform, category)
        
        # Save changes
        self.last_updated[platform] = datetime.now().isoformat()
        self._save_selectors()
    
    def _find_alternative_selector(self, platform: str, category: str):
        """
        Find an alternative selector when the current one fails.
        
        Args:
            platform: Social media platform
            category: Element category
        """
        if (platform not in self.selectors or
            category not in self.selectors[platform]):
            logger.error(f"No alternatives for {platform}/{category}")
            return
        
        alternatives = self.selectors[platform][category]
        current = self.working_selectors[platform][category]
        
        # Try to find a selector that has been successful before
        best_alternative = None
        best_score = -1
        
        for selector in alternatives:
            if selector == current:
                continue
            
            if selector in self.selector_performance[platform][category]:
                perf = self.selector_performance[platform][category][selector]
                # Simple scoring: success count - failure count
                score = perf["success"] - perf["failure"]
                
                if score > best_score:
                    best_score = score
                    best_alternative = selector
        
        # If no good alternative found, just take the next one in the list
        if best_alternative is None:
            current_index = alternatives.index(current) if current in alternatives else -1
            if current_index < len(alternatives) - 1:
                best_alternative = alternatives[current_index + 1]
            else:
                best_alternative = alternatives[0]
        
        # Update working selector
        self.working_selectors[platform][category] = best_alternative
        logger.info(f"Switched selector for {platform}/{category} from {current} to {best_alternative}")
    
    def add_selector(self, platform: str, category: str, selector: str):
        """
        Add a new selector to the collection.
        
        Args:
            platform: Social media platform
            category: Element category
            selector: The new selector to add
        """
        if platform not in self.selectors:
            self.selectors[platform] = {}
        
        if category not in self.selectors[platform]:
            self.selectors[platform][category] = []
        
        if selector not in self.selectors[platform][category]:
            self.selectors[platform][category].append(selector)
            
            # Initialize performance metrics
            if platform not in self.selector_performance:
                self.selector_performance[platform] = {}
            
            if category not in self.selector_performance[platform]:
                self.selector_performance[platform][category] = {}
            
            self.selector_performance[platform][category][selector] = {
                "success": 0, "failure": 0, "last_success": None
            }
            
            logger.info(f"Added new selector for {platform}/{category}: {selector}")
            self.last_updated[platform] = datetime.now().isoformat()
            self._save_selectors()
    
    def get_all_selectors(self, platform: str = None) -> Dict:
        """
        Get all selectors, optionally filtered by platform.
        
        Args:
            platform: Optional platform filter
            
        Returns:
            Dictionary of selectors
        """
        if platform:
            return self.selectors.get(platform, {})
        return self.selectors
    
    def get_selector_status(self, platform: str = None) -> Dict:
        """
        Get status information about selectors.
        
        Args:
            platform: Optional platform filter
            
        Returns:
            Dictionary with selector status information
        """
        status = {
            "working_selectors": self.working_selectors,
            "last_updated": self.last_updated
        }
        
        if platform:
            return {
                "working_selectors": status["working_selectors"].get(platform, {}),
                "last_updated": status["last_updated"].get(platform, None)
            }
        
        return status 