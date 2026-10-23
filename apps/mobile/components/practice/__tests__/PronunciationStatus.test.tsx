// requires live verification in Claude Code session (pack storage replaced)
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderInApp } from '../../../testing/render.js';
import { PronunciationStatus } from '../PronunciationStatus.js';
import { useLocalPronunciation } from '../../../lib/speech/usePronunciation.js';
import type { PackState } from '../../../lib/speech/pronunciationPacks.js';
const packs = vi.hoisted(() => ({ state: vi.fn(), install: vi.fn() }));
vi.mock('../../../lib/speech/pronunciation.js', () => ({ pronunciationPacks: packs }));

describe('shared pronunciation disclosure and first-use download', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('shows the current download phase and online recording path together', () => {
    renderInApp(<PronunciationStatus local={false} pack={{ state: 'verifying' }} />);
    expect(
      screen.getByText(/Prüfsumme wird geprüft.*Online: Aufnahme wird gesendet/),
    ).toBeDefined();
  });
  it('discloses fallback before a ready local recording', () => {
    renderInApp(<PronunciationStatus local pack={{ state: 'ready', path: '/pack' }} />);
    expect(screen.getByText('Auf dem Gerät; bei Unsicherheit wird Audio gesendet.')).toBeDefined();
  });
  it.each(['missing', 'downloading', 'verifying', 'installing'])(
    'joins a %s pack and selects local only after verification finishes',
    async (state) => {
      packs.state.mockResolvedValue({ state });
      let finish: (state: PackState) => void = () => {};
      packs.install.mockImplementation((_lang: string, phase: (state: PackState) => void) => {
        phase({ state: 'verifying' });
        return new Promise<PackState>((resolve) => {
          finish = resolve;
        });
      });
      const { result } = renderHook(() => useLocalPronunciation('es'));
      await waitFor(() => expect(result.current.pack.state).toBe('verifying'));
      expect(result.current.local).toBe(false);
      await act(async () => finish({ state: 'ready', path: '/verified' }));
      expect(result.current.local).toBe(true);
      expect(packs.install).toHaveBeenCalledWith('es', expect.any(Function));
    },
  );
  it('does not download on web or when no prepared plan exists', async () => {
    packs.state.mockResolvedValue({ state: 'unavailable' });
    const { result } = renderHook(() => useLocalPronunciation('en'));
    await waitFor(() => expect(packs.state).toHaveBeenCalled());
    expect(result.current.local).toBe(false);
    expect(packs.install).not.toHaveBeenCalled();
  });
});
