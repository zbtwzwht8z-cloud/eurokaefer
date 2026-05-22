import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

const GH_PAT = process.env.GH_PAT;
const GH_REPO = process.env.GH_REPO; // e.g. "bebo/eurokaefer"
const WORKFLOW = 'refresh.yml';

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!GH_PAT || !GH_REPO) {
    return NextResponse.json({ error: 'refresh not configured' }, { status: 503 });
  }
  const url = `https://api.github.com/repos/${GH_REPO}/actions/workflows/${WORKFLOW}/dispatches`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GH_PAT}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ ref: 'main' }),
  });
  if (!res.ok) {
    const txt = await res.text();
    return NextResponse.json({ error: 'gh dispatch failed', detail: txt }, { status: 502 });
  }
  return NextResponse.json({ ok: true, started: Date.now() });
}
