// The transport alone fails; the real controller must fetch the corrected offer reply.
// requires live verification in Claude Code session
import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ApiError } from '../../../lib/api/apiError.js';
import { queryClient, keys } from '../../../lib/api/queries.js';
import { startTopic } from '../../../lib/api/learningEndpoints.js';
import { useStartTopic } from '../useStartTopic.js';

vi.mock('../../../lib/api/learningEndpoints.js', () => ({ startTopic: vi.fn() }));

it('refreshes the offer and its corrected reply when starting it is refused', async () => {
  vi.mocked(startTopic).mockRejectedValueOnce(
    new ApiError('invalid_input', 'Nothing to prepare', 422, { reason: 'not_usable' }),
  );
  const refresh = vi.spyOn(queryClient, 'invalidateQueries');
  const { result } = renderHook(() => useStartTopic());
  await act(async () => {
    expect(
      await result.current.start('practice', 'Units', '00000000-0000-4000-8000-000000000001'),
    ).toBeNull();
  });
  expect(result.current.state).toEqual({ status: 'not_usable' });
  expect(refresh).toHaveBeenCalledWith({ queryKey: keys.home });
});
