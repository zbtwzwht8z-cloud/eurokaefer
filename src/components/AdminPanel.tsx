'use client';
import { useState } from 'react';
import type { User } from '@/lib/turso';
import { HOME_CITIES } from '@/lib/constants';

type EditState = { name: string; key: string; home_city: string; emoji: string; is_admin: boolean };

export default function AdminPanel({ initialUsers, myUserId }: { initialUsers: User[]; myUserId: number }) {
  const [users, setUsers]   = useState(initialUsers);
  const [form, setForm]     = useState({ name: '', key: '', home_city: 'Bochum', emoji: '🧑' });
  const [editing, setEditing] = useState<number | null>(null);
  const [editState, setEditState] = useState<EditState>({ name: '', key: '', home_city: 'Bochum', emoji: '🧑', is_admin: false });
  const [err, setErr]       = useState('');
  const [addErr, setAddErr] = useState('');

  async function reload() {
    const res = await fetch('/api/users');
    const data = await res.json();
    setUsers(data.users || []);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setAddErr('');
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.name, key: form.key, home_city: form.home_city, emoji: form.emoji, is_admin: false }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setAddErr(data.error || 'Failed to add user.');
      return;
    }
    setForm({ name: '', key: '', home_city: 'Bochum', emoji: '🧑' });
    await reload();
  }

  function startEdit(u: User) {
    setEditing(u.id);
    setEditState({ name: u.name, key: u.key, home_city: u.home_city || 'Bochum', emoji: u.emoji || '🧑', is_admin: u.is_admin });
    setErr('');
  }

  async function saveEdit(id: number) {
    setErr('');
    const res = await fetch(`/api/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editState),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErr(data.error || 'Failed to save.');
      return;
    }
    setEditing(null);
    await reload();
  }

  async function remove(id: number) {
    if (id === myUserId) { alert("Can't remove yourself."); return; }
    if (!confirm('Remove this member?')) return;
    await fetch(`/api/users/${id}`, { method: 'DELETE' });
    await reload();
  }

  return (
    <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 32, maxWidth: 580 }}>

      {/* Member list */}
      <section>
        <h2 className="h-3" style={{ marginBottom: 16 }}>Members ({users.length})</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {users.map(u => (
            <div key={u.id} style={{
              background: 'var(--surface)', border: '1px solid var(--line)',
              borderRadius: 'var(--r-sm)', overflow: 'hidden',
            }}>
              {editing === u.id ? (
                /* ── Edit mode ── */
                <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <input className="gate-input" placeholder="Name" value={editState.name}
                      onChange={e => setEditState({ ...editState, name: e.target.value })} />
                    <input className="gate-input" placeholder="Access key" value={editState.key}
                      onChange={e => setEditState({ ...editState, key: e.target.value })} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <select className="gate-input" value={editState.home_city}
                      onChange={e => setEditState({ ...editState, home_city: e.target.value })}>
                      {HOME_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input className="gate-input" placeholder="Emoji (e.g. 🧑)" value={editState.emoji}
                      onChange={e => setEditState({ ...editState, emoji: e.target.value })} />
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <input type="checkbox" checked={editState.is_admin}
                      onChange={e => setEditState({ ...editState, is_admin: e.target.checked })} />
                    Admin access
                  </label>
                  {err && <div className="gate-err">{err}</div>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-accent btn-sm" onClick={() => saveEdit(u.id)}>Save</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                /* ── View mode ── */
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>
                      {u.emoji || '🧑'} {u.name}
                      {u.is_admin && <span className="badge badge-accent" style={{ marginLeft: 8 }}>admin</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
                      key: <code style={{ userSelect: 'all' }}>{u.key}</code>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => startEdit(u)}>Edit</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => remove(u.id)}
                      disabled={u.id === myUserId} style={{ color: u.id === myUserId ? 'var(--ink-3)' : '#c0392b' }}>
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Add member */}
      <section style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: 24 }}>
        <h2 className="h-3" style={{ marginBottom: 16 }}>Add member</h2>
        <form onSubmit={add} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input className="gate-input" placeholder="Name (e.g. Owda)" value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })} required />
            <input className="gate-input" placeholder="Key (e.g. owda-2026)" value={form.key}
              onChange={e => setForm({ ...form, key: e.target.value.toLowerCase() })} required />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <select className="gate-input" value={form.home_city}
              onChange={e => setForm({ ...form, home_city: e.target.value })}>
              {HOME_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input className="gate-input" placeholder="Emoji (e.g. 🎸)" value={form.emoji}
              onChange={e => setForm({ ...form, emoji: e.target.value })} />
          </div>
          {addErr && <div className="gate-err">{addErr}</div>}
          <button type="submit" className="btn btn-accent" style={{ alignSelf: 'flex-start' }}>Add member</button>
        </form>
      </section>
    </div>
  );
}
