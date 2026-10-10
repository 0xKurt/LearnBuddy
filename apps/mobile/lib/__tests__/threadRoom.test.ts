import type { EssayFeedback, Figure } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import {
  boardKeeps,
  newestReply,
  readsThrough,
  threadEdge,
  threadRoom,
  type RoomInput,
} from '../practice/threadRoom.js';

// One reply of 120 pt under one earlier turn: the conversation needs 260, the newest turn 120.
const base: RoomInput = {
  room: 60,
  threadNeed: 260,
  tops: [0, 128],
  quiet: false,
  boardGives: false,
  boardSpare: Infinity,
  cardNatural: 0,
  cardDelta: 0,
  visual: false,
  growable: true,
  reach: 0.5,
  viewHeight: 740,
};
const newest = 260 - (12 + 128) + 8;

describe('threadRoom (issues #286, #232, #403)', () => {
  it('draws nothing of a turn that does not fit whole when nothing below can give way', () => {
    const r = threadRoom(base);
    expect(r.threadCap).toBe(0);
    expect(r.threadFloor).toBe(0);
    expect(r.threadHolds).toBe(true);
  });

  it('keeps the help chips under a reply that does not fit, whole or not at all (#403)', () => {
    // The chips start at 196: with the gap above them and the padding below, 60 pt to the end.
    const chips = { ...base, parts: [0, 196] };
    expect(threadRoom(chips).threadCap).toBe(60);
    expect(threadRoom({ ...chips, room: 58 }).threadCap).toBe(0);
    // With room for the reply, the box starts above the reply, never above half the turn before.
    expect(threadRoom({ ...chips, room: 200 }).threadCap).toBe(newest);
  });

  it('does not flip on a rounded point: a part one point over the room still counts whole (#386)', () => {
    // The voice row on 360×740: the box and the free room, each rounded, summed to 189 in one pass
    // and 190 in the next, and the 190 pt reply was drawn, hidden, drawn …
    const chips = { ...base, parts: [0, 196] };
    expect(threadRoom({ ...chips, room: newest - 1 }).threadCap).toBe(newest);
    expect(threadRoom({ ...chips, room: newest }).threadCap).toBe(newest);
    // Two points is no rounding: then the reply does not fit and only the chips stand.
    expect(threadRoom({ ...chips, room: newest - 2 }).threadCap).toBe(60);
  });

  it('keeps the newest turn whole where a board gives way and has room to spare', () => {
    const r = threadRoom({ ...base, boardGives: true, boardSpare: 400 });
    expect(r.threadCap).toBe(newest);
    expect(r.threadFloor).toBe(newest);
  });

  it('gives the room of a board for the newest turn, never for the chips under it (#387)', () => {
    // Buddy's reply from 128, the help chips from 196: the reply alone is 68 pt.
    const chips = { ...base, parts: [0, 196], boardGives: true, boardSpare: 400 };
    // 100 pt: the reply fits, with the chips it would not — the box rests on the reply and the
    // board keeps its lines; the chips are a scroll away.
    const r = threadRoom({ ...chips, room: 100 });
    expect(r).toMatchObject({ threadCap: 68, threadFloor: 68, restsOnNewest: true });
    // Room for both: everything of the newest turn, resting at the end as always.
    expect(threadRoom({ ...chips, room: newest })).toMatchObject({
      threadCap: newest,
      restsOnNewest: false,
    });
    // Without a board that gives way, nothing changes: whole parts from the end.
    expect(threadRoom({ ...chips, boardGives: false, room: 100 })).toMatchObject({
      threadCap: 60,
      restsOnNewest: false,
    });
  });

  it('never takes more of a board than it can spare above its parts and its bar (#232)', () => {
    // The cloze with the keyboard up: the board can give only 20 pt more — not enough for the
    // reply, so it is not drawn, and the board keeps its room (#403).
    const r = threadRoom({ ...base, boardGives: true, boardSpare: 20 });
    expect(r.threadCap).toBe(0);
    expect(r.threadFloor).toBe(0);
    expect(r.threadHolds).toBe(true);
  });

  it('shows everything when everything fits, and a quiet thread gives way whole', () => {
    expect(threadRoom({ ...base, room: 300 }).threadCap).toBe(260);
    expect(threadRoom({ ...base, quiet: true, tops: [], threadNeed: 40, room: 0 }).threadCap).toBe(
      0,
    );
  });

  it('lets the drawing give what the column runs short, also without a reply (#402)', () => {
    // A quiet question with a drawing, and the bar under its options 20 pt too tall.
    const quiet = { ...base, quiet: true, tops: [], threadNeed: 40, room: 0, cardNatural: 300 };
    expect(threadRoom({ ...quiet, visual: true }).cardGrowTo).toBe(0);
    expect(threadRoom({ ...quiet, visual: true, short: 20 }).cardGrowTo).toBe(-20);
    // Never more than the drawing may give; a card without one gives nothing.
    expect(threadRoom({ ...quiet, visual: true, short: 90 }).cardGrowTo).toBe(-48);
    expect(threadRoom({ ...quiet, short: 20 }).cardGrowTo).toBe(0);
  });

  it('grows a card to its share of the window: half, a tall picture all the free room (#462)', () => {
    // A quiet question, its card 250 pt with the drawing, 300 pt free under it but the hint row.
    const free = { ...base, quiet: true, tops: [], threadNeed: 40, room: 340, cardNatural: 250 };
    expect(threadRoom({ ...free, visual: true }).cardGrowTo).toBe(370 - 250);
    expect(threadRoom({ ...free, visual: true, reach: 1 }).cardGrowTo).toBe(340 - 40);
  });

  it('gives a reply she reads through all the room, from its top, where it is taller (#258)', () => {
    // Buddy's feedback on her long text is taller than the room at rest: hidden, it was nowhere.
    const r = threadRoom({ ...base, reads: true });
    expect(r.threadCap).toBe(60);
    expect(r.threadHolds).toBe(true);
    // Where it fits whole, nothing changes.
    expect(threadRoom({ ...base, room: 200, reads: true }).threadCap).toBe(newest);
  });

  it('reads an explanation with its picture through, like the feedback on a long text (#387)', () => {
    // „Mit Beispiel" (#298): the explanation with its graph was taller than the room above the
    // options and „Weiter" — hidden for its height, it stood nowhere at rest.
    const figure: Figure = { type: 'table', header: ['a', 'y'], rows: [['1', '1']] };
    expect(readsThrough({ essay: null, figure })).toBe(true);
    const essay: EssayFeedback = { form: 'Erörterung', points: [], places: [], last: false };
    expect(readsThrough({ essay, figure: null })).toBe(true);
    // A plain reply is glanced at: it shows whole or waits for room.
    expect(readsThrough({ essay: null, figure: null })).toBe(false);
    expect(readsThrough({})).toBe(false);
    expect(readsThrough(undefined)).toBe(false);
  });

  it('reads the „Anders erklären" exchange from its part, not from the turn before it (#387)', () => {
    // After „Mit Beispiel" the newest turn of the conversation was still „Stimmt – gut gemacht!":
    // the explanation with its graph stands in the exchange, the conversation's last part.
    const figure: Figure = { type: 'table', header: ['a', 'y'], rows: [['1', '1']] };
    const right = { essay: null, figure: null };
    const asked = { essay: null, figure: null };
    const explained = { essay: null, figure };
    const reply = newestReply({
      turns: [asked, right],
      again: [asked, explained],
      turnTops: [0, 60],
      partTops: [0, 112],
    });
    expect(reply).toEqual({ turn: explained, top: 112 });
    expect(readsThrough(reply.turn)).toBe(true);
    // Without an exchange it is the newest turn, where it starts.
    expect(
      newestReply({ turns: [asked, right], again: [], turnTops: [0, 60], partTops: [0] }),
    ).toEqual({
      turn: right,
      top: 60,
    });
  });

  it('keeps two lines of parts and the bar', () => {
    expect(boardKeeps(0)).toBeGreaterThan(2 * 44 + 48);
  });
});

describe('threadEdge (issues #63, #504)', () => {
  // The help chips alone, before her first answer (44 pt with 12 pt of padding above and below):
  // `threadRoom` capped the box at 64, flexShrink laid it out at 63 (tour 51-homework-photo @kb).
  const quiet = { box: 63, content: 68, offset: 0, tops: [0, 0], follows: false };

  it('keeps a box that does not follow its end at rest where it stands: no full fade (#504)', () => {
    expect(threadEdge(quiet)).toEqual({ cut: true, fadeFull: false, more: false });
    // At any size the box is laid out at: one point either side of the cap changes nothing.
    for (const box of [56, 60, 64, 65, 67])
      expect(threadEdge({ ...quiet, box }).fadeFull).toBe(false);
  });

  it('fades fully where a box that follows its end stands above it, or inside a part', () => {
    // Sized by `threadRoom` from the gap above the newest turn: 300 − (12 + 140 − 8) = 156.
    const turns = { box: 156, content: 300, tops: [0, 140], follows: true };
    // At its end the edge lies in that gap: only the gap fades.
    expect(threadEdge({ ...turns, offset: 144 }).fadeFull).toBe(false);
    // She scrolled up into the earlier turn.
    expect(threadEdge({ ...turns, offset: 60 }).fadeFull).toBe(true);
    // A box that does not follow, scrolled into a part by her.
    expect(threadEdge({ ...turns, follows: false, offset: 60 }).fadeFull).toBe(true);
  });
});
