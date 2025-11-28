#!/usr/bin/env python3
"""
Build tracking index from CLOUD manifests and upload to Vercel
Run this after new manifests are uploaded via email webhook
Also builds combined manifest for offline/backup use
"""

import requests
import pandas as pd
from io import BytesIO
import json
import re
from datetime import datetime

API_BASE = "https://package-confirmation-app.vercel.app"
API_KEY = "promos-label-2024"
UPLOAD_KEY = "promos-ink-2024"

def normalize_tracking(tracking):
    """Normalize tracking number - uppercase, alphanumeric only"""
    return re.sub(r'[^A-Za-z0-9]', '', tracking).upper()

def get_today():
    """Get today's date in YYYY-MM-DD format"""
    return datetime.now().strftime('%Y-%m-%d')

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
    
    # Process combined files first (master files)
    ss_combined = [m for m in manifests if 'ss_combined' in m.get('filename', '')]
    sanmar_combined = [m for m in manifests if 'sanmar_combined' in m.get('filename', '')]
    
    # Index from S&S combined file
    if ss_combined:
        print(f"\nProcessing S&S combined file...")
        for m in ss_combined:
            try:
                file_r = requests.get(m['url'])
                df = pd.read_excel(BytesIO(file_r.content))  # No header offset for combined
                
                # Find columns
                tracking_col = None
                po_col = None
                customer_col = None
                
                for col in df.columns:
                    col_lower = str(col).lower()
                    if 'tracking' in col_lower:
                        tracking_col = col
                    elif 'customer po' in col_lower:
                        po_col = col
                    elif 'customer name' in col_lower:
                        customer_col = col
                
                if tracking_col:
                    count = 0
                    for _, row in df.iterrows():
                        tracking = str(row.get(tracking_col, '')).strip()
                        if tracking and tracking != 'nan' and len(tracking) > 5:
                            normalized = normalize_tracking(tracking)
                            po = str(row.get(po_col, '')).strip() if po_col else ''
                            customer = str(row.get(customer_col, '')).strip() if customer_col else ''
                            
                            index[normalized] = {
                                'source': 'ss',
                                'sourceType': 'ss',
                                'po': po,
                                'customer': customer
                            }
                            count += 1
                    print(f"  {m['filename']}: {count} tracking numbers")
            except Exception as e:
                print(f"  {m['filename']}: Error - {e}")
    
    # Index from Sanmar combined file
    if sanmar_combined:
        print(f"\nProcessing Sanmar combined file...")
        for m in sanmar_combined:
            try:
                file_r = requests.get(m['url'])
                df = pd.read_excel(BytesIO(file_r.content))  # No header offset for combined
                
                # Find columns
                tracking_col = None
                po_col = None
                customer_col = None
                
                for col in df.columns:
                    col_lower = str(col).lower()
                    if 'tracking' in col_lower:
                        tracking_col = col
                    elif 'customer po' in col_lower:
                        po_col = col
                    elif 'customer name' in col_lower:
                        customer_col = col
                
                if tracking_col:
                    count = 0
                    for _, row in df.iterrows():
                        tracking = str(row.get(tracking_col, '')).strip()
                        if tracking and tracking != 'nan' and len(tracking) > 5:
                            normalized = normalize_tracking(tracking)
                            po = str(row.get(po_col, '')).strip() if po_col else ''
                            customer = str(row.get(customer_col, '')).strip() if customer_col else ''
                            
                            index[normalized] = {
                                'source': 'sanmar',
                                'sourceType': 'sanmar',
                                'po': po,
                                'customer': customer
                            }
                            count += 1
                    print(f"  {m['filename']}: {count} tracking numbers")
            except Exception as e:
                print(f"  {m['filename']}: Error - {e}")
    
    # Process individual S&S manifests (from email)
    ss_files = [m for m in manifests if m.get('type') == 'ss' and 'combined' not in m.get('filename', '')]
    print(f"\nProcessing {len(ss_files)} S&S manifests...")
    for m in ss_files:
        try:
            file_r = requests.get(m['url'])
            df = pd.read_excel(BytesIO(file_r.content), header=1)
            
            # Find tracking column for index
            tracking_col = None
            po_col = None
            customer_col = None
            ship_date_col = None
            
            for col in df.columns:
                col_lower = str(col).lower()
                if 'tracking' in col_lower:
                    tracking_col = col
                elif 'customer po' in col_lower:
                    po_col = col
                elif 'customer name' in col_lower:
                    customer_col = col
                elif 'ship date' in col_lower:
                    ship_date_col = col
            
            if tracking_col:
                count = 0
                for _, row in df.iterrows():
                    tracking = str(row.get(tracking_col, '')).strip()
                    if tracking and tracking != 'nan' and len(tracking) > 5:
                        normalized = normalize_tracking(tracking)
                        po = str(row.get(po_col, '')).strip() if po_col else ''
                        customer = str(row.get(customer_col, '')).strip() if customer_col else ''
                        
                        index[normalized] = {
                            'source': 'ss',
                            'sourceType': 'ss',
                            'po': po,
                            'customer': customer
                        }
                        count += 1
                print(f"  {m['filename']}: {count} tracking numbers")
                
        except Exception as e:
            print(f"  {m['filename']}: Error - {e}")
    
    # Process Sanmar manifests
    sanmar_files = [m for m in manifests if m.get('type') == 'sanmar' and 'combined' not in m.get('filename', '')]
    print(f"\nProcessing {len(sanmar_files)} Sanmar manifests...")
    for m in sanmar_files:
        try:
            file_r = requests.get(m['url'])
            # Skip if content looks corrupted (starts with base64 or non-CSV data)
            content = file_r.content
            if content[:4] not in [b'"Dec', b'Deco', b'\xef\xbb\xbf"', b'\xef\xbb\xbfD']:  # Valid CSV starts
                if not content[:50].decode('utf-8', errors='ignore').strip().startswith('"') and \
                   not content[:50].decode('utf-8', errors='ignore').strip().startswith('Deco'):
                    print(f"  {m['filename']}: Skipping - appears corrupted")
                    continue
            df = pd.read_csv(BytesIO(content))
            
            # Find tracking column for index
            tracking_col = None
            po_col = None
            customer_col = None
            ship_date_col = None
            
            for col in df.columns:
                col_lower = str(col).lower()
                if 'tracking' in col_lower:
                    tracking_col = col
                elif 'customer po' in col_lower:
                    po_col = col
                elif 'customer name' in col_lower:
                    customer_col = col
                elif 'shipdate' in col_lower:
                    ship_date_col = col
            
            if tracking_col:
                count = 0
                for _, row in df.iterrows():
                    tracking = str(row.get(tracking_col, '')).strip()
                    if tracking and tracking != 'nan' and len(tracking) > 5:
                        normalized = normalize_tracking(tracking)
                        po = str(row.get(po_col, '')).strip() if po_col else ''
                        customer = str(row.get(customer_col, '')).strip() if customer_col else ''
                        
                        index[normalized] = {
                            'source': 'sanmar',
                            'sourceType': 'sanmar',
                            'po': po,
                            'customer': customer
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
                        po = str(row.get(po_col, '')).strip() if po_col else ''
                        customer = str(row.get(customer_col, '')).strip() if customer_col else ''
                        
                        index[normalized] = {
                            'source': 'customink',
                            'sourceType': 'customink',
                            'po': po,
                            'customer': customer
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
                        po = str(row.get(ref_col, '')).strip() if ref_col else ''
                        shipper = str(row.get(shipper_col, '')).strip() if shipper_col else ''
                        
                        index[normalized] = {
                            'source': 'inbound',
                            'sourceType': 'inbound',
                            'po': po,
                            'customer': shipper
                        }
                        count += 1
                print(f"  {m['filename']}: {count} tracking numbers")
        except Exception as e:
            print(f"  {m['filename']}: Error - {e}")
    
    print(f"\n{'=' * 60}")
    print(f"Total tracking numbers indexed: {len(index)}")
    
    # Upload index
    print("\nUploading index to cloud...")
    
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
    
    # Note: Combined manifest files (sanmar_combined.xlsx, ss_combined.xlsx) are 
    # master files uploaded separately via upload_master.py - don't modify them here
    
    return index

if __name__ == "__main__":
    build_index()
    print("\nDone!")
