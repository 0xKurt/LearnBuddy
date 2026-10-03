// The processor list a new Buddy has to name in its privacy text and DPIA, derived from what it
// actually switches on (issue #107 §4) — the same list docs/privacy.md §Processors keeps for
// LearnBuddy. Generated, so a capability that adds a processor cannot be chosen silently.

import type { BuddyConfig, Capability } from './config.js';

export type Processor = {
  name: string;
  purpose: string;
  /** Where it processes, as far as this kit enforces or knows it. */
  where: string;
  /** What has to be done before it may run (contract, legal review). */
  before: string;
};

const ALWAYS: Processor[] = [
  {
    name: 'Supabase',
    purpose: 'Datenbank, Anmeldung, Dateiablage',
    where: 'EU, Region eu-central-1 (Frankfurt) — vom Kit erzwungen',
    before: 'AV-Vertrag (Art. 28) mit dem Verantwortlichen',
  },
  {
    name: 'Vercel',
    purpose: 'API-Funktion',
    where: 'Region fra1 (Frankfurt) — vom Kit erzwungen',
    before: 'AV-Vertrag; Deployment Protection an; Produktions-Secrets nur für „Production"',
  },
  {
    name: 'Google Cloud — Vertex AI',
    purpose: 'Sprachmodell (Gespräch, Auswertung), Einbettungen',
    where: 'EU-Endpunkt (eu oder europe-*); andere Regionen bricht die API beim Start ab',
    before:
      'Verarbeiterbedingungen schriftlich (kein Training, Missbrauchs-Logging, impliziter Cache, GA-Status) — docs/dpia.md §7',
  },
  {
    name: 'SMTP-Anbieter',
    purpose: 'Bestätigungs- und Passwort-Mails',
    where: 'nach Wahl — EU-Anbieter wählen',
    before: 'AV-Vertrag; das eingebaute Supabase-SMTP ist nicht für Produktion gedacht',
  },
];

const BY_CAPABILITY: Record<Capability, Processor[]> = {
  voice: [
    {
      name: 'Google Cloud — Text-to-Speech',
      purpose: 'natürliche Stimme',
      where: 'nur eu-texttospeech.googleapis.com — von der API erzwungen',
      before: 'Verarbeiterbedingungen schriftlich (Text weder gespeichert noch zum Training)',
    },
    {
      name: 'Apple / Google — Spracherkennung auf dem Gerät',
      purpose: 'Diktat',
      where: 'auf dem Gerät; sonst eigener EU-Weg',
      before: 'auf einem echten iPhone prüfen (docs/privacy.md §Processors)',
    },
  ],
  camera: [],
  share: [],
  push: [
    {
      name: 'Expo Push Service',
      purpose: 'Benachrichtigungen',
      where: 'USA (Unterauftragsverarbeiter)',
      before: 'rechtliche Prüfung vor dem Einschalten (PUSH_BACKEND bleibt sonst disabled)',
    },
    {
      name: 'Apple APNs / Google FCM',
      purpose: 'Zustellung der Benachrichtigungen',
      where: 'Apple / Google',
      before: 'zusammen mit Expo Push prüfen',
    },
  ],
  'crash-reports': [
    {
      name: 'Sentry (Functional Software Inc.)',
      purpose: 'Absturzberichte',
      where: 'EU-Region (*.ingest.de.sentry.io) — von der App erzwungen',
      before: 'AV-Vertrag und Bestätigung der EU-Verarbeitung vor dem Setzen des DSN',
    },
  ],
};

export function processorsFor(config: BuddyConfig): Processor[] {
  return [...ALWAYS, ...config.wiring.capabilities.flatMap((c) => BY_CAPABILITY[c])];
}

export function processorsMarkdown(config: BuddyConfig): string {
  const rows = processorsFor(config).map(
    (p) => `| ${p.name} | ${p.purpose} | ${p.where} | ${p.before} |`,
  );
  return [
    `# Auftragsverarbeiter — ${config.identity.name}`,
    '',
    'Erzeugt von `create-buddy` aus `buddy.config.json` (Fähigkeiten: ' +
      (config.wiring.capabilities.join(', ') || 'keine') +
      '). Ändert sich die Auswahl, `pnpm provision --plan` zeigt die neue Liste.',
    '',
    `**Verantwortlicher:** ${config.legal.controller ?? '— noch nicht eingetragen (legal.controller)'}`,
    '',
    '| Verarbeiter | Zweck | Wo | Vorher nötig |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
}
