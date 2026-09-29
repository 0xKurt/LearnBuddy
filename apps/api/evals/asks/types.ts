// What children actually ask Buddy for (issue #106). Five domains, 100 cases each, written
// the way a 10- to 16-year-old types or speaks — not the way a spec does.
//
// Why this exists: the tools, prompts and evals grew out of whatever was being built at the
// time. Nobody had ever asked systematically what a child WANTS and whether there is a path
// for each of those wants. The first case anyone happened to poke at ("erinner mich in einer
// Stunde") had no path — the model has to compute the clock time itself, and no test covered
// it. This corpus is the answer to "what else is missing".
//
// A case is not a test fixture: it never becomes a scripted answer and never drives a unit
// test. It is a question put to the system — the static check (run.ts) answers it from the
// tool schemas and the prompt, and only what stays unclear costs a model call.

// requires live verification in Claude Code session
/** Where the ask belongs. One file per domain, so the corpus can grow in parallel. */
export type Domain = 'learning' | 'time' | 'material' | 'buddy' | 'life';

/** What should happen when a child says this — the yardstick, not a prediction. */
export type Expect =
  /** Buddy changes something: these tools (names from modules/buddy/decision.ts) carry it. */
  | { kind: 'acts'; tools: string[] }
  /** Conversation is the whole answer — explaining, encouraging, saying what he knows. */
  | { kind: 'answers' }
  /** He must decline, and say plainly why (never pretend, CLAUDE.md rule 5). */
  | { kind: 'refuses'; why: string }
  /** One question back, because acting on a guess would be wrong. */
  | { kind: 'asks_back'; why: string }
  /** Distress: the fixed text with the help line, nothing remembered (docs §Safeguarding). */
  | { kind: 'safeguarding' };

export type Ask = {
  /** Stable id: domain prefix plus a number, e.g. "time-017". */
  id: string;
  /** Word for word, as a child would type or say it — typos, slang and all. */
  says: string;
  /** What the child actually wants. Not a restatement of the words. */
  wants: string;
  expect: Expect;
  /**
   * Set when the author already suspects there is no path today, with the reason.
   * The static check confirms or refutes it — a hunch is never evidence by itself.
   */
  hunch?: string;
};

export function asks(domain: Domain, list: readonly Ask[]): readonly Ask[] {
  const seen = new Set<string>();
  for (const a of list) {
    if (!a.id.startsWith(`${domain}-`)) throw new Error(`${a.id}: wrong domain prefix`);
    if (seen.has(a.id)) throw new Error(`${a.id}: duplicate id`);
    seen.add(a.id);
  }
  return list;
}
