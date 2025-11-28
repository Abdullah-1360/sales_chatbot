#!/bin/bash

TIMESTAMP=$(date +%s)
NAME="RealTime User $TIMESTAMP"
EMAIL="realtime$TIMESTAMP@example.com"

echo "🚀 Creating a FRESH lead for real-time testing..."
echo ""
echo "📋 Lead Details:"
echo "   Name: $NAME"
echo "   Email: $EMAIL"
echo ""

curl -s -X POST http://localhost:3000/api/leads \
  -H "Content-Type: application/json" \
  -d "{
    \"username\": \"$NAME\",
    \"email\": \"$EMAIL\",
    \"phone\": \"+$(date +%s | tail -c 11)\",
    \"description\": \"Fresh lead created at $(date) for real-time testing\"
  }" | jq -r 'if .success then "✅ SUCCESS! Lead created and broadcast via WebSocket" else "❌ FAILED: " + (.error // "Unknown error") end'

echo ""
echo "👀 Check your dashboard NOW - the lead should appear instantly!"
echo "   - No page refresh needed"
echo "   - Should show notification"
echo "   - Should play sound (if you clicked on page)"
echo ""
