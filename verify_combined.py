import requests
import pandas as pd
from io import BytesIO

r = requests.get('https://package-confirmation-app.vercel.app/api/manifests?action=list')
data = r.json()

print("Combined files found:")
for m in data.get('manifests', []):
    if 'combined' in m.get('filename', ''):
        print(f"\n{m['filename']} - {m['size']} bytes")
        
        try:
            file_r = requests.get(m['url'])
            
            if m['filename'].endswith('.xlsx'):
                # S&S combined - Excel with header row 2 (startrow=1 means headers in row 2)
                df = pd.read_excel(BytesIO(file_r.content), header=1)
            elif m['filename'].endswith('.csv'):
                # Sanmar combined - regular CSV
                df = pd.read_csv(BytesIO(file_r.content))
            else:
                print(f"  Unknown format")
                continue
                
            print(f"  Rows: {len(df)}")
            print(f"  Columns: {list(df.columns)}")
            if len(df) > 0:
                print(f"  Sample row: {dict(df.iloc[0])}")
        except Exception as e:
            print(f"  Error reading: {e}")
