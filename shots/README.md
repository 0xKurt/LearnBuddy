# Screenshots: Diagramme (#245, #246)

Code branch: `claude/train2-diagramme-245-246`. Taken by `tests/web/charts.spec.ts` (web build,
real API, scripted model; `apps/api/src/testing/scenarios/learning-modes.ts` `CHART_ITEMS`).

`composite.png` shows every chart side by side: 360×740 and 390×844, light and dark.

| File | What |
|---|---|
| `60-chart-climate*` | Climate chart (Walter–Lieth, 10 °C ≙ 20 mm), Berlin |
| `61-chart-line*` | Line chart with two series on two axes (m, m/s), measured x |
| `62-chart-pie*` | Pie chart: numbered slices, legend with shares |
| `63-chart-box*` | Two box plots on one axis |
| `64-chart-histogram*` | Histogram of a binomial distribution |
| `65-chart-scatter*` | Scatter plot with the least-squares line (computed by code) |
| `66-chart-pyramid*` | Population pyramid; the type options are written by code |
| `67-chart-answered*` | A reading within the drawing's tolerance (565 for 571 mm), judged right by the rules |

Suffixes: none = 390×844 light, `-360` = 360×740, `-dark` = dark mode.

Design rounds: (1) the pyramid's outer tick labels were clipped and got edge room; (2) the box
plot got wider margins and taller boxes; (3) the measured x-axis of the line chart now ends at the
last value, with ticks sized from their labels; (4) the pie went from beside its legend to above
it — beside it, a 14-character label had room for only 8 characters at 360 px.

Not verified here: a real device (iOS/Android rendering of react-native-svg), and a live model
writing these charts.
