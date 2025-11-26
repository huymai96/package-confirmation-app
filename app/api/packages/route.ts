import { NextResponse } from 'next/server';
import type { Package } from '@/app/types';
import { getPackages, setPackages } from '@/app/lib/storage';

export async function GET() {
  try {
    const packages = getPackages();
    return NextResponse.json(packages);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch packages' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const newPackage: Package = await request.json();
    const packages = getPackages();
    const maxId = packages.length > 0 ? Math.max(...packages.map(p => parseInt(p.id))) : 0;
    newPackage.id = (maxId + 1).toString();
    packages.push(newPackage);
    setPackages(packages);
    return NextResponse.json(newPackage, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create package' }, { status: 500 });
  }
}
