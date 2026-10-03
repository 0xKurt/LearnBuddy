// Stands in for Expo's `expo/virtual/env` in development (metro.config.js, issue #291).
//
// Babel rewrites every `process.env.EXPO_PUBLIC_X` in a DEV bundle to `env.EXPO_PUBLIC_X` from
// that module. Expo's own version merges the project's .env files into it as bundled modules —
// last, so a file beat the shell, and `EXPO_NO_DOTENV=1` did not stop it: the dev build kept
// talking to the hosted backend while Metro was started for the local stack, and every
// EXPO_PUBLIC_* line of .env.local was in the bundle whether the app read it or not (#290).
//
// Here the dev bundle reads only `process.env`, which Expo CLI fills in front of the app code
// from Metro's own environment: the shell first, then the .env files (unless EXPO_NO_DOTENV),
// never a file over the shell. Release builds never import this — Babel inlines the values.
// The cost: editing an .env file needs a Metro restart instead of a hot reload.
export const env = process.env;
