import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { deleteUser } from '@/lib/turso';

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
