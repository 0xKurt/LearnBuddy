// One runner, two projects (docs/testing-layers.md): the pure-logic tests in `lib/**` keep
// running under Node exactly as before, and the component tests render through
// react-native-web under jsdom. They need different module resolution — a component must
// see `.web.*` twins and react-native-web, a lib test must keep seeing what it sees today —
// so they are two configs rather than one with globs. `pnpm test` runs both.
export default ['./vitest.config.ts', './vitest.components.config.ts'];
