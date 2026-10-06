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
// which always says what pressing it will do) and small pills for everything quiet.
//
// No other layer can reach these states. The browser walkthrough launches Chromium with
// `--use-fake-ui-for-media-stream`, which grants the microphone on purpose so the
// conversation loop can run; a refused one is exactly what it cannot produce, and a failed
// upload would mean breaking the local API mid-run. On a device it takes a hand (and on MIUI
// a system dialog, .maestro/README.md). Here they are values.

import type { ItemView } from '@learnbuddy/shared-types/contracts';
import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SpeakMime } from '../../../lib/speech/voice.js';
import { renderInApp, styleOf } from '../../../testing/render.js';
import { SpeakPanel } from '../SpeakPanel.js';

/** What the panel handed the recorder, so a test can report a finished recording. */
type Recorded = { uri: string; mime: SpeakMime; durationMs: number; base64: string };

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
const outside = vi.hoisted(() => ({ speak: vi.fn(), stop: vi.fn(), speakItem: vi.fn() }));

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

vi.mock('../../../lib/api/endpoints.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, speakItem: outside.speakItem };
});

vi.mock('react-native', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-native');
  return {
    ...actual,
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

beforeEach(() => {
  recorder.phase = 'idle';
  recorder.denied = null;
  recorder.onRecorded = null;
  platform.os = 'ios';
  platform.openSettings.mockReset();
  recorder.start.mockReset();
  outside.speak.mockReset();
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
    expect(skin(leading()[0]!).borderTopLeftRadius).toBe('27px');
  });

  it('gives everything else one shape, whatever it does', () => {
    renderPanel({ skip: true });
    const quiet = barButtons().filter((b) => skin(b).minHeight !== '54px');
    expect(quiet.map(named)).toEqual(['Anhören', 'Langsam anhören', 'Diesmal überspringen']);
    for (const button of quiet) {
      const box = skin(button);
      // One size (and a 44 pt touch target), one roundness, no outline. Before this,
      // listening was an outlined 12 pt box and skipping a 48 pt ghost button — three
      // shapes for three things that are all "quietly available".
      expect(box.minHeight, named(button)).toBe('44px');
      expect(box.borderTopLeftRadius, named(button)).toBe('22px');
      expect(box.borderTopWidth, named(button)).toBe('0px');
    }
  });

  it('offers listening once, with "langsam" as its variant rather than a second way', () => {
    renderPanel({ skip: true });
    const listen = screen.getByRole('button', { name: 'Anhören' });
    const slow = screen.getByRole('button', { name: 'Langsam anhören' });

    // What stands on them: the action, and a modifier of it. A screen reader still hears
    // the whole thing ("Langsam anhören") — the short word is for the eye.
    expect(listen.textContent).toBe('Anhören');
    expect(slow.textContent).toBe('Langsam');

    // And they are not of equal rank. Two signals, neither of them colour alone: only the
    // listening itself carries a fill and the speaker icon.
    expect(skin(listen).backgroundColor).not.toBe(TRANSPARENT);
    expect(skin(slow).backgroundColor).toBe(TRANSPARENT);
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
    expect(leading().map(named)).toEqual(['Aufnahme beenden und an Buddy schicken']);
    expect(skin(leading()[0]!).borderTopLeftRadius).toBe('27px');
    // Hearing it is still there but waits (her own voice is being recorded), and the way
    // past the sentence is gone until she stops: nothing competes with "Fertig".
    for (const name of ['Anhören', 'Langsam anhören']) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled, name).toBe(true);
    }
    expect(screen.queryByRole('button', { name: 'Diesmal überspringen' })).toBeNull();
  });
});
