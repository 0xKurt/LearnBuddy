// INFORMATIK: Quelltext lesen, Ausgabe vorhersagen, Fehler finden, selbst programmieren
// (issue #262, Bausteine `QUELLTEXT` und `CODE_RUN` aus der Analyse #224).
//
// Dieselbe Bauweise wie Bruchbalken (#162) und Notenzeile (#226): **das Modell wählt, Code
// rechnet.** Ein `CodeTask` ist alles, was das Modell sagen darf — ein Programm, eine Aufgabe,
// Testeingaben. Was die Lernende sieht und woran sie gemessen wird, schreibt der Server
// (`apps/api/src/modules/practice/code.ts`), und jeder Schlüssel kommt aus einer AUSFÜHRUNG:
//   · „Was gibt das Programm aus?" — Code führt das Programm aus; die Ausgabe ist der Schlüssel.
//   · „In welcher Zeile bricht es ab?" — Code führt es aus; die Zeile des Fehlers ist der Schlüssel.
//   · „Schreibe eine Funktion …" — Code führt die Musterlösung auf den Testeingaben aus; ihre
//     Ergebnisse sind die erwarteten Werte. Ihre eigene Funktion läuft gegen dieselben Tests.
//
// Das Modell schreibt seine Erwartung trotzdem dazu (`output`, `line`, `expected`) — nicht als
// Schlüssel, sondern als PROBE: weicht sie von der Ausführung ab, hat das Modell sein eigenes
// Programm nicht verstanden, und dann entsteht keine Frage (issue #262, „Mechanisch geprüft").
//
// Ausgeführt wird in einem eigenen Interpreter einer Lehr-Teilmenge von Python, der nichts kann
// außer rechnen und `print` — kein Netz, keine Dateien, keine Uhr, gezählte Schritte und
// gezählter Speicher (`apps/api/src/modules/practice/python/`). Das Bedrohungsmodell steht in
// `docs/architecture.md` §Informatik und `docs/dpia.md`.

import { z } from 'zod';

/** Die Sprachen, die ausgeführt werden können. Eine — siehe `docs/architecture.md` §Informatik. */
export const CODE_LANGUAGES = ['python'] as const;
export const CodeLanguage = z.enum(CODE_LANGUAGES);
export type CodeLanguage = z.infer<typeof CodeLanguage>;

/**
 * Die meisten Zeilen eines GEZEIGTEN Programms. Zwölf, und das ist gerechnet: bei 20 pt
 * Zeilenhöhe sind es 240 pt Code, und auf einem 360×740-Handy bleiben daneben Frage, Antwortfeld
 * und „Prüfen" sichtbar, ohne dass irgendetwas scrollt (CLAUDE.md Regel 16).
 */
export const CODE_LINES_MAX = 12;
/**
 * Die meisten Zeilen eines Programms, dessen FEHLERZEILE sie antippt: acht, weil dort jede
 * Zeile ein Tippziel von 44 pt ist (CLAUDE.md, Touch-Ziele) — 8 × 44 = 352 pt.
 */
export const CODE_PICK_LINES_MAX = 8;
/**
 * Die längste Zeile. 40 Zeichen passen bei 13 pt Monospace auf ein 360 pt breites Handy; was
 * darüber hinausgeht, scrollt waagerecht, aber nur im Block (issue #262, Plan 1).
 */
export const CODE_LINE_CHARS_MAX = 48;
/** Die längste Ausgabe, nach der gefragt wird: acht Zeilen, 160 Zeichen. */
export const OUTPUT_LINES_MAX = 8;
export const OUTPUT_CHARS_MAX = 160;

// ─────────────── die gezeigte Quelle ───────────────

/** Wie ein Stück Quelltext gefärbt wird. Die Farbe dazu kommt aus dem Theme der App. */
export const CodeSpanKind = z.enum([
  'plain',
  'keyword',
  'builtin',
  'function',
  'string',
  'number',
  'comment',
]);
export type CodeSpanKind = z.infer<typeof CodeSpanKind>;

export const CodeSpan = z.object({ text: z.string().max(200), kind: CodeSpanKind });
export type CodeSpan = z.infer<typeof CodeSpan>;

/**
 * Das gezeigte Programm (`ItemView.figure`): Zeile für Zeile, schon gefärbt. Monospace,
 * Einrückung und Zeilennummern zeichnet die App; die Zeilennummer ist der Index + 1.
 *
 * Sie steht in `Figure` und **nicht** in `ModelFigure`: ein Programm, nach dessen Ausgabe oder
 * Fehlerzeile gefragt wird, IST der Schlüssel — schriebe das Modell es neben eine eigene Frage,
 * gäbe es wieder zwei Autoren, die einander widersprechen können (die Lehre aus issue #157).
 */
export const CodeFigure = z.object({
  type: z.literal('code'),
  language: CodeLanguage,
  lines: z.array(z.array(CodeSpan).max(80)).min(1).max(CODE_LINES_MAX),
  /**
   * Zeilennummern zeigen. Ein Programm hat sie (nach ihnen wird gefragt), die Beispielaufrufe
   * einer Funktionsaufgabe nicht: dort wären „1" und „2" Zahlen ohne Bedeutung.
   */
  numbered: z.boolean().default(true),
});
export type CodeFigure = z.infer<typeof CodeFigure>;

// ─────────────── was sie tut ───────────────

/**
 * Sie tippt die Zeile an, in der das Programm abbricht (`ItemView.surface`). Die Zeilen sind die
 * der Figur; die Antwort reist als Zeilennummer in `text`.
 */
export const CodeLineSurface = z.object({
  mode: z.literal('code_line'),
  lines: z.number().int().min(1).max(CODE_PICK_LINES_MAX),
});
export type CodeLineSurface = z.infer<typeof CodeLineSurface>;

/**
 * Sie schreibt Code oder eine Ausgabe in ein Feld mit fester Zeichenbreite, ohne Autokorrektur
 * und ohne automatische Großschreibung — eine Handytastatur, die aus `print` ein `Print` macht,
 * würde ihr sonst einen Fehler unterschieben, den sie nicht gemacht hat.
 *
 * `starter` ist der Anfang, den das Feld schon trägt (`def summe(a, b):` und eine Einrückung) —
 * nie ein Teil der Lösung: der Name und die Parameter stehen in der Frage.
 */
export const CodeTypeSurface = z.object({
  mode: z.literal('code_type'),
  purpose: z.enum(['output', 'program']),
  starter: z.string().max(200),
});
export type CodeTypeSurface = z.infer<typeof CodeTypeSurface>;

// ─────────────── die geprüfte Aufgabe ───────────────

/** Ein Python-Bezeichner, wie ein Kind ihn schreibt — ASCII, damit er überall tippbar ist. */
const Identifier = z.string().regex(/^[a-z_][a-z0-9_]{0,23}$/);

/** Ein Programm, wie das Modell es schreiben darf. Code prüft danach, ob es läuft und passt. */
const Program = z
  .string()
  .min(1)
  .max(600)
  .describe(
    `Python source, at most ${CODE_LINES_MAX} lines of at most 40 characters, 4-space indentation.`,
  );

export const CodeTask = z.discriminatedUnion('task', [
  z
    .object({
      task: z.literal('predict_output'),
      language: CodeLanguage.default('python'),
      program: Program,
      output: z
        .string()
        .max(400)
        .describe(
          'Exactly what the program prints. The server RUNS the program and writes no question when this differs from the real output — so this checks your own reading, it is never the key.',
        ),
    })
    .describe(
      'What does this program print? The learner reads the program and types its output. Short, deterministic, at most 8 printed lines.',
    ),
  z
    .object({
      task: z.literal('find_error'),
      language: CodeLanguage.default('python'),
      program: Program,
      line: z
        .number()
        .int()
        .min(1)
        .max(CODE_PICK_LINES_MAX)
        .describe(
          'The line (1-based) where Python stops with the error. The server runs the program and writes no question when it stops elsewhere or not at all.',
        ),
    })
    .describe(
      `Which line breaks? A program of at most ${CODE_PICK_LINES_MAX} lines that stops with a RUNTIME error (an unknown name, a text plus a number, a division by zero, an index or key that does not exist). Not a syntax error and not a wrong result — only an error Python itself reports in one line. The learner taps that line.`,
    ),
  z
    .object({
      task: z.literal('write_function'),
      language: CodeLanguage.default('python'),
      name: Identifier.describe('The function name, lowercase ASCII.'),
      params: z.array(Identifier).max(3).describe('The parameter names, lowercase ASCII.'),
      statement: z
        .string()
        .min(10)
        .max(300)
        .describe(
          'What the function should do, in the learner’s language, without the signature and without examples — the app adds both. Say what it RETURNS (return, not print).',
        ),
      tests: z
        .array(
          z.object({
            args: z
              .string()
              .max(80)
              .describe(
                'The arguments as Python literals, comma-separated: `3, 4` or `[1, 2, 3]` or `"Hallo"`.',
              ),
            expected: z
              .string()
              .max(80)
              .describe(
                'The returned value as a Python literal. Checked against your solution, never the key.',
              ),
          }),
        )
        .min(3)
        .max(6),
      solution: Program.describe(
        'A correct solution that defines the function — and nothing else.',
      ),
    })
    .describe(
      'Write a function: the learner writes it and it runs against the tests. The expected values come from RUNNING your solution; a test whose `expected` disagrees with it, or a solution that fails, costs the question.',
    ),
]);
export type CodeTask = z.infer<typeof CodeTask>;
export type CodeTaskName = CodeTask['task'];
