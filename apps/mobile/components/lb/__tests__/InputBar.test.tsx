import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import type { VoiceInput } from '../../voice/useVoiceInput.js';
import { Btn } from '../Btn.js';
import { InputBar } from '../InputBar.js';

vi.mock('../../../lib/theme/composer.js', () => ({
  COMPOSER: { slot: 40, rows: { tall: 3, roomy: 10, tight: 4 } },
}));
vi.mock('../../voice/MicButton.js', () => ({ MicButton: () => null, MicStatus: () => null }));

it('forwards the locked state as native editable=false to the sole text field', () => {
  renderInApp(<InputBar value="Draft" maxLength={100} accessibilityLabel="Nachricht" disabled />);
  expect((screen.getByRole('textbox', { name: 'Nachricht' }) as HTMLTextAreaElement).readOnly).toBe(
    true,
  );
});

it('preserves an explicitly read-only field even when the bar is unlocked', () => {
  renderInApp(
    <InputBar value="Draft" maxLength={100} accessibilityLabel="Nachricht" editable={false} />,
  );
  expect((screen.getByRole('textbox', { name: 'Nachricht' }) as HTMLTextAreaElement).readOnly).toBe(
    true,
  );
});

it('uses only the existing alternate primary while dictation is recording', () => {
  const voice = { state: 'recording' } as VoiceInput;
  renderInApp(
    <InputBar
      value="Draft"
      maxLength={100}
      accessibilityLabel="Nachricht"
      voice={voice}
      action={<Btn>Senden</Btn>}
      after={<Btn>Gespräch</Btn>}
    />,
  );
  expect(screen.queryByRole('button', { name: 'Senden' })).toBeNull();
  expect(
    screen
      .getByTestId('composer-primary')
      .contains(screen.getByRole('button', { name: 'Gespräch' })),
  ).toBe(true);
});
