'use client';
import { useEffect, useRef, useState } from 'react';

type Status = 'idle' | 'starting' | 'queued' | 'in_progress' | 'success' | 'failure' | 'unconfigured';

export default function RefreshButton({ lastGenerated }: { lastGenerated?: string }) {
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
          // Give Vercel ~3 min to build + deploy after GHA pushes
          setTimeout(() => window.location.reload(), 3 * 60 * 1000);
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

  // Estimated total: ~4 min (90s GHA + ~150s Vercel deploy)
  const pct = Math.min(99, (elapsed / 240) * 100);
  const stage =
    status === 'starting' ? 'Asking GitHub…' :
    status === 'queued' ? '🕒 Waiting for runner…' :
    status === 'in_progress'
      ? (elapsed < 30 ? 'Fetching offers…'
        : elapsed < 70 ? 'Computing chains…'
        : 'Deploying…')
    : status === 'success' ? '✅ Deploying… (reloads in ~3 min)'
    : status === 'failure' ? '❌ Failed'
    : status === 'unconfigured' ? '⚠️ Not configured'
    : '';

  const disabled = status !== 'idle' && status !== 'success' && status !== 'failure' && status !== 'unconfigured';

  const lastUpdatedLabel = (() => {
    if (!lastGenerated) return null;
    try {
      const d = new Date(lastGenerated);
      const mins = Math.round((Date.now() - d.getTime()) / 60000);
      if (mins < 2) return 'just now';
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      return `${hrs}h ago`;
    } catch { return null; }
  })();

  return (
    <div style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => (disabled ? null : start())}
        disabled={disabled}
        title={status === 'idle' && lastUpdatedLabel ? `Last updated ${lastUpdatedLabel}` : undefined}
      >
        🔄<span className="refresh-label"> {status === 'idle' ? 'Refresh' : stage}</span>
      </button>
      {/* Progress bar sits below the topbar as a thin stripe — doesn't expand topbar height */}
      {(status === 'queued' || status === 'in_progress' || status === 'success') && (
        <div style={{
          position: 'fixed', top: 56, left: 0, right: 0, height: 3, zIndex: 1001,
          background: 'var(--surface-2)',
        }}>
          <div style={{
            height: '100%', background: 'var(--accent)',
            width: status === 'success' ? '100%' : `${pct}%`,
            transition: 'width 0.5s ease',
          }} />
        </div>
      )}
      {status === 'failure' && runUrl && (
        <a href={runUrl} target="_blank" rel="noreferrer" className="text-xs"
          style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, whiteSpace: 'nowrap', color: 'var(--ink-3)' }}>
          View run →
        </a>
      )}
    </div>
  );
}
