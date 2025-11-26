import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import type { Package, ConfirmationData } from '@/app/types';

const DATA_FILE = path.join(process.cwd(), 'data', 'packages.json');

function readPackages(): Package[] {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error reading packages:', error);
  }
  return [];
}

function writePackages(packages: Package[]) {
  const dataDir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(packages, null, 2));
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const confirmation: ConfirmationData = await request.json();
    
    const packages = readPackages();
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
    
    writePackages(packages);
    return NextResponse.json(packages[packageIndex]);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to confirm package' }, { status: 500 });
  }
}

