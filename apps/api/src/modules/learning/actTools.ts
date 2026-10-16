// The learning domain's act tools (issue #107, cut 7b): their call schemas as the model reads them,
// what each may do, and where each stands among the core's tools. Registered at start-up
// (`registerActTools` from modules/learning/register.ts); their handlers register next to them.
// The order is part of the schema the model reads and of the prompt's hash: every tool stands
// before the core tool it always stood before (`before`), the last three at the end
// (buddy/__tests__/prompt-pin.test.ts holds the prompt byte for byte).

import {
  DifficultyWish as DifficultyWishSchema,
  DrillCarry,
  DrillRange,
  DrillRow,
  PictureWish,
  READ_ALOUD_WORDS,
  RoleplayLanguage,
  TalkFormat,
  TalkStage,
  VocabDirection as VocabDirectionSchema,
} from '@learnbuddy/shared-types/contracts';
import { z } from 'zod';

import {
  DaySpecSchema,
  GoalRef,
  GoalTarget,
  MaterialRef,
  Quote,
  SubjectRef,
  SUBJECT_KINDS,
  Title,
} from '../buddy/decision.js';
import type { DomainActSchemas } from '../buddy/decision.js';
import type { ActToolEntry } from '../buddy/registry.js';

const preparePractice = z.object({
  tool: z.literal('prepare_practice'),
  args: z.object({
    goal: GoalTarget.nullable(),
    subject: SubjectRef.nullable(),
    minutes: z.number().int().min(5).max(30),
    focus_topics: z.array(z.string().trim().min(1).max(60)).max(5),
    // The three below are optional in parsing (older scripted answers have none of them);
    // the model sees all of them. Issue #113.
    only_wrong: z
      .boolean()
      .optional()
      .describe('only the questions that did not sit last time (may be fewer)'),
    difficulty: DifficultyWishSchema.nullable()
      .optional()
      .describe('the harder or easier half of her questions; null unless she asked'),
    direction: VocabDirectionSchema.nullable()
      .optional()
      .describe(
        'vocabulary only: recognise = the foreign word is shown, produce = her own; null unless she asked',
      ),
    // Two sheets of the same subject used to be one pool, so asking for the vocabulary
    // could hand her the other sheet (issue #144).
    sheet: MaterialRef.nullable().optional().describe('the one sheet she pointed at; else null'),
    vocabulary_only: z.boolean().optional().describe('she asked for vocabulary and nothing else'),
    // Without these two, "minutes" was the only thing that could set the size — a guess
    // about how long she wants to sit, standing in for what she actually said (#145).
    question_count: z
      .number()
      .int()
      .min(1)
      .max(500)
      .nullable()
      .optional()
      .describe('the number SHE named; else null (the minutes decide)'),
    all_of_them: z
      .boolean()
      .optional()
      .describe('everything there is; your reply names no number, the card does'),
  }),
});
const requestMaterial = z.object({
  tool: z.literal('request_material'),
  args: z.object({
    goal: GoalTarget.nullable(),
    // What it is for stays (the field name alone does not say it); the German example of what
    // a sheet is called does not (#213) — the app shows this title to the learner.
    title: Title.describe('what to photograph, in her language'),
    /**
     * A page that belongs to a sheet she already sent — the forgotten back, a page left out
     * (issue #118). Without it the page becomes a second sheet of its own.
     */
    material: MaterialRef.nullable().optional().describe('the sheet this page completes'),
  }),
});
/**
 * One question off a sheet (issue #120). She names it in words, not by an id: the server finds
 * it in that sheet's own questions (rule 2). Like deleting a sheet it cannot be taken back —
 * the text, the solution and her answers go — so the same two turns apply.
 */
const deleteItem = z.object({
  tool: z.literal('delete_item'),
  args: z.object({
    material: MaterialRef,
    question: z
      .string()
      .trim()
      .min(3)
      .max(300)
      .describe('word for word as on the sheet (find_questions)'),
    quote: Quote,
  }),
});
/**
 * What she says about one of her own sheets, instead of a button in a list (issue #111): of
 * seventeen act tools, not one ever touched a sheet, so "delete that screenshot" was answered
 * with a link to the library. Deleting is a reduction and undoable for a week, like every
 * other memory-ish thing Buddy does.
 */
const deleteMaterial = z.object({
  tool: z.literal('delete_material'),
  args: z.object({
    material: MaterialRef,
    quote: Quote,
  }),
});
// Both deletions PROPOSE (issue #151): the app puts a card in front of her with the name
// of what would go, and her tap decides. So the reply asks — it never reports it as done.
const renameMaterialTool = z.object({
  tool: z.literal('rename_material'),
  args: z.object({
    material: MaterialRef,
    title: Title.describe('the name she gave it'),
    quote: Quote,
  }),
});
/** The minutes a timed test may have, as the model picks them (`TEST_MINUTES`, issue #241). */
export const TEST_MINUTE_CHOICES = ['10', '20', '30', '45', '60', '90'] as const;

const offerLearning = z.object({
  tool: z.literal('offer_learning'),
  args: z.object({
    kind: z
      .enum([
        'practice',
        'vocab',
        'speak',
        'listen',
        'help',
        'test',
        'spelling_dictation',
        'teach_back',
        'read',
        'essay',
      ])
      // What each kind is for stands once, in the prompt's "Learning now" (#667).
      .describe('see "Learning now"'),
    text: z
      .string()
      .trim()
      .min(2)
      .max(600)
      .describe('what to learn, in her words: topic, typed vocabulary or the task'),
    // Planned and offered in one answer, the test had no alias yet and the turn failed (#636).
    goal: GoalTarget.nullable()
      .default(null)
      .describe('practice or test for a planned test: g1 or "new"; else null'),
    // A Diktat of the words on one of her sheets (issue #242). Optional in parsing like the two
    // below: older scripted answers have none.
    sheet: MaterialRef.nullable()
      .optional()
      .describe(
        'spelling_dictation, teach_back or essay from one of her sheets: its alias, and text names it; else null',
      ),
    // What she asked for beyond the topic (issue #113), one field (#724): the level is a wish for
    // questions written on a topic, the direction one for vocabulary pairs — never both in one
    // offer, so one field holds either. It freed the property `pictures` needs: the turn's step
    // schema sits at what Vertex serves (#627, 269). Optional in parsing (older scripted answers
    // have none).
    wish: z
      .enum([...DifficultyWishSchema.options, ...VocabDirectionSchema.options])
      .nullable()
      .optional()
      .describe(
        'only her wish: harder or easier than her grade; vocab: recognise = the foreign word is shown, produce = her own; else null',
      ),
    // Issue #388: a practice test is offered once practice on it goes well (code decides,
    // `practice/readiness.ts`) — or when she asks for one, in her words, checked by code.
    asked: Quote.nullable()
      .optional()
      .describe('test only: her words asking for it; null when it is your idea'),
    // Issue #241: a clock only on her wish. The minutes are a value from a fixed list, never a
    // number of the model's own (rule 2), and her words asking for it are checked by code.
    time_limit: z
      .object({
        minutes: z.enum(TEST_MINUTE_CHOICES).describe('hers, or the nearest; 45 if she named none'),
        quote: Quote,
      })
      .nullable()
      .optional()
      .describe('test only, when she asks for a time limit; else null'),
    // Issue #724: a kind of picture only on her wish, from a closed list; the run's form choice
    // takes it first. One property: the turn's schema sits at Vertex's budget (#627), so her
    // words are not quoted beside it.
    pictures: PictureWish.nullable()
      .optional()
      .describe(
        'practice or test, when she asks to see a kind of picture: its figure types; else null',
      ),
  }),
});
const offerDrill = z.object({
  tool: z.literal('offer_drill'),
  args: z.object({
    range: DrillRange.describe('times = the times tables, divide = them backwards'),
    rows: z
      .array(DrillRow)
      .min(1)
      .max(10)
      .nullable()
      .default(null)
      .describe('times/divide: the rows she named; null = all'),
    carry: DrillCarry.nullable()
      .default(null)
      .describe('plus/minus 20 or 100, only if she said: with = crossing the ten; null = mixed'),
  }),
});
/**
 * A roleplay in a foreign language (issue #244). The model sets the frame once — the language,
 * where it plays, who Buddy is, and the 3–5 things she has to manage (the role card) — and code
 * keeps it: every in-role turn after this one is written against the stored row, never against
 * what the model remembers of it (modules/buddy/roleplay.ts).
 */
const startRoleplay = z.object({
  tool: z.literal('start_roleplay'),
  args: z.object({
    language: RoleplayLanguage.describe('the foreign language she practises, never her own'),
    scene: z.string().trim().min(3).max(80).describe('where it plays, a few words in her language'),
    role: z
      .string()
      .trim()
      .min(2)
      .max(40)
      .describe('who you play, one to three words in her language'),
    points: z
      .array(z.string().trim().min(2).max(60))
      .min(3)
      .max(5)
      .describe(
        'the role card: what she has to manage, short phrases in her language (from her card if any); the feedback is on these',
      ),
    quote: Quote,
  }),
});
/**
 * A talk with a day — a Referat, a GFS, a presentation, a poem to recite (issue #264). Like a test
 * it has a day; unlike a test it has steps she does herself. The model names the stages and their
 * days as she agreed them (DaySpec, rule 2); code resolves every day, refuses a step after the talk
 * or out of order, and writes the steps' titles itself (`talkTools.ts`).
 */
const planTalk = z.object({
  tool: z.literal('plan_talk'),
  args: z.object({
    title: Title.describe('in her language'),
    format: TalkFormat.describe('gfs = a graded presentation · recital = a poem or text recited'),
    subject: z.string().trim().min(1).max(40).describe('in her language'),
    subject_kind: z.enum(SUBJECT_KINDS),
    day: DaySpecSchema.describe('the day of the talk'),
    minutes: z.number().int().min(1).max(45).nullable().describe('only if she said; else null'),
    steps: z
      .array(
        z.object({
          stage: TalkStage,
          day: DaySpecSchema.describe('done by'),
        }),
      )
      .min(1)
      .max(5)
      .describe('the steps still ahead, in order, each before the talk'),
    quote: Quote,
  }),
});
/**
 * A card in the conversation that records her (issue #264): a rehearsal of her talk, or reading a
 * longer text aloud. Nothing is recorded until she starts it there.
 */
const offerRehearsal = z.object({
  tool: z.literal('offer_rehearsal'),
  args: z.object({
    kind: z
      .enum(['talk', 'read_aloud'])
      .describe('talk: up to 10 min · read_aloud: a given text, up to 2 min'),
    goal: GoalRef.nullable().describe('talk: the planned talk; else null'),
    text: z
      .string()
      .trim()
      .max(2000)
      .nullable()
      .describe(
        `read_aloud: the text as she reads it (${READ_ALOUD_WORDS.min}–${READ_ALOUD_WORDS.max} words, no headings or lists); null for a talk`,
      ),
    // Asked for the text on her sheet, he once wrote a different one (#636): code checks it. The
    // turn has to decide it every time (#726): an optional field let a sheet's text pass unchecked.
    sheet: MaterialRef.nullable().describe(
      'read_aloud from her sheet: its alias, text word for word from it; else null',
    ),
  }),
});

declare module '../buddy/decision.js' {
  interface DomainActSchemas {
    prepare_practice: typeof preparePractice;
    request_material: typeof requestMaterial;
    delete_material: typeof deleteMaterial;
    rename_material: typeof renameMaterialTool;
    delete_item: typeof deleteItem;
    offer_learning: typeof offerLearning;
    offer_drill: typeof offerDrill;
    start_roleplay: typeof startRoleplay;
    plan_talk: typeof planTalk;
    offer_rehearsal: typeof offerRehearsal;
  }
}

const TURN = ['turn'] as const;
const BOTH = ['turn', 'check'] as const;

/** The learning domain's act tools, each a tool it declared above and at its place among the core's. */
export const LEARNING_ACT_TOOLS: readonly (ActToolEntry & { name: keyof DomainActSchemas })[] = [
  {
    name: 'prepare_practice',
    schema: preparePractice,
    before: 'plan_step',
    spec: {
      surfaces: BOTH,
      touches: ['practice', 'steps'],
      needsQuote: false,
      undoable: true,
      does: 'prepare practice from her questions, for a test, topic or sheet',
      prepares: true,
    },
  },
  {
    name: 'request_material',
    schema: requestMaterial,
    before: 'set_contact',
    spec: {
      surfaces: BOTH,
      touches: ['steps'],
      needsQuote: false,
      undoable: true,
      does: 'ask for a photo of a sheet, or of a page missing from one',
    },
  },
  {
    name: 'delete_material',
    schema: deleteMaterial,
    before: 'set_contact',
    spec: {
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
  },
  {
    name: 'rename_material',
    schema: renameMaterialTool,
    before: 'set_contact',
    spec: {
      surfaces: TURN,
      needs: 'materials',
      touches: ['material'],
      needsQuote: true,
      undoable: true,
      does: 'give one of her sheets the name she asked for',
    },
  },
  {
    name: 'delete_item',
    schema: deleteItem,
    before: 'set_contact',
    spec: {
      // Same reasons as delete_material: only in the conversation, only on her words, and
      // nothing comes back — its text, solution and her answers are erased (issue #120).
      surfaces: TURN,
      needs: 'materials',
      touches: ['material'],
      needsQuote: true,
      undoable: false,
      does: 'propose taking one question off a sheet',
    },
  },
  {
    name: 'offer_learning',
    schema: offerLearning,
    before: 'open_area',
    spec: {
      surfaces: TURN,
      touches: ['nothing'],
      needsQuote: false,
      undoable: false,
      does: 'a button that starts learning now (kinds below)',
      offer: true,
    },
  },
  {
    name: 'offer_drill',
    schema: offerDrill,
    before: 'open_area',
    spec: {
      surfaces: TURN,
      touches: ['nothing'],
      needsQuote: false,
      undoable: false,
      does: 'a button that starts a quick mental-arithmetic round',
      offer: true,
    },
  },
  {
    name: 'start_roleplay',
    schema: startRoleplay,
    before: null,
    spec: {
      surfaces: TURN,
      touches: ['roleplay'],
      needsQuote: true,
      undoable: false,
      does: 'start a roleplay in a foreign language',
      offer: true,
    },
  },
  {
    name: 'plan_talk',
    schema: planTalk,
    before: null,
    spec: {
      surfaces: TURN,
      touches: ['goals', 'steps'],
      needsQuote: true,
      undoable: true,
      does: 'plan a talk with its day and the steps before it',
    },
  },
  {
    name: 'offer_rehearsal',
    schema: offerRehearsal,
    before: null,
    spec: {
      surfaces: TURN,
      touches: ['nothing'],
      needsQuote: false,
      undoable: false,
      does: 'a card that records her talk rehearsal or her reading aloud, and measures it',
      offer: true,
    },
  },
];
