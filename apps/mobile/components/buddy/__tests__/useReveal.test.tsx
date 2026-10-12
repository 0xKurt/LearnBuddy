import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { watchReducedMotion } from '../../../lib/theme/motion.js';
import { useReveal } from '../useReveal.js';
const os = vi.hoisted(() => ({ change: (_on: boolean) => {} }));
vi.mock('react-native', async (load) => ({
  ...(await load<Record<string, unknown>>()),
  AccessibilityInfo: {
    isReduceMotionEnabled: () => Promise.resolve(false),
    addEventListener: (_event: string, listener: (on: boolean) => void) => {
      os.change = listener;
      return {
        remove: () => {
          os.change = () => {};
        },
      };
    },
  },
}));
afterEach(() => vi.unstubAllGlobals());
it('settles an in-flight reveal on the live OS event, preserves arrived/null/replacement boundaries and resumes future chunks', async () => {
  const frames = new Map<number, FrameRequestCallback>();
  let id = 0;
  vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => {
    frames.set(++id, frame);
    return id;
  });
  const cancel = vi.fn((frame: number) => frames.delete(frame));
  vi.stubGlobal('cancelAnimationFrame', cancel);
  const stop = watchReducedMotion();
  let dispose = () => {};
  try {
    await act(async () => {});
    const text = 'Diese Antwort ist bisher tatsächlich vollständig angekommen.';
    const hook = renderHook(({ text }: { text: string | null }) => useReveal(text), {
      initialProps: { text: text as string | null },
    });
    dispose = hook.unmount;
    expect(hook.result.current).toBe('');
    expect(frames.size).toBe(1);
    const pendingFrame = [...frames.values()][0]!;
    act(() => os.change(true));
    expect(hook.result.current).toBe(text);
    expect(cancel).toHaveBeenCalled();
    expect(frames.size).toBe(0);
    act(() => pendingFrame(16));
    expect(hook.result.current).toBe(text);
    expect(frames.size).toBe(0);
    const extended = `${text} Nur dieser weitere Abschnitt ist jetzt angekommen.`;
    hook.rerender({ text: extended });
    expect(hook.result.current).toBe(extended);
    hook.rerender({ text: null });
    expect(hook.result.current).toBeNull();
    expect(frames.size).toBe(0);
    act(() => os.change(false));
    hook.rerender({ text: 'Eine neue Nachricht beginnt mit bereits angekommenen Wörtern.' });
    expect(hook.result.current).toBe('');
    expect(frames.size).toBe(1);
    const frame = [...frames.values()][0]!;
    frames.clear();
    act(() => frame(16));
    expect(hook.result.current!.length).toBeGreaterThan(0);
    expect(
      'Eine neue Nachricht beginnt mit bereits angekommenen Wörtern.'.startsWith(
        hook.result.current!,
      ),
    ).toBe(true);
  } finally {
    dispose();
    stop();
  }
});
