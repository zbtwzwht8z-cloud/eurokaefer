import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { addHighlight, getAllHighlights, removeHighlight } from '@/lib/turso';

export async function GET() {
  const highlights = await getAllHighlights();
  return NextResponse.json({ highlights });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { trip_key } = await req.json().catch(() => ({}));
  if (!trip_key || typeof trip_key !== 'string') {
    return NextResponse.json({ error: 'missing trip_key' }, { status: 400 });
  }
  await addHighlight(user.id, trip_key.slice(0, 500));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { trip_key } = await req.json().catch(() => ({}));
  if (!trip_key || typeof trip_key !== 'string') {
    return NextResponse.json({ error: 'missing trip_key' }, { status: 400 });
  }
  await removeHighlight(user.id, trip_key);
  return NextResponse.json({ ok: true });
}
