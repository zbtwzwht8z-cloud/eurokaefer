import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { deleteUser, query } from '@/lib/turso';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user?.is_admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { id } = await params;
  const num = Number(id);
  if (!Number.isFinite(num)) return NextResponse.json({ error: 'bad id' }, { status: 400 });

  let body: { name?: string; key?: string; home_city?: string; emoji?: string; is_admin?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad body' }, { status: 400 }); }

  const name      = body.name?.trim();
  const key       = body.key?.trim().toLowerCase();
  const home_city = body.home_city?.trim() || 'Other';
  const emoji     = body.emoji?.trim() || '🧑';
  const isAdmin   = body.is_admin ?? false;

  if (!name || !key) return NextResponse.json({ error: 'name and key required' }, { status: 400 });

  await query(
    'UPDATE users SET name=?, key=?, home_city=?, emoji=?, is_admin=? WHERE id=?',
    [{ type: 'text', value: name }, { type: 'text', value: key },
     { type: 'text', value: home_city }, { type: 'text', value: emoji },
     { type: 'integer', value: String(isAdmin ? 1 : 0) }, { type: 'integer', value: String(num) }],
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user?.is_admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { id } = await params;
  const num = Number(id);
  if (!Number.isFinite(num)) return NextResponse.json({ error: 'bad id' }, { status: 400 });
  if (num === user.id) return NextResponse.json({ error: 'cannot delete self' }, { status: 400 });
  await deleteUser(num);
  return NextResponse.json({ ok: true });
}
