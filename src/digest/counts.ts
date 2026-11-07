import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLine } from './read.js';
import type { RunStatus } from './types.js';

export type StatusCounts = Record<RunStatus, number>;

// Lines per status for one night. Bad lines and unreadable files count nothing.
export function countStatuses(runsDir: string, night: string): StatusCounts {
  const counts: StatusCounts = { ok: 0, retry: 0, fail: 0 };
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return counts;
  }
  for (const raw of text.split('\n')) {
    const line = parseLine(raw);
    if (line) counts[line.status]++;
  }
  return counts;
}
