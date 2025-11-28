#!/usr/bin/env python3
"""
Promos Ink Supply Chain - Manifest Upload Script

This script uploads manifest files to the cloud automatically.
Can be integrated into your existing CustomInk/OOShirts capture script.

Usage:
    python upload_manifest.py --type customink --file "\\\\promos-dc01\\data\\Huy\\desktop receiving tool\\customink_orders.xlsx"
    python upload_manifest.py --type sanmar --file "C:\\path\\to\\sanmar.xlsx"
    python upload_manifest.py --type ss --file "C:\\path\\to\\s&s.xlsx"
    python upload_manifest.py --type inbound --file "C:\\path\\to\\inbound.csv"

Or import as module:
    from upload_manifest import upload_manifest
    upload_manifest('customink', 'path/to/file.xlsx')
"""

import argparse
import base64
import json
import os
import sys
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

# Configuration
API_URL = "https://package-confirmation-app.vercel.app/api/manifests"
API_KEY = "promos-ink-2024"  # Set this in Vercel env vars for production

VALID_TYPES = ["customink", "sanmar", "ss", "ssactivewear", "inbound", "quantumview"]


def upload_manifest(manifest_type: str, file_path: str, api_url: str = API_URL, api_key: str = API_KEY) -> dict:
    """
    Upload a manifest file to the cloud.
    
    Args:
        manifest_type: One of customink, sanmar, ss, ssactivewear, inbound, quantumview
        file_path: Path to the manifest file
        api_url: API endpoint URL
        api_key: API authentication key
    
    Returns:
        dict with upload result
    """
    
    # Validate type
    if manifest_type not in VALID_TYPES:
        raise ValueError(f"Invalid manifest type: {manifest_type}. Must be one of: {VALID_TYPES}")
    
    # Check file exists
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")
    
    # Read file
    with open(file_path, 'rb') as f:
        file_data = f.read()
    
    # Get filename
    filename = os.path.basename(file_path)
    file_size = len(file_data)
    
    print(f"Uploading {filename} ({file_size / 1024:.2f} KB) as {manifest_type}...")
    
    # Encode to base64
    base64_data = base64.b64encode(file_data).decode('utf-8')
    
    # Create payload
    payload = json.dumps({
        "type": manifest_type,
        "filename": filename,
        "data": base64_data
    }).encode('utf-8')
    
    # Create request
    req = Request(api_url, data=payload, method='POST')
    req.add_header('Content-Type', 'application/json')
    req.add_header('x-api-key', api_key)
    
    try:
        with urlopen(req, timeout=120) as response:
            result = json.loads(response.read().decode('utf-8'))
            
            if result.get('success'):
                print(f"✓ Upload successful!")
                print(f"  Type: {result['manifest']['type']}")
                print(f"  Size: {result['manifest']['size']} bytes")
                print(f"  URL: {result['manifest']['url']}")
                return result
            else:
                raise Exception(f"Upload failed: {result.get('error', 'Unknown error')}")
                
    except HTTPError as e:
        error_body = e.read().decode('utf-8')
        raise Exception(f"HTTP Error {e.code}: {error_body}")
    except URLError as e:
        raise Exception(f"URL Error: {e.reason}")


def main():
    parser = argparse.ArgumentParser(
        description='Upload manifest files to Promos Ink Supply Chain',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python upload_manifest.py --type customink --file "customink_orders.xlsx"
  python upload_manifest.py --type sanmar --file "sanmar.xlsx"
  python upload_manifest.py --type ss --file "s&s.xlsx"
  python upload_manifest.py --type inbound --file "inbound.csv"
        """
    )
    
    parser.add_argument('--type', '-t', required=True, choices=VALID_TYPES,
                        help='Manifest type')
    parser.add_argument('--file', '-f', required=True,
                        help='Path to manifest file')
    parser.add_argument('--api-url', default=API_URL,
                        help='API endpoint URL')
    parser.add_argument('--api-key', default=API_KEY,
                        help='API authentication key')
    
    args = parser.parse_args()
    
    print("=" * 50)
    print("Promos Ink Supply Chain - Manifest Upload")
    print("=" * 50)
    print(f"Type: {args.type}")
    print(f"File: {args.file}")
    print()
    
    try:
        result = upload_manifest(args.type, args.file, args.api_url, args.api_key)
        print("\nDone!")
        return 0
    except Exception as e:
        print(f"\n✗ Error: {e}", file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())

