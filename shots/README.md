# Screenshots — Informatik (issue #262)

Branch `claude/train2-informatik-262`, walkthrough `programs:` in `tests/web/modes.spec.ts`,
taken by Playwright against the real app and the real API (scripted model) at **360×740** and
**390×844**, light and dark. `fit.ts` measured every state: nothing has to be scrolled.

- `composite.png` — every state side by side: columns light-360 · light-390 · dark-360 · dark-390.
- `composite-keyboard.png` — the function task while typing (keyboard up), both sizes, both schemes.

| File                     | State                                                                    |
| ------------------------ | ------------------------------------------------------------------------ |
| `50-code-read-*`         | „Was gibt dieses Programm aus?" — code block, empty output field         |
| `51-code-read-partly-*`  | first line right, order wrong: „Die erste von 3 Zeilen stimmt."          |
| `52-code-find-*`         | „Tippe die Zeile an …" — every line a 44 pt target                       |
| `53-code-find-tried-*`   | a wrong line tapped: it stays, dimmed, with a dash instead of its number |
| `54-code-write-*`        | function task: signature + examples as code, editor with auto-indent     |
| `55-code-write-partly-*` | „3 von 4 Tests bestanden. groesste([-5, -2]) soll -2 ergeben …"          |
| `56-code-write-done-*`   | all tests passed → summary                                               |

Known, and honest:

- In the **dark** shots of 54–56 the editor holds only the starter: the walkthrough switches the
  colour scheme for the dark shot, and a scheme change rebuilds the tree and wipes typed text
  (the same behaviour the path test documents). It is a test artifact of switching themes mid-task.
- `55-…-360`: with a six-line program, only the last two lines of Buddy's reply stand above the
  editor on 360×740; the thread (which may scroll) holds the rest. On 390×844 all of it shows.
