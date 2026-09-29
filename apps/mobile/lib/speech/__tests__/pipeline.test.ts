// What must hold while a text is read aloud (issue #24): the audio of the next sentence is
// fetched while the current one plays, a reply that is still being written stays one reading,
// and the phone's voice takes over whenever the natural one cannot.
//
// The clock is virtual: synthesising takes 1.1 s and a sentence plays 6 s, the medians measured
// against the live provider on 29.09. (apps/api/evals/tts, docs/speed-audit.md).

import { describe, expect, it } from 'vitest';

import { readText, type ListenEnd, type ReadingEffects } from '../pipeline.js';
import { createVoiceStore } from '../voiceState.js';

const SYNTH = 1100;
const PLAY = 6000;

/** Lets every pending promise callback run. */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function harness(opts: { synth?: number; play?: number; silent?: string[] } = {}) {
  const synthMs = opts.synth ?? SYNTH;
  const playMs = opts.play ?? PLAY;
  const silent = new Set(opts.silent ?? []);
  const timers: Array<{ at: number; run: () => void }> = [];
  const log: string[] = [];
  const released = new Set<string>();
  let now = 0;

  const effects: ReadingEffects = {
    fetch: (spoken, ahead) => {
      log.push(`fetch "${spoken}" ahead=${ahead} @${now}`);
      return new Promise((resolve) => {
        timers.push({
          at: now + synthMs,
          run: () => resolve(silent.has(spoken) ? null : { uri: spoken }),
        });
      });
    },
    release: (uri) => {
      released.add(uri);
    },
    play: (uri, on) => {
      log.push(`play "${uri}" @${now}`);
      let over = false;
      timers.push({
        at: now + playMs,
        run: () => {
          if (over) return;
          over = true;
          log.push(`played "${uri}" @${now}`);
          on.end('done');
        },
      });
      on.start();
      return {
        stop: () => {
          over = true;
        },
      };
    },
    device: (spoken, on) => {
      log.push(`phone "${spoken}" @${now}`);
      timers.push({ at: now + playMs, run: () => on.done() });
    },
  };

  return {
    effects,
    log,
    released,
    store: createVoiceStore(),
    get now() {
      return now;
    },
    /** Runs everything due up to `t`, then stands there. */
    async tickTo(t: number): Promise<void> {
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const next = timers[0];
        if (!next || next.at > t) break;
        timers.shift();
        now = next.at;
        next.run();
        await flush();
      }
      if (t > now) now = t;
      await flush();
    },
  };
}

function reading(h: ReturnType<typeof harness>, growing: boolean, ends: ListenEnd[]) {
  return readText({
    effects: h.effects,
    store: h.store,
    transform: (s) => s,
    growing,
    onEnd: (why) => ends.push(why),
  });
}

describe('reading a finished text', () => {
  it('fetches the next sentence while the current one plays, so nothing waits', async () => {
    const h = harness();
    const ends: ListenEnd[] = [];
    reading(h, false, ends).feed('Eins. Zwei. Drei.', true);
    await h.tickTo(30_000);
    expect(h.log).toEqual([
      'fetch "Eins." ahead=false @0',
      'fetch "Zwei." ahead=true @1100',
      'play "Eins." @1100',
      'played "Eins." @7100',
      'fetch "Drei." ahead=true @7100',
      'play "Zwei." @7100',
      'played "Zwei." @13100',
      'play "Drei." @13100',
      'played "Drei." @19100',
    ]);
    // The only wait is the first sentence; after that one sentence follows the next.
    expect(ends).toEqual(['done']);
  });

  it('says nothing and is done when there is nothing to say', async () => {
    const h = harness();
    const ends: ListenEnd[] = [];
    reading(h, false, ends).feed('   ', true);
    await h.tickTo(10_000);
    expect(h.log).toEqual([]);
    expect(ends).toEqual(['done']);
  });
});

describe('reading a reply while it is being written', () => {
  it('stays one reading: the next sentence is on its way before the current one ends', async () => {
    const h = harness();
    const ends: ListenEnd[] = [];
    const r = reading(h, true, ends);
    r.feed('Eins. Zw', false); // Only a sentence that is finished is read.
    await h.tickTo(500);
    r.feed('Eins. Zwei. Dr', false);
    await h.tickTo(1500);
    r.feed('Eins. Zwei. Drei.', true);
    await h.tickTo(30_000);
    expect(h.log).toEqual([
      'fetch "Eins." ahead=false @0',
      'fetch "Zwei." ahead=true @1100',
      'play "Eins." @1100',
      'played "Eins." @7100',
      'fetch "Drei." ahead=true @7100',
      'play "Zwei." @7100',
      'played "Zwei." @13100',
      'play "Drei." @13100',
      'played "Drei." @19100',
    ]);
    expect(ends).toEqual(['done']);
  });

  it('waits for a sentence that is written late, and does not blame the voice for it', async () => {
    const h = harness();
    const ends: ListenEnd[] = [];
    const r = reading(h, true, ends);
    r.feed('Eins. ', false);
    await h.tickTo(9_000); // The first sentence has been read; Buddy is still writing.
    expect(h.store.get().phase).toBe('loading');
    r.feed('Eins. Zwei.', true);
    await h.tickTo(30_000);
    expect(h.log).toEqual([
      'fetch "Eins." ahead=false @0',
      'play "Eins." @1100',
      'played "Eins." @7100',
      // She is waiting in silence for this one, so it gets the short patience (`ahead=false`).
      'fetch "Zwei." ahead=false @9000',
      'play "Zwei." @10100',
      'played "Zwei." @16100',
    ]);
    expect(ends).toEqual(['done']);
  });

  it('ends when the reply is complete and nothing is left to read', async () => {
    const h = harness();
    const ends: ListenEnd[] = [];
    const r = reading(h, true, ends);
    r.feed('Eins. ', false);
    await h.tickTo(9_000);
    r.feed('Eins.', true);
    await h.tickTo(9_100);
    expect(ends).toEqual(['done']);
  });

  it('publishes the text and its sentences for read-along, and follows the one being read', async () => {
    const h = harness();
    const ends: ListenEnd[] = [];
    const r = reading(h, true, ends);
    expect(h.store.get().phase).toBe('loading'); // His voice is on its way, not idle.
    r.feed('Eins. Zwei. Dr', false);
    await h.tickTo(1_200);
    expect(h.store.get().text).toBe('Eins. Zwei. Dr');
    expect(h.store.get().sentences).toEqual(['Eins.', 'Zwei.']);
    expect(h.store.get().index).toBe(0);
    expect(h.store.get().phase).toBe('speaking');
    await h.tickTo(7_200);
    expect(h.store.get().index).toBe(1);
    r.feed('Eins. Zwei. Drei.', true);
    await h.tickTo(30_000);
    expect(h.store.get().phase).toBe('idle');
  });
});

describe('when the natural voice cannot', () => {
  it('lets the phone read the sentence it lacks and carries on with the next', async () => {
    const h = harness({ silent: ['Zwei.'] });
    const ends: ListenEnd[] = [];
    reading(h, false, ends).feed('Eins. Zwei. Drei.', true);
    await h.tickTo(30_000);
    expect(h.log).toEqual([
      'fetch "Eins." ahead=false @0',
      'fetch "Zwei." ahead=true @1100',
      'play "Eins." @1100',
      'played "Eins." @7100',
      'fetch "Drei." ahead=true @7100',
      'phone "Zwei." @7100',
      'play "Drei." @13100',
      'played "Drei." @19100',
    ]);
    expect(ends).toEqual(['done']);
  });

  it('stops for good when something else starts, and throws the fetched audio away', async () => {
    const h = harness();
    const ends: ListenEnd[] = [];
    const r = reading(h, true, ends);
    r.feed('Eins. Zwei. Drei.', false);
    await h.tickTo(2_000);
    r.stop('stopped');
    await h.tickTo(30_000);
    expect(ends).toEqual(['stopped']);
    expect([...h.released]).toEqual(['Eins.', 'Zwei.']);
    expect(h.store.get().phase).toBe('idle');
    // Nothing more is said or fetched after it was stopped.
    r.feed('Eins. Zwei. Drei. Vier.', true);
    await h.tickTo(60_000);
    expect(h.log.filter((l) => l.includes('Vier.'))).toEqual([]);
    expect(ends).toEqual(['stopped']);
  });
});
