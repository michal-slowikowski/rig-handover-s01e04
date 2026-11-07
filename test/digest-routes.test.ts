import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const line = (o: Record<string, unknown>) => JSON.stringify(o);

const GOOD = [
  line({ at: '2026-01-01T02:00:00+01:00', job: 'zeta-report', status: 'ok', owner: 'ann' }),
  line({ at: '2026-01-01T02:05:00+01:00', job: 'alpha-sync', status: 'retry', owner: 'bob' }),
  line({ at: '2026-01-01T02:10:00+01:00', job: 'alpha-sync', status: 'ok', owner: 'bob' }),
  line({ at: '2026-01-01T02:15:00+01:00', job: 'mid-backup', status: 'fail', owner: null, error: 'disk full' }),
];
const JOBS_SORTED = ['alpha-sync', 'mid-backup', 'zeta-report'];

let dir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  writeFileSync(join(dir, '2026-01-01.jsonl'), GOOD.join('\n') + '\n');
  writeFileSync(join(dir, '2026-01-02.jsonl'), '');
  writeFileSync(join(dir, '2026-01-03.jsonl'), [GOOD[0], 'not json {', GOOD[1]].join('\n') + '\n');
  app = createApp({ adapter: 'shim', installed: 'x', beatEverySeconds: 60, runsDir: dir });
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

type Body = { night: string; rows: { job: string }[]; badLines: number };

describe('GET /digest/:night', () => {
  it('renders 200 with each job name', async () => {
    const res = await app.request('/digest/2026-01-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    for (const job of JOBS_SORTED) expect(html).toContain(job);
  });

  it('404 for a night with no file', async () => {
    const res = await app.request('/digest/2026-01-09');
    expect(res.status).toBe(404);
  });

  it('empty file renders "nothing ran"', async () => {
    const res = await app.request('/digest/2026-01-02');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('a bad line still renders 200 with the good rows', async () => {
    const res = await app.request('/digest/2026-01-03');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('zeta-report');
    expect(html).toContain('alpha-sync');
  });
});

describe('GET /api/digest/:night', () => {
  it('200 with night, rows sorted by job, badLines 0', async () => {
    const res = await app.request('/api/digest/2026-01-01');
    const body = (await res.json()) as Body;
    expect(res.status).toBe(200);
    expect(body.night).toBe('2026-01-01');
    expect(body.rows.map((r) => r.job)).toEqual(JOBS_SORTED);
    expect(body.badLines).toBe(0);
  });

  it('404 for a missing night', async () => {
    const res = await app.request('/api/digest/2026-01-09');
    expect(res.status).toBe(404);
  });

  it('empty night gives rows []', async () => {
    const res = await app.request('/api/digest/2026-01-02');
    const body = (await res.json()) as Body;
    expect(res.status).toBe(200);
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });

  it('bad line counts in badLines and good rows stay', async () => {
    const res = await app.request('/api/digest/2026-01-03');
    const body = (await res.json()) as Body;
    expect(res.status).toBe(200);
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha-sync', 'zeta-report']);
  });

  it('JSON job order equals the job order in the page', async () => {
    const api = (await (await app.request('/api/digest/2026-01-01')).json()) as Body;
    const html = await (await app.request('/digest/2026-01-01')).text();
    const jobs = api.rows.map((r) => r.job);
    const inPage = [...jobs].sort((a, b) => html.indexOf(a) - html.indexOf(b));
    expect(inPage).toEqual(jobs);
  });
});
