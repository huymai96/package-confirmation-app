import requests

API_BASE = "https://package-confirmation-app.vercel.app"

# Get all manifests
r = requests.get(f"{API_BASE}/api/manifests?action=list")
data = r.json()
manifests = data.get('manifests', [])

print("Checking for corrupted files...")
print("=" * 60)

corrupted = []
for m in manifests:
    # S&S files smaller than 1000 bytes are corrupted
    if m.get('type') == 'ss' and m.get('size', 0) < 1000:
        corrupted.append(m)
        print(f"  CORRUPTED: {m['filename']} ({m['size']} bytes)")
    # Also check S&S files that we know are bad
    elif m.get('type') == 'ss' and m.get('filename') != 's&s_2025-11-28_051829.xlsx':
        # Check if it's readable
        try:
            import pandas as pd
            from io import BytesIO
            file_r = requests.get(m['url'])
            df = pd.read_excel(BytesIO(file_r.content), header=1)
        except Exception as e:
            corrupted.append(m)
            print(f"  CORRUPTED: {m['filename']} ({m['size']} bytes) - {str(e)[:50]}")

print(f"\nFound {len(corrupted)} corrupted files")

if corrupted:
    print("\nDeleting corrupted files...")
    for m in corrupted:
        try:
            # Delete via API
            del_r = requests.delete(
                f"{API_BASE}/api/manifests",
                params={'url': m['url']},
                headers={'x-api-key': 'promos-ink-2024'}
            )
            if del_r.status_code == 200:
                print(f"  Deleted: {m['filename']}")
            else:
                print(f"  Failed to delete {m['filename']}: {del_r.status_code}")
        except Exception as e:
            print(f"  Error deleting {m['filename']}: {e}")

print("\nDone!")

