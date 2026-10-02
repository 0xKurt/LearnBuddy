# Shots: figures to scale and structural formulas (#253, #257)

From `tests/web/figures.spec.ts` (`sh scripts/web-walkthrough.sh tests/web/figures.spec.ts`),
the real web build against the dev stack with the scripted model
(`apps/api/src/testing/scenarios/figures.ts`). Every question passed the server's own checks
(`practice/figureCheck.ts`) and was answered and graded by code in the same run.

Naming: `NN-name.png` = 390×844 light · `-360` = 360×740 · `-dark` = dark room.

| #   | What                                                       | Checked by code                                                |
| --- | ---------------------------------------------------------- | -------------------------------------------------------------- |
| 60  | Angle sum, γ asked                                         | 50° and 60° are that wide (±2°); key 70 = the drawn angle at C |
| 61  | Pythagoras, right-angle mark                               | 4 cm and 3 cm on one scale; key 5 = AC on that scale           |
| 62  | Two forces and their resultant (dashed)                    | F₁, F₂ on one force scale; resultant = vector sum; key 50 N    |
| 63  | Reflection: incoming light ends at the mirror, normal, 40° | angle sizes; key 40 = the drawn reflection angle               |
| 64  | Lewis formula of water                                     | lone pairs computed (2), key checked against them              |
| 65  | Valenzstrich formula of ethanol, OH group marked           | every shell holds; the mark is one functional group (hydroxyl) |
| 66  | Skeletal formula of propan-2-ol                            | formula counted: key C3H8O; answer "C3H7OH" graded right       |
| 67  | Ammonium, charge at N                                      | charge +1 is what makes N's shell hold                         |

Composites: `composite-geometry.png`, `composite-molecules.png` (per row: 390 light,
360 light, 390 dark, 360 dark).

Not shown: the gap between the question card and the answer area is the practice screen's
layout (being reworked in #286), not part of these figures.
