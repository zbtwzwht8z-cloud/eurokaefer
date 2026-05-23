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
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => (disabled ? null : start())}
        disabled={disabled}
      >
        🔄<span className="refresh-label"> {status === 'idle' ? 'Refresh now' : stage}</span>
      </button>
      {status === 'idle' && lastUpdatedLabel && (
        <div className="text-xs" style={{ color: 'var(--ink-3)', textAlign: 'center' }}>
          last updated {lastUpdatedLabel}
        </div>
      )}
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
