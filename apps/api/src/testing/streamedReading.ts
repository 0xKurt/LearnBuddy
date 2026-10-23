// An explicitly enabled, controllable stream for the browser proof of #870. Test tooling only.
// requires live verification in Claude Code session (scripted model and real local Postgres)
import { Hono } from 'hono';

import type { ScriptedGateway } from './fakes.js';
import { DEMO_WORKSHEET } from './scenarios/core-loop.js';
import { gate } from './sync.js';

export function scriptedReadingStream(llm: ScriptedGateway): Hono {
  llm
    .byDefault('forms', { json: { forms: [], figures: [] } })
    .byDefault('figures', { json: { assets: [] } });
  const first = gate();
  const last = gate();
  const reading = { source: 'sheet', marked: [], other_subject: null, ...DEMO_WORKSHEET };
  llm.byDefault('extraction', async (req) => {
    // The scripted chooser reads the answer ahead: it never waits or consumes a gate.
    if (req.purpose === 'forms') return reading;
    const prefix = (n: number) => JSON.stringify({ ...reading, items: reading.items.slice(0, n) });
    req.onPartial?.(prefix(1));
    first.markCalled();
    await first.wait;
    req.onPartial?.(prefix(3));
    last.markCalled();
    await last.wait;
    return reading;
  });
  const controls = new Hono();
  controls.post('/grow', (c) => {
    first.release();
    return c.body(null, 204);
  });
  controls.post('/finish', (c) => {
    first.release();
    last.release();
    return c.body(null, 204);
  });
  return controls;
}
