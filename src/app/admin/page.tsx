import { getCurrentUser } from '@/lib/auth';
import { getAllUsers } from '@/lib/turso';
import { redirect } from 'next/navigation';
import AdminPanel from '@/components/AdminPanel';

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/');
  if (!user.is_admin) {
    return (
      <main className="container section-lg">
        <h1 className="h-1">Not allowed</h1>
        <p style={{ color: 'var(--ink-3)', marginTop: 8 }}>
          You need an admin key to see this page.
        </p>
      </main>
    );
  }
  const users = await getAllUsers();
  return (
    <main className="container section-lg">
      <div className="eyebrow">Admin</div>
      <h1 className="h-1" style={{ marginTop: 6 }}>The crew</h1>
      <p style={{ color: 'var(--ink-3)', marginTop: 8 }}>Manage who has access. Keys are case-insensitive and unique.</p>
      <AdminPanel initialUsers={users} myUserId={user.id} />
    </main>
  );
}
