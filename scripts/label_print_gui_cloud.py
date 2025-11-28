#!/usr/bin/env python3
"""
Promos Ink - Cloud Label Print GUI

This version connects to the cloud API instead of local files.
Operators just scan - no need to select manifest folders!

Usage:
    python label_print_gui_cloud.py

Requirements:
    pip install tkinter (usually included with Python)
"""

import tkinter as tk
from tkinter import ttk, messagebox
import json
import os
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
from datetime import datetime
import subprocess
import tempfile

# ============================================
# CONFIGURATION - Update these as needed
# ============================================
API_URL = "https://package-confirmation-app.vercel.app/api/label-lookup"
API_KEY = "promos-label-2024"
SCAN_LOG_PATH = r"\\promos-dc01\data\Huy\desktop receiving tool\scan_log.csv"

# Label configuration
LABEL_WIDTH_INCHES = 4
LABEL_HEIGHT_INCHES = 6

# ============================================
# Cloud API Functions
# ============================================

def lookup_package(tracking: str) -> dict:
    """Look up package info from cloud API"""
    try:
        url = f"{API_URL}?action=lookup&tracking={tracking}&key={API_KEY}"
        req = Request(url)
        req.add_header('x-api-key', API_KEY)
        
        with urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode('utf-8'))
            return data
    except HTTPError as e:
        print(f"HTTP Error: {e.code}")
        return {"found": False, "tracking": tracking, "error": f"HTTP {e.code}"}
    except URLError as e:
        print(f"URL Error: {e.reason}")
        return {"found": False, "tracking": tracking, "error": str(e.reason)}
    except Exception as e:
        print(f"Error: {e}")
        return {"found": False, "tracking": tracking, "error": str(e)}


def log_scan(tracking: str, po: str, customer: str, source: str):
    """Log scan to local CSV file"""
    try:
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        line = f"{timestamp},{tracking},{po},{customer},{source}\n"
        
        # Create file with header if doesn't exist
        if not os.path.exists(SCAN_LOG_PATH):
            with open(SCAN_LOG_PATH, 'w') as f:
                f.write("timestamp,tracking,po,customer,source\n")
        
        with open(SCAN_LOG_PATH, 'a') as f:
            f.write(line)
            
        print(f"Logged: {tracking}")
    except Exception as e:
        print(f"Error logging scan: {e}")


# ============================================
# Label Printing
# ============================================

def generate_label_zpl(tracking: str, po: str, customer: str, source: str) -> str:
    """Generate ZPL code for Zebra printer"""
    # Clean strings
    po_clean = (po or "N/A")[:30]
    customer_clean = (customer or "N/A")[:35]
    source_clean = (source or "Unknown")[:20]
    date_str = datetime.now().strftime("%m/%d/%Y")
    
    zpl = f"""
^XA
^FO50,30^A0N,35,35^FD*** PROMOS INK ***^FS
^FO50,80^A0N,25,25^FDDate: {date_str}^FS

^FO50,130^A0N,30,30^FDPO: {po_clean}^FS
^FO50,180^A0N,25,25^FDCustomer: {customer_clean}^FS
^FO50,230^A0N,20,20^FDSource: {source_clean}^FS

^FO50,290^BY3
^BCN,100,Y,N,N
^FD{tracking}^FS

^FO50,430^A0N,25,25^FD{tracking}^FS

^XZ
"""
    return zpl


def print_label(tracking: str, po: str, customer: str, source: str, printer_name: str = None):
    """Print label to Zebra printer"""
    try:
        zpl = generate_label_zpl(tracking, po, customer, source)
        
        # Write to temp file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.zpl', delete=False) as f:
            f.write(zpl)
            temp_path = f.name
        
        # Print based on OS
        if os.name == 'nt':  # Windows
            if printer_name:
                # Print to specific printer
                os.system(f'copy /b "{temp_path}" "{printer_name}"')
            else:
                # Use default printer
                os.startfile(temp_path, 'print')
        else:  # Linux/Mac
            if printer_name:
                subprocess.run(['lpr', '-P', printer_name, temp_path])
            else:
                subprocess.run(['lpr', temp_path])
        
        # Cleanup
        try:
            os.remove(temp_path)
        except:
            pass
            
        return True
    except Exception as e:
        print(f"Print error: {e}")
        return False


# ============================================
# GUI Application
# ============================================

class LabelPrintApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Promos Ink - Label Print (Cloud)")
        self.root.geometry("700x600")
        self.root.configure(bg='#1a1a2e')
        
        # Variables
        self.tracking_var = tk.StringVar()
        self.status_var = tk.StringVar(value="Ready - Scan a package")
        self.auto_print_var = tk.BooleanVar(value=True)
        
        self.setup_ui()
        
        # Focus on entry
        self.tracking_entry.focus_set()
    
    def setup_ui(self):
        # Title
        title_frame = tk.Frame(self.root, bg='#1a1a2e')
        title_frame.pack(fill='x', pady=20)
        
        tk.Label(
            title_frame, 
            text="📦 Promos Ink Label Print",
            font=('Segoe UI', 24, 'bold'),
            fg='#4fc3f7',
            bg='#1a1a2e'
        ).pack()
        
        tk.Label(
            title_frame,
            text="☁️ Connected to Cloud",
            font=('Segoe UI', 10),
            fg='#81c784',
            bg='#1a1a2e'
        ).pack()
        
        # Scan input
        input_frame = tk.Frame(self.root, bg='#1a1a2e')
        input_frame.pack(fill='x', padx=40, pady=20)
        
        tk.Label(
            input_frame,
            text="Scan Tracking Number:",
            font=('Segoe UI', 12),
            fg='white',
            bg='#1a1a2e'
        ).pack(anchor='w')
        
        self.tracking_entry = tk.Entry(
            input_frame,
            textvariable=self.tracking_var,
            font=('Consolas', 18),
            bg='#2d2d44',
            fg='white',
            insertbackground='white',
            relief='flat',
            width=35
        )
        self.tracking_entry.pack(fill='x', pady=10, ipady=10)
        self.tracking_entry.bind('<Return>', self.on_scan)
        
        # Auto-print checkbox
        tk.Checkbutton(
            input_frame,
            text="Auto-print label after scan",
            variable=self.auto_print_var,
            font=('Segoe UI', 10),
            fg='white',
            bg='#1a1a2e',
            selectcolor='#2d2d44',
            activebackground='#1a1a2e',
            activeforeground='white'
        ).pack(anchor='w')
        
        # Buttons
        btn_frame = tk.Frame(self.root, bg='#1a1a2e')
        btn_frame.pack(fill='x', padx=40, pady=10)
        
        tk.Button(
            btn_frame,
            text="🔍 Look Up",
            command=self.on_scan,
            font=('Segoe UI', 12, 'bold'),
            bg='#4fc3f7',
            fg='white',
            relief='flat',
            padx=20,
            pady=10,
            cursor='hand2'
        ).pack(side='left', padx=5)
        
        tk.Button(
            btn_frame,
            text="🖨️ Print Label",
            command=self.on_print,
            font=('Segoe UI', 12, 'bold'),
            bg='#81c784',
            fg='white',
            relief='flat',
            padx=20,
            pady=10,
            cursor='hand2'
        ).pack(side='left', padx=5)
        
        tk.Button(
            btn_frame,
            text="🗑️ Clear",
            command=self.on_clear,
            font=('Segoe UI', 12),
            bg='#ef5350',
            fg='white',
            relief='flat',
            padx=20,
            pady=10,
            cursor='hand2'
        ).pack(side='left', padx=5)
        
        # Results display
        result_frame = tk.Frame(self.root, bg='#2d2d44', relief='flat')
        result_frame.pack(fill='both', expand=True, padx=40, pady=20)
        
        tk.Label(
            result_frame,
            text="Package Information",
            font=('Segoe UI', 12, 'bold'),
            fg='#4fc3f7',
            bg='#2d2d44'
        ).pack(anchor='w', padx=20, pady=10)
        
        self.result_text = tk.Text(
            result_frame,
            font=('Consolas', 11),
            bg='#1a1a2e',
            fg='white',
            relief='flat',
            height=12,
            wrap='word'
        )
        self.result_text.pack(fill='both', expand=True, padx=20, pady=(0, 20))
        
        # Status bar
        status_frame = tk.Frame(self.root, bg='#0d0d1a')
        status_frame.pack(fill='x', side='bottom')
        
        tk.Label(
            status_frame,
            textvariable=self.status_var,
            font=('Segoe UI', 10),
            fg='#aaa',
            bg='#0d0d1a',
            pady=10
        ).pack()
        
        # Store current package data
        self.current_package = None
    
    def on_scan(self, event=None):
        tracking = self.tracking_var.get().strip()
        if not tracking:
            self.status_var.set("⚠️ Please scan or enter a tracking number")
            return
        
        self.status_var.set(f"🔍 Looking up {tracking}...")
        self.root.update()
        
        # Look up in cloud
        result = lookup_package(tracking)
        
        # Display result
        self.result_text.delete('1.0', tk.END)
        
        if result.get('found'):
            self.current_package = result
            
            info = f"""✅ PACKAGE FOUND

Tracking:  {result.get('tracking', 'N/A')}
Source:    {result.get('source', 'Unknown').upper()}
PO #:      {result.get('po', 'N/A')}
Customer:  {result.get('customer', 'N/A')}
"""
            self.result_text.insert('1.0', info)
            self.result_text.tag_add('found', '1.0', '1.end')
            self.result_text.tag_config('found', foreground='#81c784')
            
            self.status_var.set(f"✅ Found in {result.get('source', 'manifest')}")
            
            # Log the scan
            log_scan(
                tracking,
                result.get('po', ''),
                result.get('customer', ''),
                result.get('source', 'unknown')
            )
            
            # Auto-print if enabled
            if self.auto_print_var.get():
                self.on_print()
        else:
            self.current_package = {
                'tracking': tracking,
                'found': False
            }
            
            info = f"""❌ PACKAGE NOT FOUND

Tracking: {tracking}

This package was not found in any manifest.
It may be a new shipment or not yet uploaded.

You can still print a basic label.
"""
            self.result_text.insert('1.0', info)
            self.result_text.tag_add('notfound', '1.0', '1.end')
            self.result_text.tag_config('notfound', foreground='#ef5350')
            
            self.status_var.set("❌ Not found in manifests")
        
        # Clear and refocus for next scan
        self.tracking_var.set('')
        self.tracking_entry.focus_set()
    
    def on_print(self):
        if not self.current_package:
            self.status_var.set("⚠️ No package to print - scan first")
            return
        
        tracking = self.current_package.get('tracking', '')
        po = self.current_package.get('po', '')
        customer = self.current_package.get('customer', '')
        source = self.current_package.get('source', 'Unknown')
        
        self.status_var.set(f"🖨️ Printing label for {tracking}...")
        self.root.update()
        
        success = print_label(tracking, po, customer, source)
        
        if success:
            self.status_var.set(f"✅ Label printed for {tracking}")
        else:
            self.status_var.set(f"❌ Print failed - check printer connection")
    
    def on_clear(self):
        self.tracking_var.set('')
        self.result_text.delete('1.0', tk.END)
        self.current_package = None
        self.status_var.set("Ready - Scan a package")
        self.tracking_entry.focus_set()


# ============================================
# Main
# ============================================

def main():
    # Check API connection
    print("Checking cloud connection...")
    try:
        test_url = f"{API_URL}?action=health"
        with urlopen(test_url, timeout=5) as response:
            data = json.loads(response.read().decode('utf-8'))
            if data.get('status') == 'ok':
                print("✓ Cloud API connected")
            else:
                print("⚠ Cloud API responded but status unknown")
    except Exception as e:
        print(f"⚠ Could not connect to cloud API: {e}")
        print("  The app will still work but lookups may fail.")
    
    # Start GUI
    root = tk.Tk()
    app = LabelPrintApp(root)
    root.mainloop()


if __name__ == '__main__':
    main()

