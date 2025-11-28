#!/usr/bin/env python3
"""
Upload master S&S and Sanmar files as the combined manifests.
These are the exact format needed for the label print GUI.
"""

import requests
import pandas as pd
from io import BytesIO

API_BASE = "https://package-confirmation-app.vercel.app"
UPLOAD_KEY = "promos-ink-2024"

# Paths to master files
SS_PATH = r"\\192.168.2.5\data\Huy\desktop receiving tool\s&s.xlsx"
SANMAR_PATH = r"\\192.168.2.5\data\Huy\desktop receiving tool\sanmar.xlsx"

def main():
    print("=" * 60)
    print("Uploading Master Manifest Files")
    print("=" * 60)
    
    # First, delete ALL existing manifests to start fresh
    print("\nFetching current manifests...")
    r = requests.get(f"{API_BASE}/api/manifests?action=list")
    data = r.json()
    manifests = data.get('manifests', [])
    
    print(f"Found {len(manifests)} existing manifests")
    
    print("\nDeleting all existing manifests...")
    for m in manifests:
        try:
            del_response = requests.delete(
                f"{API_BASE}/api/manifests",
                headers={'x-api-key': UPLOAD_KEY},
                params={'url': m['url']}
            )
            if del_response.status_code == 200:
                print(f"  Deleted: {m['filename']}")
            else:
                print(f"  Failed to delete {m['filename']}: {del_response.status_code}")
        except Exception as e:
            print(f"  Error deleting {m['filename']}: {e}")
    
    # Read and upload S&S master file
    print(f"\n--- S&S Master File ---")
    print(f"Reading: {SS_PATH}")
    try:
        # Read the file as-is (binary)
        with open(SS_PATH, 'rb') as f:
            ss_content = f.read()
        
        # Verify it's valid
        df_ss = pd.read_excel(BytesIO(ss_content), header=1)
        print(f"  Rows: {len(df_ss)}")
        print(f"  Columns: {list(df_ss.columns)}")
        
        # Upload as ss_combined.xlsx
        ss_response = requests.post(
            f"{API_BASE}/api/manifests",
            headers={'x-api-key': UPLOAD_KEY},
            files={'file': ('ss_combined.xlsx', ss_content, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')},
            data={'type': 'ss_combined'}
        )
        
        if ss_response.status_code == 200:
            print(f"  SUCCESS! ss_combined.xlsx uploaded")
        else:
            print(f"  ERROR: {ss_response.status_code} - {ss_response.text}")
            
    except Exception as e:
        print(f"  Error: {e}")
    
    # Read and upload Sanmar master file
    print(f"\n--- Sanmar Master File ---")
    print(f"Reading: {SANMAR_PATH}")
    try:
        # Read the file as-is (binary)
        with open(SANMAR_PATH, 'rb') as f:
            sanmar_content = f.read()
        
        # Verify it's valid
        df_sm = pd.read_excel(BytesIO(sanmar_content))
        print(f"  Rows: {len(df_sm)}")
        print(f"  Columns: {list(df_sm.columns)}")
        
        # Upload as sanmar_combined.xlsx (keeping xlsx format like original)
        sanmar_response = requests.post(
            f"{API_BASE}/api/manifests",
            headers={'x-api-key': UPLOAD_KEY},
            files={'file': ('sanmar_combined.xlsx', sanmar_content, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')},
            data={'type': 'sanmar_combined'}
        )
        
        if sanmar_response.status_code == 200:
            print(f"  SUCCESS! sanmar_combined.xlsx uploaded")
        else:
            print(f"  ERROR: {sanmar_response.status_code} - {sanmar_response.text}")
            
    except Exception as e:
        print(f"  Error: {e}")
    
    print("\n" + "=" * 60)
    print("Done! Starting fresh with master files.")
    print("=" * 60)

if __name__ == "__main__":
    main()

