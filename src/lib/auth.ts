// Server-side auth helper. Reads the HTTPOnly cookie set by /api/auth and
// hydrates the current user from Turso.
import { cookies } from 'next/headers';
import { getUserById, type User } from './turso';

export const USER_COOKIE = 'ek_user_id';

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(USER_COOKIE)?.value;
  if (!raw) return null;
  const id = Number(raw);
  if (!Number.isFinite(id) || id <= 0) return null;
  return await getUserById(id);
}
