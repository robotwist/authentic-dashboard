#!/bin/bash

# Navigate to the chrome_extension directory
cd chrome_extension || exit

# Create a 16x16 icon
convert -size 16x16 xc:none -fill "#4361ee" -draw "circle 8,8 8,0" -fill white -stroke white -strokewidth 1.5 -draw "path 'M 5,8 L 7,10 L 11,6'" icon16.png

# Create a 48x48 icon
convert -size 48x48 xc:none -fill "#4361ee" -draw "circle 24,24 24,0" -fill white -stroke white -strokewidth 4 -draw "path 'M 14,24 L 21,31 L 34,17'" icon48.png

# Create a 128x128 icon
convert -size 128x128 xc:none -fill "#4361ee" -draw "circle 64,64 64,0" -fill white -stroke white -strokewidth 10 -draw "path 'M 38,64 L 58,84 L 90,46'" icon128.png

echo "Icons created in the chrome_extension directory" 