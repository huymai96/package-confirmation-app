export interface Package {
  id: string;
  orderNumber: string;
  supplier: string;
  description: string;
  expectedDate: string;
  receivedDate?: string;
  receivedBy?: string;
  status: 'pending' | 'received' | 'overdue';
  notes?: string;
}

export interface ConfirmationData {
  packageId: string;
  receivedBy: string;
  receivedDate: string;
  notes?: string;
}

