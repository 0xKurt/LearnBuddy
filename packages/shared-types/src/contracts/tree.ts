// Trees as data (issue #256): a probability tree or a plain tree (Informatik), a pedigree
// (Stammbaum) and a finite automaton. docs/architecture.md §Practice, Trees.
//
// The model writes the structure, nothing else: no coordinate, no layout, no key. Shape limits
// sit here; everything zod cannot say — branches of a node adding up to 1, a pedigree that only
// one mode of inheritance explains, the word an automaton accepts — is computed and checked by
// `treeProblem` and its helpers in @learnbuddy/shared-math (`trees.ts`, `pedigree.ts`), and
// `apps/api/src/modules/practice/treeCheck.ts` holds the question's key to it. Rejected, never
// repaired.
//
// Short property names and no nullable field, like the charts: these branches sit in every item
// of every generated set (the schema-size pressure of issue #281).

import { z } from 'zod';

/** A node's or a branch's label: short enough for a phone ("" for none). */
const TreeText = z.string().trim().max(10);

export const TreeFigure = z.object({
  type: z.literal('tree'),
  pr: z.boolean(),
  n: z
    .array(
      z.object({
        p: z.number().int().min(-1).max(19),
        l: TreeText,
        e: TreeText,
      }),
    )
    .min(2)
    .max(20),
  ask: z.enum(['none', 'path', 'sum', 'edge']),
  at: z.array(z.number().int().min(0).max(19)).max(10),
});

export const PedigreeFigure = z.object({
  type: z.literal('pedigree'),
  p: z
    .array(
      z.object({
        s: z.enum(['m', 'f']),
        a: z.boolean(),
        fa: z.number().int().min(-1).max(15),
        mo: z.number().int().min(-1).max(15),
      }),
    )
    .min(3)
    .max(16),
  md: z.enum(['ad', 'ar', 'xd', 'xr']),
  ask: z.enum(['none', 'mode', 'gt']),
  at: z.number().int().min(0).max(15),
});

export const AutomatonFigure = z.object({
  type: z.literal('automaton'),
  s: z
    .array(z.object({ l: z.string().trim().min(1).max(3), f: z.boolean() }))
    .min(1)
    .max(6),
  t: z
    .array(
      z.object({
        a: z.number().int().min(0).max(5),
        b: z.number().int().min(0).max(5),
        c: z.string().trim().min(1).max(5),
      }),
    )
    .max(15),
  w: z.string().trim().max(12),
});
