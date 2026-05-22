import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getMessages, postMessage, getAllUsers } from '@/lib/turso';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const trip = url.searchParams.get('trip'); // null => lounge
  const sinceStr = url.searchParams.get('since');
  const since = sinceStr ? Number(sinceStr) : undefined;
  const msgs = await getMessages({ trip_key: trip || null, since, limit: 200 });
  // Include users for emoji/name lookup
  const users = await getAllUsers();
  const usersById = Object.fromEntries(users.map(u => [u.id, { name: u.name, emoji: u.emoji }]));
  return NextResponse.json({ messages: msgs, users: usersById });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { trip_key, body } = await req.json().catch(() => ({}));
  if (typeof body !== 'string' || !body.trim()) {
    return NextResponse.json({ error: 'empty body' }, { status: 400 });
  }
  await postMessage(user.id, trip_key || null, body.trim());
  return NextResponse.json({ ok: true });
}
