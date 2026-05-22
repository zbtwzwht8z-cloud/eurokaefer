'use client';
import { useEffect, useRef, useState } from 'react';

type Status = 'idle' | 'starting' | 'queued' | 'in_progress' | 'success' | 'failure' | 'unconfigured';

export default function RefreshButton() {
  const [status, setStatus] = useState<Status>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [runUrl, setRunUrl] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function start() {
    setStatus('starting');
    setElapsed(0);
    setRunUrl(null);
    try {
      const res = await fetch('/api/refresh', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'refresh not configured') setStatus('unconfigured');
        else setStatus('failure');
        return;
      }
      setStatus('queued');
      // start timer + poller
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
      pollRef.current = setInterval(pollStatus, 4000);
      // first poll a bit later to give GH a moment
      setTimeout(pollStatus, 3000);
    } catch {
      setStatus('failure');
    }
  }

  async function pollStatus() {
    try {
      const res = await fetch('/api/refresh-status', { cache: 'no-store' });
      const data = await res.json();
      if (data.status === 'unconfigured') {
        setStatus('unconfigured');
        cleanup();
        return;
      }
      setRunUrl(data.html_url || null);
      if (data.status === 'queued') setStatus('queued');
      else if (data.status === 'in_progress') setStatus('in_progress');
      else if (data.status === 'completed') {
        setStatus(data.conclusion === 'success' ? 'success' : 'failure');
        cleanup();
        if (data.conclusion === 'success') {
          setTimeout(() => window.location.reload(), 8000);
        }
      }
    } catch {/* keep polling */}
  }

  function cleanup() {
    if (pollRef.current) clearInterval(pollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    pollRef.current = null;
    timerRef.current = null;
  }

  useEffect(() => cleanup, []);

  // Estimated total: 90 seconds.
  const pct = Math.min(100, (elapsed / 90) * 100);
  const stage =
    status === 'starting' ? 'Asking GitHub…' :
    status === 'queued' ? '🕒 Waiting for runner…' :
    status === 'in_progress'
      ? (elapsed < 30 ? 'Fetching offers…'
        : elapsed < 70 ? 'Computing chains…'
        : 'Deploying…')
    : status === 'success' ? '✅ Done — reloading…'
    : status === 'failure' ? '❌ Failed'
    : status === 'unconfigured' ? '⚠️ Not configured'
    : '';

  const disabled = status !== 'idle' && status !== 'success' && status !== 'failure' && status !== 'unconfigured';

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', minWidth: 200 }}>
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => (disabled ? null : start())}
        disabled={disabled}
        style={{ width: '100%' }}
      >
        {status === 'idle' ? '🔄 Refresh now' : stage}
      </button>
      {(status === 'queued' || status === 'in_progress') && (
        <>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-xs" style={{ textAlign: 'center' }}>
            {elapsed}s elapsed
          </div>
        </>
      )}
      {status === 'failure' && runUrl && (
        <a href={runUrl} target="_blank" rel="noreferrer" className="text-xs" style={{ marginTop: 6, textAlign: 'center' }}>
          View run on GitHub →
        </a>
      )}
    </div>
  );
}
