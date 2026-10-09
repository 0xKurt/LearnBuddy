// Whether a drawing still sizes itself (issue #501). `FigureView` measures, then scales: it lays
// out at its width, measures its natural height, and only then stands at the size it keeps. Until
// then its frame holds a placeholder, and anything that measures the drawing's container measures
// that placeholder — the practice card took it as its own height, so the room it grew into
// depended on which measurement landed first: a dark shot of the Hunderterfeld stood grown in one
// run and not in the next. A container that measures provides `FigureSizingReport`; every drawing
// inside reports to it, and `useFigureSizing` says whether any of them is still on its way.

import { createContext, useCallback, useContext, useId, useLayoutEffect, useState } from 'react';

type Report = (id: string, sizing: boolean) => void;

/** Where the drawings inside report; null: nobody measures them (the default). */
export const FigureSizingReport = createContext<Report | null>(null);

/**
 * One drawing's part: says while it sizes itself, and that it stopped when it goes. Before the
 * frame is painted (a layout effect), so no layout event of the container sees the placeholder
 * before the report.
 */
export function useReportSizing(sizing: boolean): void {
  const report = useContext(FigureSizingReport);
  const id = useId();
  useLayoutEffect(() => {
    report?.(id, sizing);
  }, [report, id, sizing]);
  useLayoutEffect(() => () => report?.(id, false), [report, id]);
}

/** The measuring container's part: whether any drawing inside still sizes itself, and its report. */
export function useFigureSizing(): { sizing: boolean; report: Report } {
  const [ids, setIds] = useState<ReadonlySet<string>>(new Set());
  const report = useCallback<Report>((id, sizing) => {
    setIds((now) => {
      if (now.has(id) === sizing) return now;
      const next = new Set(now);
      if (sizing) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  return { sizing: ids.size > 0, report };
}
