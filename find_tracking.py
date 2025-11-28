import requests
import pandas as pd
from io import BytesIO

tracking = '1Z90A10R0307440981'

# Get all manifests
r = requests.get('https://package-confirmation-app.vercel.app/api/manifests?action=list')
data = r.json()

print(f"Searching for: {tracking}")
print("=" * 50)

found = False

# Check S&S manifests
ss_files = [m for m in data.get('manifests', []) if m.get('type') == 'ss']
print(f"\nChecking {len(ss_files)} S&S manifests...")
for m in ss_files[:5]:
    print(f"  {m['filename']} ({m['size']} bytes)")
    try:
        file_r = requests.get(m['url'])
        df = pd.read_excel(BytesIO(file_r.content), header=1)
        for col in df.columns:
            if 'tracking' in str(col).lower() or 'ups' in str(col).lower():
                vals = df[col].astype(str).values
                if tracking in vals:
                    print(f"    *** FOUND in column: {col} ***")
                    found = True
    except Exception as e:
        print(f"    Error: {e}")

# Check Sanmar manifests
sanmar_files = [m for m in data.get('manifests', []) if m.get('type') == 'sanmar']
print(f"\nChecking {len(sanmar_files)} Sanmar manifests...")
for m in sanmar_files[:5]:
    print(f"  {m['filename']} ({m['size']} bytes)")
    try:
        file_r = requests.get(m['url'])
        df = pd.read_csv(BytesIO(file_r.content))
        for col in df.columns:
            if 'tracking' in str(col).lower() or 'ups' in str(col).lower():
                vals = df[col].astype(str).values
                if tracking in vals:
                    print(f"    *** FOUND in column: {col} ***")
                    found = True
    except Exception as e:
        print(f"    Error: {e}")

# Check inbound
inbound_files = [m for m in data.get('manifests', []) if m.get('type') == 'inbound']
print(f"\nChecking {len(inbound_files)} Inbound manifests...")
for m in inbound_files[:2]:
    print(f"  {m['filename']} ({m['size']} bytes)")
    try:
        file_r = requests.get(m['url'])
        df = pd.read_csv(BytesIO(file_r.content))
        for col in df.columns:
            if 'tracking' in str(col).lower():
                vals = df[col].astype(str).values
                if tracking in vals:
                    print(f"    *** FOUND in column: {col} ***")
                    found = True
    except Exception as e:
        print(f"    Error: {e}")

print("\n" + "=" * 50)
if found:
    print(f"SUCCESS: {tracking} was found!")
else:
    print(f"NOT FOUND: {tracking} is not in any uploaded manifest")

