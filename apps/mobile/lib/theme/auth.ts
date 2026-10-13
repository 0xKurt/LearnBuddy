// Welcome presentation geometry; form behavior stays in its screen container (#548).
// Values: design ui_kits/app/Welcome.jsx.
import { SPACE } from './space.js';

export const AUTH = {
  orb: 56,
  top: SPACE.md,
  heroTop: 20,
  /** Under the pinned action: the page's lower edge (Welcome.jsx:12). */
  bottom: 26,
  /** The same edge on a small phone or above the keyboard, where every point is the form's. */
  compactBottom: SPACE.lg,
  /** Under the form, above the pinned action. */
  formBottom: SPACE.lg,
  gap: SPACE.xl,
  compactGap: SPACE.md,
  heroGap: SPACE.md,
  /** The switch, the fields and the line under them are one group (Welcome.jsx:18). */
  formGap: SPACE.md,
  copyInset: SPACE.xs,
} as const;
