// Turso edge-SQLite client. Pattern adapted from archive-app/src/lib/turso.ts.
// Uses raw HTTP to the /v2/pipeline endpoint — no ORM, no client library.

const TURSO_URL = process.env.TURSO_URL!;
const TURSO_TOKEN = process.env.TURSO_TOKEN!;

type TursoValue = { type: string; value: string };
type TursoRow = TursoValue[];

export async function query(sql: string, args: TursoValue[] = []) {
  const res = await fetch(`${TURSO_URL}/v2/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TURSO_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        { type: 'execute', stmt: { sql, args } },
        { type: 'close' },
      ],
    }),
    cache: 'no-store',
  });
  const data = await res.json();
  const result = data.results[0];
  if (result.type !== 'ok') throw new Error(JSON.stringify(result));
  return result.response.result as { cols: { name: string }[]; rows: TursoRow[] };
}

function rowToObj(cols: { name: string }[], row: TursoRow) {
  return Object.fromEntries(cols.map((c, i) => [c.name, row[i]?.value ?? null]));
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type User = {
  id: number;
  name: string;
  key: string;
  home_city: string;
  emoji: string | null;
  is_admin: boolean;
  created_at: number;
};

export type Highlight = {
  id: number;
  user_id: number;
  trip_key: string;
  created_at: number;
};

export type Message = {
  id: number;
  user_id: number;
  trip_key: string | null;
  body: string;
  created_at: number;
};

// ── Users ─────────────────────────────────────────────────────────────────────

function parseUser(raw: Record<string, string | null>): User {
  return {
    id: Number(raw.id),
    name: raw.name ?? '',
    key: raw.key ?? '',
    home_city: raw.home_city ?? '',
    emoji: raw.emoji,
    is_admin: raw.is_admin === '1',
    created_at: Number(raw.created_at),
  };
}

export async function getUserByKey(key: string): Promise<User | null> {
  const { cols, rows } = await query('SELECT * FROM users WHERE key = ? LIMIT 1', [
    { type: 'text', value: key },
  ]);
  if (!rows.length) return null;
  return parseUser(rowToObj(cols, rows[0]) as Record<string, string | null>);
}

export async function getUserById(id: number): Promise<User | null> {
  const { cols, rows } = await query('SELECT * FROM users WHERE id = ? LIMIT 1', [
    { type: 'integer', value: String(id) },
  ]);
  if (!rows.length) return null;
  return parseUser(rowToObj(cols, rows[0]) as Record<string, string | null>);
}

export async function getAllUsers(): Promise<User[]> {
  const { cols, rows } = await query('SELECT * FROM users ORDER BY id');
  return rows.map(r => parseUser(rowToObj(cols, r) as Record<string, string | null>));
}

export async function createUser(u: Omit<User, 'id' | 'created_at'>): Promise<void> {
  await query(
    'INSERT INTO users (name, key, home_city, emoji, is_admin, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [
      { type: 'text', value: u.name },
      { type: 'text', value: u.key },
      { type: 'text', value: u.home_city },
      { type: 'text', value: u.emoji ?? '' },
      { type: 'integer', value: u.is_admin ? '1' : '0' },
      { type: 'integer', value: String(Date.now()) },
    ],
  );
}

export async function deleteUser(id: number): Promise<void> {
  await query('DELETE FROM users WHERE id = ?', [{ type: 'integer', value: String(id) }]);
}

// ── Highlights ────────────────────────────────────────────────────────────────

function parseHighlight(raw: Record<string, string | null>): Highlight {
  return {
    id: Number(raw.id),
    user_id: Number(raw.user_id),
    trip_key: raw.trip_key ?? '',
    created_at: Number(raw.created_at),
  };
}

export async function getAllHighlights(): Promise<Highlight[]> {
  const { cols, rows } = await query('SELECT * FROM highlights ORDER BY created_at DESC');
  return rows.map(r => parseHighlight(rowToObj(cols, r) as Record<string, string | null>));
}

export async function addHighlight(user_id: number, trip_key: string): Promise<void> {
  await query(
    'INSERT OR IGNORE INTO highlights (user_id, trip_key, created_at) VALUES (?, ?, ?)',
    [
      { type: 'integer', value: String(user_id) },
      { type: 'text', value: trip_key },
      { type: 'integer', value: String(Date.now()) },
    ],
  );
}

export async function removeHighlight(user_id: number, trip_key: string): Promise<void> {
  await query('DELETE FROM highlights WHERE user_id = ? AND trip_key = ?', [
    { type: 'integer', value: String(user_id) },
    { type: 'text', value: trip_key },
  ]);
}

// ── Messages ──────────────────────────────────────────────────────────────────

function parseMessage(raw: Record<string, string | null>): Message {
  return {
    id: Number(raw.id),
    user_id: Number(raw.user_id),
    trip_key: raw.trip_key,
    body: raw.body ?? '',
    created_at: Number(raw.created_at),
  };
}

/** trip_key null = global #lounge. Pass the trip route string for per-trip thread. */
export async function getMessages(opts: {
  trip_key: string | null;
  since?: number;
  limit?: number;
}): Promise<Message[]> {
  const limit = opts.limit ?? 100;
  let sql = 'SELECT * FROM messages WHERE ';
  const args: TursoValue[] = [];
  if (opts.trip_key === null) {
    sql += 'trip_key IS NULL';
  } else {
    sql += 'trip_key = ?';
    args.push({ type: 'text', value: opts.trip_key });
  }
  if (opts.since) {
    sql += ' AND created_at > ?';
    args.push({ type: 'integer', value: String(opts.since) });
  }
  sql += ' ORDER BY created_at ASC LIMIT ?';
  args.push({ type: 'integer', value: String(limit) });
  const { cols, rows } = await query(sql, args);
  return rows.map(r => parseMessage(rowToObj(cols, r) as Record<string, string | null>));
}

export async function postMessage(user_id: number, trip_key: string | null, body: string): Promise<void> {
  const args: TursoValue[] = [
    { type: 'integer', value: String(user_id) },
    trip_key === null ? { type: 'null', value: '' } : { type: 'text', value: trip_key },
    { type: 'text', value: body.slice(0, 4000) },
    { type: 'integer', value: String(Date.now()) },
  ];
  await query('INSERT INTO messages (user_id, trip_key, body, created_at) VALUES (?, ?, ?, ?)', args);
}
