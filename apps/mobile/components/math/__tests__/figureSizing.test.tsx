// The card waits for its drawings (issue #501): its own height counts only once every drawing in
// it has its size. Proven on the hooks alone — who reports, when the container hears it.

import { act, renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import {
  FigureSizingReport,
  useFigureSizing,
  useReportSizing,
} from '../../../lib/math/figureSizing.js';

describe('a container whose drawings size themselves', () => {
  it('hears "sizing" until the last drawing has its size, and when one goes away', () => {
    const { result: card } = renderHook(() => useFigureSizing());
    const wrapper = ({ children }: { children: ReactNode }) => (
      <FigureSizingReport.Provider value={card.current.report}>
        {children}
      </FigureSizingReport.Provider>
    );
    const first = renderHook(({ sizing }) => useReportSizing(sizing), {
      initialProps: { sizing: true },
      wrapper,
    });
    const second = renderHook(({ sizing }) => useReportSizing(sizing), {
      initialProps: { sizing: true },
      wrapper,
    });
    expect(card.current.sizing).toBe(true);
    act(() => first.rerender({ sizing: false }));
    // One still on its way.
    expect(card.current.sizing).toBe(true);
    // Unmounted while sizing (the question changed): it no longer holds the card back.
    act(() => second.unmount());
    expect(card.current.sizing).toBe(false);
    // A new width: the drawing sizes itself again.
    act(() => first.rerender({ sizing: true }));
    expect(card.current.sizing).toBe(true);
  });

  it('a drawing nobody measures (the viewer, a list) reports to nobody', () => {
    const { result: card } = renderHook(() => useFigureSizing());
    const outside = renderHook(() => useReportSizing(true), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <FigureSizingReport.Provider value={null}>{children}</FigureSizingReport.Provider>
      ),
    });
    expect(card.current.sizing).toBe(false);
    outside.unmount();
  });

  it('the same report twice changes nothing (no extra render)', () => {
    const { result } = renderHook(() => useFigureSizing());
    const before = result.current;
    act(() => result.current.report('a', false));
    expect(result.current).toBe(before);
  });
});
