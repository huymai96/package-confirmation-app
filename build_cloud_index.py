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
    sanmar_records = []  # For Sanmar combined manifest
    ss_records = []      # For S&S combined manifest
    today = get_today()
    
    # Calculate 10-day cutoff
    from datetime import timedelta
    ten_days_ago = (datetime.now() - timedelta(days=10)).strftime('%Y-%m-%d')
    
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
            
            # Find additional columns
            style_col = next((c for c in df.columns if 'style' in str(c).lower()), None)
            color_col = next((c for c in df.columns if 'color' in str(c).lower()), None)
            size_col = next((c for c in df.columns if 'size' in str(c).lower()), None)
            qty_col = next((c for c in df.columns if 'qty' in str(c).lower() or 'quantity' in str(c).lower()), None)
            ship_date_col = next((c for c in df.columns if 'ship' in str(c).lower() and 'date' in str(c).lower()), None)
            
            if tracking_col:
                count = 0
                for _, row in df.iterrows():
                    tracking = str(row.get(tracking_col, '')).strip()
                    if tracking and tracking != 'nan' and len(tracking) > 5:
                        normalized = normalize_tracking(tracking)
                        po = str(row.get(po_col, '')).strip() if po_col else ''
                        customer = str(row.get(customer_col, '')).strip() if customer_col else ''
                        ship_date = str(row.get(ship_date_col, '')).strip() if ship_date_col else ''
                        
                        index[normalized] = {
                            'source': 'ss',
                            'sourceType': 'ss',
                            'po': po,
                            'customer': customer
                        }
                        
                        record_date = ship_date[:10] if ship_date else today
                        if record_date >= ten_days_ago:
                            ss_records.append({
                                'tracking': tracking,
                                'po': po,
                                'customer': customer,
                                'shipDate': record_date,
                                'style': str(row.get(style_col, '')).strip() if style_col else '',
                                'color': str(row.get(color_col, '')).strip() if color_col else '',
                                'size': str(row.get(size_col, '')).strip() if size_col else '',
                                'qty': int(row.get(qty_col, 0)) if qty_col and pd.notna(row.get(qty_col)) else 0
                            })
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
            
            # Find additional columns
            style_col = next((c for c in df.columns if 'style' in str(c).lower()), None)
            color_col = next((c for c in df.columns if 'color' in str(c).lower()), None)
            size_col = next((c for c in df.columns if 'size' in str(c).lower()), None)
            qty_col = next((c for c in df.columns if 'qty' in str(c).lower() or 'shipped' in str(c).lower()), None)
            ship_date_col = next((c for c in df.columns if 'ship' in str(c).lower() and 'date' in str(c).lower()), None)
            
            if tracking_col:
                count = 0
                for _, row in df.iterrows():
                    tracking = str(row.get(tracking_col, '')).strip()
                    if tracking and tracking != 'nan' and len(tracking) > 5:
                        normalized = normalize_tracking(tracking)
                        po = str(row.get(po_col, '')).strip() if po_col else ''
                        customer = str(row.get(customer_col, '')).strip() if customer_col else ''
                        ship_date = str(row.get(ship_date_col, '')).strip() if ship_date_col else ''
                        
                        index[normalized] = {
                            'source': 'sanmar',
                            'sourceType': 'sanmar',
                            'po': po,
                            'customer': customer
                        }
                        
                        record_date = ship_date[:10] if ship_date else today
                        if record_date >= ten_days_ago:
                            sanmar_records.append({
                                'tracking': tracking,
                                'po': po,
                                'customer': customer,
                                'shipDate': record_date,
                                'style': str(row.get(style_col, '')).strip() if style_col else '',
                                'color': str(row.get(color_col, '')).strip() if color_col else '',
                                'size': str(row.get(size_col, '')).strip() if size_col else '',
                                'qty': int(row.get(qty_col, 0)) if qty_col and pd.notna(row.get(qty_col)) else 0
                            })
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
            
            # Find additional columns
            style_col = next((c for c in df.columns if 'style' in str(c).lower() or 'product' in str(c).lower()), None)
            color_col = next((c for c in df.columns if 'color' in str(c).lower()), None)
            size_col = next((c for c in df.columns if 'size' in str(c).lower()), None)
            qty_col = next((c for c in df.columns if 'qty' in str(c).lower() or 'quantity' in str(c).lower()), None)
            due_date_col = next((c for c in df.columns if 'due' in str(c).lower() or 'date' in str(c).lower()), None)
            
            if tracking_col:
                count = 0
                for _, row in df.iterrows():
                    tracking = str(row.get(tracking_col, '')).strip()
                    if tracking and tracking != 'nan' and len(tracking) > 5:
                        normalized = normalize_tracking(tracking)
                        po = str(row.get(po_col, '')).strip() if po_col else ''
                        customer = str(row.get(customer_col, '')).strip() if customer_col else ''
                        due_date = str(row.get(due_date_col, '')).strip() if due_date_col else ''
                        
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
            
            # Find additional columns  
            ship_date_col = next((c for c in df.columns if 'ship' in str(c).lower() and 'date' in str(c).lower()), None)
            
            if tracking_col:
                count = 0
                for _, row in df.iterrows():
                    tracking = str(row.get(tracking_col, '')).strip()
                    if tracking and tracking != 'nan' and len(tracking) > 5:
                        normalized = normalize_tracking(tracking)
                        po = str(row.get(ref_col, '')).strip() if ref_col else ''
                        shipper = str(row.get(shipper_col, '')).strip() if shipper_col else ''
                        ship_date = str(row.get(ship_date_col, '')).strip() if ship_date_col else ''
                        
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
    
    # Upload separate combined manifests for Sanmar and S&S
    print(f"\nSanmar records (last 10 days): {len(sanmar_records)}")
    print(f"S&S records (last 10 days): {len(ss_records)}")
    
    # Create and upload Sanmar combined Excel
    if sanmar_records:
        print("\nUploading Sanmar combined manifest...")
        sanmar_df = pd.DataFrame(sanmar_records)
        sanmar_buffer = BytesIO()
        sanmar_df.to_excel(sanmar_buffer, index=False)
        sanmar_buffer.seek(0)
        
        sanmar_response = requests.post(
            f"{API_BASE}/api/manifests",
            headers={'x-api-key': UPLOAD_KEY},
            files={'file': ('sanmar_combined.xlsx', sanmar_buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')},
            data={'type': 'sanmar_combined'}
        )
        
        if sanmar_response.status_code == 200:
            print(f"  SUCCESS! sanmar_combined.xlsx ({len(sanmar_records)} records)")
        else:
            print(f"  ERROR: {sanmar_response.status_code} - {sanmar_response.text}")
    
    # Create and upload S&S combined Excel
    if ss_records:
        print("\nUploading S&S combined manifest...")
        ss_df = pd.DataFrame(ss_records)
        ss_buffer = BytesIO()
        ss_df.to_excel(ss_buffer, index=False)
        ss_buffer.seek(0)
        
        ss_response = requests.post(
            f"{API_BASE}/api/manifests",
            headers={'x-api-key': UPLOAD_KEY},
            files={'file': ('ss_combined.xlsx', ss_buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')},
            data={'type': 'ss_combined'}
        )
        
        if ss_response.status_code == 200:
            print(f"  SUCCESS! ss_combined.xlsx ({len(ss_records)} records)")
        else:
            print(f"  ERROR: {ss_response.status_code} - {ss_response.text}")
    
    return index

if __name__ == "__main__":
    build_index()
    print("\nDone!")

