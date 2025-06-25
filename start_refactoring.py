#!/usr/bin/env python3
"""
Authentic Dashboard Refactoring Starter Script

This script helps automate the initial steps of the refactoring process
outlined in REFACTORING_ROADMAP.md
"""

import os
import sys
import subprocess
import shutil
from pathlib import Path
import argparse

def print_step(step_number, description):
    """Print a formatted step description"""
    print(f"\n🔧 STEP {step_number}: {description}")
    print("=" * 60)

def run_command(command, description=""):
    """Run a shell command and handle errors"""
    try:
        if description:
            print(f"Running: {description}")
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        if result.stdout:
            print(result.stdout)
        return True
    except subprocess.CalledProcessError as e:
        print(f"Error: {e}")
        if e.stderr:
            print(f"stderr: {e.stderr}")
        return False

def disable_current_extension():
    """Disable the current Chrome extension auto-collection"""
    print_step(1, "EMERGENCY: Disable Current Detection Vectors")
    
    # Check if Chrome extension exists
    extension_dir = Path("chrome_extension")
    if extension_dir.exists():
        # Backup current manifest
        manifest_file = extension_dir / "manifest.json"
        if manifest_file.exists():
            backup_file = extension_dir / "manifest_backup.json"
            shutil.copy(manifest_file, backup_file)
            print(f"✅ Backed up manifest.json to {backup_file}")
        
        # Create a minimal manifest to disable auto-collection
        minimal_manifest = {
            "manifest_version": 3,
            "name": "Authentic Dashboard (DISABLED)",
            "version": "1.0.0",
            "description": "DISABLED - Under refactoring",
            "permissions": [],
            "host_permissions": []
        }
        
        with open(manifest_file, 'w') as f:
            import json
            json.dump(minimal_manifest, f, indent=2)
        
        print("✅ Disabled Chrome extension auto-collection")
        print("⚠️  Extension is now DISABLED to prevent detection")
    else:
        print("❌ Chrome extension directory not found")

def create_directory_structure():
    """Create the new modular directory structure"""
    print_step(2, "Create New App Structure")
    
    directories = [
        "apps",
        "apps/core",
        "apps/collection", 
        "apps/processing",
        "apps/api",
        "apps/dashboard",
        "apps/analytics",
        "collection",
        "collection/stealth",
        "collection/proxies",
        "collection/sessions",
        "brandsensor/views",
        "config/stealth",
        "tests/stealth",
        "tests/collection",
        "logs"
    ]
    
    for directory in directories:
        Path(directory).mkdir(parents=True, exist_ok=True)
        # Create __init__.py for Python packages
        if not directory.startswith(('tests', 'logs', 'config')):
            init_file = Path(directory) / "__init__.py"
            if not init_file.exists():
                init_file.touch()
        print(f"✅ Created directory: {directory}")

def split_monolithic_views():
    """Split the large views.py file into modules"""
    print_step(3, "Split Monolithic Views File")
    
    views_file = Path("brandsensor/views.py")
    views_dir = Path("brandsensor/views")
    
    if not views_file.exists():
        print("❌ views.py not found")
        return
    
    if views_dir.exists() and (views_dir / "__init__.py").exists():
        print("✅ Views already split into modules")
        return
    
    # The auth_views.py was already created, so we'll note that
    print("✅ Auth views extracted to brandsensor/views/auth_views.py")
    
    # Create other view modules (placeholders for now)
    modules = [
        "dashboard_views.py",
        "api_views.py", 
        "ml_views.py",
        "post_views.py"
    ]
    
    for module in modules:
        module_file = views_dir / module
        if not module_file.exists():
            with open(module_file, 'w') as f:
                f.write(f'"""\n{module.replace(".py", "").replace("_", " ").title()}\n"""\n\n# TODO: Extract functions from main views.py\n')
            print(f"✅ Created placeholder: {module}")

def setup_stealth_environment():
    """Set up the stealth collection environment"""
    print_step(4, "Setup Stealth Collection Environment")
    
    # Check if virtual environment exists
    venv_path = Path("venv")
    if not venv_path.exists():
        print("Creating virtual environment...")
        if not run_command("python -m venv venv", "Creating virtual environment"):
            print("❌ Failed to create virtual environment")
            return
    
    # Activate virtual environment and install requirements
    activate_script = "venv/bin/activate" if os.name != 'nt' else "venv\\Scripts\\activate"
    
    print("Installing stealth collection requirements...")
    pip_cmd = "venv/bin/pip" if os.name != 'nt' else "venv\\Scripts\\pip"
    
    if Path("requirements_stealth.txt").exists():
        if run_command(f"{pip_cmd} install -r requirements_stealth.txt", 
                      "Installing stealth requirements"):
            print("✅ Stealth requirements installed")
        else:
            print("❌ Failed to install stealth requirements")
    else:
        print("❌ requirements_stealth.txt not found")

def create_configuration_files():
    """Create necessary configuration files"""
    print_step(5, "Create Configuration Files")
    
    # Stealth collection config
    stealth_config = {
        "collection": {
            "max_posts_per_session": 50,
            "session_duration_minutes": 30,
            "rotation_threshold": 10,
            "health_check_interval": 300
        },
        "proxies": {
            "providers": [],
            "max_concurrent": 5,
            "cooldown_seconds": 30
        },
        "platforms": {
            "facebook": {"enabled": True, "max_posts": 100},
            "instagram": {"enabled": True, "max_posts": 100},
            "linkedin": {"enabled": True, "max_posts": 100}
        }
    }
    
    config_file = Path("config/stealth/collection_config.json")
    config_file.parent.mkdir(parents=True, exist_ok=True)
    
    with open(config_file, 'w') as f:
        import json
        json.dump(stealth_config, f, indent=2)
    
    print(f"✅ Created stealth configuration: {config_file}")
    
    # Environment template
    env_template = """# Stealth Collection Environment Variables

# Django Settings
DJANGO_SECRET_KEY=your-secret-key-here
DJANGO_DEBUG=False
ALLOWED_HOSTS=localhost,127.0.0.1

# Database (keep existing or configure new)
DATABASE_URL=sqlite:///db.sqlite3

# Redis (for session management)
REDIS_URL=redis://127.0.0.1:6379/1

# Proxy Providers (uncomment and configure as needed)
# BRIGHTDATA_USERNAME=your-brightdata-username
# BRIGHTDATA_PASSWORD=your-brightdata-password
# OXYLABS_USERNAME=your-oxylabs-username  
# OXYLABS_PASSWORD=your-oxylabs-password

# Stealth Collection Settings
COLLECTION_ENABLED=False  # Enable only when ready
MAX_CONCURRENT_COLLECTIONS=3
COLLECTION_INTERVAL_MINUTES=60

# Monitoring and Logging
SENTRY_DSN=your-sentry-dsn-here
LOG_LEVEL=INFO
"""
    
    env_file = Path(".env.stealth")
    if not env_file.exists():
        with open(env_file, 'w') as f:
            f.write(env_template)
        print(f"✅ Created environment template: {env_file}")

def run_safety_checks():
    """Run safety checks to ensure system is ready"""
    print_step(6, "Safety Checks")
    
    checks = [
        ("Chrome extension disabled", lambda: not Path("chrome_extension/manifest.json").exists() or 
         "DISABLED" in Path("chrome_extension/manifest.json").read_text()),
        ("Virtual environment exists", lambda: Path("venv").exists()),
        ("Directory structure created", lambda: Path("apps/collection").exists()),
        ("Configuration files created", lambda: Path("config/stealth/collection_config.json").exists()),
    ]
    
    all_passed = True
    for check_name, check_func in checks:
        try:
            if check_func():
                print(f"✅ {check_name}")
            else:
                print(f"❌ {check_name}")
                all_passed = False
        except Exception as e:
            print(f"❌ {check_name} - Error: {e}")
            all_passed = False
    
    if all_passed:
        print("\n🎉 All safety checks passed!")
        print("📋 Next steps:")
        print("1. Review REFACTORING_ROADMAP.md")
        print("2. Configure proxy providers in .env.stealth")
        print("3. Test stealth collection in development")
        print("4. Continue with Phase 2 of the roadmap")
    else:
        print("\n⚠️  Some checks failed. Please review and fix issues.")

def main():
    """Main function to orchestrate the refactoring process"""
    parser = argparse.ArgumentParser(description="Start Authentic Dashboard Refactoring")
    parser.add_argument("--skip-extension", action="store_true", 
                       help="Skip disabling Chrome extension")
    parser.add_argument("--skip-install", action="store_true",
                       help="Skip installing Python packages")
    
    args = parser.parse_args()
    
    print("🚀 AUTHENTIC DASHBOARD REFACTORING STARTED")
    print("=" * 60)
    print("This script will prepare your project for the stealth collection refactoring.")
    print("See REFACTORING_ROADMAP.md for the complete plan.")
    print()
    
    # Confirm before proceeding
    if not args.skip_extension:
        response = input("❗ This will DISABLE your Chrome extension. Continue? (y/N): ")
        if response.lower() != 'y':
            print("Aborted.")
            return
    
    try:
        if not args.skip_extension:
            disable_current_extension()
        
        create_directory_structure()
        split_monolithic_views()
        create_configuration_files()
        
        if not args.skip_install:
            setup_stealth_environment()
        
        run_safety_checks()
        
    except KeyboardInterrupt:
        print("\n\n⚠️  Refactoring interrupted by user")
    except Exception as e:
        print(f"\n\n❌ Error during refactoring: {e}")
        print("Please check the error and try again, or run steps manually.")

if __name__ == "__main__":
    main() 