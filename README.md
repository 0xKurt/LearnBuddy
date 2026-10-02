# Screenshots — Fehlerdetektiv und schriftliches Rechnen (#260)

Code: branch `claude/train2-fehlerdetektiv-260`. Taken by the browser walkthrough
(`tests/web/modes.spec.ts`, "schriftlich rechnen and the Fehlerdetektiv … (issue #260)") against the
real API with the scripted model. Every shot passed `tests/web/fit.ts` (no scrolling) and axe at
390×844 (`name.png`) and 360×740 (`name-360.png`), light and dark (`-night`).

Overview: `shots/composite-light.png`, `shots/composite-dark.png` (top row 390×844, bottom 360×740).

| shot | what it shows |
| --- | --- |
| 63-written-filled | 476 + 358, three digits written, the carry forgotten (8 2 4) |
| 64-written-feedback | Buddy: „Fast – bei den Zehnern fehlt der Übertrag." — the grid unchanged |
| 65-written-multiply | the largest grid: 3826 · 47, both partial products written |
| 65b-written-multiply-feedback | the tallest state: five rows plus Buddy's reply („bei den Hundertern fehlt der Übertrag") |
| 66-detective-open | five lines, line 1 is the task (not tappable) |
| 67-detective-line-fine | a correct line tapped: „Zeile 3 stimmt – … Such weiter!" |
| 68-detective-fix | the wrong line 4 corrected in place |
| 69-detective-terms | halbschriftlich: a term chain with „=" in its own column |

Known, not from this change: the empty band between question card and answer surface before
the first reply is the shared practice-screen layout of every structured kind (#286 on the base).
