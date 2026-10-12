// Real mounted action controller: a delegated modal error must not also toast behind it.
import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderInApp } from '../../../testing/render.js';
import { useHomeAct } from '../../../lib/buddy/useHomeAct.js';
import { ApiError } from '../../../lib/api/apiError.js';
import { messageFor } from '../../../lib/errors.js';
import { toast } from '../../lb/Toast.js';

const show = vi.spyOn(toast, 'show');
beforeEach(() => show.mockClear());

function Probe({
  request,
  onError,
}: {
  request: () => Promise<void>;
  onError?: (text: string) => void;
}) {
  const { busy, act: run } = useHomeAct();
  return (
    <button disabled={busy} onClick={() => void run(request, onError)}>
      Request
    </button>
  );
}

it('keeps default action failures in the existing toast and unlocks the controller', async () => {
  const failure = new ApiError('network', 'transport failed', 0);
  let reject!: (error: unknown) => void;
  const request = () =>
    new Promise<void>((_, no) => {
      reject = no;
    });
  renderInApp(<Probe request={request} />);
  fireEvent.click(screen.getByRole('button', { name: 'Request' }));
  expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true);
  await act(async () => reject(failure));
  expect(show).toHaveBeenCalledWith(messageFor(failure), 'error');
  expect(screen.getByRole('button').hasAttribute('disabled')).toBe(false);
});

it('routes delegated undo failure once to the modal and preserves retry without a hidden toast', async () => {
  const failure = new ApiError('network', 'transport failed', 0);
  const onError = vi.fn();
  const request = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce(undefined);
  renderInApp(<Probe request={request} onError={onError} />);
  await act(async () => fireEvent.click(screen.getByRole('button')));
  expect(onError).toHaveBeenCalledTimes(1);
  expect(onError).toHaveBeenCalledWith(messageFor(failure));
  expect(show).not.toHaveBeenCalled();
  expect(screen.getByRole('button').hasAttribute('disabled')).toBe(false);
  await act(async () => fireEvent.click(screen.getByRole('button')));
  expect(request).toHaveBeenCalledTimes(2);
  expect(onError).toHaveBeenCalledTimes(1);
});
