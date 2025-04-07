#!/usr/bin/env python
import sys
print(f"Python path: {sys.executable}")
print(f"Python version: {sys.version}")
print(f"Prefix: {sys.prefix}")
print(f"Path: {sys.path}")

try:
    import corsheaders
    print("✅ corsheaders module found")
except ImportError as e:
    print(f"❌ Import Error: {e}")

try:
    import django
    print(f"✅ Django version: {django.__version__}")
except ImportError as e:
    print(f"❌ Import Error: {e}") 