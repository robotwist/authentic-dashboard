#!/usr/bin/env python3
"""
Create placeholder icon files for Chrome extension
"""
import os
from PIL import Image, ImageDraw

def create_icon(size, output_path):
    """Create a simple icon with the given size"""
    # Create a new image with a blue background
    img = Image.new('RGBA', (size, size), (67, 97, 238, 255))
    draw = ImageDraw.Draw(img)
    
    # Add a simple white check mark
    line_width = max(int(size * 0.1), 1)
    draw.line([(size * 0.3, size * 0.5), 
               (size * 0.45, size * 0.65), 
               (size * 0.7, size * 0.35)], 
              fill=(255, 255, 255), width=line_width)
    
    # Save the image
    img.save(output_path)
    print(f"Created {output_path}")

def main():
    """Main function to create all icon sizes"""
    # Ensure we're in the right directory
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    # Create icons of different sizes
    extension_dir = "chrome_extension"
    icon_sizes = [16, 48, 128]
    
    for size in icon_sizes:
        output_path = os.path.join(extension_dir, f"icon{size}.png")
        create_icon(size, output_path)

if __name__ == "__main__":
    main() 