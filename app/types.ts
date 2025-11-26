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

export interface Stats {
  total: number;
  confirmed: number;
  pending: number;
  todayScans: number;
}

export interface ConfirmationData {
  confirmedBy: string;
  notes?: string;
}
