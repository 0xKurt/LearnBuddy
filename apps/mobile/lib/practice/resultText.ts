// The same facts, title and sentences on the result page and in Buddy's home (#918).
import type { DrillLine, PracticeSummary, SessionMode } from '@learnbuddy/shared-types/contracts';

import { summaryLines, topicsToReview } from './summaryLine.js';
import { timeUpLines } from './testClock.js';

type Line = {
  key: string;
  count?: number;
  answered?: number;
  topics?: string;
  what?: string;
  n?: number;
};
type Facts = {
  mode: SessionMode;
  pass?: 'cards' | 'drill' | null;
  ran_out?: boolean;
  total?: number;
  title?: string | null;
  drill_summary?: DrillLine | null;
};

export function resultTitle(facts: Facts): string {
  if (facts.pass) return `${facts.pass}.done_title`;
  if (facts.mode === 'help') return 'summary_help.title';
  if (facts.mode === 'test')
    return facts.ran_out ? 'summary_test.time_up_title' : 'summary_test.title';
  return 'summary.title';
}

export function resultLines(summary: PracticeSummary, facts: Facts): Line[] {
  if (facts.pass === 'cards') return [{ key: 'cards.done_body' }];
  if (facts.pass === 'drill') {
    const drill = facts.drill_summary;
    if (!drill) return [];
    return [
      {
        key: `drill.line.${drill.line}_${drill.group.kind}`,
        ...(drill.group.kind === 'range' ? { what: facts.title ?? '' } : { n: drill.group.n }),
      },
    ];
  }
  const lines: Line[] =
    facts.ran_out && facts.total !== undefined
      ? timeUpLines(summary, facts.total)
      : summaryLines(summary, facts.mode);
  const secure = facts.mode === 'help' ? [] : summary.secure_topics;
  const shaky = topicsToReview(summary, facts.mode);
  if (secure.length) lines.push({ key: 'summary.secure', topics: secure.join(', ') });
  if (shaky.length) lines.push({ key: 'summary.shaky', topics: shaky.join(', ') });
  return lines;
}
