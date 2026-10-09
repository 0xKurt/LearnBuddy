import { describe, expect, it } from 'vitest';

import { poolSheet, poolTask, POOL_STEM } from '../../../testing/scenarios/taskParts.js';
import { ExtractionParse } from '../extract.js';
import { partPrompts, SheetPartTaskParse, sheetPartTaskItems, wholeTasks } from '../partTasks.js';
import { EXTRACTION_SCHEMA, HOMEWORK_SCHEMA } from '../sources.js';

const ALL_ON = new Set<never>();
const read = (task: unknown) => SheetPartTaskParse.parse(task);
const items = (task: unknown, off: ReadonlySet<'long'> = ALL_ON) =>
  sheetPartTaskItems(read(task), { locale: 'de', off });

describe('a task in parts read from a sheet (#297, step 3)', () => {
  it('becomes the task, lettered by code, with the reading’s help on its computed parts', () => {
    const [a, b, c] = items(poolTask());
    expect([a, b, c].map((it) => it?.task_part?.part)).toEqual(['a', 'b', 'c']);
    expect(b?.task_part).toMatchObject({ of: 3, stem: POOL_STEM, from: 'a / 25' });
    expect(a?.hints).toHaveLength(2);
    // The open part's help is its follow-ups, whatever the reading wrote.
    expect(c?.hints).toEqual(c?.rubric?.elements.map((e) => e.missing));
  });

  it('reads printed letters by their format: "A)" is a', () => {
    const task = poolTask(['A)', 'b)', ' c ']);
    expect(items(task).map((it) => it.task_part?.part)).toEqual(['a', 'b', 'c']);
  });

  it.each([
    ['a gap in the letters', poolTask(['a', 'c', 'd'])],
    ['letters out of order', poolTask(['b', 'a', 'c'])],
    ['a formula that does not give the key', poolTask(['a', 'b', 'c'], 'a * 2')],
    ['one part only', { ...poolTask(), parts: poolTask().parts.slice(0, 1) }],
    ['a material shorter than a situation', { ...poolTask(), stem: 'Ein Becken.' }],
  ])('%s gives the parts back as questions of their own', (_, task) => {
    const out = items(task);
    expect(out.map((it) => it.task_part ?? null)).toEqual(out.map(() => null));
    expect(out).toHaveLength((task as { parts: unknown[] }).parts.length);
    for (const it of out)
      expect(it.prompt.startsWith(`${(task as { stem: string }).stem}\n\n`)).toBe(true);
  });

  it('a part of a switched-off form leaves no task with a gap (#296)', () => {
    const out = items(poolTask(), new Set(['long'] as const));
    expect(out.every((it) => !it.task_part)).toBe(true);
    expect(out.map((it) => it.kind)).toEqual(['numeric', 'numeric', 'long']);
  });

  it('a material too long to stand in front of a question leaves the question alone', () => {
    const stem = 'Ein Schwimmbecken fasst viel Wasser. '.repeat(30).trim();
    const out = items({ ...poolTask(), stem });
    expect(out.map((it) => it.prompt)).toEqual(poolTask().parts.map((p) => p.prompt));
  });

  it('a part that does not parse costs only itself, and its gap makes the rest questions', () => {
    const [a, b, c] = poolTask().parts;
    const parsed = read({ ...poolTask(), parts: [a, { ...b, answer: 42 }, c] });
    expect(parsed.parts.map((p) => p.letter)).toEqual(['a', 'c']);
    expect(sheetPartTaskItems(parsed, { locale: 'de', off: ALL_ON })).toHaveLength(2);
  });

  it('a broken task costs only itself in the reading', () => {
    const sheet = { ...poolSheet(), part_tasks: [{ stem: 7 }, poolTask()] };
    expect(ExtractionParse.parse(sheet).part_tasks).toHaveLength(1);
  });

  it('wholeTasks drops a task that lost a part, and keeps every other question', () => {
    const [a, b, c] = items(poolTask());
    const plain = items(poolTask(['a', 'b', 'd']))[0]!;
    expect(wholeTasks([plain, a!, c!])).toEqual([plain]);
    expect(wholeTasks([a!, b!, c!, plain])).toHaveLength(4);
  });

  it('lists every part’s prompt for a continued reading', () => {
    expect(partPrompts([read(poolTask())])).toEqual(poolTask().parts.map((p) => p.prompt));
  });

  it('is offered to both readings, with a worked solution only where the sheet is studied', () => {
    type Obj = { properties: Record<string, { items?: Obj }> };
    const part = (s: unknown) =>
      (s as Obj).properties.part_tasks!.items!.properties.parts!.items!.properties;
    expect(Object.keys(part(EXTRACTION_SCHEMA))).toEqual(
      expect.arrayContaining(['letter', 'from', 'points', 'hints', 'worked_solution']),
    );
    expect(Object.keys(part(HOMEWORK_SCHEMA))).not.toContain('worked_solution');
  });
});
