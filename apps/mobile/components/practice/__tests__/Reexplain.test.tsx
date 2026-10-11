import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderInApp } from '../../../testing/render.js';
import { CheckOverrideProvider, useCheckOverride } from '../CheckOverride.js';
import { Reexplain } from '../Reexplain.js';
const REASONS = [
  'Mal heißt: so oft die gleiche Zahl zusammenzählen.',
  'Beim Malnehmen zählt man die beiden Zahlen zusammen.',
  'Die größere Zahl gewinnt immer.',
];
function Primary() {
  const action = useCheckOverride();
  return action && 'ready' in action ? (
    <button disabled={action.disabled || !action.ready} onClick={action.onPress}>
      Check reason
    </button>
  ) : (
    <button>Next</button>
  );
}
describe('Reexplain — reason draft and primary override', () => {
  it('checks once, keeps the selection after failure and restores Next after completion', () => {
    const onAsk = vi.fn();
    const ui = (pending: 'why' | null, why: readonly string[] | null = REASONS) => (
      <CheckOverrideProvider>
        <Primary />
        <Reexplain
          draftKey="reason.test"
          turns={[]}
          pending={pending}
          disabled={pending !== null}
          onAsk={onAsk}
          why={why}
          delay={0}
        />
      </CheckOverrideProvider>
    );
    const { rerender } = renderInApp(ui(null));
    fireEvent.click(screen.getByRole('button', { name: 'Warum stimmt das?' }));
    expect(screen.getByRole('button', { name: 'Check reason' }).hasAttribute('disabled')).toBe(
      true,
    );
    fireEvent.click(screen.getByRole('radio', { name: REASONS[1]! }));
    expect(onAsk).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Check reason' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check reason' }));
    expect(onAsk).toHaveBeenCalledTimes(1);
    expect(onAsk).toHaveBeenCalledWith('why', 1);
    rerender(ui('why'));
    rerender(ui(null));
    expect(screen.getByRole('radio', { name: REASONS[1]! }).getAttribute('aria-checked')).toBe(
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Check reason' }));
    expect(onAsk).toHaveBeenCalledTimes(2);
    rerender(ui(null, null));
    expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy();
  });
  it('allows immediate rejection retry without a pending render and clears on unmount', async () => {
    const onAsk = vi.fn().mockRejectedValue(new Error('offline'));
    const { unmount } = renderInApp(
      <CheckOverrideProvider>
        <Primary />
        <Reexplain
          draftKey="reason.immediate"
          turns={[]}
          pending={null}
          disabled={false}
          onAsk={onAsk}
          why={REASONS}
          delay={0}
        />
      </CheckOverrideProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Warum stimmt das?' }));
    fireEvent.click(screen.getByRole('radio', { name: REASONS[0]! }));
    fireEvent.click(screen.getByRole('button', { name: 'Check reason' }));
    await waitFor(() => expect(onAsk).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    fireEvent.click(screen.getByRole('button', { name: 'Check reason' }));
    expect(onAsk).toHaveBeenCalledTimes(2);
    unmount();
  });
  it('restores the existing primary when the reason panel unmounts', () => {
    const onAsk = vi.fn();
    const ui = (show: boolean) => (
      <CheckOverrideProvider>
        <Primary />
        {show ? (
          <Reexplain
            draftKey="reason.cleanup"
            turns={[]}
            pending={null}
            disabled={false}
            onAsk={onAsk}
            why={REASONS}
            delay={0}
          />
        ) : null}
      </CheckOverrideProvider>
    );
    const { rerender } = renderInApp(ui(true));
    fireEvent.click(screen.getByRole('button', { name: 'Warum stimmt das?' }));
    expect(screen.getByRole('button', { name: 'Check reason' })).toBeTruthy();
    rerender(ui(false));
    expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy();
  });
  it('keeps the existing explanatory action without reasons', () => {
    const onAsk = vi.fn();
    renderInApp(
      <Reexplain
        draftKey="reason.none"
        turns={[]}
        pending={null}
        disabled={false}
        delay={0}
        onAsk={onAsk}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Warum ist das so?' }));
    expect(onAsk).toHaveBeenCalledWith('why');
  });
});
