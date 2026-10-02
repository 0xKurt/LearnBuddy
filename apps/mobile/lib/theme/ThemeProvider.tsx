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
  FAMILIES,
  MODES,
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
import { applySystemChrome, applySystemScheme } from './systemChrome.js';
import { applyBoldText } from './type.js';
import { useA11ySettings } from '../a11ySettings.js';

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
  return { family: familyOf(family), mode: modeOf(mode) };
}

/**
 * What is on the device is text, and text can be anything (issue #172).
 *
 * This used to be `family as Family`, and the cast lied. A device that had chosen a colour
 * BEFORE #140 holds the old palette name — `pastellSoft` — and as soon as a mode was stored
 * beside it, that name was taken at face value as a family. `themeNameOf('pastellSoft',
 * true)` is `'pastellSoftDark'`, which is in no palette, so `paletteOf` fell back to the
 * light default: the owner switched to dark on 01.10. and **nothing happened**, while every
 * colour preview showed a palette the app was not in.
 *
 * So it is read, not asserted. An unknown value is translated if it is an old name
 * (`familyModeOf`) and otherwise falls back — never carried on as if it were valid.
 */
function familyOf(stored: string | null): Family {
  if (stored !== null && (FAMILIES as readonly string[]).includes(stored)) return stored as Family;
  return familyModeOf(stored).family;
}

function modeOf(stored: string | null): Mode {
  return stored !== null && (MODES as readonly string[]).includes(stored)
    ? (stored as Mode)
    : DEFAULT_MODE;
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

  // The OS learns which side she chose, or that the phone decides (lib/theme/systemScheme.ts):
  // a sheet's navigation bar, the keyboard and alerts follow it (#177). For `system` it must
  // hand control back — `useColorScheme()` above reports any override as the phone's answer.
  useEffect(() => {
    applySystemScheme(mode);
  }, [mode]);

  // The OS's Bold Text setting reaches the whole type scale from here (issue #133
  // position 13): the style objects are refilled in place, like a palette change, so no
  // component has to know about it.
  const { boldText } = useA11ySettings();
  useEffect(() => {
    applyBoldText(boldText, paletteOf(name));
  }, [boldText, name]);

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
  // `key` remounts the tree when the palette changes, and it has to (issues #84, #148, #171).
  //
  // The colour tokens (LB, TYPE, SHADOW, TONE_*) are refilled IN PLACE so a held reference
  // sees the new palette. That is necessary and not sufficient: a component that passes a
  // token object straight through — `style={TYPE.title}` — keeps the same object identity,
  // and React Native then has nothing to diff and leaves the native view as it was. The
  // values are new; the pixels are not.
  //
  // I removed this key on 30.09. (#148) because it threw away every screen's state — the
  // onboarding jumped back to its first card — and trusted `frozen-colors.test.ts` to cover
  // it. That test proves the refill, not the repaint. On the phone, one day later, switching
  // to dark left every settings heading at **1.39:1** contrast (measured, Xiaomi, 01.10.);
  // the same heading after a fresh mount is 10.73:1. So the key is back.
  //
  // What #148 was really about is handled where it belongs: a screen whose state must
  // survive keeps it (app/onboarding.tsx, lib/drafts.ts), instead of the whole tree paying
  // for it with wrong colours.
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
 * The frame ABOVE the provider (app/_layout.tsx) — the window the whole app is drawn on,
 * and the background every pushed screen starts from.
 *
 * It cannot use `useTheme()`: outside the provider that reads the applied palette once,
 * per render, and the root frame has no reason to render again when she picks a colour in
 * the settings. The frame then kept the old background until the next navigation happened
 * to re-render it — visible behind a modal and for the length of a push animation (audit
 * 30.09., #133 position 16). Subscribed, it follows the same instant everything else does.
 */
export function useAppliedPalette(): Palette {
  return paletteOf(useSyncExternalStore(onPaletteApplied, activeTheme, activeTheme));
}

/**
 * The colours to paint with. Above the provider (the root frame in app/_layout.tsx) there is
 * no context yet: the palette that is applied answers instead — the one an earlier choice
 * restored, not the default, so nothing outside the provider shows another theme's colours.
 * A frame that lives up there and has to FOLLOW a change takes `useAppliedPalette()`.
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
