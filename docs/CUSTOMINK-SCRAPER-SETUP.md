# CustomInk/OOShirts Scraper Integration

## Overview
Your existing CustomInk/OOShirts scraper can automatically upload order data to the Promos Ink Supply Chain cloud platform.

---

## API Endpoint

```
POST https://package-confirmation-app.vercel.app/api/manifests
```

---

## Authentication

Include this header in all requests:
```
x-api-key: promos-ink-2024
```

---

## Option 1: Python Script (Recommended)

Add this to your existing scraper script after it saves `customink_orders.xlsx`:

```python
import requests
import os

def upload_to_cloud(file_path):
    """Upload CustomInk orders to Promos Ink Supply Chain"""
    
    API_URL = "https://package-confirmation-app.vercel.app/api/manifests"
    API_KEY = "promos-ink-2024"
    
    if not os.path.exists(file_path):
        print(f"Error: File not found: {file_path}")
        return False
    
    try:
        with open(file_path, 'rb') as f:
            files = {'file': (os.path.basename(file_path), f)}
            data = {'type': 'customink'}
            headers = {'x-api-key': API_KEY}
            
            response = requests.post(API_URL, files=files, data=data, headers=headers)
            
            if response.status_code == 200:
                result = response.json()
                print(f"✅ Upload successful: {result.get('manifest', {}).get('filename')}")
                return True
            else:
                print(f"❌ Upload failed: {response.status_code} - {response.text}")
                return False
                
    except Exception as e:
        print(f"❌ Upload error: {e}")
        return False


# === ADD THIS AT THE END OF YOUR SCRAPER ===
if __name__ == "__main__":
    # ... your existing scraper code ...
    
    # After saving the file, upload to cloud
    ORDERS_FILE = r"\\promos-dc01\data\Huy\desktop receiving tool\customink_orders.xlsx"
    
    print("\n📤 Uploading to Promos Ink Supply Chain...")
    upload_to_cloud(ORDERS_FILE)
```

---

## Option 2: Standalone Upload Script

Save this as `upload_customink.py` and run it after your scraper:

```python
#!/usr/bin/env python3
"""
Upload CustomInk orders to Promos Ink Supply Chain
Run this after your scraper updates customink_orders.xlsx
"""

import requests
import os
import sys
from datetime import datetime

# Configuration
API_URL = "https://package-confirmation-app.vercel.app/api/manifests"
API_KEY = "promos-ink-2024"
DEFAULT_FILE = r"\\promos-dc01\data\Huy\desktop receiving tool\customink_orders.xlsx"

def upload_customink(file_path=None):
    file_path = file_path or DEFAULT_FILE
    
    if not os.path.exists(file_path):
        print(f"❌ File not found: {file_path}")
        return False
    
    file_size = os.path.getsize(file_path)
    print(f"📁 File: {file_path}")
    print(f"📊 Size: {file_size:,} bytes")
    print(f"🕐 Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    try:
        with open(file_path, 'rb') as f:
            files = {'file': (os.path.basename(file_path), f)}
            data = {'type': 'customink'}
            headers = {'x-api-key': API_KEY}
            
            print("📤 Uploading to cloud...")
            response = requests.post(API_URL, files=files, data=data, headers=headers, timeout=60)
            
            if response.status_code == 200:
                result = response.json()
                print()
                print("=" * 50)
                print("✅ UPLOAD SUCCESSFUL")
                print("=" * 50)
                print(f"   Filename: {result.get('manifest', {}).get('filename')}")
                print(f"   Size: {result.get('manifest', {}).get('size', 0):,} bytes")
                print(f"   URL: {result.get('manifest', {}).get('url', 'N/A')[:60]}...")
                return True
            else:
                print()
                print("=" * 50)
                print(f"❌ UPLOAD FAILED: {response.status_code}")
                print("=" * 50)
                print(response.text)
                return False
                
    except requests.exceptions.Timeout:
        print("❌ Upload timed out. Check your internet connection.")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

if __name__ == "__main__":
    file_path = sys.argv[1] if len(sys.argv) > 1 else None
    success = upload_customink(file_path)
    sys.exit(0 if success else 1)
```

### Usage:
```bash
# Use default file path
python upload_customink.py

# Or specify a file
python upload_customink.py "C:\path\to\customink_orders.xlsx"
```

---

## Option 3: PowerShell Script

Save as `upload_customink.ps1`:

```powershell
# Upload CustomInk orders to Promos Ink Supply Chain

param(
    [string]$FilePath = "\\promos-dc01\data\Huy\desktop receiving tool\customink_orders.xlsx"
)

$ApiUrl = "https://package-confirmation-app.vercel.app/api/manifests"
$ApiKey = "promos-ink-2024"

if (-not (Test-Path $FilePath)) {
    Write-Host "❌ File not found: $FilePath" -ForegroundColor Red
    exit 1
}

$fileInfo = Get-Item $FilePath
Write-Host "📁 File: $FilePath"
Write-Host "📊 Size: $($fileInfo.Length.ToString('N0')) bytes"
Write-Host "🕐 Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host ""

try {
    Write-Host "📤 Uploading to cloud..." -ForegroundColor Cyan
    
    $fileBytes = [System.IO.File]::ReadAllBytes($FilePath)
    $fileName = [System.IO.Path]::GetFileName($FilePath)
    
    $boundary = [System.Guid]::NewGuid().ToString()
    $LF = "`r`n"
    
    $bodyLines = @(
        "--$boundary",
        "Content-Disposition: form-data; name=`"type`"$LF",
        "customink",
        "--$boundary",
        "Content-Disposition: form-data; name=`"file`"; filename=`"$fileName`"",
        "Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet$LF"
    )
    
    $bodyStart = [System.Text.Encoding]::UTF8.GetBytes(($bodyLines -join $LF) + $LF)
    $bodyEnd = [System.Text.Encoding]::UTF8.GetBytes("$LF--$boundary--$LF")
    
    $body = New-Object byte[] ($bodyStart.Length + $fileBytes.Length + $bodyEnd.Length)
    [System.Buffer]::BlockCopy($bodyStart, 0, $body, 0, $bodyStart.Length)
    [System.Buffer]::BlockCopy($fileBytes, 0, $body, $bodyStart.Length, $fileBytes.Length)
    [System.Buffer]::BlockCopy($bodyEnd, 0, $body, $bodyStart.Length + $fileBytes.Length, $bodyEnd.Length)
    
    $response = Invoke-RestMethod -Uri $ApiUrl -Method Post -Body $body `
        -ContentType "multipart/form-data; boundary=$boundary" `
        -Headers @{ "x-api-key" = $ApiKey }
    
    Write-Host ""
    Write-Host "=" * 50 -ForegroundColor Green
    Write-Host "✅ UPLOAD SUCCESSFUL" -ForegroundColor Green
    Write-Host "=" * 50 -ForegroundColor Green
    Write-Host "   Filename: $($response.manifest.filename)"
    Write-Host "   Size: $($response.manifest.size) bytes"
    
} catch {
    Write-Host ""
    Write-Host "=" * 50 -ForegroundColor Red
    Write-Host "❌ UPLOAD FAILED" -ForegroundColor Red
    Write-Host "=" * 50 -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
}
```

---

## Scheduled Task Setup

To run automatically after your scraper:

### Windows Task Scheduler

1. Create a batch file `run_scraper_and_upload.bat`:
```batch
@echo off
echo Running CustomInk scraper...
python "C:\path\to\your\scraper.py"

echo Uploading to cloud...
python "C:\path\to\upload_customink.py"

echo Done!
pause
```

2. Schedule in Task Scheduler to run hourly/daily

---

## Testing

Test the upload manually:
```bash
curl -X POST "https://package-confirmation-app.vercel.app/api/manifests" \
  -H "x-api-key: promos-ink-2024" \
  -F "type=customink" \
  -F "file=@customink_orders.xlsx"
```

---

## Verification

After upload, verify at:
- **Web UI**: https://package-confirmation-app.vercel.app → Manifests tab
- **API**: https://package-confirmation-app.vercel.app/api/manifests?action=list

---

## Support

Contact: receiving@promosink.com

