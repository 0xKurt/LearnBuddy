// The browser starts without Vitest's setupFiles. Exercise that same model bootstrap (#913).
// requires live verification in Claude Code session (scripted model, no provider calls)
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { LlmRequest } from '../../llm/gateway.js';
import { toJsonSchema } from '../../llm/json-schema.js';
import { choiceFor, keptAndLost, usedBy } from '../../modules/practice/formChoice.js';
import { explainSchemaFor } from '../../modules/practice/setProfiles.js';
import { mistakeContext } from '../../modules/practice/mistakeContext.js';
import type { ScriptedGateway } from '../fakes.js';

const request = (text: string): LlmRequest => ({
  purpose: 'explain',
  tier: 'smart',
  promptVersion: 'explain.test',
  system: 'Prepare practice.',
  contents: [{ role: 'user', parts: [{ text }] }],
  schema: explainSchemaFor('practice', null),
  maxOutputTokens: 1000,
  temperature: 0,
  timeoutMs: 1000,
  thinking: 'off',
});

describe('walkthrough generation follows the production requests (#913)', () => {
  let llm: ScriptedGateway;
  beforeAll(async () => {
    vi.resetModules();
    const { ScriptedGateway } = await import('../fakes.js');
    const { scriptWalkthrough } = await import('../scenarios/walkthrough.js');
    llm = new ScriptedGateway();
    scriptWalkthrough(llm);
  });

  it('scripts form selection when started outside the Vitest domain setup', async () => {
    const main = request("LEARNER'S TEXT:\nDiagramme lesen");
    const choice = await llm.generate({
      ...main,
      purpose: 'forms',
      promptVersion: 'forms-explain.test',
      schema: toJsonSchema(choiceFor(main.schema)),
    });
    const generated = await llm.generate(main);
    expect(choice.json).toEqual(usedBy(generated.json));
    expect(usedBy(generated.json).figures).toHaveLength(7);
    expect(llm.unexpected).toEqual([]);
  });

  it('keeps earlier measured topics from selecting the next exercise', async () => {
    const gaps = mistakeContext([
      {
        subject: 'Mathe',
        topic: 'Malnehmen',
        prompt: 'Welche Rechnung passt?',
        said: '3 + 4',
        wrong_at: new Date('2026-10-24T08:00:00Z'),
      },
    ]);
    const result = await llm.generate(request(`${gaps}\nLEARNER'S TEXT:\nDativ`));
    expect(result.json).toMatchObject({
      title: 'Der Dativ',
      items: [{ answer: 'Wem?' }, { answer: 'der' }],
    });
  });

  it('scripts more worksheet practice within the forms of the completed run', async () => {
    const result = await llm.generate(
      request(
        "SHE JUST WORKED ON THESE (write more of exactly this kind):\nTOPICS: Brüche kürzen | Brüche vergleichen | Begriffe | Brüche erweitern\nQUESTIONS:\n- Kürze 6/8 und gib das Ergebnis als Dezimalzahl an.\nLEARNER'S TEXT:\nMehr davon, etwas schwerer: Brüche kürzen, Brüche vergleichen (Mathearbeit Brüche)",
      ),
    );
    const kept = keptAndLost(result.json, { forms: new Set(), figures: new Set() });
    expect(kept.lost).toEqual([]);
    expect(kept.kept).toMatchObject({
      usable: true,
      items: expect.arrayContaining([expect.objectContaining({ topic: 'Brüche kürzen' })]),
    });
  });
});
