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
from datetime import datetime, timedelta

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
    sanmar_dfs = []  # For Sanmar combined manifest (original structure)
    ss_dfs = []      # For S&S combined manifest (original structure)
    today = get_today()
    
    # Calculate 10-day cutoff
    ten_days_ago = (datetime.now() - timedelta(days=10)).strftime('%Y-%m-%d')
    
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
            
            # Add original dataframe for combined (filter by date if possible)
            if ship_date_col and ship_date_col in df.columns:
                df['_ship_date_str'] = df[ship_date_col].astype(str).str[:10]
                df_filtered = df[df['_ship_date_str'] >= ten_days_ago].drop(columns=['_ship_date_str'])
                if len(df_filtered) > 0:
                    ss_dfs.append(df_filtered)
            else:
                ss_dfs.append(df)
                
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
            
            # Add original dataframe for combined (filter by date if possible)
            if ship_date_col and ship_date_col in df.columns:
                df['_ship_date_str'] = df[ship_date_col].astype(str).str[:10].str.replace('/', '-')
                df_filtered = df[df['_ship_date_str'] >= ten_days_ago].drop(columns=['_ship_date_str'])
                if len(df_filtered) > 0:
                    sanmar_dfs.append(df_filtered)
            else:
                sanmar_dfs.append(df)
                
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
    
    # Upload combined manifests (preserving original column structure)
    
    # Clean up old combined files first
    print("\nCleaning up old combined files...")
    for m in manifests:
        if 'combined' in m.get('filename', ''):
            try:
                del_response = requests.delete(
                    f"{API_BASE}/api/manifests",
                    headers={'x-api-key': UPLOAD_KEY},
                    params={'url': m['url']}
                )
                if del_response.status_code == 200:
                    print(f"  Deleted old: {m['filename']}")
            except Exception as e:
                print(f"  Failed to delete {m['filename']}: {e}")
    
    # Sanmar combined XLSX (headers in row 1, same as original sanmar.xlsx)
    if sanmar_dfs:
        print(f"\nCreating Sanmar combined manifest...")
        sanmar_combined = pd.concat(sanmar_dfs, ignore_index=True)
        # Remove duplicates based on tracking number
        tracking_cols = [c for c in sanmar_combined.columns if 'tracking' in str(c).lower()]
        if tracking_cols:
            sanmar_combined = sanmar_combined.drop_duplicates(subset=tracking_cols, keep='first')
        
        print(f"  Total rows: {len(sanmar_combined)}")
        print(f"  Columns: {list(sanmar_combined.columns)[:5]}...")
        
        sanmar_buffer = BytesIO()
        # Write Excel with headers in row 1 (standard format)
        sanmar_combined.to_excel(sanmar_buffer, index=False, engine='openpyxl')
        sanmar_buffer.seek(0)
        
        sanmar_response = requests.post(
            f"{API_BASE}/api/manifests",
            headers={'x-api-key': UPLOAD_KEY},
            files={'file': ('sanmar_combined.xlsx', sanmar_buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')},
            data={'type': 'sanmar_combined'}
        )
        
        if sanmar_response.status_code == 200:
            print(f"  SUCCESS! sanmar_combined.xlsx uploaded")
        else:
            print(f"  ERROR: {sanmar_response.status_code} - {sanmar_response.text}")
    
    # S&S combined Excel (headers in row 1, same as original s&s.xlsx)
    if ss_dfs:
        print(f"\nCreating S&S combined manifest...")
        ss_combined = pd.concat(ss_dfs, ignore_index=True)
        # Remove duplicates based on tracking number
        tracking_cols = [c for c in ss_combined.columns if 'tracking' in str(c).lower()]
        if tracking_cols:
            ss_combined = ss_combined.drop_duplicates(subset=tracking_cols, keep='first')
        
        print(f"  Total rows: {len(ss_combined)}")
        print(f"  Columns: {list(ss_combined.columns)[:5]}...")
        
        ss_buffer = BytesIO()
        # Write Excel with headers in row 1 (standard format, like original s&s.xlsx)
        ss_combined.to_excel(ss_buffer, index=False, engine='openpyxl')
        ss_buffer.seek(0)
        
        ss_response = requests.post(
            f"{API_BASE}/api/manifests",
            headers={'x-api-key': UPLOAD_KEY},
            files={'file': ('ss_combined.xlsx', ss_buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')},
            data={'type': 'ss_combined'}
        )
        
        if ss_response.status_code == 200:
            print(f"  SUCCESS! ss_combined.xlsx uploaded")
        else:
            print(f"  ERROR: {ss_response.status_code} - {ss_response.text}")
    
    return index

if __name__ == "__main__":
    build_index()
    print("\nDone!")
