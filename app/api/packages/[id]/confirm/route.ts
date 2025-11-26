import { NextResponse } from 'next/server';
import { saveConfirmation, readScanLog } from '@/app/lib/csv-reader';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const { confirmedBy, notes } = await request.json();
    
    if (!confirmedBy) {
      return NextResponse.json({ error: 'confirmedBy is required' }, { status: 400 });
    }
    
    // Decode the ID (it might be URL encoded)
    const decodedId = decodeURIComponent(id);
    
    const success = saveConfirmation(decodedId, confirmedBy, notes);
    
    if (!success) {
      return NextResponse.json({ error: 'Failed to save confirmation' }, { status: 500 });
    }
    
    // Return the updated record
    const records = readScanLog();
    const updatedRecord = records.find(r => r.id === decodedId);
    
    if (updatedRecord) {
      return NextResponse.json(updatedRecord);
    }
    
    return NextResponse.json({ success: true, id: decodedId });
  } catch (error) {
    console.error('Error confirming package:', error);
    return NextResponse.json({ error: 'Failed to confirm package' }, { status: 500 });
  }
}
