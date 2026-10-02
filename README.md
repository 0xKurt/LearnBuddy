# Screenshots — „Erklär mal" und der lange Text (#236, #258)

Code: branch `claude/train2-erklaer-texte-236-258`. Taken by the browser walkthrough
(`tests/web/modes.spec.ts`, "an oral quiz …(issue #236)" and "an essay of 1500 words …(issue #258)")
against the real API with the scripted model (`apps/api/src/testing/scenarios/explain-essay.ts`).
Every shot passed `tests/web/fit.ts` (no scrolling except the thread and the essay field) and axe
at 390×844 (`name.png`) and 360×740 (`name-360.png`), light and dark (`-night`).

Overview: `shots/composite.png` (top row 390×844, bottom row 360×740, in the order of the table).

| shot | what it shows |
| --- | --- |
| 50-oral-question | „Frag mich Fotosynthese ab": the open question, Buddy invites her to explain |
| 51-oral-follow-up | explained by voice (fake mic): two of three key points, ONE follow-up; the list names the aspect („Ort in der Zelle"), never the answer |
| 52b-oral-complete-night | the follow-up typed: everything holds, one list under the newest reply |
| 53-essay-written | 1500 words in the field (it scrolls in itself); survives a reload as a draft |
| 54-essay-feedback | the one next step (conclusion missing), the list, two places from HER text (the invented one is dropped); her text stays in the field to revise |
| 55-essay-complete | conclusion added in place: everything holds |

Design review, five rounds:
1. The open key point was named by its content („Ort: Chloroplast") right under „Und wo in der Zelle
   passiert das?" — it gave the answer away. Key points now carry `point` (for the judge) and
   `name` (the aspect she sees); code rejects a name that leaks the point.
2. „drin"/„fehlt noch" were glued to each name and wrapped raggedly — now a right-aligned column.
3. Two full lists stacked after the follow-up — the list now stands only under the newest reply.
4. The empty thread before an explanation was a dead band — Buddy's invitation opens it.
5. At 360×740 a tall list pushed Buddy's sentence under the question card — the thread now keeps
   the start of the newest reply in view; the essay is revised in the field instead of echoed as a
   1500-word bubble.

Known, not from this change: a closed question jumps to the summary when the colour scheme
changes (ThemeProvider remounts the tree on purpose, the pinned question is screen state) — so the
closed states are shot in one scheme each (52b dark, 55 light). The empty band under the question
card before the first answer is the app-wide practice layout.
