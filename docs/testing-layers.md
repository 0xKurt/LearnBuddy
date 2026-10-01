# Test layers: what each one can see, and what it cannot

Written 01.10.2026, after a day in which four real defects reached the owner's phone with every
gate green. The question behind it was his: _"ich weiss gar nicht wie das ein problem werden
konnte.. und wieso es dafuer keinen test gibt."_

This is the honest inventory. It is not a plan; it is what is actually there, measured by running
it. Where the answer to "which layer should have caught this" is **none of them**, it says so.

---

## The layers

| Layer                             | What it runs on                                                                                                 | What it can see                                                                                                                                                                                                                                                                                        | What it is blind to                                                                                                                                                                                                                                                                                      |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **API integration** (52 files)    | Node + a **real Postgres 16**, one database per file from a template with the real migrations                   | Everything the server decides: permissions, tenant isolation, the context fence, time and DST, limits, idempotency, delivery states, streaming chunk by chunk. Failure paths are first-class.                                                                                                          | Anything on the phone. It never renders a pixel and never sees a component.                                                                                                                                                                                                                              |
| **API/package unit** (43 files)   | Node, pure functions                                                                                            | Parsers, policy, time arithmetic, prompt assembly, the eval comparison tooling.                                                                                                                                                                                                                        | Composition. A proven function wired up wrong still passes.                                                                                                                                                                                                                                              |
| **App logic unit** (84 files)     | Node, `apps/mobile/lib/**` only (`vitest.config.ts`)                                                            | State machines (speech, voice turns, push queue, outbox), math parsing, i18n parity across 5 languages, theme tokens, the source scanners (`wiring.test.ts`, `hardcoded.test.ts`, `frozen-colors.test.ts`).                                                                                            | **Every component and every screen.** The config said so out loud: _"Screens and components that depend on RN modules are not under test here yet."_ Nothing between a pure function and a full browser run.                                                                                             |
| **App component** (3 files, NEW)  | jsdom + **react-native-web** — the same engine the walkthrough's web build uses (`vitest.components.config.ts`) | One component or screen part at a time, in any state you can hand it: a refused permission, a failed upload, a long label, a palette switched mid-session. Rendered text, roles, labels, accessibility state, handlers, **declared** styles. Fast (~2 s) and runs in `pnpm test`.                      | **Geometry.** jsdom lays nothing out: every width, position and overflow is zero. Also: real motion (Reanimated is replaced), navigation (expo-router is replaced), and anything only a device does.                                                                                                     |
| **Browser walkthrough** (7 specs) | Chromium 390×844 and 360×740, the **real web build** against the **real API** on a throwaway schema             | The whole loop end to end, in 5 languages: that a control exists, is reachable, is enabled, does what it says; **fit** (nothing scrolls that shouldn't, `fit.ts`); **axe** at every screenshot (roles, names, contrast); 64 measured stops, two screenshots each; the app's own stopwatch (`perf.ts`). | States it cannot reach — a refused microphone (it launches with `--use-fake-ui-for-media-stream` on purpose), an outage mid-upload, a specific long label. And, until #187, **anything about two elements being flush with each other**: it only ever asked "is it there, does it fit, does it overlap". |
| **Device flows** (`.maestro/`, 4) | A real phone over USB                                                                                           | The three things a browser cannot have: the **microphone**, the **camera**, a real phone's **timing** (the two marks of #41 are read out of `logcat`).                                                                                                                                                 | Everything, right now — **they have never been executed.** Maestro is a JVM app and no JDK is installed on this machine; `maestro --version` stops at "Unable to locate a Java Runtime". The flows are written and waiting on an owner decision (`.maestro/README.md`).                                  |

`pnpm verify` = typecheck · lint · test · walkthrough. The pre-commit hook runs the first three.

### What is deliberately outside all of it

The live model's judgement (that is what `evals/` is for, and it costs money), real push delivery,
Supabase Auth and Storage themselves, pg_cron firing on a hosted project.

---

## The four defects of 01.10., layer by layer

### #187 — "Senden" floated 8 pt above its neighbours

`Btn` sets `alignSelf: 'flex-start'` on itself, and `alignSelf` beats the parent's `alignItems`.
The composer bar said `alignItems: 'flex-end'` and was overruled. Invisible while the field was
one line, because then the row was exactly as tall as the buttons.

**Which layer should have caught it: the browser walkthrough** — and it could not, for two
reasons, both now addressed. It had no way to reach the two-line state, and **no check anywhere
asked whether things that belong together are flush**; existence, fit and overlap were the only
questions. `tests/web/layout.spec.ts` now has `the composer row stays one row when the field
grows`.

The component layer can see the declared rule the geometry follows (`Btn` always declares an
`alignSelf`, so a row that wants its buttons flush must say `full`, `center` or `grow`) and now
pins it — but it cannot see 8 pt. **Alignment is a measurement; it belongs to the browser.**

### #191 — the green receipts clipped their own text

"✓" on one line, "Ein" on the next, where the sentence was "Eingetragen: Mathearbeit Brüche am
Freitag, 2. Oktober". Two causes, both structural: the sentence was a `Text` with `flex: 1`
sitting **next to** the "Rückgängig" button in a row, and the column stood in a block that aligns
its children to the side, so each receipt was only as wide as its own button.

**Which layer should have caught it: the component layer** — and now does, both causes
(`components/buddy/__tests__/Conversation.test.tsx`). Verified by re-introducing each cause
separately; each one fails exactly one test. The walkthrough would only have caught it with a
label long enough, in a run that happened to produce one.

### #127 — `turns[].tools` was declared, documented and always `[]`

A field the eval harness filled with nothing, read by checks that therefore always passed.

**Which layer should have caught it: none of them, by construction.** No test can see that a
value is empty for the wrong reason — a check reading an always-empty list is green and silent.
What catches this class is a test asserting the **non-trivial** case: at least one run in which
the field is populated, asserted to be populated. The same hole exists wherever a check reads an
optional field; it is not a gap in a layer, it is a gap in how an assertion is written.

### #171 — dark mode painted stale colours for a whole day of green runs

The tree must remount on a palette change (`key={name}` in `ThemeProvider`), because a component
that passes a live token object straight through (`style={TYPE.title}`) keeps the object's
identity, and React Native then has nothing to diff: the values are new, the pixels are not.

**Which layer should have caught it: none of the automated ones.** Measured, not assumed:
removing `key={name}` leaves the new component tests **green**, because react-native-web rebuilds
CSS from the object's current values on every render. The bug is native diffing behaviour, and
every automated run mounts fresh, so it only exists in the step from one palette to the next on a
device.

What stands in for it: the source guard in `lib/theme/__tests__/frozen-colors.test.ts` (which
proves a string is in the file, not that anything repaints — it says so itself), and the device.
The nearest relative, **#84** (a module-scope constant freezing the start palette), _is_ now
covered at the component layer: switching the palette and reading the button's fill fails when
#84 is re-introduced.

---

## Why the component layer was built, and not something else

Everything else had a layer; this had nothing. A screen's states — empty, loading, failed,
offline, a permission refused — were reachable only by building the web bundle, starting the API
and driving Chromium, which takes minutes, and some of them not even there. Of the four defects
above, the two that are purely about **what a component renders** (#191, #185) belong here; the
two that are about **pixels** (#187) or **the native bridge** (#171) do not, and the table says
so rather than pretending.

The microphone case is the clearest argument. `#185` ("der sprechen button funktioniert nicht. kp
wieso") lives in a state the walkthrough **grants on purpose** so the conversation loop can run,
and that a device test needs a hand (and, on MIUI, a system dialog) to produce. Here it is a
value in a test.

### How it works

One runner, two projects (`apps/mobile/vitest.workspace.ts`), so `pnpm test` is unchanged:

- `vitest.config.ts` — the `lib` project, Node, exactly as before.
- `vitest.components.config.ts` — the `components` project, jsdom + react-native-web.

The two need different module resolution, which is why they are two configs and not one with
globs: a component must see the `.web.*` twins, a lib test must keep seeing what it sees today.

Metro's job, done again in the config (each with a comment saying why):

- `react-native` → `react-native-web`.
- `.web.tsx/.web.ts/.web.js` win, and a `.js` import of a `.ts` file is re-resolved
  extension-less first, so `streamingFetch.web.ts` wins over `streamingFetch.ts` — the same hook
  `metro.config.js` installs.
- Expo publishes `.js` files with JSX still in them; those get esbuild's JSX loader.
- `expo/src/Expo.fx` (Expo Go's dev runtime: fast refresh, the `import.meta` registry) is left
  out — it reaches for relative `require('./X')` inside `.ts` files, which only Metro resolves.

Three things are **replaced**, each in a file carrying the rule-8 banner and naming what it
therefore does not cover (`apps/mobile/testing/`):

| Replaced                                       | Why                                                                                                        | Not covered here                                                             |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `react-native-reanimated`                      | Reanimated 4 builds worklets, which exist only after its Babel plugin has rewritten the app **and itself** | motion (policy: `reduceMotion.test.ts`; look: `tests/web`; feel: the device) |
| `expo-router`                                  | ships JSX inside `.js` files; neither Node nor Vite can load it                                            | navigation (`tests/web` walks it)                                            |
| `expo-localization`, the system-chrome modules | native modules with no browser equivalent                                                                  | the status/navigation bar                                                    |

No database is involved at this layer at all (CLAUDE.md rule 8 is about the database; the outside
world may be replaced, and is, explicitly).

### What is covered so far

Chosen by where the bugs actually came from, not by what was easy. Every test was verified by
re-introducing the defect it guards against — a test that cannot fail is worth nothing (#127).

| File                                                | Guards                                                                                                                                                                                              | Falsified by                                                                 |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `components/lb/__tests__/Btn.test.tsx`              | the alignment contract (#187); a waiting button answers instead of swallowing the tap and stays disabled (#97); a busy one never sends twice; it paints the palette it is told to (#84)             | removing `full`'s `stretch`; a frozen `variantStyle(paletteOf('pastell'))`   |
| `components/buddy/__tests__/Conversation.test.tsx`  | a receipt's sentence does not share a row with its button, and the column stretches (#191); undo passes the right action id and disappears once used                                                | putting the sentence back beside the button; dropping `alignSelf: 'stretch'` |
| `components/practice/__tests__/SpeakPanel.test.tsx` | a refused microphone turns the big control into "Einstellungen öffnen", opens the settings instead of recording, stays pressable, and says why (#185); on the web it says the browser thing instead | reverting the control to always offer `recordLabel`                          |

No snapshots. A snapshot of a bug is a green test.

### What to reach for next

1. **An alignment/flush check per pinned row in `tests/web`** — #187's real owner. One row has it
   now; the practice bottom bar and the talk controls do not.
2. **A JDK, so `.maestro` runs at all.** Four written flows have never been executed, and two of
   the four defects above are device-shaped. This is an owner decision (a system install).
3. **More component states**: `AnswerComposer` (offline, failed send, the outbox), `Verdict`,
   `SessionSummary`, the onboarding cards. The harness is the expensive part and it exists now.
