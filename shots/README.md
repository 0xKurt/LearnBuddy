# Shots — interactive figures (#248, #249)

From the walkthrough `tests/web/figures.spec.ts` (real app, real API, scripted model), every stop
at 390×844 (`name.png`) and 360×740 (`name-360.png`); light, and dark where named `night`.
The run fit-checked every one (no scrolling, tests/web/fit.ts) and passed axe (serious/critical).

`composite-360.png` / `composite-390.png`: the stops side by side — top row tapping (#248), bottom
row drawing (#249).

| shot  | what                                                                                   |
| ----- | -------------------------------------------------------------------------------------- |
| 50    | point task, nothing set; "Prüfen" waits                                                |
| 51    | 12 × 10 steps are too fine for 44 pt on 360 → first tap magnified                      |
| 52    | x and y swapped → code says so; Buddy's full reply above the grid                      |
| 53    | right point, theme switched to dark: the point stays (draft)                           |
| 54/55 | number line: magnified to whole ticks, then 0,75 set                                   |
| 56    | bar chart: the whole column is the target                                              |
| 57/58 | clock: short hand, then long hand; 58b dark                                            |
| 60–63 | line y = 2x − 1: two points, "Die Steigung stimmt schon …", Rückgängig, right; 63 dark |
| 64–66 | mirror triangle at the dashed line, set via "Eingeben" (the accessible way, steppers)  |
| 67/68 | bars pulled to height; wrong bar named                                                 |

Design rounds: round 1 found origin labels colliding, Buddy's reply cut under the question card,
an empty band between question and figure, a line past the grid edge, a truncated hint, and two
"Fertig" buttons in the sheet — all fixed before these shots.
