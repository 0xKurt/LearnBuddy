// The act-tool registry (ADR 0005 §Tools, stage 2): every tool that changes
// something is registered once — its call schema (decision.ts), the surfaces
// allowed to call it, the data it touches, whether it can be undone, and its
// handler (tools.ts). The schemas the model answers with, and the tool
// catalogue in the prompt, are generated from this registry, so a new
// capability is one entry plus its handler and tests.
//
// Surfaces are policy, enforced by the schema itself: a background check can
// only offer the tools registered for 'check' — never one that changes what
// the learner said (memory, goals, agreed reminders, settings).

import { z } from 'zod';

import { ACT_SCHEMAS, Outreach, type ActionOf, type AnyAction, type ToolName } from './decision.js';
import type { Surface } from './lookups.js';
import { ACT_HANDLERS, ToolRejection, type ToolContext, type ToolOutcome } from './tools.js';

/** What an act tool changes (for the catalogue, the audit and privacy review). */
export type Touches =
  | 'memory'
  | 'profile'
  | 'goals'
  | 'steps'
  | 'practice'
  | 'settings'
  | 'checks'
  | 'nothing';

type ActSpec<K extends ToolName> = {
  surfaces: readonly Surface[];
  touches: readonly Touches[];
  /** The learner's own words must justify it (quote checked in code). */
  needsQuote: boolean;
  undoable: boolean;
  /** One line for the catalogue: what it does. */
  does: string;
  run: (action: ActionOf<K>, ctx: ToolContext) => Promise<ToolOutcome>;
};

const TURN: readonly Surface[] = ['turn'];
const BOTH: readonly Surface[] = ['turn', 'check'];

export const ACT_TOOLS: { [K in ToolName]: ActSpec<K> } = {
  remember: {
    surfaces: TURN,
    touches: ['memory'],
    needsQuote: true,
    undoable: true,
    does: 'keep something lasting or temporary about the learner; "about" says what it is — health, trouble at home, being hurt and who they are are refused by the app',
    run: ACT_HANDLERS.remember,
  },
  correct_memory: {
    surfaces: TURN,
    touches: ['memory'],
    needsQuote: true,
    undoable: true,
    does: 'correct something you know (mN); "about" as in remember',
    run: ACT_HANDLERS.correct_memory,
  },
  forget: {
    surfaces: TURN,
    touches: ['memory'],
    needsQuote: true,
    undoable: true,
    does: 'forget something you know (mN)',
    run: ACT_HANDLERS.forget,
  },
  set_level: {
    surfaces: TURN,
    touches: ['profile'],
    needsQuote: true,
    undoable: true,
    does: 'set school grade / university / adult',
    run: ACT_HANDLERS.set_level,
  },
  plan_exam: {
    surfaces: TURN,
    touches: ['goals'],
    needsQuote: true,
    undoable: true,
    does: 'plan a test with its day',
    run: ACT_HANDLERS.plan_exam,
  },
  update_goal: {
    surfaces: TURN,
    touches: ['goals'],
    needsQuote: true,
    undoable: true,
    does: "change a test's day or title (gN)",
    run: ACT_HANDLERS.update_goal,
  },
  close_goal: {
    surfaces: TURN,
    touches: ['goals'],
    needsQuote: true,
    undoable: true,
    does: 'close a test as done (with outcome) or drop it (gN)',
    run: ACT_HANDLERS.close_goal,
  },
  prepare_practice: {
    surfaces: BOTH,
    touches: ['practice', 'steps'],
    needsQuote: false,
    undoable: true,
    does: 'prepare practice from her questions, for a test or topic — only the ones that went wrong, easier or harder ones, or one direction of her vocabulary, when she asks for that',
    run: ACT_HANDLERS.prepare_practice,
  },
  plan_step: {
    surfaces: TURN,
    touches: ['steps'],
    needsQuote: true,
    undoable: true,
    does: 'plan a step, e.g. an agreed reminder at a time',
    run: ACT_HANDLERS.plan_step,
  },
  update_step: {
    surfaces: TURN,
    touches: ['steps'],
    needsQuote: true,
    undoable: true,
    does: 'move, skip or cancel a step (stN)',
    run: ACT_HANDLERS.update_step,
  },
  mark_step_done: {
    surfaces: TURN,
    touches: ['steps'],
    needsQuote: true,
    undoable: true,
    does: 'mark a step done (stN)',
    run: ACT_HANDLERS.mark_step_done,
  },
  request_material: {
    surfaces: BOTH,
    touches: ['steps'],
    needsQuote: false,
    undoable: true,
    does: 'ask for a photo of a worksheet',
    run: ACT_HANDLERS.request_material,
  },
  set_contact: {
    surfaces: TURN,
    touches: ['settings'],
    needsQuote: true,
    undoable: true,
    does: 'reduce, pause or shift contact outside the app (never more)',
    run: ACT_HANDLERS.set_contact,
  },
  set_voice: {
    surfaces: TURN,
    touches: ['settings'],
    needsQuote: true,
    undoable: true,
    does: 'change how you sound when read aloud: slower, faster, normal, or another voice',
    run: ACT_HANDLERS.set_voice,
  },
  schedule_check: {
    surfaces: BOTH,
    touches: ['checks'],
    needsQuote: false,
    undoable: true,
    does: 'look again later (1 hour – 21 days)',
    run: ACT_HANDLERS.schedule_check,
  },
  offer_learning: {
    surfaces: TURN,
    touches: ['nothing'],
    needsQuote: false,
    undoable: false,
    does: 'offer a button that starts learning now (practice, test, vocab, speak, help) — easier or harder, or one vocabulary direction, when she asks for that',
    run: ACT_HANDLERS.offer_learning,
  },
  open_area: {
    surfaces: TURN,
    touches: ['nothing'],
    needsQuote: false,
    undoable: false,
    does: 'show a button that opens a part of the app she asks for (her sheets, what you know, settings, earlier messages, the camera)',
    run: ACT_HANDLERS.open_area,
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

function unionFor(surface: Surface) {
  const options = toolsFor(surface).map((n): Option => ACT_SCHEMAS[n]);
  const [first, second, ...rest] = options;
  if (!first || !second) throw new Error(`surface ${surface} needs at least two act tools`);
  return z.discriminatedUnion('tool', [first, second, ...rest]);
}

export const TurnActionSchema = unionFor('turn');
export const CheckActionSchema = unionFor('check');

/** The longest reply that passes validation; a longer one is never shown or spoken early. */
export const REPLY_MAX = 700;

const Concern = z
  .boolean()
  .describe(
    'true if the learner tells of distress: being hurt, bullied, abused or threatened, thinking of hurting themselves, or feeling unsafe or hopeless. Then the app answers with a fixed caring message and nothing about it is remembered.',
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
    'Only read when concern is true: true if the same message also asks for something about learning (help with a task, practice, a test). The app then adds one fixed sentence saying that question is not forgotten. It is not answered and nothing is prepared for it in this answer.',
  );

export const TurnDecision = z.object({
  // Lenient when parsing (older scripted answers have no such field); the model must write it.
  concern: z.boolean().default(false),
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
export const TurnDecisionForModel = z.object({
  // First, so code knows before any reply text arrives whether this is a safeguarding answer.
  concern: Concern,
  // Right behind it: whether that same message also carried a question about learning.
  also_asked: AlsoAsked,
  actions: TurnDecision.shape.actions,
  reply: TurnDecision.shape.reply,
  options: TurnDecision.shape.options,
  asks_permission: z
    .boolean()
    .describe(
      'true if your reply asks the learner whether you should do something ("Soll ich …?"). Then that thing must not be in actions — it happens in a later answer, after they said yes.',
    ),
});

/**
 * Code-enforced: only a safeguarding answer may come without a reply (its text is
 * fixed by code). Anything else with an empty reply is repaired, never shown.
 */
export function emptyReply(d: { concern: boolean; reply: string }): string[] {
  if (d.concern || d.reply.trim().length > 0) return [];
  return ['reply: write your answer to the learner (empty is only for a concern answer)'];
}

/** Actions that remove something she had (a test, something you knew, a planned step). */
export function removesSomething(a: AnyAction): boolean {
  switch (a.tool) {
    case 'close_goal':
      return a.args.status === 'dropped';
    case 'forget':
      return true;
    case 'update_step':
      return a.args.state !== null;
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

/** The catalogue of act tools for the prompt, generated from the registry. */
export function actToolsPrompt(surface: Surface): string {
  const lines = toolsFor(surface).map((n) => {
    const t = ACT_TOOLS[n];
    const notes = [
      t.needsQuote ? 'needs the learner’s quote' : null,
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
  const run = spec.run as (a: AnyAction, c: ToolContext) => Promise<ToolOutcome>;
  return run(action, ctx);
}
