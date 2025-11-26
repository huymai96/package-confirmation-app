import type { Package } from '@/app/types';

// In-memory storage (works on Vercel serverless)
// For production, use Vercel KV, Postgres, or another database
const globalForPackages = globalThis as unknown as {
  packages: Package[] | undefined;
};

function getDefaultPackages(): Package[] {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);

  return [
    { id: '1', orderNumber: 'CI-2024-001', supplier: 'CustomInk', description: 'Custom T-shirts - 100 units', expectedDate: yesterday.toISOString(), status: 'overdue' },
    { id: '2', orderNumber: 'SS-2024-045', supplier: 'S&S', description: 'Promotional items', expectedDate: today.toISOString(), status: 'pending' },
    { id: '3', orderNumber: 'SM-2024-089', supplier: 'SanMar', description: 'Polo shirts - 50 units', expectedDate: tomorrow.toISOString(), status: 'pending' },
    { id: '4', orderNumber: 'DR-2024-015', supplier: 'Decorator', description: 'Embroidered jackets', expectedDate: nextWeek.toISOString(), status: 'pending' },
  ];
}

// Initialize packages if not already set
if (!globalForPackages.packages) {
  globalForPackages.packages = getDefaultPackages();
}

export function getPackages(): Package[] {
  return globalForPackages.packages || getDefaultPackages();
}

export function setPackages(packages: Package[]) {
  globalForPackages.packages = packages;
}

