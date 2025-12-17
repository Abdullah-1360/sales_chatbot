#!/bin/bash

# Quick test for the working start_autossl_check_for_one_user method
API_URL="http://localhost:3000/api"
SERVER_NAME="pcp3"
USERNAME="x98aailqrs"

echo "🎯 Quick Test: start_autossl_check_for_one_user"
echo "=============================================="
echo "Server: $SERVER_NAME"
echo "Username: $USERNAME"
echo ""

# Test the working method directly
echo "Testing start_autossl_check_for_one_user with username parameter..."

response=$(curl -s -X POST "$API_URL/test-start-autossl" \
    -H "Content-Type: application/json" \
    -d "{\"serverName\":\"$SERVER_NAME\",\"username\":\"$USERNAME\"}")

# Extract test3b results (the working method)
test3b_success=$(echo "$response" | jq -r '.analysis.test3b.success // false' 2>/dev/null)
test3b_method=$(echo "$response" | jq -r '.analysis.test3b.method // "unknown"' 2>/dev/null)
test3b_result=$(echo "$response" | jq -r '.analysis.test3b.result.metadata.result // "unknown"' 2>/dev/null)
test3b_reason=$(echo "$response" | jq -r '.analysis.test3b.result.metadata.reason // "No reason"' 2>/dev/null)

echo ""
echo "🔍 Test Results for start_autossl_check_for_one_user:"
echo "Success: $test3b_success"
echo "Method: $test3b_method"
echo "API Result: $test3b_result"
echo "Reason: $test3b_reason"

if [ "$test3b_success" = "true" ]; then
    echo ""
    echo "🎉 SUCCESS! start_autossl_check_for_one_user is working!"
    echo "✅ This method should be used as the primary AutoSSL trigger"
    echo ""
    echo "📋 Implementation Details:"
    echo "- Method: start_autossl_check_for_one_user"
    echo "- Parameter: {\"username\": \"$USERNAME\"}"
    echo "- API Version: 1"
    echo "- Server: $SERVER_NAME"
elif [ "$test3b_result" = "1" ]; then
    echo ""
    echo "✅ API call successful (result=1) but marked as not success in our test"
    echo "This might still be working - check the full response"
else
    echo ""
    echo "❌ Method failed or returned result=0"
    echo "Check the reason above for details"
fi

echo ""
echo "🔍 Full test3b response:"
echo "$response" | jq '.analysis.test3b' 2>/dev/null || echo "Could not parse response"

echo ""
echo "📊 Summary of all methods:"
echo "$response" | jq '.summary' 2>/dev/null || echo "Could not parse summary"