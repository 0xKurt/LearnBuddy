// The card waits for its drawings and grows no taller than they can use (issue #501): its own
// height counts only once every drawing in it has its size, and each drawing says how tall it
// stands at full size. Proven on the hooks alone — who reports, what the container hears.

import { act, renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import {
  FigureSizingReport,
  useDrawingNatural,
  useFigureSizing,
  useReportSizing,
} from '../../../lib/math/figureSizing.js';

describe('a container whose drawings size themselves', () => {
  it('hears "sizing" until the last drawing has its size, then their natural height', () => {
    const { result: card } = renderHook(() => useFigureSizing());
    const wrapper = ({ children }: { children: ReactNode }) => (
      <FigureSizingReport.Provider value={card.current.value}>
        {children}
      </FigureSizingReport.Provider>
    );
    const first = renderHook(({ natural }) => useReportSizing(natural), {
      initialProps: { natural: null as number | null },
      wrapper,
    });
    const second = renderHook(({ natural }) => useReportSizing(natural), {
      initialProps: { natural: null as number | null },
      wrapper,
    });
    expect(card.current.sizing).toBe(true);
    act(() => first.rerender({ natural: 256 }));
    // One still on its way.
    expect(card.current.sizing).toBe(true);
    // Unmounted while sizing (the question changed): it no longer holds the card back.
    act(() => second.unmount());
    expect(card.current).toMatchObject({ sizing: false, natural: 256 });
    // A new width: the drawing sizes itself again, and its old height no longer counts.
    act(() => first.rerender({ natural: null }));
    expect(card.current).toMatchObject({ sizing: true, natural: 0 });
    act(() => first.unmount());
    expect(card.current).toMatchObject({ sizing: false, natural: 0 });
  });

  it('tells the drawings around it how tall they stand at full size', () => {
    const { result: card } = renderHook(() => useFigureSizing());
    act(() => card.current.value.report('a', 180));
    const { result } = renderHook(() => useDrawingNatural(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <FigureSizingReport.Provider value={card.current.value}>
          {children}
        </FigureSizingReport.Provider>
      ),
    });
    expect(result.current).toBe(180);
  });

  it('a drawing nobody measures (the viewer, a list) reports to nobody', () => {
    const { result: card } = renderHook(() => useFigureSizing());
    const outside = renderHook(() => useReportSizing(null), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <FigureSizingReport.Provider value={null}>{children}</FigureSizingReport.Provider>
      ),
    });
    expect(card.current.sizing).toBe(false);
    expect(renderHook(() => useDrawingNatural()).result.current).toBe(0);
    outside.unmount();
  });

  it('the same report twice changes nothing (no extra render)', () => {
    const { result } = renderHook(() => useFigureSizing());
    act(() => result.current.value.report('a', 120));
    const before = result.current.value;
    act(() => result.current.value.report('a', 120));
    expect(result.current.value).toBe(before);
  });
});
