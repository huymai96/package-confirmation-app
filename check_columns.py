import requests
import pandas as pd
from io import BytesIO

# Get S&S combined columns
r = requests.get('https://package-confirmation-app.vercel.app/api/manifests?action=list')
manifests = r.json().get('manifests', [])

for m in manifests:
    print(f"\nFile: {m['filename']}")
    file_r = requests.get(m['url'])
    if m['filename'].endswith('.xlsx'):
        df = pd.read_excel(BytesIO(file_r.content))
    else:
        df = pd.read_csv(BytesIO(file_r.content))
    print(f"Columns ({len(df.columns)}): {list(df.columns)}")
    print(f"First row sample:")
    if len(df) > 0:
        for i, col in enumerate(df.columns[:12]):
            print(f"  [{i}] {col}: {df.iloc[0][col]}")

