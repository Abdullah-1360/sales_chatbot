#!/bin/bash

echo "🧪 Testing Real-time Dashboard..."
echo ""
echo "📝 Creating test lead..."
echo ""

TIMESTAMP=$(date +%s)
NAME="Test User $TIMESTAMP"
EMAIL="test$TIMESTAMP@example.com"

RESPONSE=$(curl -s -X POST http://localhost:3000/api/leads \
  -H "Content-Type: application/json" \
  -d "{
    \"username\": \"$NAME\",
    \"email\": \"$EMAIL\",
    \"phone\": \"+1234567890\",
    \"description\": \"Automated test lead created at $(date)\"
  }")

SUCCESS=$(echo $RESPONSE | grep -o '"success":true' | wc -l)

if [ $SUCCESS -eq 1 ]; then
    echo "✅ Lead created successfully!"
    echo ""
    echo "📋 Details:"
    echo "   Name: $NAME"
    echo "   Email: $EMAIL"
    echo ""
    echo "👀 Check the dashboard at http://localhost:5174"
    echo "   - Lead should appear at the top"
    echo "   - Browser notification should show"
    echo "   - Sound should play"
    echo ""
else
    echo "❌ Failed to create lead"
    echo ""
    echo "Response:"
    echo $RESPONSE
    echo ""
    echo "Troubleshooting:"
    echo "1. Check if backend is running: ps aux | grep 'node server.js'"
    echo "2. Check if port 3001 is accessible: curl http://localhost:3001/api/health"
    echo "3. Check backend logs for errors"
fi
