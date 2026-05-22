# Vertex AI Models — Preise & Auswahl

Quelle: [models.dev](https://models.dev) Vertex-Liste (Stand 2026-05-22).
Preise sind USD pro 1 M Tokens. Schwammige Spalten (Vision, Tools,
Context-Window, Output-Cap) sind im Tabellen-Body als Anmerkungen.

> **Wichtig**: Preise und Verfügbarkeit ändern sich. Bevor du ein
> nicht-gelistetes Modell live einbaust: in Cloud Console gegenchecken,
> insbesondere ob es in `europe-west4` (unser Default) gehostet wird
> oder nur in US-Regionen — letzteres bricht Data-Residency.

## Tabelle

| Provider      | Modell                 | API-ID                           | Input $/M | Output $/M | Cached Input $/M | Context | Max Output | Reasoning |
| ------------- | ---------------------- | -------------------------------- | --------- | ---------- | ---------------- | ------- | ---------- | --------- |
| **Anthropic** | Claude Haiku 3.5       | `claude-3-5-haiku@20241022`      | 0.80      | 4.00       | 0.08             | 200k    | 8.2k       | –         |
| Anthropic     | Claude Haiku 4.5       | `claude-haiku-4-5@20251001`      | 1.00      | 5.00       | 0.10             | 200k    | 64k        | ✓         |
| Anthropic     | Claude Opus 4          | `claude-opus-4@20250514`         | 15.00     | 75.00      | 1.50             | 200k    | 32k        | ✓         |
| Anthropic     | Claude Opus 4.1        | `claude-opus-4-1@20250805`       | 15.00     | 75.00      | 1.50             | 200k    | 32k        | ✓         |
| Anthropic     | Claude Opus 4.5        | `claude-opus-4-5@20251101`       | 5.00      | 25.00      | 0.50             | 200k    | 64k        | ✓         |
| Anthropic     | Claude Opus 4.6        | `claude-opus-4-6@default`        | 5.00      | 25.00      | 0.50             | **1M**  | 128k       | ✓         |
| Anthropic     | Claude Opus 4.7        | `claude-opus-4-7@default`        | 5.00      | 25.00      | 0.50             | **1M**  | 128k       | ✓         |
| Anthropic     | Claude Sonnet 3.5 v2   | `claude-3-5-sonnet@20241022`     | 3.00      | 15.00      | 0.30             | 200k    | 8.2k       | –         |
| Anthropic     | Claude Sonnet 3.7      | `claude-3-7-sonnet@20250219`     | 3.00      | 15.00      | 0.30             | 200k    | 64k        | ✓         |
| Anthropic     | Claude Sonnet 4        | `claude-sonnet-4@20250514`       | 3.00      | 15.00      | 0.30             | 200k    | 64k        | ✓         |
| Anthropic     | Claude Sonnet 4.5      | `claude-sonnet-4-5@20250929`     | 3.00      | 15.00      | 0.30             | 200k    | 64k        | ✓         |
| Anthropic     | Claude Sonnet 4.6      | `claude-sonnet-4-6@default`      | 3.00      | 15.00      | 0.30             | **1M**  | 128k       | ✓         |
| **DeepSeek**  | DeepSeek V3.1          | `deepseek-ai/deepseek-v3.1-maas` | 0.60      | 1.70       | –                | 164k    | 33k        | ✓ (Open)  |
| DeepSeek      | DeepSeek V3.2          | `deepseek-ai/deepseek-v3.2-maas` | 0.56      | 1.68       | 0.06             | 164k    | 66k        | ✓ (Open)  |
| **Google**    | Gemini 2.0 Flash       | `gemini-2.0-flash`               | 0.15      | 0.60       | 0.03             | 1M      | 8.2k       | –         |
| Google        | Gemini 2.0 Flash-Lite  | `gemini-2.0-flash-lite`          | 0.07      | 0.30       | –                | 1M      | 8.2k       | –         |
| Google        | Gemini 2.5 Flash       | `gemini-2.5-flash`               | 0.30      | 2.50       | 0.07             | 1M      | 66k        | ✓         |
| Google        | Gemini 2.5 Flash-Lite  | `gemini-2.5-flash-lite`          | 0.10      | 0.40       | 0.01             | 1M      | 66k        | ✓         |
| Google        | Gemini 2.5 Pro         | `gemini-2.5-pro`                 | 1.25      | 10.00      | 0.13             | 1M      | 66k        | ✓         |
| Google        | Gemini 3 Flash Preview | `gemini-3-flash-preview`         | 0.50      | 3.00       | 0.05             | 1M      | 66k        | ✓         |

## Wo wir aktuell stehen

- **Extraction (P1 OCR/Items)** → `gemini-2.5-flash-lite` ($0.10/$0.40)
- **Tutor (Agent JSON)** → `gemini-2.5-flash` ($0.30/$2.50)
- **Trivial-Correct-Routing** → `gemini-2.5-flash-lite` (auto im Code)
- **Explain (P4)** → `gemini-2.5-flash` (tutor tier)
- **Reflect (Post-Session)** → `gemini-2.5-flash-lite`
- **TTS** → `de-DE-Chirp3-HD-Aoede` (+ andere Locales)
- **STT** → `chirp_2`

## Best-by-Category (Preis-Empfehlungen)

### Extraktion (Vision + JSON, Cost-First)

1. **`gemini-2.5-flash-lite`** — aktuell, schlägt alles im Preis bei Vision-fähigen Modellen.
2. Fallback ohne Vision-Need: `gemini-2.0-flash-lite` ($0.07/$0.30, kein Reasoning).
3. Claude Haiku 4.5 für JSON-Vision-Tasks wäre ~10× teurer ohne klaren Quality-Win bei Schul-Worksheets.

### Tutor (multi-rule Instruction-Following, Latenz < 5 s)

1. **`gemini-2.5-flash`** ($0.30/$2.50) — aktuell. Mit Server-Direktiv brauchbar.
2. **Claude Haiku 4.5** ($1/$5) — wenn Flash weiter driftet. Anthropic-Modelle folgen mehrstufigen Regeln deutlich zuverlässiger. ~3× Input, 2× Output.
3. **Claude Sonnet 4.6** ($3/$15) — Premium-Variante. Nicht für 100 % der Turns, eher Escalation-Tier (z.B. `hintsGivenForItem >= 2` oder `affect == true`).

### Escalation-Tier (nur harte Turns, ≤ 10 % der Calls)

1. **Claude Sonnet 4.6** ($3/$15) — bestes Quality/Cost.
2. **Gemini 2.5 Pro** ($1.25/$10) — Google-internes Upgrade. 4× teurer als Flash, ~3× billiger als Sonnet 4.6.
3. **Claude Opus 4.7** ($5/$25) — nur wenn echtes Bottleneck-Reasoning gebraucht wird (z.B. komplexe Misconception-Diagnose).

### Cheap-Reasoning (kein Tutor, eher Klassifikation / Batch / Reflect)

1. **DeepSeek V3.2** ($0.56/$1.68) — Open-Weights, sehr billig, Reasoning fähig. Vorsicht s.u. (Compliance).
2. **`gemini-2.5-flash-lite`** ($0.10/$0.40) — ohne politischen Beigeschmack, fast so billig.

### Reflect / Background-Jobs

1. **`gemini-2.5-flash-lite`** — aktuell, passt.
2. Bei deutlich höherem Volume: Vertex **Batch Mode** (50 % Rabatt, async, 24 h SLA) für `reflect` und Item-Bulk-Generation.

### Long-Context-Workloads (wenn wir je 1 M Tokens brauchen)

- **Claude Sonnet 4.6** & **Opus 4.6/4.7** haben jetzt 1 M Context-Window — gleich teuer, mehr Headroom als die 200k-Varianten.
- Aktuell brauchen wir das nicht (Material-Context < 8k).

## EU-Compliance & Data-Residency

Vertex AI generell:

- DPA mit GCP unterzeichnet (Standardvertragsklauseln).
- Customer Data wird NICHT für Modell-Training verwendet.
- Region-Pinning via `GOOGLE_VERTEX_LOCATION` (bei uns: `europe-west4`, NL).

**Aber** der Knackpunkt für Non-Gemini-Modelle: regionale Verfügbarkeit.

- **Gemini 2.x**: in `europe-west4` verfügbar → unproblematisch.
- **Claude auf Vertex**: ursprünglich nur in `us-east5`. Seit Ende 2025 angeblich auch `europe-west1` (Belgien) für Sonnet 4.x + Haiku 4.5 — **vor Live-Einsatz in Cloud Console bestätigen**. Wenn nur US-Region verfügbar ist, bricht Data-Residency.
- **DeepSeek auf Vertex (MaaS)**: hostet auf Google-Infrastruktur, technisch unter Vertex-DPA → GDPR-konform konfigurierbar. **Aber**: Open-Source-Modell chinesischen Ursprungs. Selbst wenn die Inference auf EU-Servern läuft, ist die Reputation/PR-Komponente bei Kinder-Lern-App problematisch. Würde ich nicht empfehlen, auch wenn der Preis verlockend ist.
- **Llama / Mistral auf Vertex**: regional verfügbar je nach Modell — checken.

Praktische Regel:

- Gemini-Varianten → safe, in EU verfügbar, keine Diskussion.
- Claude → safe **wenn** der API-Endpoint in `europe-west1` aufgelöst wird. Vor Commit verifizieren.
- DeepSeek → technisch ja, in der Praxis: skip wegen Optik.

## Cost-Hebel die wir schon haben

Aus `docs/ENV.md` und dem aktuellen Code:

- Implicit Gemini Caching (always-on, free).
- Explicit Vertex Caching (v3.1 only, ~75 % Discount auf cached input).
- flash-lite Routing für triviale Korrekt-Antworten (always-on).
- History Truncation 12 Messages + current item intro (always-on).
- Conditional Material Context (nur in Tutoring-Mode).

Pro Tutor-Turn aktuell: ~$0.00025 effektiv (siehe `docs/tutor-research/10-cost-levers.md`).
