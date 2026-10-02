# Screenshots — Figurenbibliothek (#250, #252, #261)

Branch `claude/train2-figuren-bibliothek-250-252-261`. Shot by the walkthrough
`tests/web/library.spec.ts` against the real app and API (scripted model), every stop at
390×844 (`NN-name.png`) and 360×740 (`NN-name-360.png`); `tests/web/fit.ts` checked that
nothing has to be scrolled. Light and dark.

- `composite-360.png` — ten states at 360×740 side by side (light and dark).
- `composite-390.png` — eight states at 390×844, incl. replies and dark mode.
- `drawings-gallery.png` — all 15 schematic drawings, light and dark, with each part's
  point (red, review only — not drawn in the app).

| Shot | What |
| --- | --- |
| 80–83 | Pflanzenzelle beschriften: pins, wrong tap named ("Das ist: Vakuole."), night, "Eingeben" with one button per pin |
| 84–86 | "Wie heißt Teil 1?" on the eye (compact numbered pins), night, right answer |
| 87–89 | Periodensystem, Hauptgruppen: tap Mg, "die Gruppe stimmt schon" for Ca, night |
| 90 | Valenzelektronen von Schwefel with S marked in the table |
| 91–92 | Full table, magnified on the first tap |
| 93–95 | Circuit: the one dark lamp (tap), night, ammeter placed by code |
| 96–97 | Truth table of NOT A → AND B, laid across; reply names „Q“, Spalte 5 |
| 98–99 | Itten's wheel, every field named; wrong tap named, night |

Known limit: on 360×740 the question card caps any card figure at 14 % of the screen, so the
eye in a naming question is small (tap opens it full screen).
