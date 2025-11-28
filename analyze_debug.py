import requests
import json

# Get the debug file
url = 'https://2hjrsjkqncbwsvoa.public.blob.vercel-storage.com/debug/makecom_1764305182189-7o1ispSLBX16fcG3TsYFKaELFbB22o.json'
r = requests.get(url)
data = r.json()

# Get the raw body
raw_body = data.get('rawBodyPreview', '')

# Find the content field
import re
match = re.search(r'"content":\s*"([^"]{1,200})', raw_body)
if match:
    content_start = match.group(1)
    print("First 100 chars of content:")
    print(repr(content_start[:100]))
    print()
    
    # Check for replacement characters
    if '\ufffd' in content_start:
        print("WARNING: Contains Unicode REPLACEMENT CHARACTERS (\\ufffd)")
        print("This means Make.com already corrupted the binary data!")
        count = content_start.count('\ufffd')
        print(f"Found {count} replacement chars in first 100 bytes")
    
    # Convert to bytes and check
    print()
    print("First 20 bytes as latin1:")
    b = content_start[:20].encode('latin1', errors='replace')
    print(' '.join(f'{x:02x}' for x in b))

