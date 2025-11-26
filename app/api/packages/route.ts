import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import type { Package } from '@/app/types';

const DATA_FILE = path.join(process.cwd(), 'data', 'packages.json');

function ensureDataDir() {
  const dataDir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function readPackages(): Package[] {
  ensureDataDir();
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error reading packages:', error);
  }
  return getDefaultPackages();
}

function writePackages(packages: Package[]) {
  ensureDataDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(packages, null, 2));
}

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

export async function GET() {
  try {
    const packages = readPackages();
    return NextResponse.json(packages);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch packages' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const newPackage: Package = await request.json();
    const packages = readPackages();
    const maxId = packages.length > 0 ? Math.max(...packages.map(p => parseInt(p.id))) : 0;
    newPackage.id = (maxId + 1).toString();
    packages.push(newPackage);
    writePackages(packages);
    return NextResponse.json(newPackage, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create package' }, { status: 500 });
  }
}

