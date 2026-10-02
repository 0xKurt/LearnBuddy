-- Proaktiv statt reaktiv, gemessen und gedeckelt (issue #59), und die erlebte Wartezeit vom
-- Gerät (issue #169). Zwei Tabellen, die nichts voneinander wissen.

-- ─────────────── was Buddy vorab vorbereitet ───────────────
--
-- Seit #48 schreibt Buddy die Fragen einer angebotenen Übung, während sie seine Antwort noch
-- liest (`modules/practice/prepare.ts`). Bisher wusste davon nur der Prozess, der es tat: ein
-- `Map` im Speicher. Auf Vercel trifft ihr Tipp aber oft eine ANDERE Instanz — die sah nichts
-- laufen und fragte das Modell ein zweites Mal (doppelte Kosten, volle Wartezeit). Und niemand
-- konnte sagen, wie oft eine Vorbereitung für die Tonne war.
--
-- Eine Zeile je Vorbereitung, die nicht sie angestoßen hat:
--   * `started_at` ohne `finished_at` = läuft gerade. Ihr Tipp auf einer anderen Instanz wartet
--     dann auf genau diese Zeile, statt das Modell nochmal zu fragen (`practice/generate.ts`).
--   * `outcome` sagt, wie es ausging; `ready` heißt: die Sitzung steht (erste Fragen sind da).
--   * `used_at` setzt ihr Tipp. Eine `ready`-Zeile, die nach einem Tag kein `used_at` hat, war ein
--     Modellaufruf für nichts — das ist die Verschwendung, die gemessen und gedeckelt wird
--     (`speculationAllowed` in `prepare.ts`).
-- Kein Inhalt: nur Zeitpunkte, ein Ergebnis und die Sitzung. Gelöscht mit dem Konto und nach
-- 30 Tagen (Aufbewahrung, scheduler/tick.ts).
create table speculative_preparations (
  learner_id uuid not null references learners(id) on delete cascade,
  -- Die Id der Aktion, die das Angebot ist; dieselbe, die ihr Tipp als `client_request_id` schickt.
  client_request_id uuid not null,
  kind text not null check (kind in ('offer')),
  started_at timestamptz not null,
  finished_at timestamptz,
  outcome text check (outcome in ('ready', 'refused', 'failed')),
  session_id uuid references practice_sessions(id) on delete set null,
  used_at timestamptz,
  primary key (learner_id, client_request_id),
  check ((finished_at is null) = (outcome is null))
);
create index speculative_preparations_session_idx on speculative_preparations(session_id)
  where session_id is not null;
-- Der Deckel liest die jüngsten Vorbereitungen einer Lernenden.
create index speculative_preparations_recent_idx
  on speculative_preparations(learner_id, started_at desc);
alter table speculative_preparations enable row level security;

comment on table speculative_preparations is
  'Vorbereitungen, die Buddy von sich aus startet (angebotene Übung, issue #48/#59): läuft / fertig / genutzt. Gemessen und gedeckelt in modules/practice/prepare.ts; kein Inhalt.';

-- ─────────────── wie lange sie auf dem Gerät wartet ───────────────
--
-- Die App misst selbst, wie lange ein Tipp bis zur sichtbaren Reaktion braucht
-- (`apps/mobile/lib/perf.ts`, #66). Bis jetzt blieb das auf dem Gerät: lesbar nur mit
-- `adb logcat` am Kabel — deshalb gab es in vier Tagen genau eine Messreihe vom Handy (#169).
--
-- Jetzt schickt die App ZUSAMMENGEFASSTE Zahlen: je Aktion, wie oft eine Wartezeit in einen
-- festen Eimer fiel. Gespeichert wird je Tag, Plattform, Build-Art, Aktion und Eimer nur eine
-- Zahl. Keine Lernenden-Id, kein Konto, kein Inhalt, keine Uhrzeit, keine Einzelmessung: aus
-- einer Zeile lässt sich nicht einmal sagen, ob sie von einem oder von zwanzig Geräten stammt.
-- Die Aktionen und Eimer sind eine feste Liste im Code (`PerfAction`, `PERF_BUCKETS_MS` in
-- packages/shared-types/src/contracts/perf.ts) — freier Text kommt hier nie an.
create table perf_rollups (
  day date not null,
  platform text not null check (platform in ('ios', 'android', 'web')),
  build text not null check (build in ('release', 'dev')),
  action text not null check (length(action) between 1 and 40),
  -- Obere Grenze des Eimers in ms; 0 heißt „darüber" (größer als der größte Eimer), -1 ist ein
  -- Zähler ohne Dauer (z. B. „das vorab geholte Audio wurde gebraucht").
  bucket_ms int not null check (bucket_ms >= -1),
  count int not null check (count >= 0),
  primary key (day, platform, build, action, bucket_ms)
);
alter table perf_rollups enable row level security;

comment on table perf_rollups is
  'Erlebte Wartezeiten vom Gerät, zusammengefasst: Anzahl je Tag/Plattform/Aktion/Eimer. Keine Person, kein Inhalt (issue #169, docs/privacy.md §Device timing). 180 Tage.';
