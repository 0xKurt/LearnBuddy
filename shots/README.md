# Screenshots — Barge-in und Sprach-Latenz (#35, #41)

Aus `tests/web/talk-voice.spec.ts` und `tests/web/talk-barge.spec.ts` (Web-Walkthrough,
echte App gegen den Dev-Stack), 390×844 und 360×740, hell und dunkel. `composite.png` zeigt
alle nebeneinander.

- `34-talk-speaking-*` — Buddy spricht. Einzige sichtbare Änderung: die Hinweiszeile sagt
  „Sprich einfach dazwischen, dann hört er dir zu." — nur, wenn das Barge-in-Ohr wirklich
  einen Pegel bekommt; sonst bleibt „Tipp auf Buddy, dann hört er dir zu." (Regel 5). Passt
  auch bei 360 auf eine Zeile.
- `35-talk-barged-in*` — nachdem sie reingeredet hat: Buddy ist still, das Mikro läuft (der
  bestehende Zuhör-Zustand, unverändert).

Jeder Zustand wurde in der Größe und im Farbschema aufgenommen, in dem der Turn begann: das
Umschalten im Walkthrough remountet das Vollbild-Modal (das gibt es unabhängig von dieser
Änderung, auch auf main). Die doppelte Antwort im Verlauf ist nur die mehrfach gestellte
Testfrage.
