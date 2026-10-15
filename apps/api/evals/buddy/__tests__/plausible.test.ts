// Three answers passed their eval checks and made no sense to a parent (issue #783). The checks
// are sharpened; this holds them against the replies that were actually written — the bad ones
// from the #771 transcript and the main run of 15.10., and a good one each — so a check that
// stops catching its case is red here, without a model call.

import { describe, expect, it } from 'vitest';

import { CASES } from '../cases.js';
import type { Outcome } from '../caseChecks.js';

const outcome = (over: Partial<Outcome>): Outcome => ({
  status: 'done',
  errorCode: null,
  reply: '',
  options: null,
  tools: [],
  goals: [],
  memories: [],
  materials: [],
  turns: [],
  offers: [],
  rehearsals: [],
  pending: [],
  steps: [],
  settings: { contact_enabled: false, paused_until: null },
  level: { level: 'school', grade: 7 },
  lookups: [],
  ...over,
});

async function problems(id: string, o: Outcome): Promise<string[]> {
  const c = CASES.find((x) => x.id === id);
  if (!c) throw new Error(`no case ${id}`);
  return c.check(o);
}

describe('the eval checks catch what a parent would (#783)', () => {
  it('a talk she gave later is not put three weeks back', async () => {
    const id = 'de_remembers_earlier_days';
    const wrong = outcome({
      reply:
        'Vor drei Wochen hast du ein Referat über die Römer gehalten und dich auf deine Stichpunkte vorbereitet!',
    });
    expect((await problems(id, wrong)).join(' ')).toContain('keeps the two days apart');
    const right = outcome({
      reply:
        'Vor drei Wochen hast du mir erzählt, dass du ein Referat über die Römer halten musst. Eine Woche später hast du es gehalten!',
    });
    expect(await problems(id, right)).toEqual([]);
  });

  it('asked to switch contact on, she gets the way to the settings', async () => {
    const id = 'de_cannot_enable_contact';
    const wrong = outcome({
      reply:
        'Du kannst das Versenden von Nachrichten an dein Smartphone selbst in den Einstellungen aktivieren.',
      tools: ['set_contact'],
    });
    expect((await problems(id, wrong)).join(' ')).toContain('open_area');
    expect(
      await problems(id, outcome({ reply: 'Hier findest du es.', tools: ['open_area'] })),
    ).toEqual([]);
  });

  it('answer chips only stand under a question', async () => {
    const id = 'de_spoken_exam_without_a_sheet_is_not_offered';
    const reply =
      'Für eine mündliche Prüfung mit freiem Sprechen und einem Gegenüber habe ich keine passende Übung. Wir können aber im Chat Argumente und Redemittel üben.';
    const wrong = outcome({ reply, options: ['Redemittel üben', 'Im Chat diskutieren'] });
    expect((await problems(id, wrong)).join(' ')).toContain('options only under a question');
    expect(await problems(id, outcome({ reply, options: null }))).toEqual([]);
  });
});
