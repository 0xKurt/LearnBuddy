// Which palette the app wears (issue #29, layer 1). The choice lives on this device and
// survives restarts; it is applied before the first screen renders, so nothing flashes in
// the old colours.
//
// Storage goes through lib/api/outboxStorage (which has a .web.ts twin) — importing
// AsyncStorage directly here would break the web bundle (issue #43).

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { readItem, writeItem } from '../api/outboxStorage.js';
import { activeTheme, applyPalette } from './colors.js';
import { DEFAULT_THEME, paletteOf, THEME_NAMES, type Palette, type ThemeName } from './palettes.js';

const KEY = 'lb.theme';

type ThemeContext = {
  name: ThemeName;
  palette: Palette;
  /** Switches the palette for this device (kept across restarts). */
  choose: (name: ThemeName) => void;
};

const Ctx = createContext<ThemeContext | null>(null);

/** At start-up, before the first screen: an earlier choice applies again. */
export async function restoreTheme(): Promise<void> {
  const kept = (await readItem(KEY).catch(() => null)) as ThemeName | null;
  if (kept && THEME_NAMES.includes(kept)) applyPalette(kept);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [name, setName] = useState<ThemeName>(activeTheme());

  const choose = useCallback((next: ThemeName) => {
    // The tokens change first, the tree re-renders right after: no screen shows half of
    // the old palette (lib/theme/colors.ts).
    applyPalette(next);
    setName(next);
    void writeItem(KEY, next).catch(() => undefined);
  }, []);

  const value = useMemo<ThemeContext>(
    () => ({ name, palette: paletteOf(name), choose }),
    [name, choose],
  );
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

export function useTheme(): ThemeContext {
  return (
    useContext(Ctx) ?? {
      name: DEFAULT_THEME,
      palette: paletteOf(DEFAULT_THEME),
      choose: () => undefined,
    }
  );
}
