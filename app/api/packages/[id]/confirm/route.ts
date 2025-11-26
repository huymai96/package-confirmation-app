import { NextResponse } from 'next/server';
import type { ConfirmationData } from '@/app/types';
import { getPackages, setPackages } from '../../route';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const confirmation: ConfirmationData = await request.json();
    
    const packages = getPackages();
    const packageIndex = packages.findIndex(p => p.id === id);
    
    if (packageIndex === -1) {
      return NextResponse.json({ error: 'Package not found' }, { status: 404 });
    }
    
    packages[packageIndex] = {
      ...packages[packageIndex],
      status: 'received',
      receivedDate: confirmation.receivedDate,
      receivedBy: confirmation.receivedBy,
      notes: confirmation.notes,
    };
    
    setPackages(packages);
    return NextResponse.json(packages[packageIndex]);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to confirm package' }, { status: 500 });
  }
}

