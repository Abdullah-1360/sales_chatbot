# PowerShell Manual API Test Script
# Test all endpoints with the provided domains

$BASE_URL = if ($env:API_URL) { $env:API_URL } else { "http://localhost:3000" }
$CLIENT_ID = if ($env:TEST_CLIENT_ID) { $env:TEST_CLIENT_ID } else { "1" }
$INVOICE_ID = if ($env:TEST_INVOICE_ID) { $env:TEST_INVOICE_ID } else { "1" }
$SERVICE_ID = if ($env:TEST_SERVICE_ID) { $env:TEST_SERVICE_ID } else { "1" }

# Test domains
$DOMAINS = @("Wmflippers.com", "Hostbrake.com", "Filter.pk", "Vizfilters.com", "Ibuy.com.pk", "macoode.com")

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "API Manual Tests" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Base URL: $BASE_URL"
Write-Host "Client ID: $CLIENT_ID"
Write-Host "=========================================" -ForegroundColor Cyan

# Helper function to make API calls
function Invoke-ApiTest {
    param(
        [string]$Method,
        [string]$Endpoint,
        [object]$Body = $null
    )
    
    $url = "$BASE_URL$Endpoint"
    $params = @{
        Uri = $url
        Method = $Method
        ContentType = "application/json"
    }
    
    if ($Body) {
        $params.Body = ($Body | ConvertTo-Json -Depth 10)
    }
    
    try {
        $response = Invoke-RestMethod @params
        return $response | ConvertTo-Json -Depth 10
    } catch {
        Write-Host "Error: $_" -ForegroundColor Red
        return $null
    }
}

# 1. Health Check
Write-Host "`n=== 1. Health Check ===" -ForegroundColor Yellow
Invoke-ApiTest -Method GET -Endpoint "/health"

# 2. Get Invoice
Write-Host "`n=== 2. Get Invoice ===" -ForegroundColor Yellow
Invoke-ApiTest -Method GET -Endpoint "/invoices/$INVOICE_ID"

# 3. Get Invoices
Write-Host "`n=== 3. Get Invoices (Unpaid) ===" -ForegroundColor Yellow
Invoke-ApiTest -Method GET -Endpoint "/invoices?clientId=$CLIENT_ID&status=Unpaid&limitnum=10"

# 4. Get Client Products
Write-Host "`n=== 4. Get Client Products ===" -ForegroundColor Yellow
Invoke-ApiTest -Method GET -Endpoint "/clients/$CLIENT_ID/products?status=Active"

# 5. Get Client Domains
Write-Host "`n=== 5. Get Client Domains ===" -ForegroundColor Yellow
Invoke-ApiTest -Method GET -Endpoint "/clients/$CLIENT_ID/domains?status=Active"

# 6. Get Service Status
Write-Host "`n=== 6. Get Service Status ===" -ForegroundColor Yellow
Invoke-ApiTest -Method GET -Endpoint "/clients/$CLIENT_ID/service-status"

# 7. Invoice Lookup by Domain
Write-Host "`n=== 7. Invoice Lookup by Domain ===" -ForegroundColor Yellow
foreach ($domain in $DOMAINS) {
    Write-Host "`nTesting: $domain" -ForegroundColor Green
    Invoke-ApiTest -Method POST -Endpoint "/api/invoiceLookup" -Body @{
        clientId = $CLIENT_ID
        domain = $domain
    }
}

# 8. Invoice Lookup by ID
Write-Host "`n=== 8. Invoice Lookup by ID ===" -ForegroundColor Yellow
Invoke-ApiTest -Method POST -Endpoint "/api/invoiceLookup" -Body @{
    clientId = $CLIENT_ID
    invoiceId = $INVOICE_ID
}

# 9. Service Status by Domain
Write-Host "`n=== 9. Service Status by Domain ===" -ForegroundColor Yellow
foreach ($domain in $DOMAINS) {
    Write-Host "`nTesting: $domain" -ForegroundColor Green
    Invoke-ApiTest -Method POST -Endpoint "/api/serviceStatus" -Body @{
        clientId = $CLIENT_ID
        domain = $domain
    }
}

# 10. Service Status by Service ID
Write-Host "`n=== 10. Service Status by Service ID ===" -ForegroundColor Yellow
Invoke-ApiTest -Method POST -Endpoint "/api/serviceStatus" -Body @{
    clientId = $CLIENT_ID
    serviceId = $SERVICE_ID
}

# 11. Renew Service by Domain
Write-Host "`n=== 11. Renew Service by Domain ===" -ForegroundColor Yellow
foreach ($domain in $DOMAINS) {
    Write-Host "`nTesting: $domain" -ForegroundColor Green
    Invoke-ApiTest -Method POST -Endpoint "/api/renewService" -Body @{
        clientId = $CLIENT_ID
        domain = $domain
        billingcycle = "monthly"
        paymentmethod = "banktransfer"
    }
}

# 12. Confirm Payment
Write-Host "`n=== 12. Confirm Payment ===" -ForegroundColor Yellow
Invoke-ApiTest -Method POST -Endpoint "/api/confirmPayment" -Body @{
    clientId = $CLIENT_ID
    invoiceId = $INVOICE_ID
    details = "Payment made via bank transfer. Ref: TXN123456"
}

# 13. Triage Issue
Write-Host "`n=== 13. Triage Issue ===" -ForegroundColor Yellow
$issues = @(
    @{ domain = $DOMAINS[0]; description = "Website is not loading, showing 503 error" },
    @{ domain = $DOMAINS[1]; description = "Email service is down" },
    @{ domain = $DOMAINS[2]; description = "Database connection timeout" },
    @{ domain = $DOMAINS[3]; description = "SSL certificate expired" },
    @{ domain = $DOMAINS[4]; description = "FTP access not working" },
    @{ domain = $DOMAINS[5]; description = "Server not responding, high CPU usage" }
)

foreach ($issue in $issues) {
    Write-Host "`nTesting: $($issue.domain)" -ForegroundColor Green
    Invoke-ApiTest -Method POST -Endpoint "/api/triageIssue" -Body @{
        clientId = $CLIENT_ID
        domain = $issue.domain
        description = $issue.description
    }
}

# 14. Open Ticket
Write-Host "`n=== 14. Open Ticket ===" -ForegroundColor Yellow
Invoke-ApiTest -Method POST -Endpoint "/tickets" -Body @{
    deptname = "Technical Support"
    subject = "General inquiry"
    message = "Need help with hosting plan"
    clientid = $CLIENT_ID
    priority = "Medium"
}

# 15. Add Order
Write-Host "`n=== 15. Add Order ===" -ForegroundColor Yellow
Invoke-ApiTest -Method POST -Endpoint "/orders" -Body @{
    clientid = $CLIENT_ID
    paymentmethod = "banktransfer"
    pid = @(1)
    domain = "newdomain.com"
    billingcycle = "annually"
}

Write-Host "`n=========================================" -ForegroundColor Cyan
Write-Host "All tests completed!" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
