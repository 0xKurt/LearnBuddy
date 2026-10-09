// Whether a drawing still sizes itself, and how tall it stands at full size (issue #501).
// `FigureView` measures, then scales: it lays out at its width, measures its natural height, and
// only then stands at the size it keeps. Until then its frame holds a placeholder, and anything that
// measures the drawing's container measures that placeholder — the practice card took it as its
// own height, so the room it grew into depended on which measurement landed first: a dark shot of
// the Hunderterfeld stood grown in one run and not in the next. A container that measures provides
// `FigureSizingReport`; every drawing inside reports to it — null while it sizes itself, then its
// natural height — and `useFigureSizing` says whether any is still on its way and how tall the
// tallest stands at full size. The card grows no further than that (`useDrawingNatural`): a drawing
// is never drawn larger than its natural size, so more room was only an empty band around it.

import {
  createContext,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';

/** A drawing's natural height, or null while it sizes itself. */
type Report = (id: string, natural: number | null) => void;
type Sizing = { report: Report; natural: number };

/** Where the drawings inside report; null: nobody measures them (the default). */
export const FigureSizingReport = createContext<Sizing | null>(null);

/**
 * One drawing's part: null while it sizes itself, then its natural height; nothing once it goes.
 * Before the frame is painted (a layout effect), so no layout event of the container sees the
 * placeholder before the report.
 */
export function useReportSizing(natural: number | null): void {
  const report = useContext(FigureSizingReport)?.report;
  const id = useId();
  useLayoutEffect(() => {
    report?.(id, natural);
  }, [report, id, natural]);
  useLayoutEffect(() => () => report?.(id, 0), [report, id]);
}

/** The natural height of the drawings around (0: none, or nobody measures them). */
export function useDrawingNatural(): number {
  return useContext(FigureSizingReport)?.natural ?? 0;
}

/**
 * The measuring container's part: whether any drawing inside still sizes itself, the tallest
 * natural height among them, and the value to provide (`FigureSizingReport`).
 */
export function useFigureSizing(): { sizing: boolean; natural: number; value: Sizing } {
  const [drawings, setDrawings] = useState<ReadonlyMap<string, number | null>>(new Map());
  const report = useCallback<Report>((id, natural) => {
    setDrawings((now) => {
      // 0: the drawing went (or has no height): it no longer counts.
      if (natural === 0) {
        if (!now.has(id)) return now;
        const next = new Map(now);
        next.delete(id);
        return next;
      }
      if (now.has(id) && now.get(id) === natural) return now;
      return new Map(now).set(id, natural);
    });
  }, []);
  const values = [...drawings.values()];
  const sizing = values.includes(null);
  const natural = Math.max(0, ...values.map((v) => v ?? 0));
  const value = useMemo(() => ({ report, natural }), [report, natural]);
  return { sizing, natural, value };
}
