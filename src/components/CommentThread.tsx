'use client';
import { useEffect, useRef, useState } from 'react';
import type { User, Message } from '@/lib/turso';

type Props = {
  tripKey: string;
  user: User;
  usersById: Record<number, User>;
};

export default function CommentThread({ tripKey, user, usersById }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const sinceRef = useRef<number>(0);

  async function fetchMessages(reset = false) {
    try {
      const params = new URLSearchParams({ trip: tripKey });
      if (!reset && sinceRef.current) params.set('since', String(sinceRef.current));
      const res = await fetch('/api/messages?' + params, { cache: 'no-store' });
      const data = await res.json();
      const incoming: Message[] = data.messages || [];
      if (incoming.length) {
        sinceRef.current = Math.max(...incoming.map(m => m.created_at), sinceRef.current);
        setMessages(prev => reset ? incoming : [...prev, ...incoming]);
      } else if (reset) {
        setMessages([]);
        sinceRef.current = 0;
      }
    } catch {/* silent */}
  }

  useEffect(() => {
    fetchMessages(true);
    const id = setInterval(() => fetchMessages(false), 8000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripKey]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trip_key: tripKey, body: input.trim() }),
      });
      setInput('');
      await fetchMessages(false);
    } finally {
      setSending(false);
    }
  }

  return (
    <section style={{ marginTop: 28 }}>
      <h3 className="h-3" style={{ marginBottom: 12 }}>Conversation</h3>
      {messages.length === 0 ? (
        <p className="text-sm">No messages yet. Start the thread.</p>
      ) : (
        <div className="comments">
          {messages.map(m => {
            const u = usersById[m.user_id];
            return (
              <div key={m.id} className="comment">
                <span className="comment-emoji">{u?.emoji || '🚐'}</span>
                <div className="comment-bubble">
                  <div className="comment-meta">
                    {u?.name || 'someone'} · {formatTime(m.created_at)}
                  </div>
                  <div className="comment-body">{renderBody(m.body)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <form className="comment-input" onSubmit={send}>
        <input
          placeholder={`Reply as ${user.name}…`}
          value={input}
          onChange={e => setInput(e.target.value)}
          maxLength={4000}
        />
        <button type="submit" className="btn btn-accent btn-sm" disabled={!input.trim() || sending}>
          Send
        </button>
      </form>
    </section>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Render #16 mentions as clickable chips
function renderBody(body: string): React.ReactNode {
  const parts = body.split(/(#\d+)/g);
  return parts.map((part, i) => {
    const match = part.match(/^#(\d+)$/);
    if (match) {
      const id = match[1];
      return (
        <span
          key={i}
          className="trip-mention"
          onClick={e => {
            e.stopPropagation();
            const url = new URL(window.location.href);
            url.searchParams.set('trip', id);
            window.location.href = url.toString();
          }}
        >#{id}</span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
