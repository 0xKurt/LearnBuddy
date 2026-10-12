# Icon and Chip foundation correction — #589 / #548

Prepared on published main 55e5e0f4. Nine owned paths: Icon, Chip, theme components/type, existing BaseControls/HelpChips/Bold Text tests, the narrow browser spec and this ledger. No navigation, ListGroup, Profile, Capture or question adapter changes.

## Final source

Icon defaults derive from one UI.icon role: 22 pt, normal stroke 1.7, action stroke 2.2. The actual main ColorValue interface and every registered shape/coordinate, including calendar/sparkle, are unchanged. This is the narrow accepted Small-controls renderer hunk; the remaining Small-controls 31-path tree/proof is untouched and must drop the duplicated hunk after publication.

Chip follows original core/Chip.jsx: default translucent paper with control border, receipt canvas/ink, selected primaryLt/accent with transparent border. Existing explicit legacy tones remain compatible. TYPE.chip 14/14/600 matches original font 14/1 and lifts through live Bold Text. Theme owns visual height 34, icon 16, gap 6, horizontal 14/icon-leading 10, paper opacity 88%. The actual press target remains at least 44 pt and trailing actions remain separate. Existing reduced-transparency hook changes default paper to opaque while mounted; no new preference controller or transition.

## Evidence

Mounted live transparency regression is causally red on published Chip and green after the correction; it changes the same mounted chip and retains its action. The initial incorrect test selector is preserved separately as tooling evidence. Existing HelpChips initial canvas expectation was intentionally replaced by the original paper surface; disabled, callback and offered-state assertions remain intact. Current five-file focused run passes 200 tests including 177 palette contrast cases; mobile TypeScript passes. Scoped lint, strict browser-spec TypeScript and diff checks pass. The actual four-appearance browser matrix passes 4/4 in 1.7 minutes with strict fit, accessibility and 44 pt checks at both phone sizes. Screenshots are preserved in the task artifact folder foundation-a/55e-final/web; receipt, default and selected states remain separately named.

The actual Chat receipt pathway has no production Chip tone=receipt caller on 55e. Its real receipt scenario is retained as unchanged adapter evidence, not proof of the unused Chip receipt skin. The browser spec uses actual signup/settings, Handball receipt and the existing Malnehmen two-miss hint flow in four appearances at both phones. No fixture data is injected into production.

Native rendered fonts, reduced transparency, screen reader and physical targets remain device verification gaps. The independent manager comparison accepted the bounded Icon/Chip source and all four tested appearances at both phone sizes against the original reference. This does not verify whole screens, unused receipt-tone Chip usage, native behavior or the other four looks. No commit or publication gate is claimed.
