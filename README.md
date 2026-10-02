# Shots: Karten aus Natural Earth (issue #251)

Branch `claude/train2-karten-251`. Taken by the walkthrough `tests/web/maps.spec.ts` (real app,
real API, scripted model) at 360×740 (`*-360.png`) and 390×844, light and dark.
`shots/composite.png` puts each stop side by side (360 left, 390 right).

| shot | what it shows |
| ---- | ------------- |
| 70 | "Tippe auf Bayern": the 16 Länder, nothing chosen, "Prüfen" waits |
| 71 | the magnifying first tap near Berlin (×3, Brandenburg around it) |
| 72 | a tap on Hessen checked: "Knapp daneben – das ist Hessen, ein Nachbar." |
| 73 | Bayern chosen, dark |
| 74 / 75 | "Wie heißt das markierte Land?" (Italy marked), light / dark with a typed slip |
| 76 / 76b | Berlin's position to read off the graticule; "Vergrößern" round the mark |
| 77 / 78 | a wrong hemisphere named; corrected, dark |
| 79 | world map, the tropics band tapped |

Design rounds: round 1 showed Berlin alone in white after a ×6.5 zoom (now ×3 for the Länder)
and overlapping graticule degrees on a small map (now in gutters, plus a magnifier). Known:
the world map is 2:1, so on 390×844 a band stays empty between it and "Prüfen".
