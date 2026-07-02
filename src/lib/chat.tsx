// Shared rendering helpers for chat surfaces (LoungeChat + CommentThread).

export function formatMessageTime(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Render "#16" trip mentions as clickable chips that deep-link to the trip.
export function renderMessageBody(body: string): React.ReactNode {
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
