#!/usr/bin/env python3
"""
Build tracking index from CLOUD manifests and upload to Vercel
Run this after new manifests are uploaded via email webhook
"""

import requests
import pandas as pd
from io import BytesIO
import json

API_BASE = "https://package-confirmation-app.vercel.app"
API_KEY = "promos-label-2024"

import re

def normalize_tracking(tracking):
    """Normalize tracking number - uppercase, alphanumeric only"""
    return re.sub(r'[^A-Za-z0-9]', '', tracking).upper()

def build_index():
    print("=" * 60)
    print("Building Tracking Index from Cloud Manifests")
    print("=" * 60)
    
    # Get all manifests from cloud
    r = requests.get(f"{API_BASE}/api/manifests?action=list")
    data = r.json()
    manifests = data.get('manifests', [])
    
    print(f"Found {len(manifests)} manifests in cloud")
    
    index = {}
    
    # Process S&S manifests
    ss_files = [m for m in manifests if m.get('type') == 'ss']
    print(f"\nProcessing {len(ss_files)} S&S manifests...")
    for m in ss_files:
        try:
            file_r = requests.get(m['url'])
            df = pd.read_excel(BytesIO(file_r.content), header=1)
            
            # Find columns
            tracking_col = None
            po_col = None
            customer_col = None
            
            for col in df.columns:
                col_lower = str(col).lower()
                if 'tracking' in col_lower:
                    tracking_col = col
                elif 'po' in col_lower or 'purchase' in col_lower:
                    po_col = col
                elif 'customer' in col_lower or 'decorator' in col_lower or 'company' in col_lower:
                    customer_col = col
            
            if tracking_col:
                count = 0
                for _, row in df.iterrows():
                    tracking = str(row.get(tracking_col, '')).strip()
                    if tracking and tracking != 'nan' and len(tracking) > 5:
                        normalized = normalize_tracking(tracking)
                        index[normalized] = {
                            'source': 'ss',
                            'sourceType': 'ss',
                            'po': str(row.get(po_col, '')).strip() if po_col else '',
                            'customer': str(row.get(customer_col, '')).strip() if customer_col else ''
                        }
                        count += 1
                print(f"  {m['filename']}: {count} tracking numbers")
        except Exception as e:
            print(f"  {m['filename']}: Error - {e}")
    
    # Process Sanmar manifests
    sanmar_files = [m for m in manifests if m.get('type') == 'sanmar']
    print(f"\nProcessing {len(sanmar_files)} Sanmar manifests...")
    for m in sanmar_files:
        try:
            file_r = requests.get(m['url'])
            df = pd.read_csv(BytesIO(file_r.content))
            
            # Find columns
            tracking_col = None
            po_col = None
            customer_col = None
            
            for col in df.columns:
                col_lower = str(col).lower()
                if 'tracking' in col_lower:
                    tracking_col = col
                elif 'po' in col_lower or 'purchase' in col_lower:
                    po_col = col
                elif 'customer' in col_lower or 'ship to' in col_lower or 'company' in col_lower:
                    customer_col = col
            
            if tracking_col:
                count = 0
                for _, row in df.iterrows():
                    tracking = str(row.get(tracking_col, '')).strip()
                    if tracking and tracking != 'nan' and len(tracking) > 5:
                        normalized = normalize_tracking(tracking)
                        index[normalized] = {
                            'source': 'sanmar',
                            'sourceType': 'sanmar',
                            'po': str(row.get(po_col, '')).strip() if po_col else '',
                            'customer': str(row.get(customer_col, '')).strip() if customer_col else ''
                        }
                        count += 1
                print(f"  {m['filename']}: {count} tracking numbers")
        except Exception as e:
            print(f"  {m['filename']}: Error - {e}")
    
    # Process CustomInk orders
    ci_files = [m for m in manifests if m.get('type') == 'customink']
    print(f"\nProcessing {len(ci_files)} CustomInk manifests...")
    for m in ci_files:
        try:
            file_r = requests.get(m['url'])
            df = pd.read_excel(BytesIO(file_r.content))
            
            tracking_col = None
            po_col = None
            customer_col = None
            
            for col in df.columns:
                col_lower = str(col).lower()
                if 'tracking' in col_lower:
                    tracking_col = col
                elif 'order' in col_lower:
                    po_col = col
                elif 'customer' in col_lower or 'name' in col_lower:
                    customer_col = col
            
            if tracking_col:
                count = 0
                for _, row in df.iterrows():
                    tracking = str(row.get(tracking_col, '')).strip()
                    if tracking and tracking != 'nan' and len(tracking) > 5:
                        normalized = normalize_tracking(tracking)
                        index[normalized] = {
                            'source': 'customink',
                            'sourceType': 'customink',
                            'po': str(row.get(po_col, '')).strip() if po_col else '',
                            'customer': str(row.get(customer_col, '')).strip() if customer_col else ''
                        }
                        count += 1
                print(f"  {m['filename']}: {count} tracking numbers")
        except Exception as e:
            print(f"  {m['filename']}: Error - {e}")
    
    # Process Inbound (QV) manifests
    inbound_files = [m for m in manifests if m.get('type') == 'inbound']
    print(f"\nProcessing {len(inbound_files)} Inbound manifests...")
    for m in inbound_files:
        try:
            file_r = requests.get(m['url'])
            df = pd.read_csv(BytesIO(file_r.content))
            
            tracking_col = None
            ref_col = None
            shipper_col = None
            
            for col in df.columns:
                col_lower = str(col).lower()
                if 'tracking' in col_lower:
                    tracking_col = col
                elif 'reference' in col_lower or 'ref' in col_lower:
                    ref_col = col
                elif 'shipper' in col_lower or 'from' in col_lower:
                    shipper_col = col
            
            if tracking_col:
                count = 0
                for _, row in df.iterrows():
                    tracking = str(row.get(tracking_col, '')).strip()
                    if tracking and tracking != 'nan' and len(tracking) > 5:
                        normalized = normalize_tracking(tracking)
                        index[normalized] = {
                            'source': 'inbound',
                            'sourceType': 'inbound',
                            'po': str(row.get(ref_col, '')).strip() if ref_col else '',
                            'customer': str(row.get(shipper_col, '')).strip() if shipper_col else ''
                        }
                        count += 1
                print(f"  {m['filename']}: {count} tracking numbers")
        except Exception as e:
            print(f"  {m['filename']}: Error - {e}")
    
    print(f"\n{'=' * 60}")
    print(f"Total tracking numbers indexed: {len(index)}")
    
    # Upload index
    print("\nUploading index to cloud...")
    
    # API expects { index: {...} } format and x-api-key header
    payload = json.dumps({"index": index})
    
    response = requests.post(
        f"{API_BASE}/api/upload-index",
        headers={
            'x-api-key': API_KEY,
            'Content-Type': 'application/json'
        },
        data=payload
    )
    
    if response.status_code == 200:
        result = response.json()
        print(f"SUCCESS! Index uploaded: {result.get('indexSize', 0)} bytes")
        print(f"Tracking count: {result.get('trackingCount', 0)}")
    else:
        print(f"ERROR: {response.status_code} - {response.text}")
    
    return index

if __name__ == "__main__":
    build_index()
    print("\nDone!")

