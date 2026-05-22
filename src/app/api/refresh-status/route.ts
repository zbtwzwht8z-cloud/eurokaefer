import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

const GH_PAT = process.env.GH_PAT;
const GH_REPO = process.env.GH_REPO;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!GH_PAT || !GH_REPO) {
    return NextResponse.json({ status: 'unconfigured' });
  }
  const url = `https://api.github.com/repos/${GH_REPO}/actions/workflows/refresh.yml/runs?per_page=1`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${GH_PAT}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    return NextResponse.json({ error: 'gh api failed' }, { status: 502 });
  }
  const data = await res.json();
  const run = data.workflow_runs?.[0];
  if (!run) return NextResponse.json({ status: 'none' });
  return NextResponse.json({
    status: run.status,          // queued | in_progress | completed
    conclusion: run.conclusion,  // success | failure | null
    html_url: run.html_url,
    started_at: run.run_started_at,
    updated_at: run.updated_at,
  });
}
