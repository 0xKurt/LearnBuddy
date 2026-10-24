import { expect, it } from 'vitest';
import { AdtsFrames, ContinuousTurns } from '../continuousTurns.js';

// Mono AAC, 16 kHz, one raw-data block (1024 samples); payload identifies each frame.
function frame(id: number) {
  return Uint8Array.of(0xff, 0xf1, 0x60, 0x40, 1, 0x1f, 0xfc, id);
}
it('retains split ADTS headers and payloads without losing or duplicating a byte', () => {
  const a = new AdtsFrames();
  a.push(frame(1).slice(0, 4));
  expect(a.endMs).toBe(0);
  a.push(Uint8Array.of(...frame(1).slice(4), ...frame(2)));
  expect(a.endMs).toBe(128);
  expect(a.take(0)).toEqual(Uint8Array.of(...frame(1), ...frame(2)));
});
it('keeps the onset and records a second turn while the first is still being transcribed', () => {
  const turns: Uint8Array[] = [];
  let starts = 0;
  const c = new ContinuousTurns({
    start: () => {
      starts++;
    },
    turn: (b) => turns.push(b),
  });
  for (let i = 0; i < 70; i++) {
    c.push(frame(i));
    const at = (i + 1) * 64;
    const talking = (i >= 16 && i < 24) || (i >= 40 && i < 48);
    c.observe(talking ? -30 : -65, at, false);
  }
  expect(starts).toBe(2);
  expect(turns).toHaveLength(2);
  const ids = turns.map((bytes) => Array.from(bytes).filter((_, i) => i % 8 === 7));
  for (const id of [16, 17, 18, 19, 20, 21, 22, 23]) expect(ids[0]).toContain(id);
  for (const id of [40, 41, 42, 43, 44, 45, 46, 47]) expect(ids[1]).toContain(id);
  expect(ids[1]!.some((id) => ids[0]!.includes(id))).toBe(false);
});
it('does not emit Buddy echo or sustained background as a learner message', () => {
  const turns: Uint8Array[] = [];
  const c = new ContinuousTurns({ start: () => {}, turn: (b) => turns.push(b) });
  for (let i = 0; i < 180; i++) {
    c.push(frame(i));
    c.observe(i < 80 ? -35 : i % 4 ? -22 : -34, (i + 1) * 64, i >= 80);
  }
  expect(turns).toEqual([]);
});

it('uses raw dBFS so the display clamp cannot drown out quiet speech above measured noise', () => {
  const turns: Uint8Array[] = [];
  const c = new ContinuousTurns({ start: () => {}, turn: (b) => turns.push(b) });
  for (let i = 0; i < 50; i++) {
    c.push(frame(i));
    c.observe(i >= 16 && i < 28 ? -48 : -66, (i + 1) * 64, false);
  }
  expect(turns).toHaveLength(1);
});
