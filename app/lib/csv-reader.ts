import fs from 'fs';
import path from 'path';

export interface ScanRecord {
  id: string;
  timestamp: string;
  tracking: string;
  poNumber: string;
  customer: string;
  dueDate: string;
  status: string;
  confirmed: boolean;
  confirmedBy?: string;
  confirmedAt?: string;
  notes?: string;
}

// Path to the synced CSV file
const CSV_PATH = 'C:\\auto sync inbound\\scan_log.csv';
const CONFIRMATIONS_PATH = 'C:\\auto sync inbound\\confirmations.json';

export function readScanLog(): ScanRecord[] {
  try {
    if (!fs.existsSync(CSV_PATH)) {
      console.error('CSV file not found:', CSV_PATH);
      return [];
    }

    const csvContent = fs.readFileSync(CSV_PATH, 'utf-8');
    const lines = csvContent.trim().split('\n');
    
    // Skip header row
    const dataLines = lines.slice(1);
    
    // Load existing confirmations
    const confirmations = loadConfirmations();
    
    // Parse CSV and create records
    const records: ScanRecord[] = [];
    const seen = new Set<string>(); // Track unique tracking numbers
    
    for (let i = dataLines.length - 1; i >= 0; i--) {
      const line = dataLines[i];
      const parts = parseCSVLine(line);
      
      if (parts.length >= 6) {
        const tracking = parts[1].trim();
        const poNumber = parts[2].trim();
        
        // Skip if no tracking number or already seen (keep most recent)
        if (!tracking || seen.has(tracking)) continue;
        seen.add(tracking);
        
        // Skip "Not Found" entries
        if (parts[5].trim() === 'Not Found') continue;
        
        const id = `${tracking}-${poNumber}`;
        const confirmation = confirmations[id];
        
        records.push({
          id,
          timestamp: parts[0].trim(),
          tracking,
          poNumber,
          customer: parts[3].trim(),
          dueDate: parts[4].trim(),
          status: parts[5].trim(),
          confirmed: confirmation?.confirmed || false,
          confirmedBy: confirmation?.confirmedBy,
          confirmedAt: confirmation?.confirmedAt,
          notes: confirmation?.notes,
        });
      }
    }
    
    // Sort by timestamp (newest first)
    return records.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  } catch (error) {
    console.error('Error reading CSV:', error);
    return [];
  }
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  
  return result;
}

interface Confirmation {
  confirmed: boolean;
  confirmedBy: string;
  confirmedAt: string;
  notes?: string;
}

function loadConfirmations(): Record<string, Confirmation> {
  try {
    if (fs.existsSync(CONFIRMATIONS_PATH)) {
      const data = fs.readFileSync(CONFIRMATIONS_PATH, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading confirmations:', error);
  }
  return {};
}

export function saveConfirmation(id: string, confirmedBy: string, notes?: string): boolean {
  try {
    const confirmations = loadConfirmations();
    
    confirmations[id] = {
      confirmed: true,
      confirmedBy,
      confirmedAt: new Date().toISOString(),
      notes,
    };
    
    fs.writeFileSync(CONFIRMATIONS_PATH, JSON.stringify(confirmations, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving confirmation:', error);
    return false;
  }
}

export function getStats() {
  const records = readScanLog();
  const today = new Date().toDateString();
  
  return {
    total: records.length,
    confirmed: records.filter(r => r.confirmed).length,
    pending: records.filter(r => !r.confirmed).length,
    todayScans: records.filter(r => new Date(r.timestamp).toDateString() === today).length,
  };
}

