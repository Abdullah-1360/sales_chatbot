#!/bin/bash

# Test New Focused AutoSSL Implementation
# This tests the new focusedAutoSSLManagement method integrated into service status flow

# Configuration
API_URL="http://localhost:3000/api"
SERVER_NAME="pcp3"
USERNAME="x98aailqrs"
DOMAIN="uzairfarooq.pk"

echo "🧪 Testing New Focused AutoSSL Implementation"
echo "=============================================="
echo "Testing: focusedAutoSSLManagement method (integrated into service status)"
echo "Workflow: Remove Exclusion → Enable → Trigger (no 60s wait)"
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

echo -e "${BLUE}🚀 Testing New Focused AutoSSL Method${NC}"
echo "Method: focusedAutoSSLManagement"
echo "Integration: Service Status Flow"
echo "Wait Time: None (immediate return)"
echo ""

# Test the new focused AutoSSL method
echo -e "${BLUE}📡 Calling test endpoint...${NC}"
start_time=$(date +%s%3N)

response=$(curl -s -X POST "$API_URL/test-focused-autossl" \
    -H "Content-Type: application/json" \
    -d "{\"serverName\":\"$SERVER_NAME\",\"username\":\"$USERNAME\",\"domain\":\"$DOMAIN\"}")

end_time=$(date +%s%3N)
execution_time=$((end_time - start_time))

echo -e "${BLUE}📊 Test Results:${NC}"
echo "==============="

# Check if the response contains success: true
if echo "$response" | grep -q '"success":true'; then
    echo -e "${GREEN}✅ Test completed successfully${NC}"
    
    # Extract key information
    method_tested=$(echo "$response" | jq -r '.testResults.methodTested // "Unknown"' 2>/dev/null)
    execution_time_api=$(echo "$response" | jq -r '.testResults.executionTime // 0' 2>/dev/null)
    result_success=$(echo "$response" | jq -r '.testResults.summary.success // false' 2>/dev/null)
    approach=$(echo "$response" | jq -r '.testResults.summary.approach // "Unknown"' 2>/dev/null)
    autossl_triggered=$(echo "$response" | jq -r '.testResults.summary.autoSSLTriggered // false' 2>/dev/null)
    workflow_success=$(echo "$response" | jq -r '.testResults.summary.workflowSuccess // false' 2>/dev/null)
    complete_success=$(echo "$response" | jq -r '.testResults.summary.completeSuccess // false' 2>/dev/null)
    domains_processed=$(echo "$response" | jq -r '.testResults.summary.domainsProcessed // 0' 2>/dev/null)
    timeline=$(echo "$response" | jq -r '.testResults.result.timeline // "Unknown"' 2>/dev/null)
    
    echo ""
    echo -e "${BLUE}📋 Method Test Results:${NC}"
    echo "Method Tested: $method_tested"
    echo "API Execution Time: ${execution_time_api}ms"
    echo "Total Request Time: ${execution_time}ms"
    echo "Result Success: $result_success"
    echo "Approach: $approach"
    echo "AutoSSL Triggered: $autossl_triggered"
    echo "Workflow Success: $workflow_success"
    echo "Complete Success: $complete_success"
    echo "Domains Processed: $domains_processed"
    echo ""
    echo -e "${BLUE}⏱️ Timeline:${NC}"
    echo "$timeline"
    
    if [ "$complete_success" = "true" ]; then
        echo ""
        echo -e "${GREEN}🎉 EXCELLENT! Complete workflow success!${NC}"
        echo -e "${GREEN}New focused AutoSSL implementation is working perfectly!${NC}"
        echo ""
        echo -e "${BLUE}✨ Key Improvements:${NC}"
        echo "• No 60-second wait time (immediate return)"
        echo "• Complete Remove → Enable → Trigger workflow"
        echo "• Both main domain and www subdomain processing"
        echo "• Integrated into service status flow"
        echo "• Execution time: ${execution_time_api}ms"
        
    elif [ "$workflow_success" = "true" ]; then
        echo ""
        echo -e "${YELLOW}⚠️ PARTIAL SUCCESS: Core workflow working${NC}"
        echo "Enable + Trigger steps successful"
        echo "Domain exclusion removal may have partial results"
        
    elif [ "$result_success" = "true" ]; then
        echo ""
        echo -e "${YELLOW}⚠️ BASIC SUCCESS: Some steps working${NC}"
        echo "At least one workflow step completed successfully"
        
    else
        echo ""
        echo -e "${RED}❌ WORKFLOW FAILED: Method needs debugging${NC}"
        echo "New focused AutoSSL method encountered issues"
    fi
    
    # Show comparison with old method
    echo ""
    echo -e "${BLUE}📈 Comparison with Old Method:${NC}"
    old_method=$(echo "$response" | jq -r '.comparison.oldMethod // "Unknown"' 2>/dev/null)
    new_method=$(echo "$response" | jq -r '.comparison.newMethod // "Unknown"' 2>/dev/null)
    improvement=$(echo "$response" | jq -r '.comparison.improvement // "Unknown"' 2>/dev/null)
    
    echo "Old Method: $old_method"
    echo "New Method: $new_method"
    echo "Improvement: $improvement"
    
    # Show integration status
    echo ""
    echo -e "${BLUE}🔗 Integration Status:${NC}"
    service_status_ready=$(echo "$response" | jq -r '.integration.serviceStatusReady // false' 2>/dev/null)
    compatible_format=$(echo "$response" | jq -r '.integration.compatibleFormat // false' 2>/dev/null)
    
    echo "Service Status Ready: $service_status_ready"
    echo "Compatible Format: $compatible_format"
    
    if [ "$service_status_ready" = "true" ] && [ "$compatible_format" = "true" ]; then
        echo -e "${GREEN}✅ Ready for production use in service status flow${NC}"
    else
        echo -e "${YELLOW}⚠️ Integration may need adjustments${NC}"
    fi
    
else
    echo -e "${RED}❌ Test failed${NC}"
    echo "$response" | jq '.error // "Unknown error"' 2>/dev/null || echo "$response"
fi

echo ""
echo -e "${BLUE}🔍 Full Response:${NC}"
echo "================="
echo "$response" | jq '.' 2>/dev/null || echo "$response"

echo ""
echo -e "${BLUE}🎯 Next Steps:${NC}"
echo "=============="
echo "1. Review the test results above"
echo "2. If successful, the new method is ready for production"
echo "3. Test with actual service status endpoint: /api/service-status"
echo "4. Monitor performance in production environment"
echo "5. Remove test endpoints after validation"

echo ""
echo -e "${YELLOW}💡 Production Testing:${NC}"
echo "# Test service status with SSL issues:"
echo "curl -s -X POST \"$API_URL/service-status\" -H \"Content-Type: application/json\" -d '{\"domain\":\"$DOMAIN\"}' | jq '.reachabilityAnalysis.autoSSL'"