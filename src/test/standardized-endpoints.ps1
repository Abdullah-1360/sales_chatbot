# Standardized Endpoints Test Suite - PowerShell
# Tests the 5 main endpoints with all 6 domains

$BASE_URL = if ($env:API_URL) { $env:API_URL } else { "http://localhost:3000" }
$CLIENT_ID = if ($env:TEST_CLIENT_ID) { $env:TEST_CLIENT_ID } else { "1" }
$INVOICE_ID = if ($env:TEST_INVOICE_ID) { $env:TEST_INVOICE_ID } else { "1" }

$DOMAINS = @("Wmflippers.com", "Hostbrake.com", "Filter.pk", "Vizfilters.com", "Ibuy.com.pk", "macoode.com")

Write-Host ("=" * 60) -ForegroundColor Cyan
Write-Host "STANDARDIZED ENDPOINTS TEST SUITE" -ForegroundColor Cyan
Write-Host ("=" * 60) -ForegroundColor Cyan
Write-Host "Base URL: $BASE_URL"
Write-Host "Client ID: $CLIENT_ID"
Write-Host "Test Domains: $($DOMAINS -join ', ')"
Write-Host ("=" * 60) -ForegroundColor Cyan

function Invoke-ApiTest {
    param(
        [string]$Endpoint,
        [object]$Body
    )
    
    $url = "$BASE_URL$Endpoint"
    try {
        $response = Invoke-RestMethod -Uri $url -Method POST -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 10)
        return $response
    } catch {
        Write-Host "Error: $_" -ForegroundColor Red
        return $null
    }
}

# Test 1: Invoice Lookup
Write-Host "`n$("=" * 60)" -ForegroundColor Yellow
Write-Host "TEST 1: INVOICE LOOKUP" -ForegroundColor Yellow
Write-Host ("=" * 60) -ForegroundColor Yellow

Write-Host "`n--- Test 1a: Invoice Lookup by ID ---" -ForegroundColor Green
$result = Invoke-ApiTest -Endpoint "/api/invoiceLookup" -Body @{
    clientId = $CLIENT_ID
    invoiceId = $INVOICE_ID
}
if ($result) {
    Write-Host ($result | ConvertTo-Json -Depth 10)
}

Write-Host "`n--- Test 1b: Invoice Lookup by Domain ---" -ForegroundColor Green
foreach ($domain in $DOMAINS) {
    Write-Host "`nTesting: $domain" -ForegroundColor Cyan
    $result = Invoke-ApiTest -Endpoint "/api/invoiceLookup" -Body @{
        clientId = $CLIENT_ID
        domain = $domain
    }
    if ($result) {
        Write-Host ($result | ConvertTo-Json -Depth 10)
        if ($result.success) {
            Write-Host "  → Status: $($result.status)" -ForegroundColor White
            Write-Host "  → Invoice ID: $($result.invoiceId)" -ForegroundColor White
            Write-Host "  → Amount: `$$($result.amount)" -ForegroundColor White
        }
    }
}

# Test 2: Service Status Check
Write-Host "`n$("=" * 60)" -ForegroundColor Yellow
Write-Host "TEST 2: SERVICE STATUS CHECK" -ForegroundColor Yellow
Write-Host ("=" * 60) -ForegroundColor Yellow

foreach ($domain in $DOMAINS) {
    Write-Host "`nTesting: $domain" -ForegroundColor Cyan
    $result = Invoke-ApiTest -Endpoint "/api/serviceStatus" -Body @{
        clientId = $CLIENT_ID
        domain = $domain
    }
    if ($result) {
        Write-Host ($result | ConvertTo-Json -Depth 10)
        if ($result.success) {
            Write-Host "  → Status: $($result.status)" -ForegroundColor White
            Write-Host "  → Billing Issue: $($result.billingIssue)" -ForegroundColor White
            if ($result.invoiceId) {
                Write-Host "  → Invoice ID: $($result.invoiceId)" -ForegroundColor White
                Write-Host "  → Amount Due: `$$($result.amountDue)" -ForegroundColor White
            }
        }
    }
}

# Test 3: Renew Service
Write-Host "`n$("=" * 60)" -ForegroundColor Yellow
Write-Host "TEST 3: RENEW SERVICE" -ForegroundColor Yellow
Write-Host ("=" * 60) -ForegroundColor Yellow

foreach ($domain in $DOMAINS) {
    Write-Host "`nTesting: $domain" -ForegroundColor Cyan
    $result = Invoke-ApiTest -Endpoint "/api/renewService" -Body @{
        clientId = $CLIENT_ID
        domain = $domain
        period = 1
    }
    if ($result) {
        Write-Host ($result | ConvertTo-Json -Depth 10)
        if ($result.success) {
            Write-Host "  → Existing Invoice: $($result.existingInvoice)" -ForegroundColor White
            Write-Host "  → Invoice ID: $($result.invoiceId)" -ForegroundColor White
            Write-Host "  → Amount: `$$($result.amount)" -ForegroundColor White
        }
    }
}

# Test 4: Payment Confirmation
Write-Host "`n$("=" * 60)" -ForegroundColor Yellow
Write-Host "TEST 4: PAYMENT CONFIRMATION" -ForegroundColor Yellow
Write-Host ("=" * 60) -ForegroundColor Yellow

Write-Host "`nTesting Invoice ID: $INVOICE_ID" -ForegroundColor Cyan
$result = Invoke-ApiTest -Endpoint "/api/confirmPayment" -Body @{
    clientId = $CLIENT_ID
    invoiceId = $INVOICE_ID
    details = "Test payment via bank transfer. Reference: TEST-$(Get-Date -Format 'yyyyMMddHHmmss')"
}
if ($result) {
    Write-Host ($result | ConvertTo-Json -Depth 10)
    if ($result.success) {
        Write-Host "  → Paid: $($result.paid)" -ForegroundColor White
        if ($result.paid) {
            Write-Host "  → Paid Date: $($result.paidDate)" -ForegroundColor White
        } else {
            Write-Host "  → Ticket ID: $($result.ticketId)" -ForegroundColor White
        }
    }
}

# Test 5: Triage Issue
Write-Host "`n$("=" * 60)" -ForegroundColor Yellow
Write-Host "TEST 5: TRIAGE ISSUE" -ForegroundColor Yellow
Write-Host ("=" * 60) -ForegroundColor Yellow

$issues = @(
    @{ domain = $DOMAINS[0]; issue = "Website is not loading, showing 503 error" },
    @{ domain = $DOMAINS[1]; issue = "Email service is down, cannot send or receive emails" },
    @{ domain = $DOMAINS[2]; issue = "Database connection timeout errors" },
    @{ domain = $DOMAINS[3]; issue = "SSL certificate expired" },
    @{ domain = $DOMAINS[4]; issue = "FTP access not working" },
    @{ domain = $DOMAINS[5]; issue = "Server not responding, high CPU usage" }
)

foreach ($test in $issues) {
    Write-Host "`nTesting: $($test.domain)" -ForegroundColor Cyan
    Write-Host "Issue: $($test.issue)" -ForegroundColor Gray
    $result = Invoke-ApiTest -Endpoint "/api/triageIssue" -Body @{
        clientId = $CLIENT_ID
        domain = $test.domain
        issue = $test.issue
    }
    if ($result) {
        Write-Host ($result | ConvertTo-Json -Depth 10)
        if ($result.success) {
            Write-Host "  → Resolution: $($result.resolution)" -ForegroundColor White
            if ($result.resolution -eq "billing") {
                Write-Host "  → Invoice ID: $($result.invoiceId)" -ForegroundColor White
                Write-Host "  → Amount Due: `$$($result.amountDue)" -ForegroundColor White
            } elseif ($result.resolution -eq "tech_ticket") {
                Write-Host "  → Ticket ID: $($result.ticketId)" -ForegroundColor White
            }
        }
    }
}

Write-Host "`n$("=" * 60)" -ForegroundColor Cyan
Write-Host "ALL TESTS COMPLETED" -ForegroundColor Cyan
Write-Host ("=" * 60) -ForegroundColor Cyan
