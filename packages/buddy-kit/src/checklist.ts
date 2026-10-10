// BUDDY-SETUP.md in a freshly created project: what create-buddy did, what is left, in order.
// The owner's "smallest version" (issue #107, 29.09.): copy, take the learning parts out, set up
// by hand following this list — automate only what repeats.

import type { BuddyConfig } from './config.js';
import type { CreateReport } from './create.js';
import { NOT_DELETABLE } from './provision.js';
import { manualSteps } from './steps.js';

export function checklistMarkdown(config: BuddyConfig, report: CreateReport): string {
  const { name, id, bundleId, scheme } = config.identity;
  const top = report.leftovers.slice(0, 25);
  const total = report.leftovers.reduce((s, l) => s + l.count, 0);
  const domainFiles = report.domain.reduce((s, d) => s + d.files, 0);
  const out: string[] = [
    `# ${name} — Einrichtung`,
    '',
    `Erzeugt von \`create-buddy\` (Issue #107). Id \`${id}\`, Bundle \`${bundleId}\`, Scheme \`${scheme}://\`, Zielgruppe \`${config.policy.audience}\`, Sprachen ${config.content.locales.join(', ')}.`,
    '',
    '## 1. Was schon passiert ist',
    '',
    `- ${report.copied} Dateien kopiert; nicht kopiert: Git-Historie, Berichte, Entscheidungen und Audits der Quelle, ihre \`google-services.json\`, alle Schlüssel- und \`.env\`-Dateien und der Generator selbst (${report.skipped.length} Dateien).`,
    `- Neue Identität in ${report.rewritten.length} Dateien (u. a. \`apps/mobile/app.json\`, \`eas.json\`, \`package.json\`, \`infra/supabase/config.toml\`, \`.github/workflows/health.yml\`, \`CLAUDE.md\`).`,
    `- **Keine Verbindung zur Quelle:** ihr Expo-Projekt, ihre Update-URL, die API- und Supabase-Adressen der Builds, ihre Produktions-API im Health-Workflow, ihr lokaler Supabase-Stack und ihr Repository sind ersetzt; \`create-buddy\` hat das geprüft (${report.links.length} Funde).`,
    '- `buddy.config.json` (identity · policy · content · wiring · legal) und `docs/legal/processors.md` geschrieben.',
    '',
    '## 2. Lern-Domain (noch enthalten)',
    '',
    `Der generische Kern importiert die Lern-Domain heute noch (\`pnpm guards\` → „Grenzen generisch → Domain“ zählt die Importe). Bis die Schnitte aus #107 durch sind, ist sie in dieser Kopie: **${domainFiles} Dateien**.`,
    '',
    ...report.domain.filter((d) => d.files > 0).map((d) => `- \`${d.pattern}\` — ${d.files}`),
    '',
    `Dazu ${total} Stellen in ${report.leftovers.length} Dateien, die den Namen der Quelle tragen. Wo am meisten steht:`,
    '',
    ...top.map((l) => `- \`${l.file}\` — ${l.count}`),
    ...(report.leftovers.length > top.length
      ? [`- … und ${report.leftovers.length - top.length} weitere Dateien`]
      : []),
    '',
    'Nach jedem Schritt: `pnpm typecheck && pnpm lint && pnpm test`.',
    '',
    '## 3. Fähigkeiten',
    '',
    `Gewählt: ${config.wiring.capabilities.join(', ') || 'keine'}. Nicht gewählte Fähigkeiten sind **noch im Code** (native Module, Berechtigungen in \`apps/mobile/app.json\`): ein Plugin nur aus der Konfiguration zu streichen, während der Code es importiert, ließe die App beim Start abstürzen.`,
    '',
    '## 4. Infrastruktur',
    '',
    '`pnpm provision --dry-run` zeigt, was entsteht, und schreibt nichts. `pnpm provision` erledigt den lokalen Teil (Secrets, Status, Ids in `app.json`, `eas.json` und `health.yml`). Von Hand, in dieser Reihenfolge:',
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
