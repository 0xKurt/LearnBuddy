// Which palette the app wears (issue #29, layer 1). The choice lives on this device and
// survives restarts; it is applied before the first screen renders, so nothing flashes in
// the old colours.
//
// Since issue #140 the choice has TWO axes: a colour family and a mode. "Nacht" used to be
// one of five flat palettes, so picking dark meant giving up your colour — now blue stays
// blue in the dark, with blue highlights. The mode may also be `system`, which follows the
// phone, and that is the default: the app goes dark in the evening without anyone setting
// anything.
//
// Storage goes through lib/api/outboxStorage (which has a .web.ts twin) — importing
// AsyncStorage directly here would break the web bundle (issue #43).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { useColorScheme } from 'react-native';

import { readItem, writeItem } from '../api/outboxStorage.js';
import { activeTheme, applyPalette, onPaletteApplied } from './colors.js';
import {
  DEFAULT_FAMILY,
  DEFAULT_MODE,
  familyModeOf,
  figureOf,
  paletteOf,
  themeNameOf,
  toneBgOf,
  toneDeepOf,
  type Family,
  type Figure,
  type Mode,
  type Palette,
  type SubjectTone,
  type ThemeName,
} from './palettes.js';
import { applySystemChrome } from './systemChrome.js';

/** Pre-#140 this held one palette name; it now holds the family, and the mode sits beside it. */
const KEY = 'lb.theme';
const MODE_KEY = 'lb.themeMode';

type ThemeContext = {
  name: ThemeName;
  /** Every colour token of the palette in use — read at render time, never held in a module. */
  palette: Palette;
  /** The pastel tints a subject card or a toned button wears. */
  tones: { bg: Record<SubjectTone, string>; deep: Record<SubjectTone, string> };
  /** Figure ink for questions (components/math/FigureView.tsx). */
  figure: Figure;
  /** The colour family in use, and whether dark was chosen or comes from the phone. */
  family: Family;
  mode: Mode;
  /** Switches the family, the mode, or both (kept on this device across restarts). */
  choose: (next: { family?: Family; mode?: Mode }) => void;
};

function contextOf(
  name: ThemeName,
  family: Family,
  mode: Mode,
  choose: ThemeContext['choose'],
): ThemeContext {
  const palette = paletteOf(name);
  return {
    name,
    family,
    mode,
    palette,
    tones: { bg: toneBgOf(palette), deep: toneDeepOf(palette) },
    figure: figureOf(palette),
    choose,
  };
}

const Ctx = createContext<ThemeContext | null>(null);

/**
 * At start-up, before the first screen: an earlier choice applies again. It runs from
 * `app/_layout.tsx` while the loading screen is up — after this provider already mounted
 * with the default. Applying is all it takes: the provider subscribes to the applied
 * palette, so it follows instead of holding a stale name until she happens to open the
 * look settings (and, since #36, instead of leaving the system chrome in the default).
 */
/** What is on this device, with a pre-#140 value read as what it used to show. */
export async function keptChoice(): Promise<{ family: Family; mode: Mode }> {
  const [family, mode] = await Promise.all([
    readItem(KEY).catch(() => null),
    readItem(MODE_KEY).catch(() => null),
  ]);
  // No mode stored: either nothing was ever chosen, or this device predates the two axes.
  // `familyModeOf` answers both — an old "night" becomes pastell + dark, which is what it
  // was showing.
  if (mode === null) return familyModeOf(family);
  return {
    family: (family as Family | null) ?? DEFAULT_FAMILY,
    mode: (mode as Mode | null) ?? DEFAULT_MODE,
  };
}

export async function restoreTheme(): Promise<void> {
  const { family, mode } = await keptChoice();
  // `system` cannot be resolved here — there is no component to read the scheme from, and
  // the provider applies it on its first render anyway. Light is the safer guess for the
  // instant before that.
  applyPalette(themeNameOf(family, mode === 'dark'));
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // The applied palette is the single truth, and the provider mirrors it — it must not keep
  // a copy of its own: `restoreTheme()` runs from the root screen's effect, after this
  // provider has mounted, so a remembered choice would otherwise never reach the tree.
  const name = useSyncExternalStore(onPaletteApplied, activeTheme, activeTheme);
  const [family, setFamily] = useState<Family>(DEFAULT_FAMILY);
  const [mode, setMode] = useState<Mode>(DEFAULT_MODE);
  const scheme = useColorScheme();
  const dark = mode === 'system' ? scheme === 'dark' : mode === 'dark';

  // What this device kept, once, and then whenever the phone's own scheme turns while the
  // mode follows it.
  useEffect(() => {
    let alive = true;
    void keptChoice().then((kept) => {
      if (!alive) return;
      setFamily(kept.family);
      setMode(kept.mode);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    applyPalette(themeNameOf(family, dark));
  }, [family, dark]);

  // The window behind the app and Android's navigation bar wear the palette too — on the
  // first render and on every change (lib/theme/systemChrome.ts).
  useEffect(() => {
    applySystemChrome();
  }, [name]);

  const choose = useCallback<ThemeContext['choose']>((next) => {
    // The tokens change through the effect above, so a screen never shows half of the old
    // palette (lib/theme/colors.ts) and `system` keeps working on either axis.
    if (next.family !== undefined) {
      setFamily(next.family);
      void writeItem(KEY, next.family).catch(() => undefined);
    }
    if (next.mode !== undefined) {
      setMode(next.mode);
      void writeItem(MODE_KEY, next.mode).catch(() => undefined);
    }
  }, []);

  const value = useMemo<ThemeContext>(
    () => contextOf(name, family, mode, choose),
    [name, family, mode, choose],
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

/**
 * The colours to paint with. Above the provider (the root frame in app/_layout.tsx) there is
 * no context yet: the palette that is applied answers instead — the one an earlier choice
 * restored, not the default, so nothing outside the provider shows another theme's colours.
 */
export function useTheme(): ThemeContext {
  const ctx = useContext(Ctx);
  // Outside the provider there is no choice to mirror — the applied palette is all there
  // is, so the axes are read back off its key.
  const name = activeTheme();
  const dark = name.endsWith('Dark');
  const family = (dark ? name.slice(0, -4) : name) as Family;
  return ctx ?? contextOf(name, family, dark ? 'dark' : 'light', () => undefined);
}
