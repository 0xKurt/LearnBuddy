## Was und warum

<!-- Issue (Closes #…), Quelle, und der Abschnitt der Doku, dem die Änderung folgt (z. B. docs/architecture.md §Delivery). -->

**Dient USP-Punkt:** <!-- 1 Proaktiv · 2 Ihr Material ist die Quelle · 3 Verlässliche Prüfung · 4 Ein ruhiger Screen · 5 EU und für Kinder gebaut — siehe docs/buddy/01-prinzip-und-diagnose.md §1.1. Bei „keinem": Begründung, oder der PR entfällt. -->

## Nachweis

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` grün
- [ ] Walkthrough grün (`scripts/web-walkthrough.sh`) — bei UI-Änderungen mit Screenshots 360×740 und 390×844
- [ ] Neue Route? Eintrag mit Begründung in `ROUTES` (`apps/mobile/lib/__tests__/minimalism.test.ts`)
- [ ] **Bibliotheks-Check:** <!-- Neuer Darstellungs-, Interaktions- oder Infrastruktur-Baustein? Issue mit Check (Lizenz, React-Native-Weg, Größe, Pflege, A11y) verlinken — oder „keiner“. Eigenbau nur mit Begründung (CLAUDE.md Engineering-Regel 1). -->
- [ ] **Kohärenz: verwandte Screens verglichen** <!-- Welche Screens daneben gelegt (gleiche Position, gleiche Aktion, gleiche Abstände)? Bilder 360×740 und 390×844. Engineering-Regel 6 und 10. -->
- [ ] Ausnahmelisten (`tools/guards/baselines/`) nicht gewachsen — oder Zuwachs begründet (`Ausnahmeliste-Zuwachs: #… …`)

## Nicht geprüft

<!-- Was ohne Live-Modell oder Gerät nicht belegt ist. -->
