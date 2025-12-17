#!/bin/bash

# Specific Test for WHM API v1 start_autossl_check
# This script tests the start_autossl_check method with different parameter combinations

# Configuration
API_URL="http://localhost:3000/api"
SERVER_NAME="pcp3"
USERNAME="x98aailqrs"
DOMAIN="uzairfarooq.pk"  # Optional - set to empty string if not needed

echo "🧪 WHM API v1 AutoSSL Methods Test (Extended)"
echo "============================================="
echo "Testing: start_autossl_check_for_one_user (PRIMARY METHOD)"
echo "Also testing: reset_autossl_provider, run_autossl_check_for_user"
echo "Plus fallbacks: autossl_check_all_users, start_autossl_check"
echo "API URL: $API_URL"
echo "Server: $SERVER_NAME"
echo "Username: $USERNAME"
echo "Domain: $DOMAIN"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test the start_autossl_check method
echo -e "${BLUE}🚀 Testing start_autossl_check with comprehensive parameter testing${NC}"

if [ -n "$DOMAIN" ]; then
    # Test with domain
    response=$(curl -s -X POST "$API_URL/test-start-autossl" \
        -H "Content-Type: application/json" \
        -d "{\"serverName\":\"$SERVER_NAME\",\"username\":\"$USERNAME\",\"domain\":\"$DOMAIN\"}")
else
    # Test without domain
    response=$(curl -s -X POST "$API_URL/test-start-autossl" \
        -H "Content-Type: application/json" \
        -d "{\"serverName\":\"$SERVER_NAME\",\"username\":\"$USERNAME\"}")
fi

echo -e "${BLUE}📊 Test Results:${NC}"
echo "================"

# Check if the response contains success: true
if echo "$response" | grep -q '"success":true'; then
    echo -e "${GREEN}✅ Test completed successfully${NC}"
    
    # Extract key information
    api_exists=$(echo "$response" | jq -r '.summary.apiExists // false' 2>/dev/null)
    working_configs=$(echo "$response" | jq -r '.summary.workingConfigurations // 0' 2>/dev/null)
    recommended_config=$(echo "$response" | jq -r '.summary.recommendedConfig // null' 2>/dev/null)
    recommendation=$(echo "$response" | jq -r '.recommendation // "No recommendation"' 2>/dev/null)
    
    echo ""
    echo -e "${BLUE}📋 Summary:${NC}"
    echo "API Exists: $api_exists"
    echo "Working Configurations: $working_configs"
    echo "Recommended Config: $recommended_config"
    echo "Recommendation: $recommendation"
    
    if [ "$working_configs" -gt 0 ]; then
        echo ""
        echo -e "${GREEN}🎉 SUCCESS: AutoSSL methods are working!${NC}"
        echo -e "${GREEN}Use this configuration in your code:${NC}"
        echo "$recommended_config"
        
        # Show specific method results
        echo ""
        echo -e "${BLUE}🔍 Key Method Results:${NC}"
        echo "start_autossl_check_for_one_user (test3b): $(echo "$response" | jq -r '.analysis.test3b.success // false' 2>/dev/null)"
        echo "reset_autossl_provider (test7): $(echo "$response" | jq -r '.analysis.test7.success // false' 2>/dev/null)"
        echo "run_autossl_check_for_user (test10): $(echo "$response" | jq -r '.analysis.test10.success // false' 2>/dev/null)"
        
    elif [ "$api_exists" = "true" ]; then
        echo ""
        echo -e "${YELLOW}⚠️ PARTIAL: API exists but no working configurations found${NC}"
        echo "The API is available but may require different parameters or permissions"
    else
        echo ""
        echo -e "${RED}❌ FAILED: AutoSSL APIs not available on this server${NC}"
    fi
    
else
    echo -e "${RED}❌ Test failed${NC}"
    echo "$response" | jq '.error // "Unknown error"' 2>/dev/null || echo "$response"
fi

echo ""
echo -e "${BLUE}🔍 Full Response Details:${NC}"
echo "========================="
echo "$response" | jq '.' 2>/dev/null || echo "$response"

echo ""
echo -e "${BLUE}📋 Getting API Information${NC}"
echo "=========================="

# Get API info
info_response=$(curl -s "$API_URL/test-start-autossl/info?serverName=$SERVER_NAME")

if echo "$info_response" | grep -q '"success":true'; then
    echo -e "${GREEN}✅ API Info Retrieved${NC}"
    
    # Extract version info if available
    version=$(echo "$info_response" | jq -r '.versionInfo.data.version // "Unknown"' 2>/dev/null)
    echo "Server Version: $version"
    
    echo ""
    echo -e "${BLUE}📖 API Documentation:${NC}"
    echo "$info_response" | jq '.documentation' 2>/dev/null || echo "Documentation not available"
else
    echo -e "${RED}❌ Failed to get API info${NC}"
    echo "$info_response" | jq '.error // "Unknown error"' 2>/dev/null || echo "$info_response"
fi

echo ""
echo -e "${BLUE}🎯 Next Steps:${NC}"
echo "=============="
echo "1. Review the test results above"
echo "2. If working configurations found, update triggerAutoSSLCheck() method"
echo "3. If API not available, remove start_autossl_check from the method list"
echo "4. Test with different servers (cp1, pcp1, etc.) to see variations"
echo "5. Remove this temporary test endpoint after testing"

echo ""
echo -e "${YELLOW}💡 Quick Commands for Other Servers:${NC}"
echo "# Test on CP1:"
echo "curl -s -X POST \"$API_URL/test-start-autossl\" -H \"Content-Type: application/json\" -d '{\"serverName\":\"cp1\",\"username\":\"$USERNAME\"}' | jq '.summary'"
echo ""
echo "# Test on PCP1:"
echo "curl -s -X POST \"$API_URL/test-start-autossl\" -H \"Content-Type: application/json\" -d '{\"serverName\":\"pcp1\",\"username\":\"$USERNAME\"}' | jq '