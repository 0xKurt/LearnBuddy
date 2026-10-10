// What Buddy can read of the learning domain before he answers (ADR 0005 §Tools, issue #107):
// her sheets, how her practice went, the questions she has. Declared here with their code and
// registered at start-up (register.ts); the core builds the model's schema and the LOOKUPS
// section of the prompt from them, in this order (pinned by buddy/__tests__/prompt-pin.test.ts).

import { z } from 'zod';

import { searchMaterials } from '../buddy/connectors/material.js';
import { findQuestions, recentResults } from '../buddy/connectors/practice.js';
import { defineLookup } from '../buddy/lookups.js';

const Query = z.string().trim().min(2).max(120);

export const LEARNING_LOOKUPS = [
  defineLookup({
    name: 'search_material',
    description:
      'Read the learner\'s own worksheets: passages matching the query — a couple of topic words, in the language her sheets are written in, never a whole question — with title, subject and the day it was read. Empty query = the newest sheets. Every hit carries a "sheet" alias you can use in the SAME answer to practise from it, rename it or propose deleting it — also for sheets too old to stand in STATE. Homework comes without its text (homework: true): help with it happens in the help session, never here.',
    args: z.object({ query: z.string().trim().max(120) }),
    surfaces: ['turn', 'check'],
    run: (c, a) => searchMaterials(c.deps, c.learnerId, c.timezone, a.query, 3, c.aliases),
  }),
  defineLookup({
    name: 'practice_history',
    description:
      'How practice went: finished sessions (newest first) with the day, title, mode, how many answered / right on the first try, and which topics sat or were shaky. Optional topic narrows it to sessions with questions on it.',
    args: z.object({ topic: Query.nullable() }),
    surfaces: ['turn', 'check'],
    run: (c, a) => recentResults(c.deps.db, c.learnerId, c.timezone, a.topic, 6),
  }),
  defineLookup({
    name: 'find_questions',
    description:
      'Questions the learner already has on a topic (from sheets or earlier practice) and how the latest try went (first_try, with_help, not_known, never_asked). Empty query = her newest questions, whatever the topic — use it when she asks what she has or had. Solutions are not included.',
    args: z.object({ query: z.string().trim().max(120) }),
    surfaces: ['turn', 'check'],
    run: (c, a) => findQuestions(c.deps.db, c.learnerId, a.query, 8),
  }),
];
