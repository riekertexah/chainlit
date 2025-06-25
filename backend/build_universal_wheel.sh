#!/bin/bash

# echo "Building frontend assets..."
# python build.py

echo "Temporarily disabling build script..."
sed -i.bak '/\[tool.poetry.build\]/,+1d' pyproject.toml

echo "Building universal wheel..."
poetry build -f wheel

echo "Restoring build script..."
mv pyproject.toml.bak pyproject.toml

echo "Universal wheel built successfully!"
ls -la dist/ 