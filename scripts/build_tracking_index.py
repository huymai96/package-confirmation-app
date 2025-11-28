#!/usr/bin/env python3
"""
Build Tracking Index for Promos Ink Supply Chain

This script builds a tracking index from manifest files and uploads it to the cloud.
Run this whenever manifests are updated.

Usage:
    python build_tracking_index.py
"""

import os
import re
import json
import requests
from pathlib import Path
from datetime import datetime

# Optional: pandas for Excel files
try:
    import pandas as pd
    HAS_PANDAS = True
except ImportError:
    HAS_PANDAS = False
    print("Warning: pandas not installed. Excel files will be skipped.")
    print("Install with: pip install pandas openpyxl")

# ============================================
# CONFIGURATION
# ============================================
# Try multiple paths (different computers use different names)
MANIFEST_DIRS = [
    r"\\192.168.2.5\data\Huy\desktop receiving tool",
    r"\\promos-dc01\data\Huy\desktop receiving tool",
]

def get_manifest_dir():
    """Find a working manifest directory"""
    for path in MANIFEST_DIRS:
        if Path(path).exists():
            return path
    return None

MANIFEST_DIR = get_manifest_dir()
API_URL = "https://package-confirmation-app.vercel.app"
API_KEY = "promos-label-2024"

# Or use local files if cloud manifests not available
USE_LOCAL_FILES = True

# ============================================
# MANIFEST CONFIGURATION
# ============================================
MANIFEST_CONFIG = {
    'sanmar': {
        'patterns': ['sanmar'],
        'tracking_cols': [11, 12],  # Column L, M (0-indexed: 11, 12)
        'po_col': 4,                # Column E
        'customer_col': 2           # Column C
    },
    'ss': {
        'patterns': ['s&s', 'ss', 'activewear'],
        'tracking_cols': [7],       # Column H
        'po_col': 2,                # Column C
        'customer_col': 1           # Column B
    },
    'inbound': {
        'patterns': ['inbound'],
        'tracking_cols': [0],       # Column A (but we search all)
        'po_col': 1,                # Column B (reference)
        'customer_col': 4           # Column E (shipper)
    }
}

# ============================================
# HELPER FUNCTIONS
# ============================================
def normalize_tracking(val):
    """Normalize tracking number for consistent lookup"""
    return re.sub(r'[^A-Za-z0-9]', '', str(val or '')).upper()

def detect_manifest_type(filename):
    """Detect manifest type from filename"""
    lower = filename.lower()
    for mtype, config in MANIFEST_CONFIG.items():
        for pattern in config['patterns']:
            if pattern in lower:
                return mtype, config
    return 'unknown', None

def read_manifest(filepath):
    """Read manifest file (CSV or Excel)"""
    filepath = Path(filepath)
    
    if filepath.suffix.lower() == '.csv':
        rows = []
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                # Simple CSV parsing
                values = []
                current = ''
                in_quotes = False
                for char in line:
                    if char == '"':
                        in_quotes = not in_quotes
                    elif char == ',' and not in_quotes:
                        values.append(current.strip())
                        current = ''
                    elif char not in '\r\n':
                        current += char
                values.append(current.strip())
                rows.append(values)
        return rows
    
    elif filepath.suffix.lower() in ['.xlsx', '.xls'] and HAS_PANDAS:
        df = pd.read_excel(filepath, header=None)
        return df.values.tolist()
    
    return []

def read_orders_file(filepath):
    """Read CustomInk orders file and build order index"""
    order_index = {}
    
    if not HAS_PANDAS:
        return order_index
    
    try:
        df = pd.read_excel(filepath)
        cols_lower = {str(c).lower(): c for c in df.columns}
        
        # Find relevant columns
        order_col = None
        dept_col = None
        due_col = None
        status_col = None
        
        for col in df.columns:
            col_lower = str(col).lower()
            if 'order' in col_lower or col_lower == 'id':
                order_col = col
            if 'vendor' in col_lower or 'department' in col_lower:
                dept_col = col
            if 'due' in col_lower:
                due_col = col
            if 'status' in col_lower:
                status_col = col
        
        if order_col:
            for _, row in df.iterrows():
                order_id = str(row.get(order_col, ''))
                digits = re.sub(r'[^0-9]', '', order_id)
                if digits and len(digits) >= 6:
                    order_index[digits] = {
                        'department': str(row.get(dept_col, '')) if dept_col else '',
                        'dueDate': str(row.get(due_col, '')) if due_col else '',
                        'status': str(row.get(status_col, '')) if status_col else ''
                    }
    except Exception as e:
        print(f"  Error reading orders: {e}")
    
    return order_index

def build_index_from_local():
    """Build tracking index from local manifest files"""
    index = {}
    stats = {
        'sanmar': 0,
        'ss': 0,
        'inbound': 0,
        'total': 0
    }
    
    # Find working manifest directory
    manifest_dir_path = get_manifest_dir()
    if not manifest_dir_path:
        print("Error: Could not find manifest directory!")
        print("Tried:")
        for p in MANIFEST_DIRS:
            print(f"  - {p}")
        return None, None
    
    manifest_dir = Path(manifest_dir_path)
    print(f"Using manifest directory: {manifest_dir_path}")
    
    # First, build order index from CustomInk orders
    order_index = {}
    orders_file = manifest_dir / "customink_orders.xlsx"
    if orders_file.exists():
        print(f"Reading orders file: {orders_file.name}")
        order_index = read_orders_file(orders_file)
        print(f"  Loaded {len(order_index)} orders")
    
    # Find all manifest files
    manifest_files = []
    for ext in ['*.csv', '*.xlsx', '*.xls']:
        manifest_files.extend(manifest_dir.glob(ext))
    
    print(f"\nFound {len(manifest_files)} files in {MANIFEST_DIR}")
    
    for filepath in manifest_files:
        filename = filepath.name
        
        # Skip orders file (already processed)
        if 'order' in filename.lower() or 'customink' in filename.lower():
            continue
        
        mtype, config = detect_manifest_type(filename)
        if not config:
            continue
        
        print(f"\nProcessing: {filename} ({mtype})")
        rows = read_manifest(filepath)
        print(f"  {len(rows)} rows")
        
        added = 0
        for row in rows:
            if not row:
                continue
            
            # Get tracking numbers
            trackings = []
            
            if mtype == 'inbound':
                # For inbound, search first few columns for tracking-like values
                for col in range(min(len(row), 10)):
                    val = normalize_tracking(row[col])
                    if len(val) >= 10 and (val.startswith('1Z') or re.match(r'^\d{12,}', val)):
                        trackings.append(val)
            else:
                # Use configured tracking columns
                for col_idx in config['tracking_cols']:
                    if col_idx < len(row):
                        val = normalize_tracking(row[col_idx])
                        if len(val) >= 10:
                            trackings.append(val)
            
            # Add each tracking to index
            for tracking in trackings:
                if tracking in index:
                    continue  # Skip duplicates
                
                po = str(row[config['po_col']]) if config['po_col'] < len(row) else ''
                customer = str(row[config['customer_col']]) if config['customer_col'] < len(row) else ''
                
                entry = {
                    'source': filename,
                    'sourceType': mtype,
                    'po': po,
                    'customer': customer
                }
                
                # Enrich with order info
                if po:
                    po_digits = re.sub(r'[^0-9]', '', po)
                    if po_digits in order_index:
                        entry['department'] = order_index[po_digits].get('department', '')
                        entry['dueDate'] = order_index[po_digits].get('dueDate', '')
                        entry['status'] = order_index[po_digits].get('status', '')
                
                # Special handling for inbound
                if mtype == 'inbound':
                    ref_value = str(row[1]) if len(row) > 1 else ''
                    shipper_value = str(row[4]) if len(row) > 4 else ''
                    entry['shipperName'] = shipper_value
                    entry['referenceTokens'] = [t.strip() for t in ref_value.split('|') if t.strip()]
                    
                    # Try to find CI order from reference
                    for token in entry['referenceTokens']:
                        ci_match = re.search(r'(\d{7,10})[A-Za-z]', token)
                        if ci_match and ci_match.group(1) in order_index:
                            entry['department'] = order_index[ci_match.group(1)].get('department', '')
                            entry['dueDate'] = order_index[ci_match.group(1)].get('dueDate', '')
                            entry['status'] = order_index[ci_match.group(1)].get('status', '')
                            entry['po'] = ci_match.group(1)
                            break
                
                index[tracking] = entry
                added += 1
                stats[mtype] += 1
        
        print(f"  Added {added} trackings")
    
    stats['total'] = len(index)
    return index, stats

def upload_index(index):
    """Upload index to cloud API"""
    print("\nUploading index to cloud...")
    
    try:
        # Upload as JSON to blob storage via API
        response = requests.post(
            f"{API_URL}/api/upload-index",
            headers={
                'x-api-key': API_KEY,
                'Content-Type': 'application/json'
            },
            json={'index': index},
            timeout=60
        )
        
        if response.status_code == 200:
            result = response.json()
            print(f"✓ Index uploaded successfully")
            return True
        else:
            print(f"✗ Upload failed: {response.status_code}")
            print(response.text)
            return False
            
    except Exception as e:
        print(f"✗ Upload error: {e}")
        return False

def save_index_locally(index, stats):
    """Save index to local file (backup)"""
    output_path = Path(MANIFEST_DIR) / "tracking_index.json"
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump({
            'index': index,
            'stats': stats,
            'buildTime': datetime.now().isoformat()
        }, f)
    
    print(f"\n✓ Index saved locally: {output_path}")
    print(f"  Size: {output_path.stat().st_size:,} bytes")

# ============================================
# MAIN
# ============================================
def main():
    print("=" * 60)
    print("Promos Ink - Build Tracking Index")
    print("=" * 60)
    print()
    
    start_time = datetime.now()
    
    # Build index from local files
    print("Building index from local manifest files...")
    index, stats = build_index_from_local()
    
    if not index:
        print("\n✗ Failed to build index")
        input("\nPress Enter to exit...")
        return
    
    # Print stats
    print("\n" + "=" * 60)
    print("INDEX STATISTICS")
    print("=" * 60)
    print(f"  Total trackings: {stats['total']:,}")
    print(f"  - Sanmar:  {stats['sanmar']:,}")
    print(f"  - S&S:     {stats['ss']:,}")
    print(f"  - Inbound: {stats['inbound']:,}")
    print(f"  Build time: {(datetime.now() - start_time).total_seconds():.1f} seconds")
    
    # Save locally
    save_index_locally(index, stats)
    
    # Upload to cloud
    print("\nUploading to cloud...")
    upload_index(index)
    
    print("\n" + "=" * 60)
    print("DONE!")
    print("=" * 60)
    print("\nThe index has been saved locally.")
    print("The cloud API will automatically use this index for instant lookups.")
    
    input("\nPress Enter to exit...")

if __name__ == "__main__":
    main()

