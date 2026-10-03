// BUDDY-SETUP.md in a freshly created project: what create-buddy did, what is left, in order.
// The owner's "smallest version" (issue #107, 29.09.): copy, take the learning parts out by
// hand, set up by hand following this list — automate only what repeats.

import type { BuddyConfig } from './config.js';
import type { CreateReport } from './create.js';
import { manualSteps, NOT_DELETABLE } from './provision.js';

export function checklistMarkdown(config: BuddyConfig, report: CreateReport): string {
  const { name, id, bundleId, scheme } = config.identity;
  const top = report.leftovers.slice(0, 25);
  const total = report.leftovers.reduce((s, l) => s + l.count, 0);
  const out: string[] = [
    `# ${name} — Einrichtung`,
    '',
    `Erzeugt von \`create-buddy\` aus LearnBuddy (Issue #107). Id \`${id}\`, Bundle \`${bundleId}\`, Scheme \`${scheme}://\`, Zielgruppe \`${config.policy.audience}\`, Sprachen ${config.content.locales.join(', ')}.`,
    '',
    '## 1. Was schon passiert ist',
    '',
    `- ${report.copied} Dateien kopiert; nicht kopiert: Git-Historie, \`docs/legacy\`, \`reports\`, \`research_notes\`, \`design-examples\`, LearnBuddys \`google-services.json\` und alle Schlüsseldateien (${report.skipped.length} Dateien).`,
    `- Neue Identität in: ${report.rewritten.map((f) => `\`${f}\``).join(', ')}. LearnBuddys Expo-Projekt, Update-URL und die API-/Supabase-Adressen der Builds sind **entfernt** — diese App kann LearnBuddys Backend nicht erreichen.`,
    '- `buddy.config.json` (identity · policy · content · wiring · legal) und `docs/legal/processors.md` geschrieben.',
    '',
    '## 2. Lern-Domain entfernen (von Hand, Issue #107 §6)',
    '',
    `Diese Kopie ist noch LearnBuddy mit neuem Namen: **${total} Stellen in ${report.leftovers.length} Dateien** sagen „LearnBuddy". Herauszulösen sind Material, Übung, Tutor, Mathe-Rendering, Vokabeln, Fächer und Klassenstufe; die Grenzen dafür nennt #107 §6 (\`identity/privacy.ts\`, \`scheduler/tick.ts\`, \`materials/purge.ts\`, \`modules/buddy\`). Danach eine **frische Basis-Migration** ohne Lern-Tabellen (Regel 10 gilt ab da für diese App).`,
    '',
    'Wo am meisten steht:',
    '',
    ...top.map((l) => `- \`${l.file}\` — ${l.count}`),
    ...(report.leftovers.length > top.length
      ? [`- … und ${report.leftovers.length - top.length} weitere Dateien`]
      : []),
    '',
    'Nach jedem Schritt: `pnpm typecheck && pnpm lint && pnpm test` und `sh scripts/web-walkthrough.sh`.',
    '',
    '## 3. Fähigkeiten',
    '',
    `Gewählt: ${config.wiring.capabilities.join(', ') || 'keine'}. Nicht gewählte Fähigkeiten sind **noch im Code** (native Module, Berechtigungstexte in \`apps/mobile/app.json\`): sie zu entfernen gehört zu Schritt 2 — ein Plugin nur aus der Konfiguration zu streichen, während der Code es importiert, ließe die App beim Start abstürzen.`,
    '',
    '## 4. Infrastruktur',
    '',
    '`pnpm provision --plan` zeigt alles, `pnpm provision` erledigt den lokalen Teil (Secrets, Status, Ids in `app.json`/`eas.json`). Von Hand, in dieser Reihenfolge:',
    '',
    ...manualSteps(config, {}).flatMap((m) => [
      `- [ ] **${m.area}: ${m.title}**`,
      ...m.how.map((h) => `  - ${h}`),
    ]),
    '',
    '## 5. Was sich nicht wieder löschen lässt',
    '',
    ...NOT_DELETABLE.map((n) => `- ${n}`),
    '',
  ];
  return out.join('\n');
}
