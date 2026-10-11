// Recovery-screen geometry, sharing the auth introduction's background and lower edge (#548).
import { AUTH } from './auth.js';
import { TOUCH } from './space.js';

export const RESET = {
  orb: TOUCH,
  top: 28,
  bottom: AUTH.bottom,
  glow: AUTH.glow,
} as const;
