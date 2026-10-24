# Promo-Video (Branch `claude/promo-video`, wird nie gemerged)

- `storyboard.md`, `scenes.json` – Storyboard: 7 Szenen in einer Session, Texte DE/EN, Schritte und Pausen.
- `narration.json` – Sprechertext je Zeile (`de-intro`, `de-s1` … `de-s7`, `de-outro`, dasselbe mit `en-`).
- `render/` – Renderer für Overlays und Schnitt (`page.html`, `render.mjs`, Schriften, Dummy-Daten).
- Aufnahme lokal: `LB_PROMO_LANG=de scripts/web-walkthrough.sh promo` (oder `en`); Spec `tests/web/promo.spec.ts`.
- Ergebnis: `test-results/web/promo/app-de.webm` und `marks-de.json` (Szenenmarken und Schnittstellen in ms ab Testbeginn).
- In GitHub Actions: Workflow „Promo recording“ (`.github/workflows/promo.yml`), Artefakte `promo-recording-de|en`.
- Englische Modellantworten: `apps/api/src/testing/scenarios/promo-en.ts`; deutsche: `core-loop.ts`.
- Narration: `pnpm --filter @learnbuddy/api exec tsx scripts/promo-narration.ts ../../promo/narration.json ../../test-results/narration`
  (braucht `GOOGLE_APPLICATION_CREDENTIALS_JSON` und `GOOGLE_CLOUD_PROJECT`; Ergebnis je Zeile eine MP3 plus `index.json`).
