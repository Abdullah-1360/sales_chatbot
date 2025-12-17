#!/bin/bash

# Focused AutoSSL Test: Enable → Trigger → Wait → Verify
# This tests the correct AutoSSL workflow

# Configuration
API_URL="http://localhost:3000/api"
SERVER_NAME="pcp3"
USERNAME="x98aailqrs"
DOMAIN="uzairfarooq.pk"  # Optional - set to empty string if not needed

echo "🎯 Focused AutoSSL Workflow Test"
echo "================================"
echo "Testing: Remove Exclusion → Enable → Trigger → Wait (Complete AutoSSL Workflow)"
echo "Method: remove_autossl_user_excluded_domains + add_override_features_for_user + start_autossl_check_for_one_user"
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

echo -e "${BLUE}🚀 Running Correct AutoSSL Workflow Test${NC}"
echo "Complete Workflow:"
echo "1. Remove: Call remove_autossl_user_excluded_domains (Removes domain and www.domain from exclusions)"
echo "2. Enable: Call add_override_features_for_user (Ensures they are not excluded)"
echo "3. Trigger: Call start_autossl_check_for_one_user (Starts the issuance)"
echo "4. Wait: Wait 60 seconds (AutoSSL handles certificate generation automatically)"
echo ""

# Run the focused test
if [ -n "$DOMAIN" ]; then
    # Test with domain
    response=$(curl -s -X POST "$API_URL/focused-autossl-test" \
        -H "Content-Type: application/json" \
        -d "{\"serverName\":\"$SERVER_NAME\",\"username\":\"$USERNAME\",\"domain\":\"$DOMAIN\"}")
else
    # Test without domain
    response=$(curl -s -X POST "$API_URL/focused-autossl-test" \
        -H "Content-Type: application/json" \
        -d "{\"serverName\":\"$SERVER_NAME\",\"username\":\"$USERNAME\"}")
fi

echo -e "${BLUE}📊 Workflow Results:${NC}"
echo "==================="

# Check if the response contains success: true
if echo "$response" | grep -q '"success":true'; then
    echo -e "${GREEN}✅ Test completed successfully${NC}"
    
    # Extract key information
    remove_worked=$(echo "$response" | jq -r '.analysis.removeWorked // null' 2>/dev/null)
    enable_worked=$(echo "$response" | jq -r '.analysis.enableWorked // false' 2>/dev/null)
    trigger_worked=$(echo "$response" | jq -r '.analysis.triggerWorked // false' 2>/dev/null)
    workflow_success=$(echo "$response" | jq -r '.analysis.workflowSuccess // false' 2>/dev/null)
    complete_success=$(echo "$response" | jq -r '.analysis.completeSuccess // false' 2>/dev/null)
    wait_time=$(echo "$response" | jq -r '.analysis.waitTime // 0' 2>/dev/null)
    domain_provided=$(echo "$response" | jq -r '.analysis.domainProvided // false' 2>/dev/null)
    recommendation=$(echo "$response" | jq -r '.recommendation // "No recommendation"' 2>/dev/null)
    
    echo ""
    echo -e "${BLUE}📋 Complete Workflow Results:${NC}"
    if [ "$domain_provided" = "true" ]; then
        echo "Step 1 - Remove Domain Exclusion: $remove_worked"
    else
        echo "Step 1 - Remove Domain Exclusion: Skipped (no domain)"
    fi
    echo "Step 2 - Enable AutoSSL: $enable_worked"
    echo "Step 3 - Trigger AutoSSL Check: $trigger_worked"
    echo "Step 4 - Wait Time: $wait_time seconds"
    echo "Workflow Success: $workflow_success"
    echo "Complete Success: $complete_success"
    echo ""
    echo -e "${BLUE}💡 Recommendation:${NC}"
    echo "$recommendation"
    
    if [ "$workflow_success" = "true" ]; then
        echo ""
        echo -e "${GREEN}🎉 EXCELLENT! Full workflow is working!${NC}"
        echo -e "${GREEN}Complete AutoSSL workflow is working!${NC}"
        echo ""
        echo -e "${BLUE}📋 Implementation Steps:${NC}"
        if [ "$domain_provided" = "true" ]; then
            echo "1. Call remove_autossl_user_excluded_domains to remove domain and www subdomain exclusions"
        else
            echo "1. Skip domain exclusion removal (no domain provided)"
        fi
        echo "2. Call add_override_features_for_user to enable AutoSSL"
        echo "3. Call start_autossl_check_for_one_user to trigger certificate generation"
        echo "4. Wait 60 seconds (AutoSSL handles certificate generation automatically)"
        echo ""
        echo -e "${BLUE}🔧 Parameters to use:${NC}"
        if [ "$domain_provided" = "true" ]; then
            echo "Remove: {\"username\": \"$USERNAME\", \"domains\": [\"$DOMAIN\", \"www.$DOMAIN\"]}"
        fi
        echo "Enable: {\"user\": \"$USERNAME\", \"features\": \"{\\\"autossl\\\":1}\"}"
        echo "Trigger: {\"username\": \"$USERNAME\"}"
        echo ""
        
    elif [ "$trigger_worked" = "true" ] && [ "$enable_worked" = "false" ]; then
        echo ""
        echo -e "${YELLOW}⚠️ PARTIAL SUCCESS: Trigger works, enable doesn't${NC}"
        echo "start_autossl_check_for_one_user works without enable"
        echo "You can use just the trigger method"
        
    elif [ "$enable_worked" = "true" ] && [ "$trigger_worked" = "false" ]; then
        echo ""
        echo -e "${YELLOW}⚠️ PARTIAL SUCCESS: Enable works, trigger doesn't${NC}"
        echo "add_override_features_for_user works but trigger method has issues"
        
    else
        echo ""
        echo -e "${RED}❌ WORKFLOW FAILED: Neither method is working properly${NC}"
        echo "Both APIs may need different parameters or may not be available"
    fi
    
    # Show detailed step results
    echo ""
    echo -e "${BLUE}🔍 Detailed Step Results:${NC}"
    echo "========================="
    
    # Step 1 results (remove exclusion)
    if [ "$domain_provided" = "true" ]; then
        step1_success=$(echo "$response" | jq -r '.results.step1_remove.success // false' 2>/dev/null)
        step1_reason=$(echo "$response" | jq -r '.results.step1_remove.reason // "No reason"' 2>/dev/null)
        echo "Step 1 (remove_autossl_user_excluded_domains):"
        echo "  Success: $step1_success"
        echo "  Reason: $step1_reason"
    else
        echo "Step 1 (remove_autossl_user_excluded_domains):"
        echo "  Skipped: No domain provided"
    fi
    
    # Step 2 results (enable)
    step2_success=$(echo "$response" | jq -r '.results.step2_enable.success // false' 2>/dev/null)
    step2_reason=$(echo "$response" | jq -r '.results.step2_enable.reason // "No reason"' 2>/dev/null)
    echo "Step 2 (add_override_features_for_user):"
    echo "  Success: $step2_success"
    echo "  Reason: $step2_reason"
    
    # Step 3 results (trigger)
    step3_success=$(echo "$response" | jq -r '.results.step3_trigger.success // false' 2>/dev/null)
    step3_reason=$(echo "$response" | jq -r '.results.step3_trigger.reason // "No reason"' 2>/dev/null)
    echo "Step 3 (start_autossl_check_for_one_user):"
    echo "  Success: $step3_success"
    echo "  Reason: $step3_reason"
    
    # Step 4 results (wait)
    step4_wait=$(echo "$response" | jq -r '.results.step4_wait.waitTime // 0' 2>/dev/null)
    echo "Step 4 (wait for AutoSSL):"
    echo "  Wait Time: $step4_wait seconds"
    echo "  Purpose: Allow AutoSSL to generate certificate automatically"
    
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
echo "1. Review the workflow results above"
echo "2. If successful, implement the Remove Exclusion → Enable → Trigger → Wait workflow in production"
echo "3. If partial success, use only the working method"
echo "4. Test on other servers (cp1, pcp1, etc.) to verify consistency"
echo "5. Remove temporary test endpoints after testing"

echo ""
echo -e "${YELLOW}💡 Quick Test Commands for Other Servers:${NC}"
echo "# Test on CP1:"
echo "curl -s -X POST \"$API_URL/focused-autossl-test\" -H \"Content-Type: application/json\" -d '{\"serverName\":\"cp1\",\"username\":\"$USERNAME\"}' | jq '.analysis'"
echo ""
echo "# Test on PCP1:"
echo "curl -s -X POST \"$API_URL/focused-autossl-test\" -H \"Content-Type: application/json\" -d '{\"serverName\":\"pcp1\",\"username\":\"$USERNAME\"}' | jq '.analysis'"