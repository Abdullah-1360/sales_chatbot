#!/bin/bash

# Frontend Deployment Script for cPanel
# This script builds the frontend and prepares it for deployment

echo "🚀 Starting frontend deployment preparation..."

# Check if .env.production exists
if [ ! -f .env.production ]; then
    echo "⚠️  Warning: .env.production not found!"
    echo "📝 Please create .env.production with your backend URL"
    echo "   Example: VITE_API_URL=https://api.yourdomain.com"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Clean previous build
echo "🧹 Cleaning previous build..."
rm -rf dist
rm -f dist.zip

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build for production
echo "🔨 Building for production..."
npm run build

# Check if build was successful
if [ ! -d "dist" ]; then
    echo "❌ Build failed! dist folder not created."
    exit 1
fi

echo "✅ Build successful!"

# Create zip file for easy upload
echo "📦 Creating deployment package..."
cd dist
zip -r ../dist.zip .
cd ..

echo "✅ Deployment package created: dist.zip"
echo ""
echo "📋 Next steps:"
echo "1. Login to your cPanel"
echo "2. Go to File Manager"
echo "3. Navigate to public_html (or your domain folder)"
echo "4. Upload dist.zip"
echo "5. Extract dist.zip"
echo "6. Move all files from dist folder to public_html root"
echo "7. Create .htaccess file (see CPANEL_DEPLOYMENT_GUIDE.md)"
echo ""
echo "📁 Files ready in:"
echo "   - dist/ folder (individual files)"
echo "   - dist.zip (compressed for upload)"
echo ""
echo "🎉 Deployment preparation complete!"
