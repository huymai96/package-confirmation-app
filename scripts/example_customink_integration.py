#!/usr/bin/env python3
"""
Example: How to integrate manifest upload into your existing CustomInk/OOShirts script

This shows how to add automatic cloud upload to your existing script that
captures orders and saves to customink_orders.xlsx
"""

# ============================================
# Add this import at the top of your script
# ============================================
from upload_manifest import upload_manifest

# ============================================
# Your existing code that captures orders...
# ============================================

def capture_customink_orders():
    """Your existing function that captures CustomInk orders"""
    # ... your existing code ...
    pass

def capture_ooshirts_orders():
    """Your existing function that captures OOShirts orders"""
    # ... your existing code ...
    pass

def save_to_excel(orders, filepath):
    """Your existing function that saves to Excel"""
    # ... your existing code ...
    # Example: 
    # df = pd.DataFrame(orders)
    # df.to_excel(filepath, index=False)
    pass

# ============================================
# Add this at the end of your main() function
# ============================================

def main():
    """Main function with cloud upload integration"""
    
    # Your existing code to capture orders
    print("Capturing CustomInk orders...")
    customink_orders = capture_customink_orders()
    
    print("Capturing OOShirts orders...")
    ooshirts_orders = capture_ooshirts_orders()
    
    # Combine orders
    all_orders = customink_orders + ooshirts_orders
    
    # Save to local file (your existing code)
    local_path = r"\\promos-dc01\data\Huy\desktop receiving tool\customink_orders.xlsx"
    print(f"Saving to {local_path}...")
    save_to_excel(all_orders, local_path)
    
    # =============================================
    # NEW: Upload to cloud automatically
    # =============================================
    print("\nUploading to cloud...")
    try:
        result = upload_manifest('customink', local_path)
        print("✓ Cloud sync complete!")
    except Exception as e:
        print(f"⚠ Cloud upload failed: {e}")
        print("  (Local file was saved successfully)")
    
    print("\nDone!")


if __name__ == '__main__':
    main()


# ============================================
# ALTERNATIVE: Simple one-liner to add anywhere
# ============================================
# 
# Just add this line after you save your Excel file:
#
#     from upload_manifest import upload_manifest
#     upload_manifest('customink', r'\\promos-dc01\data\Huy\desktop receiving tool\customink_orders.xlsx')
#

