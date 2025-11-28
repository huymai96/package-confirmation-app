import requests

# Get all manifests and look for anything with index
r = requests.get('https://package-confirmation-app.vercel.app/api/manifests?action=list')
data = r.json()

print("All files in blob storage:")
for m in data.get('manifests', []):
    print(f"  {m['filename']} - {m['size']} bytes")

print(f"\nTotal: {len(data.get('manifests', []))} files")

# Check if we can access the index directly
print("\nTrying to access tracking-index.json directly...")
# The upload-index route saves as INDEX_BLOB_NAME = 'tracking-index.json'

