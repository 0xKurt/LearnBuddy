# Screenshots: Lesetext und Markieren (#233, #234)

Code branch: `claude/train2-lesen-markieren-233-234`. Taken by `tests/web/modes.spec.ts`
("a reading text stays visible …", "marking: words, sentence parts …"): web build, real API,
scripted model (`apps/api/src/testing/scenarios/reading-marking.ts`). Every shot is also a fit
check — the walkthrough fails if anything but the conversation or the reading text
(`scroll-text`) would have to be scrolled at 360×740 or 390×844, and runs axe on each.

`composite.png` shows every state side by side: 390×844 and 360×740, light and dark.

| File | What |
|---|---|
| `60-reading-question*` | Lesetext above a multiple-choice question; text and question visible together, the text scrolls alone |
| `61-reading-evidence*` | A closed question: lines 6–8 tinted in the text and named in a chip ("Im Text: Z. 6–8") |
| `62-reading-folded*` | The text folded to its heading for the next question about it |
| `63-reading-mark-commas*` | A comma task on a sentence of the text; the text shrinks to ~4 lines above the board |
| `64-reading-commas-set*` | Two commas set (a comma, never colour alone) |
| `65-mark-words-start*` | 12 words, every one a ≥ 44 pt tile (the issue's acceptance case) |
| `66-mark-words-feedback*` | Counted, never named: "Noch nicht ganz: 3 richtig, 1 zu viel." |
| `67-mark-categories-start*` | Three categories, numbered chips, the first chosen |
| `68-mark-categories*` | Subject, predicate, object marked: underline + number + the line in words |
| `69-mark-syllables-start*` / `70-mark-syllables*` | Syllables: letter tiles in a box per word, the cuts spelled out ("Getrennt: Scho-ko-la-de …") |
| `71-mark-errors-start*` / `72-mark-errors-marked*` | The largest unsorted task: an error text of 24 words |
| `73-mark-errors-solved*` | Right on the first try |

Suffixes: none = 390×844 light, `-360` = 360×740, `-night` = dark mode.

Answered states at night: a theme switch remounts the practice screen, which then opens the next
open question (existing behaviour, not part of this branch). So `61-reading-evidence-night` is the
closed **true/false** question (lines 14–15), switched to dark before it was answered, and
`73-mark-errors-solved` exists only in light.

Design rounds (what was wrong, what changed):
1. The words to mark looked like plain text, so they became soft tiles. Long reading lines (45
   characters) wrapped at 360 and broke the line numbering, so Buddy now writes at most 36. The
   text panel repeated the screen's title, and the question card repeated it again as its topic.
2. A category's number beside the word made every marked tile wider, so the largest category
   task overflowed 360×740. The number now sits on the tile's corner. The comma sentence did not
   fit beside eight lines of text, so above a board the text takes four.
3. A 10-letter syllable word broke across rows into scattered letters, so each word now has a box
   and a text line spells the cuts. "Im Text: Z. 6–8" was loose grey text and is now a reference
   chip. The "Markiert: …" line with categories was cut off with "…".
4. With categories, 18 words still overflowed and 16 squeezed the conversation until the "Tipp"
   row was cut in half, so `MARK_SORTED_WORDS_MAX` is 12. A full stop hung below the word's
   baseline.

Still open (not this branch's to change): between the question card and an answer board there is
empty room. It is the conversation area, where Buddy's reply appears (`66-…`), and the same
layout as every structured kind (order, matching, tables).

Not verified here: a real device (iOS/Android), a live model writing reading texts and marking
tasks, and a real photographed reading text (the photo path is covered by the integration test
`reading-marking.int.test.ts` with a scripted extraction).
