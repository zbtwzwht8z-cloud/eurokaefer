import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createUser, getAllUsers } from '@/lib/turso';

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.is_admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const users = await getAllUsers();
  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.is_admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  const key = String(body.key || '').trim().toLowerCase();
  const home_city = String(body.home_city || 'Other').trim();
  const emoji = String(body.emoji || '🚐').trim();
  const is_admin = Boolean(body.is_admin);
  if (!name || !key) return NextResponse.json({ error: 'missing fields' }, { status: 400 });
  try {
    await createUser({ name, key, home_city, emoji, is_admin });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: 'create failed', detail: String(e) }, { status: 500 });
  }
}
