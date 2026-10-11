import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { renderInApp } from '../../../testing/render.js';
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
      <SetupStep
        variant="onboarding"
        keyboardSafe
        title="Profile"
        footer={<button>Continue</button>}
      >
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
    <SetupStep variant="onboarding" orbState="happy" title="Done" footer={null}>
      <Text>Copy</Text>
    </SetupStep>,
  );
  expect(screen.getByTestId('setup-orb').dataset.state).toBe('happy');
  rerender(
    <SetupStep variant="onboarding" orbState="idle" title="Intro" footer={null}>
      <Text>Copy</Text>
    </SetupStep>,
  );
  expect(screen.getByTestId('setup-orb').dataset.state).toBe('idle');
});
