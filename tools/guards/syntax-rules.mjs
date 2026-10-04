// Forbidden code shapes, one lint rule each (docs/engineering-guards.md).
//
// They used to be entries of ESLint's `no-restricted-syntax`. That rule takes ONE list per file:
// a later config block replaces the list of an earlier one for the files both match, it does not
// add to it. Three PRs each brought their own list (#290 secrets, #289 window height, #315
// context fence and default zone), and on the files where two met, one guard went silent with
// no error anywhere. As their own rules they cannot replace each other; guards.test.mjs lints
// one file that every guard covers and expects every one of them to fire.

import { createRequire } from 'node:module';

// The one definition of a secret-sounding EXPO_PUBLIC_* name (issue #290), shared with the
// Metro gate and the bundle scan.
const { SECRET_NAME } = createRequire(import.meta.url)(
  '../../apps/mobile/scripts/client-secrets.cjs',
);

/** In a string or a template (SQL), both checked; `.` stands for the slash esquery cannot escape. */
const inText = (/** @type {string} */ pattern) => [
  `TemplateElement[value.raw=/${pattern}/]`,
  `Literal[value=/${pattern}/]`,
];

/**
 * @param {string} description
 * @param {string[]} selectors
 * @param {string} message
 * @returns {import('eslint').Rule.RuleModule}
 */
function forbid(description, selectors, message) {
  return {
    meta: { type: 'problem', docs: { description }, schema: [], messages: { forbidden: message } },
    create: (context) =>
      Object.fromEntries(
        selectors.map((s) => [
          s,
          (/** @type {import('eslint').Rule.Node} */ node) =>
            context.report({ node, messageId: 'forbidden' }),
        ]),
      ),
  };
}

export const syntaxRules = {
  // The context fence has one door (CLAUDE.md rule 4, issue #315): every change a decision
  // depends on moves `context_version` through `bumpContext` (apps/api/src/modules/buddy/plan.ts),
  // in the caller's transaction. The #311 audit found a hand-written `context_version + 1` at
  // three places — the same SQL that day, a silent drift the next.
  'no-context-bump': forbid(
    'context_version nur über bumpContext() (Regel 4, Issue #315).',
    inText('context_version\\s*\\+'),
    'context_version nur über bumpContext() (modules/buddy/plan.ts) erhöhen — CLAUDE.md Regel 4, Issue #315.',
  ),
  // One default zone (issue #315): DEFAULT_TIMEZONE in packages/shared-types
  // (src/contracts/common.ts) is the only place that names it; a learner's zone comes from
  // learnerTimezone() / learnerZoneSql() (apps/api/src/lib/zone.ts). The audit found it written
  // 14 times, and one lookup without any fallback.
  'no-default-zone': forbid(
    'Die Standard-Zeitzone nur als DEFAULT_TIMEZONE (Issue #315).',
    inText('Europe.Berlin'),
    'Standard-Zeitzone nur als DEFAULT_TIMEZONE (@learnbuddy/shared-types/contracts); die Zone eines Lernenden über learnerTimezone() — Issue #315.',
  ),
  // A secret-sounding name under EXPO_PUBLIC_* is a secret in every bundle (issue #290):
  // reading one in the app is an error at the source already, before Metro's gate
  // (metro.config.js) and the scan of the finished bundle (scripts/web-walkthrough.sh).
  'no-public-secret': forbid(
    'Kein Server-Schlüssel unter EXPO_PUBLIC_* (Issue #290).',
    [
      `MemberExpression[object.object.name='process'][object.property.name='env'][property.name=/^EXPO_PUBLIC_.*${SECRET_NAME.source}/]`,
    ],
    'Ein EXPO_PUBLIC_*-Name mit SERVICE/SECRET/ADMIN/… landet im App-Bundle — Administrator- und Server-Schlüssel gehören nur auf den Server (Issue #290).',
  ),
  // A screen lays itself out on the height she can SEE, never on the window's (issue #289).
  // Since edge-to-edge Android keeps the window's height while the keyboard is up, a layout
  // decided on `useWindowDimensions().height` stayed roomy behind it. `useVisibleHeight()`
  // (lib/useVisibleHeight.ts) subtracts the keyboard. Widths are free — the keyboard never
  // takes any.
  'no-window-height': forbid(
    'Layout nach der sichtbaren Höhe, nicht nach der Fensterhöhe (Issue #289).',
    [
      "MemberExpression[object.callee.name='useWindowDimensions'][property.name='height']",
      "VariableDeclarator[init.callee.name='useWindowDimensions'] > ObjectPattern > Property[key.name='height']",
    ],
    'Die Fensterhöhe ignoriert die Tastatur (edge-to-edge) — useVisibleHeight() aus lib/useVisibleHeight.ts nehmen (Issue #289).',
  ),
  // One text field in the whole app (issue #365, owner 04.10.: "Es sollte EIN Inputfeld in der
  // ganzen App existieren, das immer benutzt wird."). Five files had built their own field from
  // React Native's TextInput — each with its own border, ring and padding. Every field is
  // components/lb/LbTextInput.tsx (a ref to one is `LbTextInputRef`); the input bar of the chat
  // and of a typed answer is components/lb/InputBar.tsx, built from it.
  'one-text-field': forbid(
    'Ein Textfeld: TextInput nur in components/lb/LbTextInput.tsx (Issue #365).',
    [
      "JSXOpeningElement[name.name='TextInput']",
      "JSXOpeningElement[name.property.name='TextInput']",
      "ImportDeclaration[source.value='react-native'] > ImportSpecifier[imported.name='TextInput']",
    ],
    'Ein Textfeld in der ganzen App: <LbTextInput> (components/lb/LbTextInput.tsx), für die Eingabeleiste <InputBar>; ein Ref heißt LbTextInputRef — Issue #365.',
  ),
  // The scripted model's report is read in ONE place, after the background work has landed
  // (issue #323): `env.checkScript()` / `env.closeChecked()` in apps/api/src/testing/harness.ts.
  // A test that reads `env.llm.unexpected`, `.scriptErrors` or `.pending()` itself counts
  // before a background call (Buddy's check after /finish) lands — green on a quiet machine,
  // red under load. 60 files did that until #327.
  'no-early-script-report': forbid(
    'Die Modell-Bilanz nur über env.checkScript() / env.closeChecked() (Issue #323).',
    [
      "MemberExpression[object.type='MemberExpression'][object.property.name='llm'][property.name=/^(unexpected|scriptErrors|pending)$/]",
    ],
    'Die Bilanz des geskripteten Modells nur über env.checkScript() oder env.closeChecked() lesen — die warten zuerst die Hintergrundarbeit ab (apps/api/src/testing/harness.ts, Issue #323).',
  ),
};
