'use client';
import { useState } from 'react';

export default function AccessKeyGate() {
  const [key, setKey] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: key.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErr(data.error === 'unknown key' ? 'Hmm, that key doesn\'t match anyone.' : 'Something went wrong.');
        return;
      }
      // Reload to pick up the server-side user
      window.location.reload();
    } catch {
      setErr('Network error. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gate">
      <div className="gate-card">
        <div className="gate-logo">🚐</div>
        <h1 className="gate-title">Eurokäfer</h1>
        <p className="gate-sub">€1 road trips · for the crew</p>
        <form onSubmit={submit} autoComplete="off">
          <input
            className="gate-input"
            type="password"
            placeholder="Your access key"
            autoComplete="current-password"
            value={key}
            onChange={e => setKey(e.target.value)}
            autoFocus
          />
          <button type="submit" className="btn btn-accent" style={{ width: '100%' }} disabled={busy || !key.trim()}>
            {busy ? 'Checking…' : 'Enter'}
          </button>
          <p className="gate-err">{err || ' '}</p>
        </form>
      </div>
    </div>
  );
}
