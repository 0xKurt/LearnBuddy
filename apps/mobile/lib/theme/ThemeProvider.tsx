// Which palette the app wears (issue #29, layer 1). The choice lives on this device and
// survives restarts; it is applied before the first screen renders, so nothing flashes in
// the old colours.
//
// Storage goes through lib/api/outboxStorage (which has a .web.ts twin) — importing
// AsyncStorage directly here would break the web bundle (issue #43).

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { readItem, writeItem } from '../api/outboxStorage.js';
import { activeTheme, applyPalette, onPaletteApplied } from './colors.js';
import {
  figureOf,
  paletteOf,
  THEME_NAMES,
  toneBgOf,
  toneDeepOf,
  type Figure,
  type Palette,
  type SubjectTone,
  type ThemeName,
} from './palettes.js';

const KEY = 'lb.theme';

type ThemeContext = {
  name: ThemeName;
  /** Every colour token of the palette in use — read at render time, never held in a module. */
  palette: Palette;
  /** The pastel tints a subject card or a toned button wears. */
  tones: { bg: Record<SubjectTone, string>; deep: Record<SubjectTone, string> };
  /** Figure ink for questions (components/math/FigureView.tsx). */
  figure: Figure;
  /** Switches the palette for this device (kept across restarts). */
  choose: (name: ThemeName) => void;
};

function contextOf(name: ThemeName, choose: (name: ThemeName) => void): ThemeContext {
  const palette = paletteOf(name);
  return {
    name,
    palette,
    tones: { bg: toneBgOf(palette), deep: toneDeepOf(palette) },
    figure: figureOf(palette),
    choose,
  };
}

const Ctx = createContext<ThemeContext | null>(null);

/** At start-up, before the first screen: an earlier choice applies again. */
export async function restoreTheme(): Promise<void> {
  const kept = (await readItem(KEY).catch(() => null)) as ThemeName | null;
  if (kept && THEME_NAMES.includes(kept)) applyPalette(kept);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // The applied palette is the single truth, and the provider mirrors it — it must not keep
  // a copy of its own: `restoreTheme()` runs from the root screen's effect, after this
  // provider has mounted, so a remembered choice would otherwise never reach the tree.
  const name = useSyncExternalStore(onPaletteApplied, activeTheme, activeTheme);

  const choose = useCallback((next: ThemeName) => {
    // The tokens change first, the tree re-renders right after: no screen shows half of
    // the old palette (lib/theme/colors.ts).
    applyPalette(next);
    void writeItem(KEY, next).catch(() => undefined);
  }, []);

  const value = useMemo<ThemeContext>(() => contextOf(name, choose), [name, choose]);
  // `key` remounts the tree on a change, so styles built once in a component's body
  // (a StyleSheet in a module, a memo) cannot keep the old colours.
  return (
    <Ctx.Provider value={value}>
      <Ctx.Consumer>{() => <ThemeScope key={name}>{children}</ThemeScope>}</Ctx.Consumer>
    </Ctx.Provider>
  );
}

function ThemeScope({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

/**
 * The colours to paint with. Above the provider (the root frame in app/_layout.tsx) there is
 * no context yet: the palette that is applied answers instead — the one an earlier choice
 * restored, not the default, so nothing outside the provider shows another theme's colours.
 */
export function useTheme(): ThemeContext {
  const ctx = useContext(Ctx);
  return ctx ?? contextOf(activeTheme(), () => undefined);
}
