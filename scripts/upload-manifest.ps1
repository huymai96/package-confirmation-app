# Promos Ink Supply Chain - Manifest Upload Script
# This script uploads manifest files to the cloud automatically
#
# Usage:
#   .\upload-manifest.ps1 -Type customink -FilePath "\\promos-dc01\data\Huy\desktop receiving tool\customink_orders.xlsx"
#   .\upload-manifest.ps1 -Type sanmar -FilePath "C:\path\to\sanmar.xlsx"
#   .\upload-manifest.ps1 -Type ss -FilePath "C:\path\to\s&s.xlsx"
#   .\upload-manifest.ps1 -Type inbound -FilePath "C:\path\to\inbound.csv"

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("customink", "sanmar", "ss", "ssactivewear", "inbound", "quantumview")]
    [string]$Type,
    
    [Parameter(Mandatory=$true)]
    [string]$FilePath,
    
    [string]$ApiUrl = "https://package-confirmation-app.vercel.app/api/manifests",
    [string]$ApiKey = "promos-ink-2024"
)

# Check if file exists
if (-not (Test-Path $FilePath)) {
    Write-Error "File not found: $FilePath"
    exit 1
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Promos Ink Supply Chain - Manifest Upload" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Type: $Type" -ForegroundColor Yellow
Write-Host "File: $FilePath" -ForegroundColor Yellow
Write-Host "API:  $ApiUrl" -ForegroundColor Yellow
Write-Host ""

try {
    # Read file and convert to base64
    $fileBytes = [System.IO.File]::ReadAllBytes($FilePath)
    $base64Data = [Convert]::ToBase64String($fileBytes)
    $filename = Split-Path $FilePath -Leaf
    
    # Create JSON payload
    $body = @{
        type = $Type
        filename = $filename
        data = $base64Data
    } | ConvertTo-Json

    Write-Host "Uploading $filename ($([math]::Round($fileBytes.Length / 1024, 2)) KB)..." -ForegroundColor White

    # Send POST request
    $headers = @{
        "Content-Type" = "application/json"
        "x-api-key" = $ApiKey
    }

    $response = Invoke-RestMethod -Uri $ApiUrl -Method Post -Headers $headers -Body $body -TimeoutSec 120

    if ($response.success) {
        Write-Host ""
        Write-Host "✓ Upload successful!" -ForegroundColor Green
        Write-Host "  Manifest: $($response.manifest.type)" -ForegroundColor White
        Write-Host "  Size: $($response.manifest.size) bytes" -ForegroundColor White
        Write-Host "  URL: $($response.manifest.url)" -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Error "Upload failed: $($response.error)"
        exit 1
    }

} catch {
    Write-Error "Error uploading manifest: $_"
    exit 1
}

Write-Host "Done!" -ForegroundColor Green

