// requires live verification in Claude Code session — the microphone, the upload and the
// voice are replaced here (CLAUDE.md rule 8: the outside world may be, the database never).
//
// Two complaints of the owner's, from the same minute on 01.10., live in this file.
//
// #185: the microphone was refused, and the big button still said "Sprechen". He pressed it,
// nothing happened, and he wrote "der sprechen button funktioniert nicht. kp wieso". The
// explanation was on screen — three rows above, with two "Anhören" buttons in between.
//
// #186: "und ich weiss auch nicht wieso das vom design so anders ist". The bar carried five
// controls in four shapes — a text link, two equal outlined boxes, one large filled button
// and a ghost button. It carries two now: one large filled pill (the single leading action,
// which always says what pressing it will do) and chips for everything quiet (#599).
//
// No other layer can reach these states. The browser walkthrough launches Chromium with
// `--use-fake-ui-for-media-stream`, which grants the microphone on purpose so the
// conversation loop can run; a refused one is exactly what it cannot produce, and a failed
// upload would mean breaking the local API mid-run. On a device it takes a hand (and on MIUI
// a system dialog, .maestro/README.md). Here they are values.

import type { AudioMime, ItemView } from '@learnbuddy/shared-types/contracts';
import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UI } from '../../../lib/theme/components.js';
import { paletteOf } from '../../../lib/theme/palettes.js';
import { RADIUS } from '../../../lib/theme/radius.js';
import { renderInApp, styleOf } from '../../../testing/render.js';
import { SpeakPanel } from '../SpeakPanel.js';
import { WordSheet } from '../WordSheet.js';
import { RehearseCard } from '../../buddy/RehearseCard.js';

/** What the panel handed the recorder, so a test can report a finished recording. */
type Recorded = { uri: string; mime: AudioMime; durationMs: number; base64: string };

/** Set per test: what the recorder reports about the microphone and what it is doing. */
const recorder = vi.hoisted(() => ({
  phase: 'idle' as 'idle' | 'starting' | 'recording' | 'stopping',
  denied: null as { canAskAgain: boolean } | null,
  start: vi.fn(),
  stop: vi.fn(),
  cancel: vi.fn(),
  onRecorded: null as ((r: Recorded) => void) | null,
}));

/** Which platform the panel believes it is on, and the settings screen it may open. */
const platform = vi.hoisted(() => ({ os: 'ios', openSettings: vi.fn() }));

/** Reading the sentence aloud, and the upload of her recording. */
const outside = vi.hoisted(() => ({
  speak: vi.fn(),
  stop: vi.fn(),
  speakItem: vi.fn(),
  speakWord: vi.fn(),
}));

vi.mock('../../../lib/speech/record.js', () => ({
  useRecording: ({ onRecorded }: { onRecorded: (r: Recorded) => void }) => {
    recorder.onRecorded = onRecorded;
    return {
      phase: recorder.phase,
      elapsedMs: 0,
      maxMs: 30_000,
      level: 0,
      denied: recorder.denied,
      start: recorder.start,
      stop: recorder.stop,
      cancel: recorder.cancel,
    };
  },
}));

vi.mock('../../../lib/speech/listen.js', () => ({
  speak: outside.speak,
  stop: outside.stop,
}));

vi.mock('../../../lib/api/learningEndpoints.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, speakItem: outside.speakItem, speakWord: outside.speakWord };
});

vi.mock('react-native', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-native');
  return {
    ...actual,
    AccessibilityInfo: {
      ...(actual.AccessibilityInfo as object),
      announceForAccessibilityWithOptions: vi.fn(),
    },
    Platform: {
      ...(actual.Platform as object),
      get OS() {
        return platform.os;
      },
    },
    Linking: { ...(actual.Linking as object), openSettings: platform.openSettings },
  };
});

const ITEM: ItemView = {
  id: '44444444-4444-4444-8444-444444444444',
  kind: 'speak',
  prompt: 'Le chat dort sur le canapé.',
  choices: null,
  unit: null,
  topic: null,
  origin: 'material',
  lang: 'fr',
  prompt_lang: 'fr',
  subject_kind: null,
  figure: null,
  choice_figures: null,
  image: null,
  tap_choices: null,
  surface: null,
  tap: false,
  task_view: null,
  listen: null,
  tones: null,
  passage: null,
  task_part: null,
  read_aloud: true,
};

const RECORDING: Recorded = {
  uri: 'file:///tmp/take.m4a',
  mime: 'audio/m4a',
  durationMs: 2400,
  base64: 'a'.repeat(200),
};

/** `skip`: the session allows moving past the sentence, so the bar carries that way out. */
function renderPanel({ skip = false }: { skip?: boolean } = {}) {
  return renderInApp(
    <SpeakPanel
      item={ITEM}
      sessionId="55555555-5555-4555-8555-555555555555"
      hasFeedback={false}
      disabled={false}
      onResult={() => undefined}
      {...(skip ? { onSkip: () => undefined } : {})}
    />,
  );
}

/** What a screen reader calls this control. */
const named = (button: Element): string =>
  button.getAttribute('aria-label') ?? button.textContent ?? '';

/**
 * The box a `Btn` paints. Its height, its roundness and its fill sit on the view inside the
 * pressable, never on the pressable itself (CLAUDE.md rule 13 — a background on a Pressable
 * silently does nothing in RN 0.73+).
 */
function skin(button: Element): CSSStyleDeclaration {
  const inner = button.firstElementChild;
  if (!inner) throw new Error(`"${named(button)}" has no view inside it`);
  return styleOf(inner);
}

const barButtons = (): Element[] => screen.getAllByRole('button');

/** Everything the bar paints with a filled background and the large size: the lead. */
const leading = (): Element[] => barButtons().filter((b) => skin(b).minHeight === '54px');

const TRANSPARENT = 'rgba(0, 0, 0, 0)';
const rgb = (hex: string): string =>
  `rgb(${[1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)).join(', ')})`;

beforeEach(() => {
  recorder.phase = 'idle';
  recorder.denied = null;
  recorder.onRecorded = null;
  platform.os = 'ios';
  platform.openSettings.mockReset();
  recorder.start.mockReset();
  outside.speak.mockReset();
  outside.speakWord.mockReset();
  outside.speak.mockResolvedValue(undefined);
  outside.stop.mockReset();
  outside.speakItem.mockReset();
});

describe('a button that cannot do its job stops offering it (issue #185)', () => {
  it('offers "Sprechen" while the microphone is still open', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Aufnahme starten' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Einstellungen öffnen' })).toBeNull();
  });

  it('turns the big control into "Einstellungen öffnen" once the microphone is refused', () => {
    recorder.denied = { canAskAgain: false };
    renderPanel();

    // This is the whole of #185: the one big control says what pressing it will do.
    expect(screen.getByRole('button', { name: 'Einstellungen öffnen' })).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Aufnahme starten' }),
      'a refused microphone must not keep offering to record',
    ).toBeNull();
  });

  it('opens the settings on a tap instead of trying to record', () => {
    recorder.denied = { canAskAgain: false };
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Einstellungen öffnen' }));
    expect(platform.openSettings).toHaveBeenCalledTimes(1);
    expect(recorder.start, 'it must not try the microphone again').not.toHaveBeenCalled();
  });

  it('stays pressable — a dead button was the complaint', () => {
    recorder.denied = { canAskAgain: false };
    renderPanel();
    const button = screen.getByRole('button', { name: 'Einstellungen öffnen' });
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it('says why, out loud, and not in red', () => {
    recorder.denied = { canAskAgain: false };
    renderPanel();
    const alert = screen.getByRole('alert');
    // The sentence a screen reader gets, and the one she reads. Never "Falsch!" in tone.
    expect(alert.textContent).toBe(
      'Ohne Mikrofon kann ich dich nicht hören. Du kannst es in den Einstellungen erlauben.',
    );
  });

  it('tells the browser the browser-specific thing', () => {
    // On the web the settings screen does not exist — the permission sits in the address
    // bar — so there the big control keeps offering to record and the sentence differs.
    platform.os = 'web';
    recorder.denied = { canAskAgain: true };
    renderPanel();
    expect(screen.getByRole('button', { name: 'Aufnahme starten' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('oben in deinem Browser');
  });
});

describe('one action leads, the rest is quiet and of one shape (issue #186)', () => {
  it('fills exactly one control — the one she came here for', () => {
    renderPanel({ skip: true });
    // Four controls, one lead. Not "a big one among several big ones": the large size is
    // what the eye finds first, so only the thing she is here for may wear it.
    expect(leading().map(named)).toEqual(['Aufnahme starten']);
    expect(skin(leading()[0]!).backgroundColor).not.toBe(TRANSPARENT);
    // And it is the same shape as every other leading action in the app ("Weiter", "Dieses
    // Wort sagen"): a large pill. The old bar drew it with a 14 pt corner, unlike them.
    expect(skin(leading()[0]!).borderTopLeftRadius).toBe(`${RADIUS.round}px`);
  });

  // Design ui_kits/app/Flows.jsx:119–121 (#599): three chips above the primary.
  it('gives everything else one shape, whatever it does: the chip, in one row above the lead', () => {
    renderPanel({ skip: true });
    const quiet = barButtons().filter((b) => skin(b).minHeight !== '54px');
    expect(quiet.map(named)).toEqual(['Anhören', 'Langsam anhören', 'Überspringen']);
    const row = screen.getByTestId('speak-chips');
    for (const button of quiet) {
      expect(row.contains(button), named(button)).toBe(true);
      // One size, one roundness, one fine edge — and a whole touch target around it. Before
      // this, listening was a grey pill, "Langsam" a text link and skipping a ghost button
      // under the lead: three shapes for three things that are all "quietly available".
      const chip = styleOf(button.querySelector('div > div')!);
      expect(chip.minHeight, named(button)).toBe(`${UI.chip.height}px`);
      expect(chip.borderTopLeftRadius, named(button)).toBe(`${RADIUS.round}px`);
      expect(chip.borderTopWidth, named(button)).toBe('1px');
      expect(styleOf(button).minHeight, named(button)).toBe('44px');
    }
    // The row stands before the lead, never under it.
    const lead = leading()[0]!;
    expect(row.compareDocumentPosition(lead) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('offers listening once, with "langsam" as its variant rather than a second way', () => {
    renderPanel({ skip: true });
    const listen = screen.getByRole('button', { name: 'Anhören' });
    const slow = screen.getByRole('button', { name: 'Langsam anhören' });

    // What stands on them: the action, and a modifier of it. A screen reader still hears
    // the whole thing ("Langsam anhören") — the short word is for the eye.
    expect(listen.textContent).toBe('Anhören');
    expect(slow.textContent).toBe('Langsam');

    // And they are not of equal rank, by a signal that is not colour: only the listening
    // itself carries the speaker.
    expect(listen.querySelector('svg'), 'the action carries the speaker').toBeTruthy();
    expect(slow.querySelector('svg'), 'its variant does not repeat the icon').toBeNull();
  });

  it('still reads the sentence slowly when asked — the capability, not just the label', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Langsam anhören' }));
    expect(outside.speak).toHaveBeenCalledTimes(1);
    const [text, lang, opts] = outside.speak.mock.calls[0] as [string, string, { slow?: boolean }];
    expect(text).toBe(ITEM.prompt);
    expect(lang).toBe('fr');
    expect(opts.slow, 'the quieter pill must still be the slower reading').toBe(true);
  });

  it('makes sending it again the leading action when the upload failed', async () => {
    outside.speakItem.mockRejectedValue(new Error('the upload did not arrive'));
    renderPanel({ skip: true });
    await act(async () => {
      recorder.onRecorded?.(RECORDING);
    });

    // The recording is kept and sending it again is now the one thing to do, so it stands in
    // the big control. It used to be a second filled button in the status row while the big
    // one below sat there muted, saying "Sprechen" — two filled buttons, the larger one dead.
    expect(leading().map(named)).toEqual(['Nochmal senden']);
    expect(screen.queryByRole('button', { name: 'Aufnahme starten' })).toBeNull();
    const letGo = screen.getByRole('button', { name: 'Neu aufnehmen' });
    expect(skin(letGo).minHeight).toBe('44px');
    expect(skin(letGo).backgroundColor).toBe(TRANSPARENT);
    expect(screen.getByRole('alert').textContent).toBe(
      'Deine Aufnahme ist noch nicht bei Buddy angekommen.',
    );
  });

  it('keeps one lead while it records, and nothing else to decide', () => {
    recorder.phase = 'recording';
    renderPanel({ skip: true });
    expect(leading().map(named)).toEqual(['Aufnahme stoppen']);
    expect(skin(leading()[0]!).borderTopLeftRadius).toBe(`${RADIUS.round}px`);
    // Hearing it is still there but waits (her own voice is being recorded), and the way
    // past the sentence is gone until she stops: nothing competes with "Fertig".
    for (const name of ['Anhören', 'Langsam anhören']) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled, name).toBe(true);
    }
    expect(screen.queryByRole('button', { name: 'Überspringen' })).toBeNull();
  });

  it('says "Fertig" on the primary, with the shared stop square, while she speaks (Flows.jsx:123)', () => {
    recorder.phase = 'recording';
    renderPanel();
    const lead = leading()[0]!;
    expect(lead.textContent).toBe('Fertig');
    // The filled accent, not the grey "soft" skin the stop button had.
    expect(skin(lead).backgroundColor).toBe(rgb(paletteOf('pastell').primary));
    expect(lead.querySelector('rect')?.getAttribute('width')).toBe('11');
  });

  it('waits on the primary itself while Buddy listens, instead of a status row (Flows.jsx:124)', async () => {
    outside.speakItem.mockReturnValue(new Promise(() => undefined));
    renderPanel({ skip: true });
    await act(async () => {
      recorder.onRecorded?.(RECORDING);
    });
    expect(leading().map(named)).toEqual(['Buddy hört zu …']);
    expect(leading()[0]!.getAttribute('aria-disabled')).toBe('true');
    expect(leading()[0]!.getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByRole('progressbar', { name: 'Buddy hört zu …' })).toBeNull();
  });
});

function renderWord() {
  return renderInApp(
    <WordSheet
      word={{ text: 'chat', ok: false, tip: 'Achte auf den Anfang.' }}
      sessionId="55555555-5555-4555-8555-555555555555"
      itemId={ITEM.id}
      lang="fr"
      onClose={() => undefined}
    />,
  );
}

describe('the same recorder state in word practice and rehearsal (#918)', () => {
  it.each(['word', 'rehearsal'])('offers settings for a refused mic in %s', (surface) => {
    recorder.denied = { canAskAgain: false };
    if (surface === 'word') renderWord();
    else
      renderInApp(
        <RehearseCard
          actionId="55555555-5555-4555-8555-555555555555"
          offer={{
            tool: 'offer_rehearsal',
            kind: 'read_aloud',
            title: 'Lesen',
            text: 'Bonjour.',
            minutes: null,
            goal_id: null,
          }}
        />,
      );
    const settings = screen.getByRole('button', { name: 'Einstellungen öffnen' });
    fireEvent.click(settings);
    expect(platform.openSettings).toHaveBeenCalledTimes(1);
    expect(recorder.start).not.toHaveBeenCalled();
  });

  it('shows the running recording in word practice', () => {
    recorder.phase = 'recording';
    renderWord();
    expect(screen.getByLabelText('Aufnahme läuft, 0:00 von 0:30')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Aufnahme stoppen' }).textContent).toBe('Fertig');
  });

  it('does not grade silence as almost right or repeat a pronunciation tip', async () => {
    outside.speakWord.mockResolvedValue({
      audible: false,
      ok: false,
      heard: '',
      tip: null,
      help: null,
    });
    renderWord();
    await act(async () => {
      recorder.onRecorded?.(RECORDING);
    });
    expect(screen.queryByText('Fast – hör es dir nochmal an und probier es.')).toBeNull();
    expect(screen.queryByText('Achte auf den Anfang.')).toBeNull();
    expect(screen.getByText('Das konnte ich nicht sicher beurteilen.')).toBeTruthy();
  });
});
