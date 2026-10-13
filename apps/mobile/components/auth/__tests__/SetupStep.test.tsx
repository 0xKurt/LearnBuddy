import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { renderInApp, styleOf } from '../../../testing/render.js';
import { GUTTER_OUTER } from '../../../lib/theme/space.js';
import { SetupStep } from '../SetupStep.js';
vi.mock('../../lb/BuddyOrb.js', () => ({
  BuddyOrb: ({ state }: { state?: string }) => <div data-testid="setup-orb" data-state={state} />,
}));
vi.mock('../../lb/KeyboardSafe.js', () => ({
  KeyboardSafe: ({ children }: { children: ReactNode }) => (
    <div data-testid="keyboard-safe">{children}</div>
  ),
}));
describe('SetupStep editable form shell', () => {
  it('keeps both fields and pinned footer inside one keyboard avoider', () => {
    renderInApp(
      <SetupStep keyboardSafe title="Profile" footer={<button>Continue</button>}>
        <input aria-label="Name" />
      </SetupStep>,
    );
    const safe = screen.getByTestId('keyboard-safe');
    expect(safe.contains(screen.getByLabelText('Name'))).toBe(true);
    expect(safe.contains(screen.getByRole('button', { name: 'Continue' }))).toBe(true);
    expect(screen.getAllByTestId('keyboard-safe')).toHaveLength(1);
  });
  it('keeps the noneditable default free of a keyboard avoider', () => {
    renderInApp(
      <SetupStep title="Step" footer={<button>Continue</button>}>
        <Text>Copy</Text>
      </SetupStep>,
    );
    expect(screen.queryByTestId('keyboard-safe')).toBeNull();
  });
});

it('forwards a caller-owned Orb state without introducing shell state', () => {
  const { rerender } = renderInApp(
    <SetupStep orbState="happy" title="Done" footer={null}>
      <Text>Copy</Text>
    </SetupStep>,
  );
  expect(screen.getByTestId('setup-orb').dataset.state).toBe('happy');
  rerender(
    <SetupStep orbState="idle" title="Intro" footer={null}>
      <Text>Copy</Text>
    </SetupStep>,
  );
  expect(screen.getByTestId('setup-orb').dataset.state).toBe('idle');
});

// Design ui_kits/app/Onboarding.jsx `OnbPage`: the orb is the first thing on the page, the count
// stands at its right in the design's words ("2 von 4"), and the page keeps the margin of the
// pages before the app (tokens/space.css `--space-gutter`, 20).
describe('SetupStep as the design’s page', () => {
  it('says which of the four it is in the design’s words, and nothing where it is none', () => {
    const { rerender } = renderInApp(
      <SetupStep step="profile" title="Eltern" footer={null}>
        <Text>Fields</Text>
      </SetupStep>,
    );
    expect(screen.getByTestId('setup-step').textContent).toBe('2 von 4');
    rerender(
      <SetupStep step="look" title="Farben" footer={null}>
        <Text>Tiles</Text>
      </SetupStep>,
    );
    expect(screen.getByTestId('setup-step').textContent).toBe('4 von 4');
    rerender(
      <SetupStep title="Sag es Buddy einfach" footer={null}>
        <Text>Card</Text>
      </SetupStep>,
    );
    expect(screen.queryByTestId('setup-step')).toBeNull();
    expect(screen.queryByText(/Schritt/)).toBeNull();
  });

  it('keeps the margin before the app around the page and under it', () => {
    renderInApp(
      <SetupStep title="Step" footer={<button>Continue</button>}>
        <Text>Copy</Text>
      </SetupStep>,
    );
    const margin = `${GUTTER_OUTER}px`;
    expect(margin).toBe('20px');
    const page = screen.getByRole('heading', { name: 'Step' }).parentElement!.parentElement!;
    expect(styleOf(page).paddingLeft).toBe(margin);
    expect(styleOf(page).paddingRight).toBe(margin);
    const bar = screen.getByRole('button', { name: 'Continue' }).parentElement!;
    expect(styleOf(bar).paddingLeft).toBe(margin);
    expect(styleOf(bar).paddingRight).toBe(margin);
  });

  it('puts nothing above the orb: the page starts with Buddy', () => {
    renderInApp(
      <SetupStep title="Parent" footer={<button>Zurück</button>}>
        <Text>Fields</Text>
      </SetupStep>,
    );
    const orb = screen.getByTestId('setup-orb');
    const back = screen.getByRole('button', { name: 'Zurück' });
    // DOCUMENT_POSITION_FOLLOWING: the way back comes after the orb, in the bar below.
    expect(orb.compareDocumentPosition(back) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
