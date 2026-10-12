import { TYPE } from './type.js';

// Shared component geometry and interaction treatment (redesign, #548).
const inputLine = () => TYPE.input.lineHeight;

export const UI = {
  border: 1,
  selectedBorder: 2,
  disabledOpacity: 0.45,
  busyOpacity: 0.8,
  // React Native Android ProgressBar small/large intrinsic dimensions.
  busyIndicator: { small: 20, large: 36 },
  pressScale: 0.97,
  pressedOpacity: 0.78,
  fontScale: 2,
  minimumFontScale: 0.82,
  button: { pad: 22, icon: 18, compactIcon: 24, compactGlyph: 18 },
  field: {
    height: 52,
    get line() {
      return inputLine();
    },
    centeredPadding: (height: number) => (height - inputLine()) / 2,
    labelGap: 6,
    maxRows: 5,
    toolGap: 2,
    composerHorizontal: 10,
    composerBottom: 6,
    toggleIcon: 20,
    clearIcon: 18,
  },
  iconButton: { glyph: 20, actionGlyph: 22, composer: 40 },
  list: { row: 56, tile: 36, icon: 22, chevron: 18, trailing: 32 },
  chip: { height: 34, icon: 14 },
  segmented: { visible: 36 },
  progress: { height: 4, legacyHeight: 6, currentPart: 0.5 },
  sheet: {
    maxFraction: 0.92,
    veilOpacity: 0.28,
    radius: 28,
    handleWidth: 36,
    handleHeight: 5,
    handleRadius: 3,
    topPad: 10,
    travel: 0.9,
    dragResistance: 0.15,
    gestureStart: 8,
    gestureFail: 24,
  },
  entrance: { slide: 28, slowMultiplier: 2, maxRows: 8, windowMs: 900 },
} as const;
