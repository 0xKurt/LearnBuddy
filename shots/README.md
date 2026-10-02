# Screenshots — Barge-in und Sprach-Latenz (#35, #41)

Aus `tests/web/talk-barge.spec.ts` (Web-Walkthrough, echte App gegen den Dev-Stack): je
Telefon (390×844, 360×740) und Farbschema (hell, dunkel) eine eigene Lernerin mit genau einem
Austausch — kein doppelter Verlauf. `composite.png` zeigt alle acht nebeneinander.

- `34-talk-speaking-*` — Buddy spricht (Mitlese-Markierung im Text). Einzige sichtbare
  Änderung: die Hinweiszeile sagt „Sprich einfach dazwischen, dann hört er dir zu." — nur,
  wenn das Barge-in-Ohr wirklich einen Pegel bekommt; sonst bleibt „Tipp auf Buddy, dann hört
  er dir zu." (Regel 5). Passt auch bei 360 auf eine Zeile.
- `35-talk-barged-in-*` — nachdem sie reingeredet hat: Buddy ist still, die Aufnahme läuft
  (der bestehende Zuhör-Zustand, unverändert).

Dunkel wird nach dem Onboarding eingeschaltet, vor dem Turn: `app.json` startet die App hell
(`userInterfaceStyle: "light"`), die Palette folgt dem System erst ab dessen Wechsel.
