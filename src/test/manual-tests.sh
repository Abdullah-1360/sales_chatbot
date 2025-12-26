#!/bin/bash

# Manual API Test Script
# Test all endpoints with the provided domains

BASE_URL="${API_URL:-http://localhost:3000}"
CLIENT_ID="${TEST_CLIENT_ID:-1}"
INVOICE_ID="${TEST_INVOICE_ID:-1}"
SERVICE_ID="${TEST_SERVICE_ID:-1}"

# Test domains
DOMAINS=("Wmflippers.com" "Hostbrake.com" "Filter.pk" "Vizfilters.com" "Ibuy.com.pk" "macoode.com")

echo "========================================="
echo "API Manual Tests"
echo "========================================="
echo "Base URL: $BASE_URL"
echo "Client ID: $CLIENT_ID"
echo "========================================="

# 1. Health Check
echo -e "\n=== 1. Health Check ==="
curl -X GET "$BASE_URL/health" | json_pp

# 2. Get Invoice
echo -e "\n=== 2. Get Invoice ==="
curl -X GET "$BASE_URL/invoices/$INVOICE_ID" | json_pp

# 3. Get Invoices
echo -e "\n=== 3. Get Invoices (Unpaid) ==="
curl -X GET "$BASE_URL/invoices?clientId=$CLIENT_ID&status=Unpaid&limitnum=10" | json_pp

# 4. Get Client Products
echo -e "\n=== 4. Get Client Products ==="
curl -X GET "$BASE_URL/clients/$CLIENT_ID/products?status=Active" | json_pp

# 5. Get Client Domains
echo -e "\n=== 5. Get Client Domains ==="
curl -X GET "$BASE_URL/clients/$CLIENT_ID/domains?status=Active" | json_pp

# 6. Get Service Status
echo -e "\n=== 6. Get Service Status ==="
curl -X GET "$BASE_URL/clients/$CLIENT_ID/service-status" | json_pp

# 7. Invoice Lookup by Domain (test each domain)
echo -e "\n=== 7. Invoice Lookup by Domain ==="
for domain in "${DOMAINS[@]}"; do
  echo -e "\nTesting: $domain"
  curl -X POST "$BASE_URL/api/invoiceLookup" \
    -H "Content-Type: application/json" \
    -d "{\"clientId\":\"$CLIENT_ID\",\"domain\":\"$domain\"}" | json_pp
done

# 8. Invoice Lookup by ID
echo -e "\n=== 8. Invoice Lookup by ID ==="
curl -X POST "$BASE_URL/api/invoiceLookup" \
  -H "Content-Type: application/json" \
  -d "{\"clientId\":\"$CLIENT_ID\",\"invoiceId\":\"$INVOICE_ID\"}" | json_pp

# 9. Service Status by Domain (test each domain)
echo -e "\n=== 9. Service Status by Domain ==="
for domain in "${DOMAINS[@]}"; do
  echo -e "\nTesting: $domain"
  curl -X POST "$BASE_URL/api/serviceStatus" \
    -H "Content-Type: application/json" \
    -d "{\"clientId\":\"$CLIENT_ID\",\"domain\":\"$domain\"}" | json_pp
done

# 10. Service Status by Service ID
echo -e "\n=== 10. Service Status by Service ID ==="
curl -X POST "$BASE_URL/api/serviceStatus" \
  -H "Content-Type: application/json" \
  -d "{\"clientId\":\"$CLIENT_ID\",\"serviceId\":\"$SERVICE_ID\"}" | json_pp

# 11. Renew Service by Domain (test each domain)
echo -e "\n=== 11. Renew Service by Domain ==="
for domain in "${DOMAINS[@]}"; do
  echo -e "\nTesting: $domain"
  curl -X POST "$BASE_URL/api/renewService" \
    -H "Content-Type: application/json" \
    -d "{\"clientId\":\"$CLIENT_ID\",\"domain\":\"$domain\",\"billingcycle\":\"monthly\",\"paymentmethod\":\"banktransfer\"}" | json_pp
done

# 12. Confirm Payment
echo -e "\n=== 12. Confirm Payment ==="
curl -X POST "$BASE_URL/api/confirmPayment" \
  -H "Content-Type: application/json" \
  -d "{\"clientId\":\"$CLIENT_ID\",\"invoiceId\":\"$INVOICE_ID\",\"details\":\"Payment made via bank transfer. Ref: TXN123456\"}" | json_pp

# 13. Triage Issue (test each domain with different issues)
echo -e "\n=== 13. Triage Issue ==="
curl -X POST "$BASE_URL/api/triageIssue" \
  -H "Content-Type: application/json" \
  -d "{\"clientId\":\"$CLIENT_ID\",\"domain\":\"${DOMAINS[0]}\",\"description\":\"Website is not loading, showing 503 error\"}" | json_pp

curl -X POST "$BASE_URL/api/triageIssue" \
  -H "Content-Type: application/json" \
  -d "{\"clientId\":\"$CLIENT_ID\",\"domain\":\"${DOMAINS[1]}\",\"description\":\"Email service is down\"}" | json_pp

curl -X POST "$BASE_URL/api/triageIssue" \
  -H "Content-Type: application/json" \
  -d "{\"clientId\":\"$CLIENT_ID\",\"domain\":\"${DOMAINS[2]}\",\"description\":\"Database connection timeout\"}" | json_pp

curl -X POST "$BASE_URL/api/triageIssue" \
  -H "Content-Type: application/json" \
  -d "{\"clientId\":\"$CLIENT_ID\",\"domain\":\"${DOMAINS[3]}\",\"description\":\"SSL certificate expired\"}" | json_pp

curl -X POST "$BASE_URL/api/triageIssue" \
  -H "Content-Type: application/json" \
  -d "{\"clientId\":\"$CLIENT_ID\",\"domain\":\"${DOMAINS[4]}\",\"description\":\"FTP access not working\"}" | json_pp

curl -X POST "$BASE_URL/api/triageIssue" \
  -H "Content-Type: application/json" \
  -d "{\"clientId\":\"$CLIENT_ID\",\"domain\":\"${DOMAINS[5]}\",\"description\":\"Server not responding, high CPU usage\"}" | json_pp

# 14. Open Ticket
echo -e "\n=== 14. Open Ticket ==="
curl -X POST "$BASE_URL/tickets" \
  -H "Content-Type: application/json" \
  -d "{\"deptname\":\"Technical Support\",\"subject\":\"General inquiry\",\"message\":\"Need help with hosting plan\",\"clientid\":\"$CLIENT_ID\",\"priority\":\"Medium\"}" | json_pp

# 15. Add Order
echo -e "\n=== 15. Add Order ==="
curl -X POST "$BASE_URL/orders" \
  -H "Content-Type: application/json" \
  -d "{\"clientid\":\"$CLIENT_ID\",\"paymentmethod\":\"banktransfer\",\"pid\":[1],\"domain\":\"newdomain.com\",\"billingcycle\":\"annually\"}" | json_pp

echo -e "\n========================================="
echo "All tests completed!"
echo "========================================="
