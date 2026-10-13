// The system states against the design they are built from (#599, HANDOFF §6 "Systemzustände"):
// each case names the line of `components/core/States.jsx` (design folder) it holds, with the
// design's number written out — a token compared with itself would hold nothing.
//
// Declared styles only — jsdom lays nothing out, and Reanimated is a stand-in here
// (testing/reanimated.tsx): that the pulse is asked for, how long and how it is stopped is read
// from the calls; how it looks on a phone belongs to the final walkthrough.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type * as Reanimated from 'react-native-reanimated';
import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../../lib/api/apiError.js';
import type * as MotionTokens from '../../../lib/theme/motion.js';
import { toast, toastDuration } from '../../../lib/toast.js';
import { renderInApp, styleOf } from '../../../testing/render.js';
import { ProfileSubjects } from '../../settings/ProfileSubjects.js';
import { Banner } from '../Banner.js';
import { ListGroup, Row } from '../ListGroup.js';
import { LoadFailed } from '../LoadFailed.js';
import { Bone, BoneCard, SkeletonGroup } from '../Skeleton.js';
import {
  ChatSkeleton,
  HomeSkeleton,
  LibrarySkeleton,
  PracticeSkeleton,
  SettingsSkeleton,
} from '../Skeletons.js';
import { ToastHost } from '../Toast.js';

const motion = vi.hoisted(() => ({
  reduced: false,
  timing: vi.fn(),
  repeat: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock('../../../lib/theme/motion.js', async (load) => {
  const actual = await load<typeof MotionTokens>();
  return { ...actual, useMotionReduced: () => motion.reduced };
});
vi.mock('react-native-reanimated', async (load) => {
  const actual = await load<typeof Reanimated>();
  return {
    ...actual,
    withTiming: (value: number, config: unknown) => {
      motion.timing(value, config);
      return value;
    },
    withRepeat: (value: number, count: number, reverse: boolean) => {
      motion.repeat(count, reverse);
      return value;
    },
    cancelAnimation: motion.cancel,
  };
});
vi.mock('../BuddyOrb.js', () => ({
  BuddyOrb: ({ size, state }: { size: number; state?: string }) => (
    <div data-testid="orb" data-size={size} data-state={state ?? 'idle'} />
  ),
}));

beforeEach(() => {
  motion.reduced = false;
  motion.timing.mockClear();
  motion.repeat.mockClear();
  motion.cancel.mockClear();
});

/** What the component itself declares on this element (react-native-web sets it inline). */
const own = (el: Element) => (el as HTMLElement).style;

/** tokens/colors.css, Pastell light — the look these tests render in. */
const CANVAS = 'rgb(241, 237, 248)';
const PAPER = 'rgb(255, 255, 255)';
const PRIMARY_LT = 'rgb(235, 229, 252)';
const PRIMARY_DK = 'rgb(83, 53, 181)';
const INK = 'rgb(31, 27, 46)';

/** Every element under `root` that declares this style value. */
const withStyle = (root: Element, name: keyof CSSStyleDeclaration, value: string) =>
  Array.from(root.querySelectorAll('div')).filter((el) => el.style[name] === value);

describe('Skel (States.jsx:8–10)', () => {
  const bone = () =>
    screen.getByRole('progressbar').firstElementChild?.firstElementChild as Element;

  it('is a canvas-coloured block with a corner of 8', () => {
    renderInApp(
      <SkeletonGroup label="Einen Moment …">
        <Bone height={14} />
      </SkeletonGroup>,
    );
    expect(own(bone()).backgroundColor).toBe(CANVAS);
    expect(own(bone()).borderTopLeftRadius).toBe('8px');
    expect([own(bone()).height, own(bone()).width]).toEqual(['14px', '100%']);
  });

  it('stands for a bubble of hers in primary-lt (:21) and for an answer as paper with a hairline (:27)', () => {
    renderInApp(
      <SkeletonGroup label="Einen Moment …">
        <Bone height={40} tone="selected" />
        <Bone height={56} tone="paper" />
      </SkeletonGroup>,
    );
    const [hers, answer] = Array.from((bone().parentElement as Element).children) as [
      Element,
      Element,
    ];
    expect(own(hers).backgroundColor).toBe(PRIMARY_LT);
    expect(own(answer).backgroundColor).toBe(PAPER);
    expect(own(answer).borderTopWidth).toBe('1px');
  });

  it('pulses 1.4 s, ease-in-out, for as long as it loads: 0.7 s down, 0.7 s back (:9,18)', () => {
    renderInApp(
      <SkeletonGroup label="Einen Moment …">
        <Bone height={14} />
      </SkeletonGroup>,
    );
    // The group's own fade-in is the other timing here; the pulse is the one that repeats.
    const beats = motion.timing.mock.calls.filter(
      ([to, config]) => to === 1 && (config as { duration: number }).duration === 700,
    );
    expect(beats).toHaveLength(1);
    // Without end, and back the way it came.
    expect(motion.repeat).toHaveBeenCalledTimes(1);
    expect(motion.repeat).toHaveBeenCalledWith(-1, true);
  });

  it('stands still with reduced motion, and stops the moment it is asked for (tokens/motion.css)', () => {
    motion.reduced = true;
    const view = renderInApp(
      <SkeletonGroup label="Einen Moment …">
        <Bone height={14} />
      </SkeletonGroup>,
    );
    expect(motion.timing).not.toHaveBeenCalled();
    expect(motion.repeat).not.toHaveBeenCalled();
    expect(own(bone()).opacity).toBe('1');

    motion.reduced = false;
    view.rerender(
      <SkeletonGroup label="Einen Moment …">
        <Bone height={14} />
      </SkeletonGroup>,
    );
    expect(motion.repeat).toHaveBeenCalledTimes(1);
    motion.cancel.mockClear();
    motion.reduced = true;
    view.rerender(
      <SkeletonGroup label="Einen Moment …">
        <Bone height={14} />
      </SkeletonGroup>,
    );
    expect(motion.cancel).toHaveBeenCalled();
    expect(motion.repeat).toHaveBeenCalledTimes(1);
  });

  it('is one element for a screen reader, named by what is loading', () => {
    renderInApp(
      <SkeletonGroup label="Ich hole deine Fragen …">
        <Bone height={14} />
      </SkeletonGroup>,
    );
    expect(screen.getByRole('progressbar', { name: 'Ich hole deine Fragen …' })).toBeTruthy();
  });

  it('hands its gap to the element that holds the bones, so they stand apart', () => {
    renderInApp(
      <SkeletonGroup label="Einen Moment …" style={{ flex: 1, gap: 24 }}>
        <Bone height={14} />
        <Bone height={14} />
      </SkeletonGroup>,
    );
    expect(styleOf(bone().parentElement as Element).gap).toBe('24px');
  });

  it('stands on the app’s card: paper, a corner of 20, 20 inside, 10 between (:14)', () => {
    renderInApp(
      <SkeletonGroup label="Einen Moment …">
        <BoneCard>
          <Bone height={14} />
        </BoneCard>
      </SkeletonGroup>,
    );
    const card = own(bone());
    expect([
      card.backgroundColor,
      card.borderTopLeftRadius,
      card.paddingTop,
      card.paddingLeft,
    ]).toEqual([PAPER, '20px', '20px', '20px']);
    expect(styleOf(bone()).gap).toBe('10px');
    // The design's card has no line around it.
    expect(card.borderTopWidth).toBe('');
  });
});

describe('SkeletonScreen (States.jsx:13–31) in the shape of the loaded screen', () => {
  it('list: four rows of a tile and two bones 13 and 11, in the real row’s box (:15,24)', () => {
    const loaded = renderInApp(
      <ListGroup>
        <Row title="Mathe" sub="Brüche · und mehr" tile={{ letter: 'M', tone: 'sky' }} />
      </ListGroup>,
    );
    const real = own(screen.getByText('Mathe').parentElement?.parentElement as Element);
    const box = [
      real.minHeight,
      real.paddingLeft,
      real.paddingTop,
      styleOf(screen.getByText('Mathe').parentElement?.parentElement as Element).gap,
    ];
    expect(box).toEqual(['56px', '16px', '10px', '12px']);
    loaded.unmount();

    const { container } = renderInApp(<LibrarySkeleton label="Einen Moment …" />);
    const rows = withStyle(container, 'minHeight', '56px');
    expect(rows).toHaveLength(4);
    for (const row of rows)
      expect([
        own(row).minHeight,
        own(row).paddingLeft,
        own(row).paddingTop,
        styleOf(row).gap,
      ]).toEqual(box);
    const tile = rows[0]?.firstElementChild as Element;
    expect([
      own(tile).width,
      own(tile).height,
      own(tile).borderTopLeftRadius,
      own(tile).backgroundColor,
    ]).toEqual(['36px', '36px', '12px', CANVAS]);
    // Each bone in the box of its line of type (16/22 over 14/20), 2 apart — as the row is.
    const lines = Array.from((rows[0]?.lastElementChild as Element).children);
    expect(lines.map((l) => own(l).height)).toEqual(['22px', '20px']);
    expect(lines.map((l) => own(l.firstElementChild as Element).height)).toEqual(['13px', '11px']);
    expect(lines.map((l) => own(l.firstElementChild as Element).width)).toEqual(['55%', '35%']);
  });

  it('settings: two groups of three and two rows, one bone of 45 % each (:29)', () => {
    const { container } = renderInApp(<SettingsSkeleton label="Einen Moment …" />);
    const cards = withStyle(container, 'borderTopLeftRadius', '20px');
    expect(cards.map((card) => withStyle(card, 'minHeight', '56px').length)).toEqual([3, 2]);
    expect(withStyle(container, 'width', '45%')).toHaveLength(5);
    const page = own(screen.getByRole('progressbar').firstElementChild as Element);
    expect([page.paddingLeft, page.paddingTop]).toEqual(['16px', '18px']);
  });

  it('question: the card’s label and two lines of 18, then four answers of 56 with a corner of 16 (:25–28)', () => {
    const { container } = renderInApp(<PracticeSkeleton label="Einen Moment …" />);
    const answers = withStyle(container, 'height', '56px');
    expect(answers).toHaveLength(4);
    for (const answer of answers)
      expect([
        own(answer).borderTopLeftRadius,
        own(answer).backgroundColor,
        own(answer).borderTopWidth,
      ]).toEqual(['16px', PAPER, '1px']);
    expect(
      withStyle(container, 'height', '18px')
        .map((el) => own(el).width)
        .filter(Boolean),
    ).toEqual(['90%', '65%']);
    expect(withStyle(container, 'height', '11px').map((el) => own(el).width)).toEqual(['30%']);
    // The bar where the Composer will stand: its box at rest (8 + 37 + 4 + 40 + 8), corner 26,
    // in `BottomBar`'s room: 16 at the sides, 8 above, 12 below (plus the safe area, which
    // jsdom does not have).
    const bar = withStyle(container, 'height', '97px');
    expect(bar).toHaveLength(1);
    expect([
      own(bar[0] as Element).borderTopLeftRadius,
      own(bar[0] as Element).backgroundColor,
    ]).toEqual(['26px', PAPER]);
    const room = own(bar[0]?.parentElement as Element);
    expect([room.paddingLeft, room.paddingTop, room.paddingBottom]).toEqual([
      '16px',
      '8px',
      '12px',
    ]);
  });

  it('chat: Buddy’s two lines of 16 after his orb’s column, a bubble of hers at the end edge (:20–21)', () => {
    const { container } = renderInApp(<ChatSkeleton label="Einen Moment …" rows={2} />);
    const lines = withStyle(container, 'height', '16px');
    expect(lines.map((el) => own(el).width)).toEqual(['80%', '60%']);
    // The column his mini orb stands in beside the newest line (26 + 10).
    expect(own(lines[0]?.parentElement?.parentElement as Element).paddingLeft).toBe('36px');
    const hers = withStyle(container, 'width', '45%');
    expect(hers).toHaveLength(1);
    expect([
      own(hers[0] as Element).backgroundColor,
      own(hers[0] as Element).borderTopLeftRadius,
    ]).toEqual([PRIMARY_LT, '20px']);
    expect(own(hers[0]?.parentElement as Element).alignItems).toBe('flex-end');
  });

  it('home: the conversation ends at the bottom with one of his cards — 30 %, 70 %, a 120 × 40 button (:19–23)', () => {
    const { container } = renderInApp(<HomeSkeleton label="Einen Moment …" />);
    const thread = screen.getByRole('progressbar').firstElementChild?.firstElementChild as Element;
    expect(own(thread).justifyContent).toBe('flex-end');
    const button = withStyle(container, 'width', '120px');
    expect(button).toHaveLength(1);
    expect([
      own(button[0] as Element).height,
      own(button[0] as Element).borderTopLeftRadius,
    ]).toEqual(['40px', '999px']);
    const card = button[0]?.parentElement as Element;
    expect(Array.from(card.children).map((el) => own(el).width)).toEqual(['30%', '70%', '120px']);
    // No bones for the head or for ways to start: the head is the real one, the ways are in ⋯.
    expect(withStyle(container, 'width', '44px')).toHaveLength(0);
  });
});

describe('Toast (States.jsx:58–65)', () => {
  const show = (run: () => void = () => undefined) => {
    renderInApp(<ToastHost />);
    act(() =>
      toast.show('Entfernt. Buddy vergisst das.', 'info', { action: { label: 'Rückgängig', run } }),
    );
  };

  it('is an ink pill at least 44 high: 14 before its words, 6 after its offer, 10 between', () => {
    show();
    const words = screen.getByText('Entfernt. Buddy vergisst das.');
    const pill = words.parentElement as Element;
    expect([
      own(pill).backgroundColor,
      own(pill).minHeight,
      own(pill).paddingLeft,
      own(pill).paddingRight,
      own(pill).borderTopLeftRadius,
      styleOf(pill).gap,
    ]).toEqual([INK, '44px', '14px', '6px', '999px', '10px']);
    act(() => toast.hide());
  });

  it('says its words in 600 14, paper on ink', () => {
    show();
    const words = own(screen.getByText('Entfernt. Buddy vergisst das.'));
    expect([words.fontSize, words.fontWeight, words.color]).toEqual(['14px', '600', PAPER]);
    act(() => toast.hide());
  });

  it('gives "Rückgängig" a real box of 44 × 44 or more — padding, no hitSlop', () => {
    show();
    const offer = screen.getByRole('button', { name: 'Rückgängig' });
    expect([own(offer).minHeight, own(offer).minWidth]).toEqual(['44px', '44px']);
    expect([own(offer).paddingLeft, own(offer).paddingRight]).toEqual(['12px', '12px']);
    // As tall as the pill it stands in, whatever the message's height.
    expect(own(offer).alignSelf).toBe('stretch');
    const label = own(screen.getByText('Rückgängig'));
    expect([label.fontSize, label.fontWeight, label.color]).toEqual(['14px', '700', PRIMARY_LT]);
    const source = readFileSync(join(__dirname, '../Toast.tsx'), 'utf8');
    expect(source).not.toMatch(/hitSlop=/);
    act(() => toast.hide());
  });

  it('takes the action back on a tap, and goes with it', () => {
    const run = vi.fn();
    show(run);
    fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));
    expect(run).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Entfernt. Buddy vergisst das.')).toBeNull();
  });

  it('keeps its room at the end without an offer (:62), and its time with one', () => {
    renderInApp(<ToastHost />);
    act(() => toast.show('Gespeichert.'));
    const pill = screen.getByText('Gespeichert.').parentElement as Element;
    expect(own(pill.lastElementChild as Element).width).toBe('8px');
    expect(screen.queryByRole('button')).toBeNull();
    act(() => toast.hide());
    expect(toastDuration('info', true)).toBe(9000);
  });

  it('is announced: an alert with a polite live region', () => {
    show();
    const alert = screen.getByRole('alert');
    expect(alert.getAttribute('aria-live')).toBe('polite');
    expect(alert.textContent).toBe('Entfernt. Buddy vergisst das.Rückgängig');
    act(() => toast.hide());
  });
});

describe('Banner (States.jsx:68–71)', () => {
  it('as the bar under the head: 600 13/18, at least 36 high, 8 and 16 inside, canvas and ink, centred', () => {
    renderInApp(<Banner bar>Keine Verbindung</Banner>);
    const words = screen.getByText('Keine Verbindung');
    expect([
      own(words).fontSize,
      own(words).lineHeight,
      own(words).fontWeight,
      own(words).color,
      own(words).textAlign,
    ]).toEqual(['13px', '18px', '600', INK, 'center']);
    const bar = own(words.parentElement as Element);
    expect([bar.minHeight, bar.paddingTop, bar.paddingLeft, bar.backgroundColor]).toEqual([
      '36px',
      '8px',
      '16px',
      CANVAS,
    ]);
    // From edge to edge: no corner.
    expect(bar.borderTopLeftRadius).toBe('');
  });

  it('"sync" is primary-lt with the accent text', () => {
    renderInApp(<Banner tone="info">Wird gespeichert …</Banner>);
    const words = screen.getByText('Wird gespeichert …');
    expect(own(words).color).toBe(PRIMARY_DK);
    expect(own(words.parentElement as Element).backgroundColor).toBe(PRIMARY_LT);
  });

  it('as a note inside a sheet keeps its corner and its room, in the same type', () => {
    renderInApp(<Banner tone="info">Das Thema passt gerade nicht.</Banner>);
    const words = screen.getByText('Das Thema passt gerade nicht.');
    expect([own(words).fontSize, own(words).lineHeight, own(words).fontWeight]).toEqual([
      '13px',
      '18px',
      '600',
    ]);
    const note = own(words.parentElement as Element);
    expect([note.borderTopLeftRadius, note.paddingTop, note.paddingLeft]).toEqual([
      '20px',
      '12px',
      '16px',
    ]);
  });
});

describe('a load that failed (States.jsx:37–40, ui_kits/app/Extra.jsx:255–258)', () => {
  const orb = () => screen.getByTestId('orb').dataset;

  it('shows Buddy at 64, thinking about what went wrong', () => {
    renderInApp(
      <LoadFailed error={new ApiError('internal', 'x', 500)} onRetry={() => undefined} />,
    );
    expect([orb().size, orb().state]).toEqual(['64', 'think']);
  });

  it('shows him at rest when the thing is simply gone', () => {
    renderInApp(
      <LoadFailed error={new ApiError('not_found', 'x', 404)} onRetry={() => undefined} />,
    );
    expect(orb().state).toBe('idle');
  });

  it('draws no Buddy as one part of a page: a profile’s subjects that did not load (States.jsx:34)', () => {
    const onRetry = vi.fn();
    renderInApp(
      <ProfileSubjects
        cards={[]}
        loading
        error={new ApiError('internal', 'x', 500)}
        onRetry={onRetry}
      />,
    );
    expect(screen.queryByTestId('orb')).toBeNull();
    // What it says and the way on are the same as on a full screen.
    expect(screen.getByRole('heading').textContent).not.toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Nochmal versuchen' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('owner rule 4: no colour written into a system state', () => {
  const FILES = [
    'components/lb/Skeleton.tsx',
    'components/lb/Skeletons.tsx',
    'components/lb/Toast.tsx',
    'components/lb/Banner.tsx',
    'components/lb/EmptyState.tsx',
    'components/lb/LoadFailed.tsx',
    'components/lb/LoadingState.tsx',
    'components/lb/OfflineFrame.tsx',
    'components/lb/ErrorBoundary.tsx',
    'components/lb/DevHostNote.tsx',
    'components/lb/WaitHint.tsx',
    'lib/theme/states.ts',
  ];

  it.each(FILES)('%s takes every colour from the palette', (file) => {
    const source = readFileSync(join(__dirname, '../../..', file), 'utf8');
    expect(source.match(/['"`](#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))['"`]/g) ?? []).toEqual([]);
  });
});
