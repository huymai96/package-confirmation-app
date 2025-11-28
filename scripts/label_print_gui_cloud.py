#!/usr/bin/env python3
"""
Promos Ink - Cloud Label Print GUI v2.0

Full cloud migration - all data sourced from Promos Ink Supply Chain API.
Maintains exact same label formats and logic as original label_print_gui.py

Requirements:
    pip install pillow python-barcode pandas requests

Usage:
    python label_print_gui_cloud.py
"""

import os
import io
import re
import csv
import json
import sys
import tempfile
import traceback
from datetime import datetime
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

# Check for required dependencies before importing
def check_dependencies():
    missing = []
    
    try:
        import tkinter
    except ImportError:
        missing.append("tkinter (usually included with Python)")
    
    try:
        from PIL import Image
    except ImportError:
        missing.append("pillow (pip install pillow)")
    
    try:
        from barcode import Code128
    except ImportError:
        missing.append("python-barcode (pip install python-barcode)")
    
    if missing:
        print("=" * 50)
        print("ERROR: Missing required packages!")
        print("=" * 50)
        print()
        print("Please install the following:")
        for pkg in missing:
            print(f"  - {pkg}")
        print()
        print("Run this command:")
        print("  pip install pillow python-barcode")
        print()
        input("Press Enter to exit...")
        sys.exit(1)

# Check dependencies first
check_dependencies()

import tkinter as tk
from tkinter import messagebox

# Third-party libs
from barcode import Code128
from barcode.writer import ImageWriter
from PIL import Image, ImageTk, ImageDraw, ImageFont

# ============================================
# CONFIGURATION
# ============================================
API_URL = "https://package-confirmation-app.vercel.app/api/label-lookup"
API_KEY = "promos-label-2024"

# Logo file - copy Pic (2).png to same directory as this script
LOGO_PATH = "Pic (2).png"

# Log file locations - try multiple paths
LOG_FILE_PATHS = [
    r"\\promos-dc01\data\Huy\desktop receiving tool\scan_log.csv",
    r"\\192.168.2.5\data\Huy\desktop receiving tool\scan_log.csv",
]

# Alternative local log if network unavailable
LOCAL_LOG_FILE = "scan_log_local.csv"

def get_log_path():
    """Find a working log file path"""
    for path in LOG_FILE_PATHS:
        try:
            # Check if parent directory exists
            parent = Path(path).parent
            if parent.exists():
                return path
        except Exception:
            continue
    # Fallback to local
    return LOCAL_LOG_FILE

# ============================================
# CUSTOMER NAME NORMALIZATION
# (Same as original)
# ============================================
CUSTOMER_NAME_MAPPING = {
    "GATEWAY CDI": "Brand Addition",
    "GatewayCDI Inc": "Brand Addition",
    "Gateway CDI": "Brand Addition",
    "GATEWAYCDI": "Brand Addition",
    "Eretailing Technology Group LLC": "Fast Platform",
    "ERETAILING TECHNOLOGY GROUP LLC": "Fast Platform",
    "eRetailing Technology Group": "Fast Platform",
    "Eretailing Tech Group - Cintas": "Fast Platform",
    "Eretailing Technology Group": "Fast Platform",
    "ADVANCED GRAPHIC PRODUCTS": "AOSWAG",
    "Advanced Graphic Products": "AOSWAG",
    "GetOnChat LLC": "Ooshirts",
    "BSN SPORTS INC": "BSN Sports",
}

def normalize_customer_name(name: str) -> str:
    raw = str(name or "").strip()
    low = raw.lower()
    for k, v in CUSTOMER_NAME_MAPPING.items():
        if k.lower() in low:
            return v
    return raw


# ============================================
# PO CLASSIFICATION
# (Same as original)
# ============================================
def classify_po_type(po_field: str):
    s = str(po_field or "").strip().upper().replace(" ", "")
    m = re.fullmatch(r"(\d{7,10})([A-Z])", s)
    if m:
        return "ci_package", m.group(1)
    m = re.fullmatch(r"(\d{7,10})", s)
    if m:
        return "ci_plain", m.group(1)
    if re.fullmatch(r"(\d{7,10})-\d+", s):
        return "manifest_sub", None
    return "unknown", None


def parse_po_and_suffix(po_field):
    """Special handling for Ooshirts format: '7124537 - DTG'"""
    if " - " in str(po_field):
        parts = str(po_field).split(" - ")
        if len(parts) >= 2:
            digits = parts[0].strip()
            suffix = " - " + parts[1].strip()
            return digits, suffix
    
    m = re.match(r"(\d+)(.*)", str(po_field))
    if m:
        digits = m.group(1)
        suffix = m.group(2).replace("-", "").strip()
        return digits, suffix
    return str(po_field), ""


# CI token pattern for inbound fallback
CI_TOKEN_CAPTURE = re.compile(r'([89]\d{6,9})([A-Za-z])')


# ============================================
# CLOUD API FUNCTIONS
# ============================================
def api_request(action: str, params: dict = None, timeout: int = 30) -> dict:
    """Make request to cloud API"""
    try:
        query = f"?action={action}&key={API_KEY}"
        if params:
            for k, v in params.items():
                query += f"&{k}={v}"
        
        url = API_URL + query
        req = Request(url)
        req.add_header('x-api-key', API_KEY)
        
        with urlopen(req, timeout=timeout) as response:
            return json.loads(response.read().decode('utf-8'))
    except HTTPError as e:
        print(f"API HTTP Error: {e.code}")
        return {"error": f"HTTP {e.code}", "timeout": False}
    except URLError as e:
        reason = str(e.reason)
        is_timeout = "timed out" in reason.lower()
        print(f"API URL Error: {reason}")
        return {"error": reason, "timeout": is_timeout}
    except Exception as e:
        error_msg = str(e)
        is_timeout = "timed out" in error_msg.lower()
        print(f"API Error: {error_msg}")
        return {"error": error_msg, "timeout": is_timeout}


def lookup_tracking(tracking: str) -> dict:
    """Look up package by tracking number - INSTANT with pre-built index"""
    return api_request("lookup", {"tracking": tracking}, timeout=10)


def lookup_order_info(po: str) -> dict:
    """Look up CustomInk order info by PO"""
    return api_request("orderInfo", {"po": po})


def lookup_fast_platform(po: str) -> dict:
    """Look up Fast Platform info by PO"""
    return api_request("fastPlatform", {"po": po})


def check_api_health() -> bool:
    """Check if API is reachable"""
    result = api_request("health")
    return result.get("status") == "ok"


# ============================================
# LOGGING
# (Same as original)
# ============================================
def log_scan(tracking, po, extra, status):
    """Log scan to CSV file"""
    log_path = get_log_path()
    
    try:
        log_exists = Path(log_path).exists()
        with open(log_path, mode="a", newline="", encoding="utf-8") as logfile:
            writer = csv.writer(logfile)
            if not log_exists:
                writer.writerow(["Timestamp", "Tracking/LPN", "PO#", "Department/Customer", "Due Date", "Status"])
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            writer.writerow([now, tracking, po, extra.get("name", ""), extra.get("due", ""), status])
    except Exception as e:
        # Try local fallback
        try:
            log_exists = Path(LOCAL_LOG_FILE).exists()
            with open(LOCAL_LOG_FILE, mode="a", newline="", encoding="utf-8") as logfile:
                writer = csv.writer(logfile)
                if not log_exists:
                    writer.writerow(["Timestamp", "Tracking/LPN", "PO#", "Department/Customer", "Due Date", "Status"])
                now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                writer.writerow([now, tracking, po, extra.get("name", ""), extra.get("due", ""), status])
        except Exception as e2:
            print(f"Log error: {e2}")


# ============================================
# LABEL PRINTING FUNCTIONS
# (Same formats as original)
# ============================================
def load_logo():
    """Load logo image if available"""
    try:
        if Path(LOGO_PATH).exists():
            return Image.open(LOGO_PATH).convert("RGBA")
    except Exception:
        pass
    
    # Try in script directory
    try:
        script_dir = Path(__file__).parent
        logo_path = script_dir / "Pic (2).png"
        if logo_path.exists():
            return Image.open(str(logo_path)).convert("RGBA")
    except Exception:
        pass
    
    return None


def print_label(po, department, due_text, pipeline_flag=""):
    """Standard CustomInk label - same format as original"""
    barcode_io = io.BytesIO()
    Code128(str(po), writer=ImageWriter()).write(barcode_io)
    barcode_img = Image.open(barcode_io)
    label_img = Image.new("RGB", (400, 280), "white")
    y = 0
    
    logo = load_logo()
    if logo:
        lw, lh = logo.size
        ratio = min(380 / lw, 60 / lh)
        logo_new = logo.resize((int(lw * ratio), int(lh * ratio)))
        label_img.paste(logo_new, (10, 0), logo_new)
        y = 65
    else:
        y = 10
    
    label_img.paste(barcode_img.resize((320, 70)), (40, y + 5))
    draw = ImageDraw.Draw(label_img)
    
    try:
        font_large = ImageFont.truetype("arial.ttf", 28)
        font_med = ImageFont.truetype("arial.ttf", 23)
        font_due = ImageFont.truetype("arial.ttf", 22)
        font_flag = ImageFont.truetype("arial.ttf", 20)
    except Exception:
        font_large = font_med = font_due = font_flag = ImageFont.load_default()
    
    draw.text((40, y + 85), f"PO#: {po}", fill="black", font=font_large)
    if department:
        draw.text((40, y + 115), f"{department}", fill="black", font=font_med)
    if due_text:
        draw.text((40, y + 145), f"Due: {due_text}", fill="black", font=font_due)
    if pipeline_flag:
        draw.text((40, y + 175), pipeline_flag, fill="black", font=font_flag)
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmp:
        label_img.save(tmp.name)
        try:
            os.startfile(tmp.name, "print")
        except Exception as e:
            messagebox.showerror("Print error", f"Could not send label to printer:\n{e}")


def print_manifest_label(po, customer, due_text=None, pipeline_flag=""):
    """Manifest label for non-CI orders - same format as original"""
    barcode_io = io.BytesIO()
    Code128(str(po), writer=ImageWriter()).write(barcode_io)
    barcode_img = Image.open(barcode_io)
    label_img = Image.new("RGB", (400, 250), "white")
    
    logo = load_logo()
    if logo:
        lw, lh = logo.size
        ratio = min(380 / lw, 50 / lh)
        logo_new = logo.resize((int(lw * ratio), int(lh * ratio)))
        label_img.paste(logo_new, (10, 0), logo_new)
        y = 55
    else:
        y = 10
    
    label_img.paste(barcode_img.resize((320, 70)), (40, y + 5))
    draw = ImageDraw.Draw(label_img)
    
    try:
        font_large = ImageFont.truetype("arial.ttf", 26)
        font_med = ImageFont.truetype("arial.ttf", 22)
        font_small = ImageFont.truetype("arial.ttf", 20)
    except Exception:
        font_large = font_med = font_small = ImageFont.load_default()
    
    draw.text((40, y + 80), f"PO#: {po}", fill="black", font=font_large)
    draw.text((40, y + 110), f"{customer}", fill="black", font=font_med)
    if due_text:
        draw.text((40, y + 140), f"Due: {due_text}", fill="black", font=font_small)
    if pipeline_flag:
        draw.text((40, y + 165), pipeline_flag, fill="black", font=font_small)
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmp:
        label_img.save(tmp.name)
        try:
            os.startfile(tmp.name, "print")
        except Exception as e:
            messagebox.showerror("Print error", f"Could not send label to printer:\n{e}")


def print_manifest_label_fast_platform(po, customer, due_value=None, processes_value=None):
    """Fast Platform label - same format as original"""
    barcode_io = io.BytesIO()
    Code128(str(po), writer=ImageWriter()).write(barcode_io)
    barcode_img = Image.open(barcode_io)
    label_img = Image.new("RGB", (400, 260), "white")
    
    logo = load_logo()
    if logo:
        lw, lh = logo.size
        ratio = min(380 / lw, 50 / lh)
        logo_new = logo.resize((int(lw * ratio), int(lh * ratio)))
        label_img.paste(logo_new, (10, 0), logo_new)
        y = 55
    else:
        y = 10
    
    label_img.paste(barcode_img.resize((320, 70)), (40, y + 5))
    draw = ImageDraw.Draw(label_img)
    
    try:
        font_large = ImageFont.truetype("arial.ttf", 26)
        font_med = ImageFont.truetype("arial.ttf", 22)
        font_small = ImageFont.truetype("arial.ttf", 20)
    except Exception:
        font_large = font_med = font_small = ImageFont.load_default()
    
    draw.text((40, y + 80), f"PO#: {po}", fill="black", font=font_large)
    draw.text((40, y + 110), f"{customer}", fill="black", font=font_med)
    y_line = y + 140
    if due_value:
        draw.text((40, y_line), f"{due_value}", fill="black", font=font_small)
        y_line += 25
    if processes_value:
        draw.text((40, y_line), f"{processes_value}", fill="black", font=font_small)
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmp:
        label_img.save(tmp.name)
        try:
            os.startfile(tmp.name, "print")
        except Exception as e:
            messagebox.showerror("Print error", f"Could not send label to printer:\n{e}")


def print_inbound_label_generic(tracking_code: str, shipper_text: str, ref_lines: list):
    """Inbound/unknown package label - same format as original"""
    barcode_io = io.BytesIO()
    Code128(str(tracking_code), writer=ImageWriter()).write(barcode_io)
    barcode_img = Image.open(barcode_io)
    label_img = Image.new("RGB", (400, 300), "white")
    draw = ImageDraw.Draw(label_img)
    y = 10
    
    logo = load_logo()
    if logo:
        lw, lh = logo.size
        ratio = min(380 / lw, 50 / lh)
        logo_new = logo.resize((int(lw * ratio), int(lh * ratio)))
        label_img.paste(logo_new, (10, 0), logo_new)
        y = 55
    
    try:
        font_small = ImageFont.truetype("arial.ttf", 18)
    except Exception:
        font_small = ImageFont.load_default()
    
    bw, bh = barcode_img.size
    ratio = min(340 / bw, 80 / bh)
    barcode_resized = barcode_img.resize((int(bw * ratio), int(bh * ratio)))
    label_img.paste(barcode_resized, (30, y), None)
    y += int(bh * ratio) + 5
    
    # Add shipper header
    if shipper_text:
        shipper_header = shipper_text.split(",")[0].strip()
        draw.text((40, y), shipper_header, fill="black", font=font_small)
        y += 20
    
    # Add each reference token on a new line
    for token in ref_lines:
        token = (token or "").strip()
        if token:
            parts = token.split("|")
            for part in parts:
                part = part.strip()
                if part:
                    draw.text((40, y), part, fill="black", font=font_small)
                    y += 18
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmp:
        label_img.save(tmp.name)
        try:
            os.startfile(tmp.name, "print")
        except Exception as e:
            messagebox.showerror("Print error", f"Could not send label to printer:\n{e}")


# ============================================
# MAIN PROCESSING LOGIC
# (Same logic as original, using cloud data)
# ============================================
def process_tracking(tracking: str) -> bool:
    """
    Process a scanned tracking number.
    Returns True if handled, False if not found.
    """
    if not tracking:
        return False
    
    tracking = tracking.strip()
    
    # Look up in cloud (with retry on timeout)
    result = lookup_tracking(tracking)
    
    if result.get("error"):
        error_msg = result.get("error", "Unknown error")
        
        # Handle timeout specifically
        if result.get("timeout") or "timed out" in error_msg.lower():
            retry = messagebox.askyesno(
                "Connection Timeout", 
                f"The cloud lookup timed out.\n\n"
                f"This can happen with slow internet or large manifests.\n\n"
                f"Would you like to retry?"
            )
            if retry:
                # Retry with longer timeout
                result = api_request("lookup", {"tracking": tracking}, timeout=60)
                if not result.get("error"):
                    pass  # Continue processing below
                else:
                    messagebox.showerror("API Error", f"Retry failed:\n{result.get('error')}")
                    return False
            else:
                return False
        else:
            messagebox.showerror("API Error", f"Could not connect to cloud:\n{error_msg}")
            return False
    
    if not result.get("found"):
        # Not found in any manifest
        log_scan(tracking, "", {"name": "", "due": ""}, "Not Found")
        messagebox.showwarning("Not Found", 
            "No PO# found in cloud manifests.\n\n"
            "Package not in SanMar, S&S, CustomInk orders, or inbound file.")
        return False
    
    # Extract data from API response
    source_type = result.get("sourceType", "unknown")
    po_manifest = result.get("po", "")
    customer = result.get("customer", "")
    department = result.get("department", "")
    due_date = result.get("dueDate", "")
    status = result.get("status", "")
    must_ship_by = result.get("mustShipBy", "")
    processes = result.get("processes", "")
    shipper_name = result.get("shipperName", "")
    ref_tokens = result.get("referenceTokens", [])
    
    # Normalize customer name
    customer_norm = normalize_customer_name(customer)
    
    # Determine pipeline flag from status
    pipeline_flag = ""
    if status:
        status_lower = status.lower()
        if "on hold" in status_lower:
            pipeline_flag = "On Hold"
        elif any(k in status_lower for k in ["pipelined", "pipeline", "pending"]):
            pipeline_flag = "Pipelined"
    
    # Format due date
    if due_date:
        try:
            from datetime import datetime as dt
            parsed = dt.strptime(due_date, "%Y-%m-%d")
            due_date = parsed.strftime("%a, %b %d")
        except Exception:
            pass
    
    # --- SANMAR / S&S MANIFEST FOUND ---
    if source_type in ("sanmar", "ss"):
        po_type, base_digits = classify_po_type(po_manifest)
        
        # Special handling for Ooshirts
        if customer_norm.lower().startswith("ooshirts"):
            po_digits, po_suffix = parse_po_and_suffix(po_manifest)
            if po_digits:
                label_customer = customer_norm + (po_suffix if po_suffix else "")
                print_label(po_digits, label_customer, due_date or "", pipeline_flag=pipeline_flag)
                log_scan(tracking, po_digits, {"name": label_customer, "due": due_date or ""}, "Printed")
                return True
        
        # CI order with department found
        if po_type in ("ci_plain", "ci_package") and base_digits and department:
            print_label(base_digits, department, due_date or "", pipeline_flag=pipeline_flag)
            log_scan(tracking, base_digits, {"name": department, "due": due_date or ""}, "Printed")
            return True
        
        # Fast Platform customer
        if customer_norm.lower() == "fast platform":
            # Use must_ship_by and processes from API if available
            print_manifest_label_fast_platform(
                po_manifest, 
                customer_norm, 
                due_value=must_ship_by or "", 
                processes_value=processes or ""
            )
            log_scan(tracking, po_manifest, {"name": customer_norm, "due": must_ship_by or ""}, "Fast Platform Manifest Print")
            return True
        
        # Default manifest label
        print_manifest_label(po_manifest, customer_norm, due_text=due_date or "", pipeline_flag=pipeline_flag)
        log_scan(tracking, po_manifest, {"name": customer_norm, "due": due_date or ""}, "Manifest Print")
        return True
    
    # --- INBOUND MANIFEST FOUND ---
    if source_type == "inbound":
        # Try to find CI order from reference tokens
        if department:
            # API already found a CI match
            po_digits = result.get("po", "")
            print_label(po_digits, department, due_date or "", pipeline_flag=pipeline_flag)
            log_scan(tracking, po_digits, {"name": department, "due": due_date or ""}, "Inbound→CI Fallback")
            return True
        
        # No CI match - print generic inbound label
        print_inbound_label_generic(
            tracking_code=tracking,
            shipper_text=shipper_name,
            ref_lines=ref_tokens
        )
        log_scan(tracking, "", {"name": shipper_name.split(",")[0] if shipper_name else "", "due": ""}, "Inbound Generic")
        return True
    
    # --- CUSTOMINK ORDERS DIRECT MATCH ---
    if source_type == "customink":
        print_label(po_manifest, department or customer_norm, due_date or "", pipeline_flag=pipeline_flag)
        log_scan(tracking, po_manifest, {"name": department or customer_norm, "due": due_date or ""}, "CustomInk Direct")
        return True
    
    # Unknown source type - default manifest label
    print_manifest_label(po_manifest or tracking, customer_norm or "Unknown", due_text=due_date)
    log_scan(tracking, po_manifest or tracking, {"name": customer_norm, "due": due_date or ""}, "Unknown Source")
    return True


# ============================================
# GUI APPLICATION
# ============================================
class LabelPrintApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Promos Ink - Scan & Print Label App (Cloud)")
        self.root.geometry("520x450")
        self.root.resizable(False, False)
        
        # Colors
        self.bg_color = "#f5f7fa"
        self.frame_color = "#ffffff"
        
        self.root.configure(bg=self.bg_color)
        
        # Main frame
        self.frame = tk.Frame(root, bg=self.frame_color, bd=2, relief="groove")
        self.frame.place(relx=0.5, rely=0, anchor="n", y=15, width=490, height=420)
        
        self.setup_ui()
        self.check_connection()
    
    def setup_ui(self):
        # Logo
        try:
            logo = load_logo()
            if logo:
                logo_resized = logo.resize((220, 72))
                self.logo_photo = ImageTk.PhotoImage(logo_resized)
                lbl = tk.Label(self.frame, image=self.logo_photo, bg=self.frame_color)
                lbl.pack(pady=(10, 5))
            else:
                raise Exception("No logo")
        except Exception:
            tk.Label(
                self.frame, 
                text="Promos Ink", 
                font=("Arial", 15, "bold"), 
                bg=self.frame_color
            ).pack(pady=(18, 5))
        
        # Cloud status
        self.status_frame = tk.Frame(self.frame, bg=self.frame_color)
        self.status_frame.pack(pady=(5, 10))
        
        self.cloud_indicator = tk.Label(
            self.status_frame,
            text="☁️ Checking cloud connection...",
            font=("Arial", 10),
            fg="#666666",
            bg=self.frame_color
        )
        self.cloud_indicator.pack()
        
        # Instructions
        tk.Label(
            self.frame,
            text="Scan Tracking or LPN",
            font=("Arial", 12, "bold"),
            bg=self.frame_color
        ).pack(pady=(10, 5))
        
        # Entry
        self.entry = tk.Entry(
            self.frame,
            font=("Arial", 16),
            width=36,
            bd=3,
            relief="solid",
            justify="center"
        )
        self.entry.pack(pady=(8, 5))
        self.entry.bind("<Return>", self.on_scan)
        
        # Help text
        tk.Label(
            self.frame,
            text="(Scan while cursor is in the box; label prints instantly)",
            bg=self.frame_color,
            font=("Arial", 9, "italic"),
            fg="#777777"
        ).pack(pady=(2, 10))
        
        # Result display
        self.result_frame = tk.Frame(self.frame, bg="#e8f5e9", bd=1, relief="solid")
        self.result_frame.pack(fill="x", padx=20, pady=10)
        
        self.result_label = tk.Label(
            self.result_frame,
            text="Ready to scan...",
            font=("Arial", 11),
            bg="#e8f5e9",
            fg="#2e7d32",
            wraplength=440,
            justify="center"
        )
        self.result_label.pack(pady=10, padx=10)
        
        # Manual lookup button
        btn_frame = tk.Frame(self.frame, bg=self.frame_color)
        btn_frame.pack(pady=10)
        
        tk.Button(
            btn_frame,
            text="🔍 Manual Lookup",
            font=("Arial", 10),
            command=self.on_manual_lookup,
            width=15
        ).pack(side="left", padx=5)
        
        tk.Button(
            btn_frame,
            text="🔄 Refresh",
            font=("Arial", 10),
            command=self.check_connection,
            width=10
        ).pack(side="left", padx=5)
    
    def check_connection(self):
        """Check cloud API connection"""
        self.cloud_indicator.config(text="☁️ Checking connection...", fg="#666666")
        self.root.update()
        
        if check_api_health():
            self.cloud_indicator.config(text="☁️ Connected to Cloud", fg="#4caf50")
            self.entry.configure(state="normal")
            self.entry.focus()
        else:
            self.cloud_indicator.config(text="❌ Cloud Offline - Check Internet", fg="#f44336")
            self.entry.configure(state="disabled")
    
    def on_scan(self, event=None):
        """Handle scan/enter event"""
        tracking = self.entry.get().strip()
        if not tracking:
            return
        
        self.result_label.config(
            text=f"🔍 Looking up {tracking}...",
            bg="#fff3e0",
            fg="#e65100"
        )
        self.root.update()
        
        try:
            success = process_tracking(tracking)
            
            if success:
                self.result_label.config(
                    text=f"✅ Processed: {tracking}",
                    bg="#e8f5e9",
                    fg="#2e7d32"
                )
            else:
                self.result_label.config(
                    text=f"❌ Not found: {tracking}",
                    bg="#ffebee",
                    fg="#c62828"
                )
        except Exception as e:
            self.result_label.config(
                text=f"⚠️ Error: {str(e)[:50]}",
                bg="#ffebee",
                fg="#c62828"
            )
        
        # Clear and refocus
        self.entry.delete(0, tk.END)
        self.entry.focus()
    
    def on_manual_lookup(self):
        """Manual lookup button handler"""
        tracking = self.entry.get().strip()
        if tracking:
            self.on_scan()
        else:
            messagebox.showinfo("Manual Lookup", "Enter a tracking number first, then click Lookup.")


# ============================================
# MAIN
# ============================================
def main():
    print("=" * 50)
    print("Promos Ink - Cloud Label Print GUI v2.0")
    print("=" * 50)
    print()
    print("Checking cloud API...")
    
    if check_api_health():
        print("✓ Cloud API connected")
    else:
        print("⚠ Could not connect to cloud API")
        print("  Check your internet connection.")
        print("  The app will still start but lookups may fail.")
    
    print()
    print("Starting GUI...")
    
    root = tk.Tk()
    app = LabelPrintApp(root)
    root.mainloop()


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print()
        print("=" * 50)
        print("ERROR: Application crashed!")
        print("=" * 50)
        print()
        print(f"Error: {e}")
        print()
        print("Full traceback:")
        traceback.print_exc()
        print()
        input("Press Enter to exit...")
        sys.exit(1)
