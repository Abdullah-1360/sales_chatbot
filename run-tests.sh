#!/bin/bash

# cPHulk Test Runner Script - PCP3 Server Focus
NODE_PATH="/home/abdullah/.nvm/versions/node/v24.12.0/bin/node"

echo "🚀 Running cPHulk Tests (PCP3 Server Focus)"
echo "==========================================="
echo "Node.js: $NODE_PATH"
echo "API URL: http://localhost:3000"
echo "Target Server: PCP3"
echo "==========================================="

# Set environment variables for PCP3 testing
export API_BASE_URL=http://localhost:3000
export TEST_IP=115.186.130.67
export TEST_DOMAIN=uzairfarooq.pk
export TEST_EMAIL=uzairfarooq.pk97@gmail.com
export TEST_SERVER=pcp3

echo ""
echo "📋 Test 1: PCP3 Specific cPHulk Test"
echo "===================================="
$NODE_PATH test-pcp3-cphulk.js

echo ""
echo "📋 Test 2: WHM Permissions Test"
echo "==============================="
$NODE_PATH test-whm-permissions.js

echo ""
echo "📋 Test 3: Basic IP Test (No Domain Validation)"
echo "================================================"
$NODE_PATH test-basic-ip.js

echo ""
echo "📋 Test 4: Simple IP Whitelist and Removal Test"
echo "================================================"
$NODE_PATH test-ip-whitelist-removal.js

echo ""
echo "✅ All PCP3-focused tests completed!"