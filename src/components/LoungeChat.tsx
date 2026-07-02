'use client';
import { useEffect, useRef, useState } from 'react';
import type { User, Message } from '@/lib/turso';
import { formatMessageTime, renderMessageBody } from '@/lib/chat';

type Props = {
  open: boolean;
  onClose: () => void;
  user: User;
  usersById: Record<number, User>;
};

export default function LoungeChat({ open, onClose, user, usersById }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const sinceRef = useRef<number>(0);
  const bodyRef = useRef<HTMLDivElement>(null);

  async function fetchMessages(reset = false) {
    try {
      const params = new URLSearchParams();
      if (!reset && sinceRef.current) params.set('since', String(sinceRef.current));
      const res = await fetch('/api/messages?' + params, { cache: 'no-store' });
      const data = await res.json();
      const incoming: Message[] = data.messages || [];
      if (incoming.length) {
        sinceRef.current = Math.max(...incoming.map(m => m.created_at), sinceRef.current);
        setMessages(prev => reset ? incoming : [...prev, ...incoming]);
        // auto-scroll to bottom on new messages
        setTimeout(() => {
          if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
        }, 50);
      } else if (reset) {
        setMessages([]);
        sinceRef.current = 0;
      }
    } catch {/* silent */}
  }

  useEffect(() => {
    if (!open) return;
    fetchMessages(true);
    const id = setInterval(() => fetchMessages(false), 8000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trip_key: null, body: input.trim() }),
      });
      setInput('');
      await fetchMessages(false);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {open && (
        <div onClick={onClose} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.18)',
          zIndex: 1099, backdropFilter: 'blur(2px)',
        }} />
      )}
    <aside className={open ? 'lounge open' : 'lounge'}>
      <div className="lounge-head">
        <div>
          <div className="eyebrow">Eurokäfer · chat</div>
          <h2 className="h-3" style={{ marginTop: 2 }}>💬 Lounge</h2>
        </div>
        <button className="btn-icon" onClick={onClose} title="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="lounge-body" ref={bodyRef}>
        {messages.length === 0 ? (
          <p className="text-sm" style={{ textAlign: 'center', padding: '40px 20px' }}>
            Nothing yet. Drop the first message.
          </p>
        ) : (
          <div className="comments">
            {messages.map(m => {
              const u = usersById[m.user_id];
              return (
                <div key={m.id} className="comment">
                  <span className="comment-emoji">{u?.emoji || '🚐'}</span>
                  <div className="comment-bubble">
                    <div className="comment-meta">{u?.name || 'someone'} · {formatMessageTime(m.created_at)}</div>
                    <div className="comment-body">{renderMessageBody(m.body)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <form className="comment-input" onSubmit={send} style={{ padding: 16, borderTop: '1px solid var(--line)', marginTop: 0 }}>
        <input
          placeholder={`Message as ${user.name}…`}
          value={input}
          onChange={e => setInput(e.target.value)}
          maxLength={4000}
        />
        <button type="submit" className="btn btn-accent btn-sm" disabled={!input.trim() || sending}>
          Send
        </button>
      </form>
    </aside>
    </>
  );
}
