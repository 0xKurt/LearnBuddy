# Screenshots — issues #254 and #255

Branch `claude/train2-grundschule-koerper-254-255`, browser walkthrough `tests/web/pictures.spec.ts`
against the real API (scripted model). Every stop at 390×844 and 360×740, light and dark
(`-night`); `shots/composite.png` shows them side by side.

| Stop | What |
|---|---|
| 80, 81 | Setting a clock by tapping — #248's `figure_tap` clock (the one tap mechanism), 7:45 |
| 82 | Reading a clock (`clock` task, drawn with the same `ClockSvg`); "halb acht" is accepted |
| 83 | Laying 2,80 € — purse below, laid coins above, no running sum |
| 84 | Counting money (schematic coins and a note, not images of real money) |
| 85 | Twenty field, 13 counters |
| 86 | Base-ten blocks, 247 |
| 90 | Hexagonal prism, count the edges (hidden edges dashed) |
| 91 | Cylinder volume with r and h labelled |
| 92 | Is this a cube net? |
| 93 | Point in space with its coordinate path (x₁ at 45°, shortened by ½√2) |

Design rounds (critique → revision): the dial clipped Buddy's reply on 360×740 → smaller and
the hint line hidden after the first tap (then the dial moved to #248's figure_tap); the coin
table grew into an empty box and squeezed "Tipp" → fixed-height table; the cylinder labels clipped
and sat on the dashed arc → room reserved, r under the rim; P(2|3|1) landed on the x₂-axis in
the school projection → such points are rejected by the server; money and blocks were drawn
small inside a tall card → drawn larger.
