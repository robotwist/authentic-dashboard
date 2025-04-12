"""
Collection Scheduler - Automated scheduling of social media collection jobs
"""

import asyncio
import json
import logging
import os
import signal
import sys
import time
from datetime import datetime, timedelta
from typing import Dict, List, Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from playwright.async_api import async_playwright

from playwright.social_media_collector import SocialMediaCollector

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("scheduler.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("scheduler")

class CollectionScheduler:
    """
    Scheduler for social media collection jobs.
    Manages periodic collection from different platforms
    and handles job scheduling, execution, and monitoring.
    """
    
    DEFAULT_CONFIG = {
        "data_dir": "./data",
        "headless": True,
        "api_key": "",
        "api_endpoint": "http://localhost:8000/api/collect-posts/",
        "platforms": ["facebook", "instagram", "linkedin", "twitter"],
        "posts_per_platform": 20,
        "schedules": [
            {
                "name": "hourly_collection",
                "platforms": ["facebook", "linkedin"],
                "cron": "0 * * * *",  # Every hour
                "posts_per_platform": 10
            },
            {
                "name": "daily_collection",
                "platforms": ["facebook", "instagram", "linkedin", "twitter"],
                "cron": "0 10 * * *",  # Every day at 10:00 AM
                "posts_per_platform": 50
            },
            {
                "name": "weekly_deep_collection",
                "platforms": ["facebook", "instagram", "linkedin", "twitter"],
                "cron": "0 12 * * 0",  # Every Sunday at 12:00 PM
                "posts_per_platform": 100
            }
        ]
    }
    
    def __init__(self, config_file: str = "scheduler_config.json"):
        """
        Initialize the collection scheduler.
        
        Args:
            config_file: Path to configuration file
        """
        self.config_file = config_file
        self.config = self._load_config()
        self.scheduler = AsyncIOScheduler()
        self.collector = None
        self.job_history = []
        
        # Create data directory if it doesn't exist
        os.makedirs(self.config["data_dir"], exist_ok=True)
    
    def _load_config(self) -> Dict:
        """
        Load configuration from file or initialize with defaults.
        
        Returns:
            Configuration dictionary
        """
        try:
            if os.path.exists(self.config_file):
                with open(self.config_file, 'r') as f:
                    config = json.load(f)
                logger.info(f"Loaded configuration from {self.config_file}")
                return config
        except Exception as e:
            logger.error(f"Error loading configuration: {str(e)}")
        
        # Use default configuration if loading fails
        logger.info("Using default configuration")
        return self.DEFAULT_CONFIG.copy()
    
    def _save_config(self):
        """Save configuration to file."""
        try:
            with open(self.config_file, 'w') as f:
                json.dump(self.config, f, indent=2)
            logger.info(f"Saved configuration to {self.config_file}")
        except Exception as e:
            logger.error(f"Error saving configuration: {str(e)}")
    
    async def initialize(self):
        """Initialize scheduler and collector."""
        logger.info("Initializing scheduler")
        
        # Create collector
        self.collector = SocialMediaCollector(
            data_dir=self.config["data_dir"],
            headless=self.config["headless"]
        )
        
        # Set API configuration
        if self.config["api_key"] and self.config["api_endpoint"]:
            self.collector.set_api_config(
                self.config["api_key"],
                self.config["api_endpoint"]
            )
        
        # Initialize collector
        await self.collector.initialize()
        
        # Schedule jobs
        self._schedule_jobs()
    
    def _schedule_jobs(self):
        """Schedule collection jobs based on configuration."""
        logger.info("Scheduling collection jobs")
        
        # Clear existing jobs
        self.scheduler.remove_all_jobs()
        
        # Schedule collection jobs
        for schedule in self.config["schedules"]:
            job_id = schedule["name"]
            platforms = schedule.get("platforms", self.config["platforms"])
            posts_per_platform = schedule.get("posts_per_platform", self.config["posts_per_platform"])
            cron_expression = schedule["cron"]
            
            # Add job
            self.scheduler.add_job(
                self._run_collection_job,
                CronTrigger.from_crontab(cron_expression),
                id=job_id,
                name=job_id,
                kwargs={
                    "job_id": job_id,
                    "platforms": platforms,
                    "posts_per_platform": posts_per_platform
                },
                replace_existing=True
            )
            
            logger.info(f"Scheduled job {job_id} with cron: {cron_expression}")
    
    async def _run_collection_job(self, job_id: str, platforms: List[str], posts_per_platform: int):
        """
        Run a collection job.
        
        Args:
            job_id: Job identifier
            platforms: List of platforms to collect from
            posts_per_platform: Number of posts to collect per platform
        """
        logger.info(f"Running collection job {job_id}")
        
        start_time = datetime.now()
        
        # Initialize collector if needed
        if not self.collector:
            logger.info("Collector not initialized, initializing now")
            self.collector = SocialMediaCollector(
                data_dir=self.config["data_dir"],
                headless=self.config["headless"]
            )
            
            # Set API configuration
            if self.config["api_key"] and self.config["api_endpoint"]:
                self.collector.set_api_config(
                    self.config["api_key"],
                    self.config["api_endpoint"]
                )
            
            # Initialize collector
            await self.collector.initialize()
        
        try:
            # Run collection job
            results = await self.collector.run_collection_job(
                platforms=platforms,
                posts_per_platform=posts_per_platform
            )
            
            # Calculate job duration
            end_time = datetime.now()
            duration = end_time - start_time
            
            # Record job history
            job_record = {
                "job_id": job_id,
                "start_time": start_time.isoformat(),
                "end_time": end_time.isoformat(),
                "duration_seconds": duration.total_seconds(),
                "platforms": platforms,
                "posts_per_platform": posts_per_platform,
                "results": results
            }
            
            self.job_history.append(job_record)
            
            # Trim job history (keep last 100 jobs)
            if len(self.job_history) > 100:
                self.job_history = self.job_history[-100:]
            
            # Save job history
            self._save_job_history()
            
            logger.info(f"Job {job_id} completed in {duration.total_seconds():.2f} seconds")
            logger.info(f"Collected total: {results['summary']['total_collected']} posts")
            
        except Exception as e:
            logger.error(f"Error running job {job_id}: {str(e)}")
    
    def _save_job_history(self):
        """Save job history to file."""
        try:
            history_file = os.path.join(self.config["data_dir"], "job_history.json")
            with open(history_file, 'w') as f:
                json.dump(self.job_history, f, indent=2)
            logger.info(f"Saved job history to {history_file}")
        except Exception as e:
            logger.error(f"Error saving job history: {str(e)}")
    
    def start(self):
        """Start the scheduler."""
        logger.info("Starting scheduler")
        self.scheduler.start()
    
    def stop(self):
        """Stop the scheduler."""
        logger.info("Stopping scheduler")
        self.scheduler.shutdown()
    
    async def close(self):
        """Close scheduler and collector."""
        logger.info("Closing scheduler")
        
        # Stop scheduler
        self.stop()
        
        # Close collector
        if self.collector:
            await self.collector.close()
    
    def update_config(self, new_config: Dict):
        """
        Update configuration and reschedule jobs.
        
        Args:
            new_config: New configuration dictionary
        """
        logger.info("Updating configuration")
        
        # Update configuration
        self.config.update(new_config)
        
        # Save configuration
        self._save_config()
        
        # Reschedule jobs
        self._schedule_jobs()
    
    async def run_manual_job(self, job_name: str, platforms: List[str] = None, posts_per_platform: int = None):
        """
        Run a collection job manually.
        
        Args:
            job_name: Name for the manual job
            platforms: List of platforms to collect from (defaults to all configured platforms)
            posts_per_platform: Number of posts to collect per platform (defaults to configured value)
        """
        if platforms is None:
            platforms = self.config["platforms"]
        
        if posts_per_platform is None:
            posts_per_platform = self.config["posts_per_platform"]
        
        logger.info(f"Running manual job {job_name}")
        
        # Run job
        await self._run_collection_job(
            job_id=f"manual_{job_name}",
            platforms=platforms,
            posts_per_platform=posts_per_platform
        )
    
    def get_job_history(self):
        """
        Get job history.
        
        Returns:
            List of job history records
        """
        return self.job_history
    
    def get_status(self):
        """
        Get scheduler status.
        
        Returns:
            Dictionary with scheduler status
        """
        return {
            "scheduler_running": self.scheduler.running,
            "next_job_times": {
                job.id: job.next_run_time.isoformat() 
                for job in self.scheduler.get_jobs() 
                if job.next_run_time
            },
            "job_count": len(self.scheduler.get_jobs()),
            "last_job": self.job_history[-1] if self.job_history else None
        }


# Helper function to run scheduler as a standalone script
async def main():
    """Run scheduler as a standalone script."""
    # Parse command line arguments
    import argparse
    parser = argparse.ArgumentParser(description="Social Media Collection Scheduler")
    parser.add_argument("--config", default="scheduler_config.json", help="Path to configuration file")
    parser.add_argument("--run-now", action="store_true", help="Run a collection job immediately")
    args = parser.parse_args()
    
    # Create scheduler
    scheduler = CollectionScheduler(config_file=args.config)
    
    # Register signal handlers
    def handle_shutdown(sig, frame):
        logger.info(f"Received signal {sig}, shutting down")
        loop = asyncio.get_event_loop()
        loop.create_task(shutdown())
    
    async def shutdown():
        await scheduler.close()
        loop = asyncio.get_event_loop()
        loop.stop()
    
    # Register signal handlers
    signal.signal(signal.SIGINT, handle_shutdown)
    signal.signal(signal.SIGTERM, handle_shutdown)
    
    try:
        # Initialize scheduler
        await scheduler.initialize()
        
        # Run a job immediately if requested
        if args.run_now:
            await scheduler.run_manual_job("startup_job")
        
        # Start scheduler
        scheduler.start()
        
        # Print status
        print(f"Scheduler started with {len(scheduler.scheduler.get_jobs())} jobs")
        for job in scheduler.scheduler.get_jobs():
            next_run = job.next_run_time.strftime("%Y-%m-%d %H:%M:%S") if job.next_run_time else "Not scheduled"
            print(f"  - {job.id}: Next run at {next_run}")
        
        # Keep running until interrupted
        while True:
            await asyncio.sleep(1)
            
    except KeyboardInterrupt:
        logger.info("Interrupted by user")
    finally:
        # Clean up
        await scheduler.close()

if __name__ == "__main__":
    # Run main function
    asyncio.run(main()) 