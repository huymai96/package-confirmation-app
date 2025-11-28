import requests
import pandas as pd
from io import BytesIO

# Get the latest S&S file URL
r = requests.get('https://package-confirmation-app.vercel.app/api/manifests?action=list')
data = r.json()
ss = [m for m in data.get('manifests', []) if m.get('type') == 'ss']
ss.sort(key=lambda x: x.get('uploadedAt', ''), reverse=True)
latest = ss[0]

print(f"Testing: {latest['filename']} ({latest['size']} bytes)")

# Download and try to read
file_r = requests.get(latest['url'])
try:
    df = pd.read_excel(BytesIO(file_r.content))
    print(f"SUCCESS! Valid Excel file with {len(df)} rows and {len(df.columns)} columns")
    print(f"Columns: {list(df.columns)[:5]}...")
    if 'Tracking Number' in df.columns or 'tracking' in str(df.columns).lower():
        print("Tracking column found!")
except Exception as e:
    print(f"ERROR: {e}")

