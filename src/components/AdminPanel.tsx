'use client';
import { useState } from 'react';
import type { User } from '@/lib/turso';
import { HOME_CITIES } from '@/lib/constants';

export default function AdminPanel({ initialUsers, myUserId }: { initialUsers: User[]; myUserId: number }) {
  const [users, setUsers] = useState(initialUsers);
  const [form, setForm] = useState({ name: '', key: '', home_city: 'Bochum', emoji: '🚐', is_admin: false });
  const [err, setErr] = useState('');

  async function refresh() {
    const res = await fetch('/api/users');
    const data = await res.json();
    setUsers(data.users || []);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErr(data.detail || data.error || 'failed');
      return;
    }
    setForm({ name: '', key: '', home_city: 'Bochum', emoji: '🚐', is_admin: false });
    await refresh();
  }

  async function remove(id: number) {
    if (id === myUserId) return alert('Can\'t delete yourself.');
    if (!confirm('Delete this user?')) return;
    await fetch(`/api/users/${id}`, { method: 'DELETE' });
    await refresh();
  }

  return (
    <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 32 }}>
      {/* User list */}
      <section>
        <h2 className="h-3" style={{ marginBottom: 12 }}>Members ({users.length})</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {users.map(u => (
            <div key={u.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 18px', background: 'var(--surface)',
              border: '1px solid var(--line)', borderRadius: 'var(--r-sm)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 22 }}>{u.emoji || '🚐'}</span>
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {u.name} {u.is_admin && <span className="badge badge-accent" style={{ marginLeft: 6 }}>admin</span>}
                  </div>
                  <div className="text-xs">
                    {u.home_city} · key: <code>{u.key}</code>
                  </div>
                </div>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => remove(u.id)}
                disabled={u.id === myUserId}
              >Remove</button>
            </div>
          ))}
        </div>
      </section>

      {/* Add form */}
      <section style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: 24 }}>
        <h2 className="h-3" style={{ marginBottom: 16 }}>Add a member</h2>
        <form onSubmit={add} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <input className="gate-input" placeholder="Name" value={form.name}
                 onChange={e => setForm({ ...form, name: e.target.value })} required />
          <input className="gate-input" placeholder="Access key (e.g. tom-bochum)" value={form.key}
                 onChange={e => setForm({ ...form, key: e.target.value })} required />
          <select className="gate-input" value={form.home_city}
                  onChange={e => setForm({ ...form, home_city: e.target.value })}>
            {HOME_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input className="gate-input" placeholder="Emoji" maxLength={2} value={form.emoji}
                 onChange={e => setForm({ ...form, emoji: e.target.value })} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            <input type="checkbox" checked={form.is_admin}
                   onChange={e => setForm({ ...form, is_admin: e.target.checked })} />
            Admin
          </label>
          <button type="submit" className="btn btn-accent">Add</button>
        </form>
        {err && <div className="gate-err">{err}</div>}
      </section>
    </div>
  );
}
