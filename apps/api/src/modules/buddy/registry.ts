// The act-tool registry (ADR 0005 §Tools, stage 2): every tool that changes
// something is registered once — its call schema (decision.ts), the surfaces
// allowed to call it, the data it touches, whether it can be undone — and its
// handler once in tools.ts (a domain's tools register theirs at start-up, issue #107). The schemas the model answers with, and the tool
// catalogue in the prompt, are generated from this registry, so a new
// capability is one entry plus its handler and tests.
//
// Surfaces are policy, enforced by the schema itself: a background check can
// only offer the tools registered for 'check' — never one that changes what
// the learner said (memory, goals, agreed reminders, settings).

import { z } from 'zod';

import { flatUnion, nestCall } from './calls.js';
import type { Aliases } from './context.js';
import { ACT_SCHEMAS, Outreach, type ActionOf, type AnyAction, type ToolName } from './decision.js';
import type { Surface } from './lookups.js';
import { ToolRejection, type ToolContext, type ToolOutcome } from './toolKit.js';
import { actHandler, missingActHandlers } from './tools.js';

/** What an act tool changes (for the catalogue, the audit and privacy review). */
type Touches =
  | 'memory'
  | 'profile'
  | 'goals'
  | 'steps'
  | 'practice'
  /** Her sheets themselves — renaming, deleting (issue #111). */
  | 'material'
  | 'settings'
  | 'checks'
  /** A roleplay in a foreign language (issue #244). */
  | 'roleplay'
  | 'nothing';

type ActSpec = {
  surfaces: readonly Surface[];
  touches: readonly Touches[];
  /** The learner's own words must justify it (quote checked in code). */
  needsQuote: boolean;
  undoable: boolean;
  /** One line for the catalogue: what it does. */
  does: string;
  /**
   * What STATE must name for the tool to be offered in a turn (KI-Audit F3 stage 2, #668): a tool
   * that changes a memory, a test, a step or a sheet needs one to name. Without it the call could
   * only be refused by code, so the model is not offered it — one schema less to read on every
   * turn of a learner who has none. Absent: always offered.
   */
  needs?: Fact;
};

/** What a tool can need STATE to name (counted from the turn's aliases, `turnFacts`). */
type Fact = 'memories' | 'goals' | 'steps' | 'materials';
export type ToolFacts = Record<Fact, number>;

const TURN: readonly Surface[] = ['turn'];
const BOTH: readonly Surface[] = ['turn', 'check'];

export const ACT_TOOLS: { [K in ToolName]: ActSpec } = {
  remember: {
    surfaces: TURN,
    touches: ['memory'],
    needsQuote: true,
    undoable: true,
    does: 'keep something lasting or temporary about her',
  },
  correct_memory: {
    surfaces: TURN,
    needs: 'memories',
    touches: ['memory'],
    needsQuote: true,
    undoable: true,
    does: 'correct something you know (mN)',
  },
  forget: {
    surfaces: TURN,
    needs: 'memories',
    touches: ['memory'],
    needsQuote: true,
    undoable: true,
    does: 'forget something you know (mN), or all of it',
  },
  set_level: {
    surfaces: TURN,
    touches: ['profile'],
    needsQuote: true,
    undoable: true,
    does: 'set her school year, university or adult',
  },
  plan_exam: {
    surfaces: TURN,
    touches: ['goals'],
    needsQuote: true,
    undoable: true,
    does: 'plan a test with its day',
  },
  update_goal: {
    surfaces: TURN,
    needs: 'goals',
    touches: ['goals'],
    needsQuote: true,
    undoable: true,
    does: "change a test's day, title or topics (gN)",
  },
  close_goal: {
    surfaces: TURN,
    needs: 'goals',
    touches: ['goals'],
    needsQuote: true,
    undoable: true,
    does: 'close a test as done (with outcome) or drop it (gN)',
  },
  prepare_practice: {
    surfaces: BOTH,
    touches: ['practice', 'steps'],
    needsQuote: false,
    undoable: true,
    does: 'prepare practice from her questions, for a test, topic or sheet',
  },
  plan_step: {
    surfaces: TURN,
    touches: ['steps'],
    needsQuote: true,
    undoable: true,
    does: 'plan a step, or a reminder she agreed to',
  },
  update_step: {
    surfaces: TURN,
    needs: 'steps',
    touches: ['steps'],
    needsQuote: true,
    undoable: true,
    does: 'move, skip or cancel a step, or end its repetition (stN)',
  },
  mark_step_done: {
    surfaces: TURN,
    needs: 'steps',
    touches: ['steps'],
    needsQuote: true,
    undoable: true,
    does: 'mark a step done (stN)',
  },
  request_material: {
    surfaces: BOTH,
    touches: ['steps'],
    needsQuote: false,
    undoable: true,
    does: 'ask for a photo of a sheet, or of a page missing from one',
  },
  delete_material: {
    // Only in the conversation: requireQuote does not apply to a check, and Buddy must never
    // reach for one of her sheets on his own initiative (issue #111).
    surfaces: TURN,
    needs: 'materials',
    touches: ['material'],
    needsQuote: true,
    // archiveMaterial erases the photos and the transcript right away — nothing to put back.
    undoable: false,
    does: 'propose deleting one of her sheets with its questions',
  },
  rename_material: {
    surfaces: TURN,
    needs: 'materials',
    touches: ['material'],
    needsQuote: true,
    undoable: true,
    does: 'give one of her sheets the name she asked for',
  },
  delete_item: {
    // Same reasons as delete_material: only in the conversation, only on her words, and
    // nothing comes back — its text, solution and her answers are erased (issue #120).
    surfaces: TURN,
    needs: 'materials',
    touches: ['material'],
    needsQuote: true,
    undoable: false,
    does: 'propose taking one question off a sheet',
  },
  set_contact: {
    surfaces: TURN,
    touches: ['settings'],
    needsQuote: true,
    undoable: true,
    does: 'reduce, pause or shift contact outside the app (never more)',
  },
  set_voice: {
    surfaces: TURN,
    touches: ['settings'],
    needsQuote: true,
    undoable: true,
    does: 'change how you sound when read aloud',
  },
  schedule_check: {
    surfaces: BOTH,
    touches: ['checks'],
    needsQuote: false,
    undoable: true,
    does: 'look again later (1 hour – 21 days)',
  },
  offer_learning: {
    surfaces: TURN,
    touches: ['nothing'],
    needsQuote: false,
    undoable: false,
    does: 'a button that starts learning now (kinds below)',
  },
  offer_drill: {
    surfaces: TURN,
    touches: ['nothing'],
    needsQuote: false,
    undoable: false,
    does: 'a button that starts a quick mental-arithmetic round',
  },
  open_area: {
    surfaces: TURN,
    touches: ['nothing'],
    needsQuote: false,
    undoable: false,
    does: 'a button that opens a part of the app, or the start of a practice you prepared',
  },
  start_roleplay: {
    surfaces: TURN,
    touches: ['roleplay'],
    needsQuote: true,
    undoable: false,
    does: 'start a roleplay in a foreign language',
  },
  plan_talk: {
    surfaces: TURN,
    touches: ['goals', 'steps'],
    needsQuote: true,
    undoable: true,
    does: 'plan a talk with its day and the steps before it',
  },
  offer_rehearsal: {
    surfaces: TURN,
    touches: ['nothing'],
    needsQuote: false,
    undoable: false,
    does: 'a card that records her talk rehearsal or her reading aloud, and measures it',
  },
};

const NAMES = Object.keys(ACT_SCHEMAS) as ToolName[];

/** Tool names a surface may call, in registry order. */
export function toolsFor(surface: Surface): ToolName[] {
  return NAMES.filter((n) => ACT_TOOLS[n].surfaces.includes(surface));
}

type KeysFor<S extends Surface> = {
  [K in ToolName]: S extends (typeof ACT_TOOLS)[K]['surfaces'][number] ? K : never;
}[ToolName];
// Surfaces are declared as readonly Surface[] (not literal tuples), so the static
// types stay the full union; the runtime schema below is what limits a surface.
export type TurnAction = ActionOf<KeysFor<'turn'>>;

type Option = (typeof ACT_SCHEMAS)[ToolName];

/** What code validates: a call as `{ tool, args }`, or flat as the model writes it (calls.ts). */
function unionFor(surface: Surface) {
  const options = toolsFor(surface).map((n): Option => ACT_SCHEMAS[n]);
  const [first, second, ...rest] = options;
  if (!first || !second) throw new Error(`surface ${surface} needs at least two act tools`);
  return z.preprocess(nestCall, z.discriminatedUnion('tool', [first, second, ...rest]));
}

export const TurnActionSchema = unionFor('turn');
export const CheckActionSchema = unionFor('check');

/** What the model is offered: these tools, each call flat (calls.ts, #726). */
function modelUnionOf(tools: readonly ToolName[]) {
  return flatUnion(tools.map((n) => ACT_SCHEMAS[n]));
}

/** The turn's tools that apply to what STATE names (#668); every tool when `facts` is absent. */
export function offeredTools(facts?: ToolFacts): ToolName[] {
  return toolsFor('turn').filter((n) => {
    const need = ACT_TOOLS[n].needs;
    return !facts || !need || facts[need] > 0;
  });
}

/** What the turn's STATE names, counted from its aliases (they grow when a lookup finds a sheet). */
export function turnFacts(aliases: Aliases): ToolFacts {
  return {
    memories: aliases.memories.size,
    goals: aliases.goals.size,
    steps: aliases.steps.size,
    materials: aliases.materials.size,
  };
}

/**
 * What a turn's offer is named in `llm_calls.schema_variant`: what STATE had nothing of, so its
 * tools were left out ("no memories,steps"), or "all tools".
 */
export function offerVariant(tools: readonly ToolName[]): string {
  const missing = new Set<Fact>();
  for (const n of toolsFor('turn')) {
    const need = ACT_TOOLS[n].needs;
    if (need && !tools.includes(n)) missing.add(need);
  }
  return missing.size === 0 ? 'all tools' : `no ${[...missing].join(',')}`;
}

/** The longest reply that passes validation; a longer one is never shown or spoken early. */
export const REPLY_MAX = 700;

const Concern = z
  .boolean()
  .describe(
    'true only when she tells of danger to herself (the rules under "When she writes about herself"); the app then replaces your reply with its fixed help answer. Never for an insult, rudeness or hard news alone.',
  );

/**
 * A child rarely says only one thing (issue #110): the same message can carry the
 * disclosure and a question about learning. Code reads this bit only when `concern`
 * is true, and answers with one further fixed sentence — it never carries the request
 * out and nothing of the message is remembered.
 */
const AlsoAsked = z
  .boolean()
  .describe(
    'only read when concern is true: the same message also asks for something about her learning',
  );

export const TurnDecision = z.object({
  // Lenient when parsing (older scripted answers have no such field); the model must write it.
  //
  // It carried no description at all until issue #225, so everything this bit means stood in
  // the system prompt while the model wrote the bit here — and measured over six runs it set it
  // on a plain insult about one time in six, which hands a child who was only rude a crisis
  // helpline and throws the real answer away. The description says both sides, because the one
  // without the other is what went wrong (the schema reaches the model in the same request and
  // is the larger of the two static blocks — see #213).
  concern: z
    .boolean()
    .default(false)
    .describe(
      'true only when the learner tells of DANGER to herself: being hurt, bullied, abused or threatened, thinking of hurting herself, harming her own body, feeling unsafe or hopeless. The app then replaces your reply with a fixed caring message and a helpline. NOT true for an insult, a provocation, rudeness towards you, ordinary school stress, or a hard turn in her life she is only telling you about while naming no danger — setting it there throws your answer away and hands her a crisis number instead of an answer.',
    ),
  also_asked: z.boolean().default(false),
  // No minimum length: a safeguarding answer is written by code, so the model rightly
  // leaves the reply empty then (its own text would be thrown away). Everything else
  // must carry a reply — enforced by emptyReply(), so an empty text is repaired with a
  // clear reason instead of failing the turn (a child in distress would get an error).
  reply: z
    .string()
    .trim()
    .max(REPLY_MAX)
    .describe(
      "Your answer to the learner, in their language. Never claim a change you don't make in actions. Leave it empty only when concern is true — the app then answers with its own fixed text.",
    ),
  options: z
    .array(z.string().trim().min(1).max(40))
    .min(2)
    .max(4)
    .nullable()
    .describe('Short tappable answers if you asked a question, else null'),
  actions: z.array(TurnActionSchema).max(6),
  // Lenient when parsing (older scripted answers have no such field); the model must write it.
  asks_permission: z.boolean().default(false),
});
export type TurnDecision = {
  concern: boolean;
  also_asked: boolean;
  reply: string;
  options: string[] | null;
  actions: TurnAction[];
  asks_permission: boolean;
};

/**
 * What the model answers with: asks_permission is required there, and actions come
 * before the reply. The model writes in this order, so while the reply is still
 * being streamed code already knows whether the answer changes anything: a reply
 * without actions can be shown and spoken at once (docs/architecture.md §Speed).
 */
export function turnDecisionForModel(tools: readonly ToolName[] = toolsFor('turn')) {
  return z.object({
    // First, so code knows before any reply text arrives whether this is a safeguarding answer.
    concern: Concern,
    // Right behind it: whether that same message also carried a question about learning.
    also_asked: AlsoAsked,
    // Flat calls (calls.ts): one property less per tool than the `{ tool, args }` code validates.
    actions: z.array(modelUnionOf(tools)).max(6),
    // The rule for the reply stands in the prompt once; here only what the field holds (#667).
    reply: z
      .string()
      .trim()
      .max(REPLY_MAX)
      .describe('your answer in her language; empty only when concern is true'),
    options: TurnDecision.shape.options,
    asks_permission: z
      .boolean()
      // A German sample question stood in here until issue #213 — in the response schema, which
      // reaches the model in the same request as the prompt, so it is the same material that
      // put German into an English reply (#200). What the bit MEANS needs no sample sentence.
      .describe(
        'your reply asks whether you should do something instead of doing it; then it is not in actions',
      ),
  });
}

/** The turn as the model sees it with every tool: what the inventory and the tests read. */
export const TurnDecisionForModel = turnDecisionForModel();

/**
 * Code-enforced: only a safeguarding answer may come without a reply (its text is
 * fixed by code). Anything else with an empty reply is repaired, never shown.
 */
export function emptyReply(d: { concern: boolean; reply: string }): string[] {
  if (d.concern || d.reply.trim().length > 0) return [];
  return ['reply: write your answer to the learner (empty is only for a concern answer)'];
}

/**
 * Options are possible answers to the question the reply asks (the prompt's rule, issue #783): a
 * reply that asks none carries none, so code drops them rather than show answer chips under a
 * statement. A question is read by its mark — every app language writes one with "?" (Spanish
 * opens it with "¿") — so no word of the reply is read (CLAUDE.md rule 3).
 */
export function optionsFor(reply: string, options: string[] | null): string[] | null {
  return options && /[?¿？]/.test(reply) ? options : null;
}

/** Actions that remove something she had (a test, something you knew, a planned step). */
function removesSomething(a: AnyAction): boolean {
  switch (a.tool) {
    case 'close_goal':
      return a.args.status === 'dropped';
    case 'forget':
      return true;
    case 'update_step':
      return a.args.state !== null;
    case 'delete_material':
    case 'delete_item':
      // Since issue #151 these only PROPOSE: the app puts a card in front of her and her
      // tap decides. Asking in the reply while proposing is now exactly right — it was
      // this guard that made the live eval's correct answer fail (buddy.44 run).
      return false;
    default:
      return false;
  }
}

/**
 * Code-enforced (not only prompted): a reply that asks for permission may not
 * already remove something in the same answer. Returns the reasons to repair.
 */
export function askedButActed(d: {
  asks_permission: boolean;
  actions: readonly AnyAction[];
}): string[] {
  if (!d.asks_permission) return [];
  return d.actions
    .filter(removesSomething)
    .map(
      (a) =>
        `${a.tool}: your reply asks whether to do it, but you already did it. Ask only — leave it out of actions until the learner says yes.`,
    );
}

export const CheckDecision = z.object({
  disposition: z.enum(['act', 'wait']),
  reason: z.string().trim().min(1).max(300).describe('Short audit note (not shown to the learner)'),
  actions: z.array(CheckActionSchema).max(3),
  outreach: Outreach.nullable(),
  /** Looking back (lookback.ts): only about the fact the server offered, only in the app. */
  look_back: z
    .object({
      fact: z
        .string()
        .regex(/^p\d{1,2}$/, 'must be the LOOK BACK alias, e.g. p1')
        .describe('The LOOK BACK fact alias from the triggers (p1)'),
      text: z
        .string()
        .trim()
        .min(2)
        .max(200)
        .describe("One short, warm sentence in the learner's language, shown in the chat"),
    })
    .nullable()
    .optional()
    .describe('Only when a LOOK BACK fact is offered and it fits; otherwise null'),
});

/** What the check's model is offered: the same decision, its calls flat (calls.ts). */
export const CheckDecisionForModel = CheckDecision.extend({
  actions: z.array(modelUnionOf(toolsFor('check'))).max(3),
});

/** The catalogue of act tools for the prompt, generated from the registry. */
export function actToolsPrompt(surface: Surface): string {
  const lines = toolsFor(surface).map((n) => {
    const t = ACT_TOOLS[n];
    const notes = [
      t.needsQuote ? 'her quote' : null,
      t.undoable ? 'undoable' : null,
      t.touches.includes('nothing') ? 'changes nothing' : null,
    ].filter(Boolean);
    return `- ${n}: ${t.does}${notes.length ? ` (${notes.join(', ')})` : ''}`;
  });
  return `ACT TOOLS you can call in "actions" here:\n${lines.join('\n')}`;
}

/**
 * Runs one act tool through the registry. The surface is checked again here
 * (the schema already limits it): a check can never run a turn-only tool.
 */
export async function runAct(action: AnyAction, ctx: ToolContext): Promise<ToolOutcome> {
  const spec = ACT_TOOLS[action.tool];
  if (!spec.surfaces.includes(ctx.mode)) {
    throw new ToolRejection(`${action.tool} is not available in a ${ctx.mode}`);
  }
  const run = actHandler(action.tool) as (a: AnyAction, c: ToolContext) => Promise<ToolOutcome>;
  return run(action, ctx);
}

/**
 * What the model can call that has no code behind it: act tools the core declares but nobody
 * registered a handler for (issue #107; a lookup brings its code when it registers). Start-up
 * refuses to serve with any (app.ts).
 */
export function withoutCode(): string[] {
  return missingActHandlers();
}
