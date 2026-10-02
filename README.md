# Screenshots: Schemata und Bäume (#247, #256)

Branch `claude/train2-schema-baum-247-256`, walkthrough `tests/web/graphs.spec.ts` against the dev
stack (scripted model: it supplied only the graphs; every question, drawing, board and verdict is
the server's). Every stop at 390×844 (`name.png`) and 360×740 (`name-360.png`), light and dark
(`-dark`); each one passed `tests/web/fit.ts` (no scrolling) and the axe check.

`shots/composite.png` — rows: 390 light · 360 light · 390 dark · 360 dark.

| Stop | What |
| --- | --- |
| 60 | Wasserkreislauf, two gaps (acceptance case of #247): cycle on two rows, numbered dashed gaps, arrow numbers with a flowing legend; answered in a two-field table |
| 61 | the same, filled (light only — switching the phone's scheme remounts the screen and clears an unsent board, a pre-existing app behaviour) |
| 62 | Nahrungskette to order: deliberately **no** drawing (it would only repeat the board's numbers) |
| 63 | Probability tree, path "Kopf – Kopf"; a wrong "1/2" got code's fixed line, not the tutor |
| 64 | Pedigree, "Welcher Erbgang?" — only autosomal recessive fits (checked by enumerating genotypes for all four modes) |
| 65 | Automaton, "Wird das Wort „abb“ akzeptiert?" — loops above, back arc below, start arrow, double circle |
| 66 | Kohlenstoffkreislauf, match the arrow labels (`-set`: all four pairs placed) |

Design rounds: the first build drew the water cycle three rows tall with a stacked legend; on
360×740 it was scaled to ~60 % and unreadable. The layout now picks the flattest grid in which
every word fits unbroken, the legend flows, the title is the topic chip only (no longer repeated
in the prompt), the chain-order drawing was removed, the pedigree rows are tighter, and these
figures get 17 % instead of 14 % of the screen height as their floor (20 % pushed the "Tipp" row
under the edge on 360×740).

Still visible and **not** from this branch: the empty band between the question card and "Tipp"
on 390×844 — the practice screen keeps ~30 % of the middle for the conversation even when it is
empty (`app/practice/[id].tsx`, `questionCap`).
