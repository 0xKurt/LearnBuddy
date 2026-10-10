// Prompt versions derived from what a prompt sends (issue #425).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buddyPrompt } from '../../modules/buddy/prompts.js';
import { CONSOLIDATE_PROMPT_VERSION } from '../../modules/buddy/consolidate.js';
import { ROLEPLAY_PROMPT_VERSION } from '../../modules/buddy/roleplay.js';
import { SUMMARY_PROMPT_VERSION } from '../../modules/buddy/summarise.js';
import { FIGURES_PROMPT_VERSION } from '../../modules/materials/images.js';
import { EXTRACT_PROMPT_VERSION, SOURCES_PROMPT_VERSION } from '../../modules/materials/sources.js';
import { TUTOR_PROMPT_VERSION } from '../../modules/practice/answerTutor.js';
import { CLOZE_JUDGE_PROMPT_VERSION } from '../../modules/practice/cloze.js';
import { ESSAY_PROMPT_VERSION } from '../../modules/practice/essay.js';
import { GENERATE_PROMPT_VERSION } from '../../modules/practice/generate.js';
import { HINTS_PROMPT_VERSION } from '../../modules/practice/hints.js';
import { REEXPLAIN_PROMPT_VERSION } from '../../modules/practice/reexplain.js';
import { PRONOUNCE_PROMPT_VERSION } from '../../modules/practice/speak.js';
import { WORK_PROMPT_VERSION } from '../../modules/practice/workPhoto.js';
import { TRANSCRIBE_PROMPT_VERSION } from '../../modules/voice/service.js';
import { REHEARSE_PROMPT_VERSION } from '../../modules/buddy/rehearse.js';
import { registerLearning } from '../../modules/learning/register.js';
import { promptVersion } from '../promptVersion.js';

const SYSTEM = 'You write three practice questions.';
const SCHEMA = {
  type: 'object',
  properties: { items: { type: 'array' }, usable: { type: 'boolean' } },
};

// Buddy's prompt is built from what the learning domain registers (issue #107).
registerLearning();

describe('promptVersion (#425)', () => {
  it('gives the same version for the same bytes, every time', () => {
    expect(promptVersion('generate', SYSTEM, SCHEMA)).toBe(
      promptVersion('generate', SYSTEM, SCHEMA),
    );
    expect(promptVersion('generate', SYSTEM, SCHEMA)).toMatch(/^generate\.[0-9a-f]{8}$/);
  });

  it('gives another version for any other byte: the text, the schema, a field order, the name', () => {
    const base = promptVersion('generate', SYSTEM, SCHEMA);
    expect(promptVersion('generate', `${SYSTEM} `, SCHEMA)).not.toBe(base);
    expect(promptVersion('generate', SYSTEM, { ...SCHEMA, required: ['items'] })).not.toBe(base);
    // The order of a schema's fields is what the model gets (stream.ts reads those before `reply`).
    const reordered = {
      type: 'object',
      properties: { usable: { type: 'boolean' }, items: { type: 'array' } },
    };
    expect(promptVersion('generate', SYSTEM, reordered)).not.toBe(base);
    expect(promptVersion('extract', SYSTEM, SCHEMA)).not.toBe(base);
    // Where a part ends is part of it: two parts are not their concatenation.
    expect(promptVersion('generate', 'ab', 'c')).not.toBe(promptVersion('generate', 'a', 'bc'));
  });

  it('two independent changes need no shared line: each version follows its own text', () => {
    // Branch A changes the system text, branch B the schema; merged, both are in the version, and
    // neither branch had to touch a counter the other one also changed.
    const a = promptVersion('generate', `${SYSTEM} Keep it short.`, SCHEMA);
    const b = promptVersion('generate', SYSTEM, { ...SCHEMA, description: 'A set.' });
    const merged = promptVersion('generate', `${SYSTEM} Keep it short.`, {
      ...SCHEMA,
      description: 'A set.',
    });
    expect(new Set([promptVersion('generate', SYSTEM, SCHEMA), a, b, merged]).size).toBe(4);
  });

  it('names every prompt the app sends by its name and a hash, each a different one', () => {
    const versions = {
      buddy: buddyPrompt().version,
      consolidate: CONSOLIDATE_PROMPT_VERSION,
      roleplay: ROLEPLAY_PROMPT_VERSION,
      summary: SUMMARY_PROMPT_VERSION,
      figures: FIGURES_PROMPT_VERSION,
      extract: EXTRACT_PROMPT_VERSION,
      sources: SOURCES_PROMPT_VERSION,
      tutor: TUTOR_PROMPT_VERSION,
      'cloze-gaps': CLOZE_JUDGE_PROMPT_VERSION,
      essay: ESSAY_PROMPT_VERSION,
      generate: GENERATE_PROMPT_VERSION,
      hints: HINTS_PROMPT_VERSION,
      reexplain: REEXPLAIN_PROMPT_VERSION,
      pronounce: PRONOUNCE_PROMPT_VERSION,
      transcribe: TRANSCRIBE_PROMPT_VERSION,
      rehearse: REHEARSE_PROMPT_VERSION,
      work: WORK_PROMPT_VERSION,
    };
    for (const [name, version] of Object.entries(versions)) {
      expect(version, name).toMatch(new RegExp(`^${name}\\.[0-9a-f]{8}$`));
    }
    expect(new Set(Object.values(versions)).size).toBe(Object.keys(versions).length);
  });

  it('has no hand-counted version left in the code (the line every prompt PR collided in)', () => {
    const src = join(__dirname, '../..');
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) return f === '__tests__' ? [] : files(p);
        return p.endsWith('.ts') ? [p] : [];
      });
    const counted = files(src).filter((f) =>
      /export const [A-Z_]*PROMPT_VERSION = ['`]/.test(readFileSync(f, 'utf8')),
    );
    expect(counted).toEqual([]);
  });
});
