// Recovery-screen geometry, sharing the auth introduction's background and lower edge (#548).
// Values: design ui_kits/app/Flows.jsx `ResetInvalid`.
import { AUTH } from './auth.js';
import { SPACE, TOUCH } from './space.js';

export const RESET = {
  orb: TOUCH,
  top: 28,
  /** Orb, title, words, field and the two actions keep one distance. */
  gap: SPACE.lg,
  bottom: AUTH.bottom,
} as const;
