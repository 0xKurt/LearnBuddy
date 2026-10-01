// requires live verification in Claude Code session — the microphone is replaced here
// (CLAUDE.md rule 8: the outside world may be, the database never).
//
// The state under test is the one the owner hit on 01.10.: the microphone is refused, and the
// big button still said "Sprechen". He pressed it, nothing happened, and he wrote "der
// sprechen button funktioniert nicht. kp wieso" (issue #185). The explanation was on screen —
// three rows above, with two "Anhören" buttons in between.
//
// No other layer can reach this. The browser walkthrough launches Chromium with
// `--use-fake-ui-for-media-stream`, which grants the microphone on purpose so the
// conversation loop can run; a refused one is exactly what it cannot produce. On a device it
// takes a hand (and on MIUI a system dialog, .maestro/README.md). Here it is a value.

import type { ItemView } from '@learnbuddy/shared-types/contracts';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { SpeakPanel } from '../SpeakPanel.js';

/** Set per test: what the recorder reports about the microphone. */
const recorder = vi.hoisted(() => ({
  denied: null as { canAskAgain: boolean } | null,
  start: vi.fn(),
  stop: vi.fn(),
  cancel: vi.fn(),
}));

/** Which platform the panel believes it is on, and the settings screen it may open. */
const platform = vi.hoisted(() => ({ os: 'ios', openSettings: vi.fn() }));

vi.mock('../../../lib/speech/record.js', () => ({
  useRecording: () => ({
    phase: 'idle' as const,
    elapsedMs: 0,
    maxMs: 30_000,
    level: 0,
    denied: recorder.denied,
    start: recorder.start,
    stop: recorder.stop,
    cancel: recorder.cancel,
  }),
}));

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
  figure: null,
  image: null,
  tap_choices: null,
};

function renderPanel() {
  return renderInApp(
    <SpeakPanel
      item={ITEM}
      sessionId="55555555-5555-4555-8555-555555555555"
      hasFeedback={false}
      disabled={false}
      onResult={() => undefined}
    />,
  );
}

beforeEach(() => {
  recorder.denied = null;
  platform.os = 'ios';
  platform.openSettings.mockReset();
  recorder.start.mockReset();
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
