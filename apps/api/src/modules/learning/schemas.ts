// The learning domain's response schemas, for the list of everything the app sends
// (`buddy/schemas.ts`, issues #281, #627, #650): practice runs, sheet readings, the tutor, talks,
// roleplays. Registered at start-up (register.ts). Each main call whose whole schema is past the
// budget is listed at its widest narrowed form (`formChoice.widest`): the largest it can go out with.

import type { StartTopicRequest } from '@learnbuddy/shared-types/contracts';

import type { SentSchema } from '../buddy/schemas.js';
import * as rehearse from '../buddy/rehearse.js';
import * as roleplay from '../buddy/roleplay.js';
import * as extract from '../materials/extract.js';
import * as images from '../materials/images.js';
import * as sheetSources from '../materials/sources.js';
import * as practice from '../practice/answerTutor.js';
import * as cloze from '../practice/cloze.js';
import * as essay from '../practice/essay.js';
import * as formChoice from '../practice/formChoice.js';
import * as generate from '../practice/generate.js';
import * as hints from '../practice/hints.js';
import * as reexplain from '../practice/reexplain.js';
import * as setProfiles from '../practice/setProfiles.js';
import * as speak from '../practice/speak.js';
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

export function learningSchemas(): SentSchema[] {
  const explain = (profile: string, schema: SentSchema['schema'], where: string): SentSchema => ({
    purpose: 'explain',
    profile,
    tier: 'smart',
    promptVersion: generate.GENERATE_PROMPT_VERSION,
    system: generate.GENERATE_SYSTEM,
    schema: formChoice.widest(schema),
    where,
  });
  const reading = (profile: string, system: string, schema: SentSchema['schema']): SentSchema => ({
    purpose: 'extraction',
    profile,
    tier: 'smart',
    promptVersion: sheetSources.EXTRACT_PROMPT_VERSION,
    system,
    schema: formChoice.widest(schema),
    where: 'materials/reader.ts — homework ? HOMEWORK_* : EXTRACT_*, lean after a cut-off answer',
  });
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
    ...RUN_KINDS.map((kind) =>
      explain(
        `kind=${kind}`,
        setProfiles.explainSchemaFor(kind, null),
        `practice/setProfiles.ts — explainSchemaFor('${kind}', null)`,
      ),
    ),
    reading('study', extract.EXTRACT_SYSTEM, sheetSources.EXTRACTION_SCHEMA),
    reading(
      'study + LEAN_RULES (after a cut-off answer)',
      leanOf(extract.EXTRACT_SYSTEM),
      sheetSources.EXTRACTION_SCHEMA,
    ),
    reading('homework', extract.HOMEWORK_SYSTEM, sheetSources.HOMEWORK_SCHEMA),
    reading('homework + LEAN_RULES', leanOf(extract.HOMEWORK_SYSTEM), sheetSources.HOMEWORK_SCHEMA),
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
      promptVersion: `${speak.PRONOUNCE_PROMPT_VERSION}-word`,
      system: speak.WORD_SYSTEM,
      schema: speak.WORD_SCHEMA,
      where: 'practice/speak.ts',
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
