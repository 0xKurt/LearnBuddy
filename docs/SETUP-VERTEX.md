# Vertex AI — Setup für Privatperson (LearnBuddy)

Schritt-für-Schritt-Anleitung, um Vertex AI Gemini 2.5 Flash-Lite für LearnBuddy nutzbar zu machen. Privatperson reicht — kein Gewerbeschein, keine UStID nötig. Du brauchst Kreditkarte oder SEPA, eine Telefonnummer für die Verifizierung und ~30 Minuten.

Stand: 2026-05-16. Wenn die Google-Cloud-Console-UI sich ändert, sind die Pfade unten als "Console → X → Y" zu lesen und ggf. mit der globalen Suche oben (Lupensymbol) abzukürzen.

---

## Begriffs-Wirrwarr — was ist was

Google hat die ML-Produkte mehrfach umbenannt. Quick-Reference:

| Was du in der Console siehst           | Was es ist                                                           | Brauchst du das hier?                                                            |
| -------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Vertex AI** (Parent-Menü)            | Die ganze ML-Suite — Modelle, Training, Endpoints, Pipelines, Studio | **Ja**, dein Einstiegspunkt                                                      |
| **Model Garden**                       | Katalog aller verfügbaren Modelle inkl. Gemini                       | **Ja** — hier siehst du Gemini 2.5 Flash-Lite; "Activate" reicht für API-Zugriff |
| **Vertex AI Studio**                   | Browser-UI zum interaktiven Prompt-Testen                            | Optional, nützlich fürs Prompt-Debugging in Slice D1                             |
| **Agent Builder** / **Agent Platform** | Hosted RAG-Chatbot-Builder                                           | **Nein** — anderer Use Case (Konversationsagenten mit RAG-Datenquellen)          |
| **AutoML**                             | No-Code-Modell-Training auf eigenen Daten                            | **Nein**                                                                         |
| **Vertex AI Pipelines**                | ML-Workflow-Orchestrator                                             | **Nein**                                                                         |

**Wichtigste Abgrenzung:** Es gibt zwei Google-AI-Produkte mit ähnlichem Namen, die NICHT dasselbe sind:

- **Google AI Studio** unter `aistudio.google.com` — Consumer-Produkt, kostenlos, **NICHT GDPR-tauglich für Production**. Daten dürfen per Default für Modelltraining verwendet werden, keine EU-Region-Garantie, kein DPA. **Finger weg.**
- **Vertex AI** unter `console.cloud.google.com` (mit GCP-Projekt) — Enterprise-Produkt, DPA + EU-Data-Residency, das ist hier gemeint.

Wenn ein Tutorial oder Beispielcode `@google/generative-ai` oder `googleapis.com/v1beta/models/gemini-...:generateContent` verwendet ohne Projekt-ID im Pfad → **das ist AI Studio**, falsche Tür. Vertex AI Endpoints haben immer das Muster `{region}-aiplatform.googleapis.com/v1/projects/{project}/locations/{region}/...` und das SDK heisst `@google-cloud/vertexai`.

---

## 0. Vorab — die Kosten-Realität

- **$300 / 90 Tage Free Trial** beim ersten Sign-up. Reicht für Monate von D1-Entwicklung.
- Danach: ~$0.0001 pro Credit (siehe `docs/legacy/08-cost-and-credits.md`, heute: `docs/architecture.md` §Limits). Heavy User = $0.076/Monat. Selbst 50 Testnutzer kosten dich <$4/Monat.
- Setze **Budget Alerts** (Schritt 3 unten) — Google schaltet die API nicht automatisch ab, du bekommst nur Email. Das ist die einzige Achilles­ferse.

---

## 1. Google-Cloud-Account erstellen

1. Gehe zu **<https://cloud.google.com/>** → oben rechts "Get started for free" / "Kostenlos starten".
2. Mit deinem persönlichen Google-Account einloggen (oder neuen Account erstellen — am besten einen dedizierten, z. B. `learnbuddy.kurt@gmail.com`, damit Privates und Projekt nicht vermischen).
3. Land: **Deutschland**, Account-Typ: **Individual / Einzelperson** (NICHT Business — Business braucht UStID).
4. Telefonnummer-Verifizierung per SMS.
5. Zahlungsmethode hinterlegen:
   - Kreditkarte ODER SEPA-Lastschrift (SEPA dauert ein paar Tage bis aktiv)
   - $1 wird probeweise abgebucht und sofort erstattet
6. Bedingungen akzeptieren — damit ist auch das **Data Processing Addendum (DPA)** automatisch angenommen. Du kannst es unter <https://cloud.google.com/terms/data-processing-addendum> separat herunterladen für deine Datenschutz-Akte.

---

## 2. Projekt anlegen

1. Console öffnen: **<https://console.cloud.google.com/>**
2. Oben links Project Selector klicken → **"NEW PROJECT"**.
3. Werte:
   - **Project name**: `learnbuddy-prod`
   - **Project ID**: wird automatisch erzeugt, z. B. `learnbuddy-prod-471823` — **diese ID notieren**, sie geht später in `GOOGLE_CLOUD_PROJECT`.
   - **Location**: "No organization" (Privatperson hat keine Org)
4. "CREATE" klicken. Nach ~10 Sekunden ist das Projekt aktiv.
5. Sicherstellen, dass das neue Projekt im Project Selector oben links ausgewählt ist (sonst landen alle Schritte unten im falschen Projekt).

> **Naming-Tipp**: Ein zweites Projekt `learnbuddy-dev` anlegen lohnt sich später für die Trennung von Entwicklungs- und Produktions-Spend. Für D1 reicht zunächst eins.

---

## 3. Billing + Budget Alerts

1. **Console → Navigation Menu (☰) → Billing**.
2. "LINK A BILLING ACCOUNT" wenn noch nicht verknüpft.
3. **Budgets & alerts → CREATE BUDGET**:
   - **Name**: `learnbuddy-monthly`
   - **Time range**: Monthly
   - **Scope**: nur das `learnbuddy-prod` Projekt
   - **Amount**: z. B. **€20** als harter Deckel für die Anfangsphase
   - **Threshold rules**:
     - 50 % → Email
     - 90 % → Email
     - 100 % → Email
     - (Bei 100 % bekommst du Email — **aber die API läuft weiter**. Hard-Stop ist nicht eingebaut. Wenn du das willst, brauchst du eine Pub/Sub-Funktion, die das Billing Account bei 100 % deaktiviert. Optional, für Einstieg nicht nötig.)
   - **Email recipients**: deine Email
4. "FINISH".

---

## 4. Vertex AI API aktivieren

1. **Console-Suche oben (Lupe)** → "Vertex AI" tippen → den Menüpunkt "Vertex AI" anklicken (NICHT "Agent Builder" oder "AI Studio" — siehe Begriffs-Wirrwarr oben).
2. Du landest auf dem **Vertex AI Dashboard**. Falls ein Onboarding-Banner "Enable Vertex AI API" anzeigt: klicken.
3. Sonst manuell:
   - Console → APIs & Services → Enabled APIs & services → **+ ENABLE APIS AND SERVICES**
   - Suchen: `Vertex AI API` → enable
   - **`aiplatform.googleapis.com`** ist der eine API, den du wirklich brauchst
4. Optional, falls die Console fragt: **"ENABLE ALL RECOMMENDED APIs"** aktiviert zusätzlich Compute / Storage / Logging — schadet nicht, aber Vertex AI alleine reicht.
5. Akzeptiere die "Generative AI Terms" / "Gen AI Additional Terms" wenn ein Modal erscheint.
6. Modell auswählen: **Vertex AI → Model Garden** (in der linken Seitenleiste). Such nach `Gemini 2.5 Flash-Lite`. Du musst nichts "anklicken" oder einkaufen — sobald die Vertex AI API aktiv ist und dein Service Account die `Vertex AI User`-Rolle hat (Schritt 6), darfst du das Modell per API ansprechen. Model Garden ist Katalog + Doku, keine "Aktivierungsgeste" pro Modell nötig.

> Wenn du in Model Garden ein Modell mit "Open Notebook" / "Deploy" siehst — das ist für eigene Custom-Modelle oder Open-Source-Hosting auf Vertex. Für Gemini (Googles eigene Modelle) reicht der API-Call, kein Deployment.

---

## 5. Region wählen — wichtig für GDPR

Vertex AI Gemini 2.5 Flash-Lite ist in mehreren EU-Regionen verfügbar. Für LearnBuddy:

| Region                  | Code           | Notizen                                                              |
| ----------------------- | -------------- | -------------------------------------------------------------------- |
| **Niederlande**         | `europe-west4` | Empfohlen. Mature, alle Gemini-Modelle, EU-data-residency garantiert |
| Belgien                 | `europe-west1` | Auch ok, gleiche Garantien                                           |
| Deutschland (Frankfurt) | `europe-west3` | Verfügbar aber Gemini-2.5-Verfügbarkeit teils verzögert              |

**Wahl: `europe-west4`** — wird unten als Wert für `GOOGLE_VERTEX_LOCATION` verwendet.

GDPR-relevant:

- Daten bleiben in der gewählten Region (Vertex AI Data Residency Commitment)
- Customer Data wird NICHT für Modelltraining verwendet (Default-Verhalten, siehe Vertex AI Data Governance Doc)
- Logging-Daten bleiben ebenfalls in der Region (Cloud Logging in `europe-west4`)

---

## 6. Service Account + JSON-Key

Vertex authentifiziert via Service-Account-JSON. Niemals OAuth User Credentials in Server-Code.

1. **Console → IAM & Admin → Service Accounts**
2. **"+ CREATE SERVICE ACCOUNT"**:
   - **Name**: `learnbuddy-vertex`
   - **Description**: "Vertex AI calls from LearnBuddy API"
   - Klick "CREATE AND CONTINUE"
3. **Roles** vergeben — minimal:
   - **`Vertex AI User`** (`roles/aiplatform.user`) — reicht für `generateContent` / Vision
   - Falls du Bilder erst nach GCS lädst (NICHT im aktuellen Plan; LearnBuddy nutzt Supabase Storage): zusätzlich **`Storage Object Viewer`**
4. "CONTINUE" → "DONE".
5. In der Liste den neuen Service Account anklicken → **Tab "KEYS"** → **"ADD KEY" → "Create new key" → JSON → CREATE**.
6. Datei wird heruntergeladen, z. B. `learnbuddy-prod-471823-abc123.json`.
7. **Umbenennen** zu etwas Übersichtlichem: `~/.config/learnbuddy/vertex-sa.json`.
   ```sh
   mkdir -p ~/.config/learnbuddy
   mv ~/Downloads/learnbuddy-prod-*.json ~/.config/learnbuddy/vertex-sa.json
   chmod 600 ~/.config/learnbuddy/vertex-sa.json
   ```

> **Wichtig**: Diese JSON-Datei enthält den Private Key. Nicht ins Git-Repo. `.gitignore` enthält bereits `*.json` nicht generisch, also entweder den Pfad oben (`~/.config/learnbuddy/`) nutzen oder explizit `vertex-sa*.json` ignorieren.

---

## 7. Lokale Entwicklung — Env-Variablen

Die API liest ihre Konfiguration über `apps/api/src/config.ts` (Vorlage: `apps/api/.env.example`).
Der Node-Server (`pnpm --filter @learnbuddy/api dev`) lädt `apps/api/.env.local` automatisch.

```env
# apps/api/.env.local  (NICHT ins Repo committen)
LLM_BACKEND=vertex
GOOGLE_CLOUD_PROJECT=<deine-projekt-id>
GOOGLE_VERTEX_LOCATION=europe-west4
GOOGLE_APPLICATION_CREDENTIALS=/Users/<dein-user>/.config/learnbuddy/vertex-sa.json
# Modelle (Standardwerte):
VERTEX_MODEL_SMART=gemini-2.5-flash
VERTEX_MODEL_FAST=gemini-2.5-flash-lite
```

Ohne diese Werte läuft die API mit `LLM_BACKEND=disabled`: Buddy sagt dann ehrlich, dass er gerade
nicht antworten kann, und nutzt feste Ersatzabläufe (vorbereitete Übung vor einer Arbeit usw.).

---

## 8. Vercel / Produktions-Deployment

1. **Vercel Dashboard → Project → Settings → Environment Variables**.
2. Anlegen:
   - `LLM_BACKEND` = `vertex`
   - `GOOGLE_CLOUD_PROJECT` = deine Projekt-ID
   - `GOOGLE_VERTEX_LOCATION` = `europe-west4`
   - `GOOGLE_APPLICATION_CREDENTIALS_JSON` = Inhalt der JSON-Datei (mehrzeilig ist ok)
3. Die API schreibt den JSON-String beim Start in eine Tempdatei (Rechte 0600) und setzt
   `GOOGLE_APPLICATION_CREDENTIALS` darauf (`apps/api/src/llm/vertex.ts`).

> **Alternative**: GCP Workload Identity Federation (ohne Key-Datei) — lohnt sich, sobald der Dienst produktiv läuft.

---

## 9. Connectivity-Test

Mit gesetzten Variablen (siehe §7) prüft dieses Skript eine echte, strukturierte Modellantwort
über denselben Weg, den Buddy nutzt (JSON-Schema, Timeout, Token-Grenzen):

```sh
cd apps/api
npx tsx scripts/probe-model.ts
```

Erwartung: eine Zeile mit `ok: true`, dem Modellnamen, Tokens und Kosten. Häufige Fehler:

- `PERMISSION_DENIED: aiplatform.endpoints.predict` → Service Account fehlt die Rolle `Vertex AI User` (Schritt 6.3)
- `404 Model not found` → Region oder Modellname falsch
- `Could not load the default credentials` → `GOOGLE_APPLICATION_CREDENTIALS` nicht gesetzt

---

## 10. Quotas — Standardlimits prüfen

**Console → Vertex AI → Quotas & System Limits**, filtern nach `europe-west4`:

- **Online prediction requests per minute per region per project**: default 600–1000, reicht weit
- **Gemini Flash-Lite tokens per minute**: meist 5M, reicht weit
- **Gemini Flash-Lite requests per day**: meist 1500/Tag bei Free Trial, danach unlimited

Falls du gegen ein Limit läufst (passiert beim Eval-Harness-Run, der mehrere hundert Calls in kurzer Zeit feuert), Quota Increase Request über die UI stellen — bei Privatperson + 5-stelligen RPM-Anfragen wird das in <24h genehmigt.

---

## 11. GDPR-Akte — was du dir aufheben solltest

Für deine eigene Datenschutz-Dokumentation (falls jemals nötig):

1. **DPA**: <https://cloud.google.com/terms/data-processing-addendum> — als PDF speichern.
2. **Subprocessor list**: <https://cloud.google.com/terms/subprocessors> — speichern, aktuelles Datum notieren.
3. **Vertex AI Data Governance**: <https://cloud.google.com/vertex-ai/docs/general/data-governance> — bestätigt, dass Customer Data nicht zum Training verwendet wird.
4. **EU Data Boundary Commitment**: <https://cloud.google.com/blog/products/identity-security/announcing-eu-sovereign-controls-for-google-workspace> — relevant falls du das in der Privacy Policy referenzieren willst.

In LearnBuddys `docs/privacy.md` §Processors Vertex AI eintragen, wenn D1 live geht.

---

## 12. Kostenkontrolle nach Setup

Drei Schichten, alle wichtig:

1. **Google-side Budget Alert** (Schritt 3) — Email-Warnung bei 50/90/100 %.
2. **LearnBuddy-side Credit Bucket** (Doc 08) — pro Account harter Cap, refund bei Fehler. Bereits implementiert in Slice C2.
3. **Per-Action Cap** (Doc 08 §estimates → "Cap"-Spalte) — server-side reject wenn ein einzelner Call > Cap-Credits kosten würde. Wird in D1 implementiert.

---

## 13. Troubleshooting-Cheatsheet

| Symptom                                      | Wahrscheinliche Ursache                               | Fix                                                          |
| -------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------ |
| `PERMISSION_DENIED` bei `generateContent`    | SA fehlt `Vertex AI User` Rolle                       | Schritt 6.3                                                  |
| `Could not load default credentials`         | `GOOGLE_APPLICATION_CREDENTIALS` nicht im Process-Env | `.env.local` laden in dev-server                             |
| `404 Model not found`                        | Region kennt das Modell nicht oder Tippfehler         | `europe-west4` + `gemini-2.5-flash-lite`                     |
| `RESOURCE_EXHAUSTED: Quota exceeded`         | Quota-Limit erreicht                                  | Console → Quotas → Increase Request                          |
| `BILLING_DISABLED`                           | Billing-Account nicht verknüpft                       | Schritt 3, Project → Billing                                 |
| Free Trial credits laufen ab, $0.30 Rechnung | Trial vorbei, neuer Spend                             | Budget Alert ist da; keine Action nötig solange unter Deckel |

---

## 14. Mental Model — was passiert eigentlich

Wenn LearnBuddys `POST /materials` einen Vision-Call macht:

```
Mobile (Browser/App)
  → LearnBuddy API (Hono auf Vercel, EU-Region)
    → @google-cloud/vertexai SDK
      → google-auth-library reads ~/.config/learnbuddy/vertex-sa.json
        → exchanges private key for short-lived OAuth token
          → POST https://europe-west4-aiplatform.googleapis.com/v1/projects/learnbuddy-prod-471823/locations/europe-west4/publishers/google/models/gemini-2.5-flash-lite:generateContent
            → Response: { candidates: [...] }
              → tokens × price wird in apps/api/src/lib/credits.ts dem Account abgezogen
```

Daten verlassen die EU nicht, der private Key verlässt deinen Server nicht (nur kurzlebige Tokens), und LearnBuddys Logging schreibt nur Token-Counts + Latenz, keinen Prompt-Inhalt (Doc 09 §6 Sentry scrubbing).

---

## Quick-Reference-Kommandos

```sh
# Service-Account aktivieren in der gcloud CLI (optional, für manuelle Probes)
gcloud auth activate-service-account --key-file=~/.config/learnbuddy/vertex-sa.json
gcloud config set project learnbuddy-prod-471823

# Aktuell aktiven Account prüfen
gcloud auth list

# Liste der verfügbaren Modelle in der Region
gcloud ai models list --region=europe-west4 --filter='displayName:gemini*'

# Eingestellten Project und Region prüfen
echo "Project: $GOOGLE_CLOUD_PROJECT"
echo "Location: $GOOGLE_VERTEX_LOCATION"
echo "Creds: $GOOGLE_APPLICATION_CREDENTIALS"
ls -la "$GOOGLE_APPLICATION_CREDENTIALS"
```

---

## Danach

Mit gesetzten Variablen nutzt Buddy das Modell für Gespräche, Hintergrund-Checks, das Lesen von
Arbeitsblättern und den Übungs-Tutor. Kosten werden pro Aufruf in `llm_calls` erfasst und pro
Lernendem und Tag begrenzt (`docs/architecture.md` §Limits).
