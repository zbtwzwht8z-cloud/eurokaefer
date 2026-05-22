import { NextRequest, NextResponse } from 'next/server';
import { getUserByKey } from '@/lib/turso';
import { USER_COOKIE } from '@/lib/auth';

export async function POST(req: NextRequest) {
  let body: { key?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  const key = (body.key ?? '').trim().toLowerCase();
  if (!key) return NextResponse.json({ error: 'missing key' }, { status: 400 });

  const user = await getUserByKey(key);
  if (!user) {
    // small random delay to deter brute-force scanning
    await new Promise(r => setTimeout(r, 300 + Math.random() * 200));
    return NextResponse.json({ error: 'unknown key' }, { status: 401 });
  }

  const res = NextResponse.json({
    id: user.id, name: user.name, home_city: user.home_city,
    emoji: user.emoji, is_admin: user.is_admin,
  });
  res.cookies.set(USER_COOKIE, String(user.id), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 90, // 90 days
  });
  return res;
}
