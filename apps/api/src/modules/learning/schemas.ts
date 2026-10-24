// The learning domain's response schemas, for the list of everything the app sends
// (`buddy/schemas.ts`, issues #281, #627, #650): practice runs, sheet readings, the tutor, talks,
// roleplays. Registered at start-up (register.ts). Each main call whose whole schema is past the
// budget is listed at its widest narrowed form (`formChoice.widest`): the largest it can go out with.

import type { StartTopicRequest } from '@learnbuddy/shared-types/contracts';

import { toJsonSchema } from '../../llm/json-schema.js';
import { promptVersion } from '../../llm/promptVersion.js';
import { withinBudget } from '../../llm/schemaBudget.js';
import type { SentSchema } from '../buddy/schemas.js';
import * as rehearse from '../buddy/rehearse.js';
import * as roleplay from '../buddy/roleplay.js';
import * as extract from '../materials/extract.js';
import * as images from '../materials/images.js';
import { readingCatalogue, readingSystem } from '../materials/readingPrompt.js';
import * as sheetSources from '../materials/sources.js';
import * as practice from '../practice/answerTutor.js';
import * as cloze from '../practice/cloze.js';
import * as distress from '../buddy/distress.js';
import * as essay from '../practice/essay.js';
import { choosingCatalogue } from '../practice/choosingCatalogue.js';
import * as formChoice from '../practice/formChoice.js';
import * as generate from '../practice/generate.js';
import * as hints from '../practice/hints.js';
import * as reexplain from '../practice/reexplain.js';
import * as setProfiles from '../practice/setProfiles.js';
import * as speak from '../practice/speak.js';
import * as pronunciation from '../practice/pronunciation.js';
import * as tutor from '../practice/tutor.js';
import * as workPhoto from '../practice/workPhoto.js';

/** Every kind of run there is: each sends its own explain profile (`explainSchemaFor`). */
const RUN_KINDS: StartTopicRequest['kind'][] = [
  'practice',
  'test',
  'vocab',
  'speak',
  'help',
  'listen',
  'spelling_dictation',
  'teach_back',
  'read',
  'essay',
];

const leanOf = (system: string) => `${system}\n\n${extract.LEAN_RULES}`;

/**
 * The choosing call before a main call whose whole schema is past the budget (#627, #665): two
 * closed lists as its answer, with the chooser's rule on top of a short catalogue (#669, #869).
 */
function choosingFor(
  main: SentSchema,
  full: SentSchema['schema'],
  catalogue = choosingCatalogue,
): SentSchema[] {
  if (withinBudget(full)) return [];
  const purpose = main.purpose === 'extraction' ? 'extraction' : 'explain';
  const lead = catalogue(formChoice.offered(full));
  return [
    {
      purpose: 'forms',
      profile: `before ${main.purpose} ${main.profile}`,
      tier: 'fast',
      promptVersion: promptVersion(
        `forms-${purpose}`,
        formChoice.CHOOSER,
        lead,
        main.promptVersion,
      ),
      system: `${lead}\n\n${formChoice.CHOOSER}`,
      schema: toJsonSchema(formChoice.choiceFor(full)),
      where: 'practice/formChoice.ts — chooseForms',
    },
  ];
}

export function learningSchemas(): SentSchema[] {
  const explain = (profile: string, full: SentSchema['schema'], where: string): SentSchema => ({
    purpose: 'explain',
    profile,
    tier: 'smart',
    promptVersion: generate.GENERATE_PROMPT_VERSION,
    // The largest prompt this run can go out with: the rules of what its widest schema offers (#669).
    system: generate.generateSystem(formChoice.offered(formChoice.widest(full))),
    schema: formChoice.widest(full),
    where,
  });
  const reading = (
    profile: string,
    homework: boolean,
    full: SentSchema['schema'],
    lean = false,
  ): SentSchema => {
    const schema = formChoice.widest(full);
    const line = withinBudget(full)
      ? null
      : formChoice.availableLine(formChoice.fitted(full, formChoice.offered(full)));
    const system = `${readingSystem(homework, formChoice.offered(schema))}${line ? `\n\n${line}` : ''}`;
    return {
      purpose: 'extraction',
      profile,
      tier: 'smart',
      promptVersion: `${sheetSources.EXTRACT_PROMPT_VERSION}${homework ? '' : `+${sheetSources.SOURCES_PROMPT_VERSION}`}`,
      system: lean ? leanOf(system) : system,
      schema,
      where: 'materials/reader.ts — readingSystem, lean after a cut-off answer',
    };
  };
  // A main call and the choosing call before it, when it needs one. A lean reading reuses the
  // choice of the sheet's first reading, so it has none of its own.
  const chosen = (main: SentSchema, full: SentSchema['schema'], catalogue = choosingCatalogue) => [
    main,
    ...choosingFor(main, full, catalogue),
  ];
  return [
    {
      purpose: 'buddy_turn',
      profile: 'roleplay line (#244)',
      tier: 'smart',
      promptVersion: roleplay.ROLEPLAY_PROMPT_VERSION,
      system: roleplay.ROLEPLAY_SYSTEM,
      schema: roleplay.ROLEPLAY_TURN_SCHEMA,
      where: 'learning/turn.ts — roleplayRound',
    },
    {
      purpose: 'buddy_turn',
      profile: 'roleplay feedback (#244)',
      tier: 'smart',
      promptVersion: roleplay.ROLEPLAY_PROMPT_VERSION,
      system: roleplay.ROLEPLAY_FEEDBACK_SYSTEM,
      schema: roleplay.FEEDBACK_SCHEMA,
      where: 'buddy/roleplay.ts',
    },
    explain(
      'GENERATED_SCHEMA (global)',
      setProfiles.GENERATED_SCHEMA,
      'practice/setProfiles.ts — GENERATED_SCHEMA',
    ),
    ...RUN_KINDS.flatMap((kind) => {
      const full = setProfiles.explainSchemaFor(kind, null);
      return chosen(
        explain(
          `kind=${kind}`,
          full,
          `practice/setProfiles.ts — explainSchemaFor('${kind}', null)`,
        ),
        full,
      );
    }),
    ...chosen(
      reading('study', false, sheetSources.EXTRACTION_SCHEMA),
      sheetSources.EXTRACTION_SCHEMA,
      (offer) => readingCatalogue(offer, false),
    ),
    reading(
      'study + LEAN_RULES (after a cut-off answer)',
      false,
      sheetSources.EXTRACTION_SCHEMA,
      true,
    ),
    ...chosen(
      reading('homework', true, sheetSources.HOMEWORK_SCHEMA),
      sheetSources.HOMEWORK_SCHEMA,
      (offer) => readingCatalogue(offer, true),
    ),
    reading('homework + LEAN_RULES', true, sheetSources.HOMEWORK_SCHEMA, true),
    {
      purpose: 'tutor',
      profile: 'tutor',
      tier: 'smart',
      promptVersion: practice.TUTOR_PROMPT_VERSION,
      system: tutor.TUTOR_SYSTEM,
      schema: practice.TUTOR_SCHEMA,
      where: 'practice/answerTutor.ts — asked.length ? RUBRIC_SCHEMA : TUTOR_SCHEMA',
    },
    {
      purpose: 'safeguard',
      profile: 'distress check (#747)',
      tier: 'smart',
      promptVersion: distress.DISTRESS_PROMPT_VERSION,
      system: distress.DISTRESS_SYSTEM,
      schema: distress.DISTRESS_SCHEMA,
      where: 'buddy/distress.ts — practice/answerSafeguard.ts, buddy/turn.ts failHerTurn',
    },
    {
      purpose: 'tutor',
      profile: 'rubric (#211)',
      tier: 'smart',
      promptVersion: practice.TUTOR_PROMPT_VERSION,
      system: tutor.TUTOR_SYSTEM,
      schema: practice.RUBRIC_SCHEMA,
      where: 'practice/answerTutor.ts',
    },
    {
      purpose: 'tutor',
      profile: 'long text (#258)',
      tier: 'smart',
      promptVersion: essay.ESSAY_PROMPT_VERSION,
      system: essay.ESSAY_SYSTEM,
      schema: essay.ESSAY_SCHEMA,
      where: 'practice/essay.ts',
    },
    {
      purpose: 'tutor',
      profile: 'cloze gaps (#232)',
      tier: 'smart',
      promptVersion: cloze.CLOZE_JUDGE_PROMPT_VERSION,
      system: cloze.JUDGE_SYSTEM,
      schema: cloze.GAP_SCHEMA,
      where: 'practice/cloze.ts',
    },
    {
      purpose: 'figures',
      profile: '-',
      tier: 'smart',
      promptVersion: images.FIGURES_PROMPT_VERSION,
      system: images.FIGURES_SYSTEM,
      schema: images.FIGURES_SCHEMA,
      where: 'materials/images.ts',
    },
    {
      purpose: 'hints',
      profile: '-',
      tier: 'smart',
      promptVersion: hints.HINTS_PROMPT_VERSION,
      system: hints.SYSTEM,
      schema: hints.HINTS_SCHEMA,
      where: 'practice/hints.ts',
    },
    {
      purpose: 'pronounce',
      profile: 'sentence',
      tier: 'smart',
      promptVersion: speak.PRONOUNCE_PROMPT_VERSION,
      system: speak.SYSTEM,
      schema: speak.JUDGEMENT_SCHEMA,
      where: 'practice/speak.ts',
    },
    {
      purpose: 'pronounce',
      profile: 'one word',
      tier: 'smart',
      promptVersion: speak.PRONOUNCE_PROMPT_VERSION,
      system: speak.WORD_SYSTEM,
      schema: speak.WORD_SCHEMA,
      where: 'practice/speak.ts',
    },
    {
      purpose: 'tutor',
      profile: 'pronunciation tip',
      tier: 'fast',
      promptVersion: pronunciation.TIP_PROMPT_VERSION,
      system: pronunciation.TIP_SYSTEM,
      schema: pronunciation.TIP_SCHEMA,
      where: 'practice/pronunciation.ts',
    },
    {
      purpose: 'transcribe',
      profile: 'a rehearsal talk (#264)',
      tier: 'smart',
      promptVersion: rehearse.REHEARSE_PROMPT_VERSION,
      system: rehearse.TALK_SYSTEM,
      schema: rehearse.HEARD_SCHEMA,
      where: 'buddy/rehearse.ts',
    },
    {
      purpose: 'transcribe',
      profile: 'reading aloud (#264)',
      tier: 'smart',
      promptVersion: rehearse.REHEARSE_PROMPT_VERSION,
      system: rehearse.READ_SYSTEM,
      schema: rehearse.HEARD_SCHEMA,
      where: 'buddy/rehearse.ts',
    },
    {
      purpose: 'transcribe',
      profile: 'her working, photographed (#444)',
      tier: 'smart',
      promptVersion: workPhoto.WORK_PROMPT_VERSION,
      system: workPhoto.WORK_SYSTEM,
      schema: workPhoto.WORK_SCHEMA,
      where: 'practice/workPhoto.ts',
    },
    {
      purpose: 'reexplain',
      profile: '-',
      tier: 'smart',
      promptVersion: reexplain.REEXPLAIN_PROMPT_VERSION,
      system: reexplain.REEXPLAIN_SYSTEM,
      schema: reexplain.SCHEMA,
      where: 'practice/reexplain.ts',
    },
  ];
}
