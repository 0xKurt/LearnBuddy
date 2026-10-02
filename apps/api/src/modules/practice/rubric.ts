// Eine Schreibaufgabe, Element für Element geprüft (issue #211, Schritt 2 aus #197).
//
// Schritt 1 hat aufgehört zu behaupten: bei einem freien Text gibt es seit #197 kein „Die Lösung
// ist", kein `Again` und kein wackliges Thema. Geblieben ist ein Loch — sie bekam eines von vier
// GESAMTURTEILEN über einen Text, für den es keine Musterlösung gibt. Hier kommt das, was eine
// Klassenarbeit stattdessen tut: sie hakt die geforderten Elemente ab.
//
// ─────────────── Die eine Zahl, an der dieses Feature hängt: EIN Modellaufruf ───────────────
//
// Sechs Pflichtelemente sind nicht sechs Aufrufe. Alles steckt in demselben Tutor-Aufruf, den
// eine Antwort schon immer gekostet hat (`RubricDecision` erweitert `TutorDecision` um ein Feld;
// `service.ts` schickt dasselbe eine Mal). Der Integrationstest beweist das, indem er genau
// einen Aufruf skriptet: ein zweiter wäre `unexpected`, ein ausbleibender wäre `pending`, und
// beides lässt den Test fallen (`writing-rubric.int.test.ts`).
//
// Und für die Hälfte der Elemente wird das Modell überhaupt nicht gefragt: `askedElements` zeigt
// ihm nur, was Code nicht entscheiden kann. Eine Wortzahl und eine Pflichtangabe werden gezählt
// und verglichen — das Modell erfährt nicht einmal, dass sie zur Rubrik gehören, und kann ihnen
// also auch nicht widersprechen. Das ist CLAUDE.md Regel 1 in ihrer stärksten Form: nicht „das
// Modell wird überstimmt", sondern „das Modell wird nicht gefragt".
//
// ─────────────── Regel 0 aus #224: ein Urteil muss auf ihren Text zeigen ───────────────
//
// Was das Modell doch beurteilt, muss es BELEGEN:
//
//   · `judged` — `erfüllt`/`nicht erfüllt` plus ein wörtliches Zitat aus ihrem Text. Code prüft,
//     dass das Zitat wirklich dort steht; sonst gilt das Element als nicht erfüllt. Ein Modell
//     kann damit nichts bestätigen, was sie nicht geschrieben hat.
//   · `tense` — das Modell nennt die VERBEN, bei denen die Zeitform nicht stimmt; Code prüft
//     jedes einzelne gegen ihren Text. Nur ein bestätigtes Verb lässt das Element offen, und
//     dann nennt der nächste Schritt genau dieses Wort aus ihrem eigenen Text.
//
// Bleibt eine Beurteilung ganz aus, steht das Element auf `unknown` — nicht auf „fehlt". Dann hat
// niemand etwas gemessen, und ein `unknown`-Element wird nie der nächste Schritt (Regel 5).
//
// ─────────────── Was eine teilweise erfüllte Rubrik heißt ───────────────
//
// Dieselbe Antwort wie bei einer mehrteiligen Antwort, aus demselben Grund, und bewusst keine
// zweite Antwort auf dieselbe Frage:
//
//   1. **Hält ein Teil, ist es `partially_correct`, und die Frage bleibt OFFEN.** Nicht
//      `correct`, weil noch etwas fehlt; nicht `incorrect`, weil das wegwerfen würde, was schon
//      trägt — und genau das tut eine Klassenarbeit NICHT. Erst wenn kein Element hält, ist es
//      `incorrect`; dann gibt es nichts, was man ihr wegnehmen könnte.
//   2. **FSRS bekommt daraus keinen Bruchteil.** Es gibt kein „0,75 von Good": FSRS kennt drei
//      Noten (`fsrs.ts`). Eine erfundene Zwischennote wäre die Behauptung, sie beherrsche das
//      Thema zu drei Vierteln — eine Zahl, die niemand gemessen hat. Hier muss dafür nichts
//      gebaut werden: eine teilweise erfüllte Rubrik schließt die Frage nicht, schreibt also
//      keine Wiederholung, und ein freier Text bekommt seit #197 ohnehin nur dann eine
//      Bewertung, wenn er richtig war (`service.ts`, `rateable`).
//   3. **Der Satz nennt EINEN nächsten Schritt, keine Abarbeitungsliste.** Dieselbe
//      Entscheidung, die `chemistry.ts` bei mehreren unausgeglichenen Elementen trifft und
//      begründet: „alle auf einmal zu nennen ist eine Liste statt eines nächsten Schritts."
//      Die Elemente selbst stehen daneben, jedes mit seinem Stand — das ist die Rückmeldung
//      pro Element, die #211 verlangt; der SATZ ist einer.
//   4. **Keine Zahl, kein Punktestand, keine Note.** Nicht „vier von sechs": das wäre eine Note
//      mit einem anderen Namen (CLAUDE.md Regel 6, Abnahme von #211). Die Elemente stehen als
//      Liste neben dem Satz (`rubricFeedback`, seit #236/#258 eine Struktur und keine Zeile
//      mehr), jedes mit „drin" oder „fehlt noch" in Worten — nie nur als Farbe oder Symbol.
//
// ─────────────── Zwei Formen, ein Mechanismus (issues #236, #258) ───────────────
//
//   · `text` — eine Schreibaufgabe einer Textsorte, bis zum Aufsatz (#258): Wortzahl, Absätze,
//     Pflichtangaben, Zeilenangaben (deren Zeile es im Material geben muss) und Zeitform zählt
//     Code; dazu bis zu DREI Stellen aus ihrem Text zum Verbessern, jede ein Zitat, das Code in
//     ihrem Text findet (`spotsIn`).
//   · `explain` — eine offene Frage, die sie mündlich oder schriftlich ERKLÄRT (#236): 3–6
//     Kernpunkte, jeder beurteilt und mit Zitat belegt, Zahlen und Formeln darin exakt geprüft.
//     Geprüft wird alles, was sie zu dieser Frage gesagt hat — ihre Antwort auf eine Nachfrage
//     ergänzt die erste, sie ersetzt sie nicht. Der nächste Schritt ist EINE Nachfrage zum ersten
//     fehlenden Punkt, die Code wählt (`checkRubric`).

import {
  KEY_POINTS_MAX,
  KEY_POINTS_MIN,
  RUBRIC_QUOTE_MAX,
  RUBRIC_SPOTS_MAX,
  RUBRIC_TIP_MAX,
  RUBRIC_VERBS_MAX,
  Rubric as RubricSchema,
  type Rubric,
  type RubricElement,
  type RubricFeedback,
  type RubricSpotView,
} from '@learnbuddy/shared-types/contracts';
import { normalizeShortAnswer } from '@learnbuddy/shared-math';
import { z } from 'zod';

import { t, type MessageKey } from '../../i18n/index.js';

/**
 * Wie weit „der erste Satz" reicht. Der Satz selbst, und mindestens so viele Zeichen — die
 * GRÖSSERE der beiden Spannen gilt.
 *
 * Absichtlich großzügig, und zwar in genau einer Richtung: ein Satzpunkt steht auch in einer
 * Abkürzung und hinter einer Jahreszahl, und ein zu früh abgeschnittener erster Satz würde eine
 * Angabe, die sie geschrieben HAT, als fehlend melden. Das ist der eine Fehler, den diese Datei
 * nicht machen darf (Regel 1 und Regel 5), also kann die Fensterbreite nur zu groß sein und nie
 * zu klein. Der Preis ist, dass eine Angabe im zweiten Satz als „in der Einleitung" durchgeht —
 * ein Preis, der niemandem etwas wegnimmt.
 */
const OPENING_CHARS = 200;

/** Das Kürzel eines Elements aus seiner Position; das Modell schreibt keine Ids (Regel 2). */
function refOf(index: number): string {
  return `r${index + 1}`;
}

/**
 * Die gespeicherte Rubrik, als Rubrik gelesen — und nie als gegeben genommen (dieselbe Sorgfalt,
 * die `taskOf` für `items.bar_task` aufbringt). Eine Spalte, die nicht mehr passt, ergibt null,
 * und dann verhält sich die Frage genau wie seit #197: Buddy beurteilt, was sie geschrieben hat,
 * und behauptet keine Lösung. Nichts wird geraten.
 */
export function rubricOf(stored: unknown): Rubric | null {
  if (stored === null || stored === undefined) return null;
  const r = RubricSchema.safeParse(stored);
  return r.success ? r.data : null;
}

/** Ziffern nach dem Falten — „CO₂" wird „co2", „mc²" wird „mc2" (NFKC). */
const DIGIT = /[0-9]/;

/**
 * Die Rubrik, die angelegt wird — oder null, und null heißt: die FRAGE bleibt, nur ohne Rubrik.
 * Dasselbe Verhalten, das eine nicht haltbare Figur schon bekommt (`usableFigure`), und aus
 * demselben Grund: eine halbe Rubrik würde Elemente abhaken, die niemand geprüft hat.
 *
 * Gründe, eine Rubrik zu verwerfen, und jeder davon macht sie unprüfbar:
 *
 *   · sie hängt an einer Frage, die kein freier Text ist. Für eine Zahl oder ein Vokabelpaar
 *     gibt es keine Pflichtelemente, und ein Modell, das trotzdem eine schreibt, hat die
 *     Aufgabe missverstanden;
 *   · zwei Elemente mit demselben Namen — sie stünden zweimal in derselben Liste und niemand
 *     könnte sagen, welches gemeint ist;
 *   · eine Wortzahl ohne jede Grenze (beides null) oder mit vertauschten Grenzen: da ist nichts
 *     zu zählen;
 *   · eine Pflichtangabe, von der nach dem Falten kein Zeichen übrig bleibt (nur Satzzeichen):
 *     die würde in jedem Text „gefunden";
 *   · ein exakter Wert (`exact`), in dessen Schreibweisen keine Ziffer steht: dafür ist das Feld
 *     nicht da — ein Wort, das man auch anders sagen darf, wird beurteilt, nicht verglichen.
 *
 * Und für eine ERKLÄRFRAGE (issue #236, Regel 0 „Erzeugung"):
 *
 *   · 3–6 Kernpunkte, jeder beurteilt (`judged`) — die gezählten Prüfarten gehören zu einem Text
 *     einer Textsorte, nicht zu einer Erklärung;
 *   · jeder mit seiner Nachfrage, die eine Frage ist (endet auf „?") und den Wert, den sie
 *     erfragt, nicht selbst nennt (keine seiner exakten Schreibweisen steht darin);
 *   · keiner nennt die Frage wörtlich — ein Kernpunkt „Erkläre die Fotosynthese" wäre in jeder
 *     Antwort „erfüllt", die die Frage wiederholt;
 *   · eine Zahl oder Formel im Namen eines Kernpunkts (nach dem Falten jede Ziffer) muss in
 *     seinen exakten Werten stehen — sonst würde eine Zahl, die Code prüfen kann, einem Urteil
 *     überlassen.
 *
 * Umgekehrt trägt eine Schreibaufgabe (`text`) keine Nachfragen: dort ist der nächste Schritt der
 * Satz `missing`, und eine Nachfrage wäre ein Feld, das nichts liest.
 */
export function usableRubric(
  rubric: Rubric | null | undefined,
  kind: string,
  prompt = '',
): Rubric | null {
  if (!rubric) return null;
  if (kind !== 'long') return null;
  const explain = rubric.kind === 'explain';
  if (explain && rubric.elements.length < KEY_POINTS_MIN) return null;
  if (explain && rubric.elements.length > KEY_POINTS_MAX) return null;
  const question = padded(prompt);
  const names = new Set<string>();
  for (const e of rubric.elements) {
    const key = normalizeShortAnswer(e.name);
    if (key === '' || names.has(key)) return null;
    names.add(key);
    if (e.check.by === 'word_count') {
      const { min, max } = e.check;
      if (min === null && max === null) return null;
      if (min !== null && max !== null && min > max) return null;
    }
    if (e.check.by === 'mentions' && e.check.terms.some((x) => normalizeShortAnswer(x) === '')) {
      return null;
    }
    const exact = e.check.by === 'judged' ? e.check.exact : [];
    for (const group of exact) {
      if (group.some((x) => normalizeShortAnswer(x) === '')) return null;
      if (!group.some((x) => DIGIT.test(normalizeShortAnswer(x)))) return null;
    }
    if (!explain) {
      if (e.ask !== null || e.point !== null) return null;
      continue;
    }
    if (e.check.by !== 'judged') return null;
    if (e.ask === null || !e.ask.trim().endsWith('?')) return null;
    if (exact.some((group) => group.some((x) => says(e.ask ?? '', x)))) return null;
    if (question !== '' && padded(e.name).includes(question)) return null;
    // Was der Kernpunkt sagt, steht in `point` (für das Urteil); sie sieht nur `name`, den
    // ASPEKT — und der steht direkt unter der Nachfrage, die nach genau diesem Punkt fragt.
    // „Ort: Chloroplast" unter „Und wo in der Zelle passiert das?" hätte die Antwort verraten.
    // Also: kein Wort des Punktes im Namen, das nicht schon in der Frage oder der Nachfrage
    // steht, und keine Ziffer.
    if (e.point === null) return null;
    if (DIGIT.test(key) || leaks(e.name, e.point, `${prompt} ${e.ask}`)) return null;
    // Jede Ziffer im Punkt gehört einem exakten Wert: „Beginn 1914" ohne `exact` ["1914"]
    // hätte die Jahreszahl einem Urteil überlassen.
    const numbered = normalizeShortAnswer(e.point)
      .split(' ')
      .filter((w) => DIGIT.test(w));
    const values = exact.flat().map((x) => padded(x));
    if (numbered.some((w) => !values.some((v) => v.includes(` ${w} `)))) return null;
  }
  return rubric;
}

/**
 * Ob der Name eines Kernpunkts seinen Inhalt verrät. Inhalt sind die Wörter des Punktes (ab vier
 * Zeichen, also ohne Artikel und kurze Füllwörter; gefaltet), die weder in der Frage noch in der
 * Nachfrage stehen — was dort steht („Fotosynthese", „Zelle"), liest sie ohnehin. Verglichen wird
 * über den Wortanfang, damit eine Beugung nichts durchlässt: „Chloroplast" im Namen verrät
 * „im Chloroplasten". Was der Wortanfang nicht sieht („Brechung" / „gebrochen"), sieht diese
 * Prüfung nicht — dafür sagt der Generator-Prompt dasselbe in Worten; gemessen ist nur das hier.
 */
function leaks(name: string, point: string, shownAnyway: string): boolean {
  const words = (x: string) =>
    normalizeShortAnswer(x)
      .split(' ')
      .filter((w) => w.length >= 4);
  const related = (a: string, b: string) => a.startsWith(b) || b.startsWith(a);
  const known = words(shownAnyway);
  const content = words(point).filter((w) => !known.some((k) => related(w, k)));
  return words(name).some((w) => content.some((c) => related(w, c)));
}

// ─────────────── was das Modell gefragt wird (und was nicht) ───────────────

/** Ein Element, über das nur das Modell etwas sagen kann — mit dem Kürzel, das der Server vergibt. */
export type AskedElement = {
  ref: string;
  name: string;
  /** What a key point says (issue #236): what the judge looks for — never shown to her. */
  point: string | null;
  check: RubricElement['check'];
};

/**
 * Die Elemente, über die das Modell befragt wird: `tense` und `judged`. Und nur die.
 *
 * Eine Wortzahl und eine Pflichtangabe stehen hier bewusst nicht drin. Sie werden gezählt und
 * verglichen, also wird das Modell dazu nicht gefragt — es erfährt nicht einmal, dass sie zur
 * Rubrik gehören. Damit kann es einer Angabe, die in ihrem Text steht, nicht widersprechen; es
 * gibt keinen Konflikt, der aufgelöst werden müsste (CLAUDE.md Regel 1).
 *
 * Ist die Liste leer, ist der Tutor-Aufruf der gewöhnliche: dieselbe Antwort, dasselbe Schema,
 * ein Aufruf.
 */
export function askedElements(rubric: Rubric): AskedElement[] {
  return rubric.elements
    .map((e, i) => ({ ref: refOf(i), name: e.name, point: e.point, check: e.check }))
    .filter((e) => e.check.by === 'tense' || e.check.by === 'judged');
}

/**
 * Was das Modell über EIN Element sagt. Mehr als das darf es nicht sagen: kein Gewicht, keine
 * Note, keinen eigenen Satz — der Satz an die Lernende wird aus der Rubrik gebaut, damit er
 * dem nicht widersprechen kann, was Code gemessen hat.
 */
export const RubricClaim = z.object({
  element: z
    .string()
    .describe('The element this is about, named by the ref given in REQUIRED ELEMENTS.'),
  met: z
    .boolean()
    .describe('true only if this element really is in her text; otherwise false — never a guess.'),
  quote: z
    .string()
    .trim()
    .max(RUBRIC_QUOTE_MAX)
    .default('')
    .describe(
      'For met = true: the words from HER text that carry this element, copied character for character out of it. The server looks the quote up in her text and does not accept the element without it. Empty for met = false.',
    ),
  verbs: z
    .array(z.string().trim().min(1).max(40))
    .max(RUBRIC_VERBS_MAX)
    .default([])
    .describe(
      'Only for a tense element: the verb forms in HER text that are not in the required tense, copied character for character out of it. Empty when the tense holds throughout. The server looks each of them up in her text.',
    ),
});
export type RubricClaim = z.infer<typeof RubricClaim>;

/**
 * Eine Stelle, an der sie ihren Aufsatz verbessern kann (issue #258) — so, wie das Modell sie
 * nennt. Was davon bei ihr ankommt, entscheidet `spotsIn`: nur ein Zitat, das in ihrem Text steht.
 */
export const RubricSpot = z.object({
  quote: z
    .string()
    .trim()
    .max(RUBRIC_QUOTE_MAX)
    .describe(
      'Words from HER text, copied out of it character for character: the place that can be improved. The server looks the quote up in her text and drops the spot without it.',
    ),
  tip: z
    .string()
    .trim()
    .max(RUBRIC_TIP_MAX)
    .describe(
      "ONE short sentence to her, in the learner's language, saying how this place gets better — a direction, never the rewritten sentence and never a number, a grade or a score.",
    ),
});
export type RubricSpot = z.infer<typeof RubricSpot>;

// ─────────────── prüfen ───────────────

/** Der eine nächste Schritt — nie eine Liste davon (siehe den Kopf dieser Datei). */
export type RubricStep = {
  name: string;
  missing: string;
  /** Code hat es gemessen (`word_count`, `mentions`, ein bestätigtes Verb) — kein Urteil. */
  counted: boolean;
  /** Das Verb aus IHREM Text, dessen Zeitform nicht passt; null sonst. */
  verb: string | null;
  /** Eine Zeilenangabe aus IHREM Text, deren Zeile es im Material nicht gibt („Z. 87"); null sonst. */
  cite: string | null;
  /** Die Nachfrage einer Erklärfrage (#236) — die Worte der Rubrik, nie die des Modells im Moment. */
  ask: string | null;
};

/**
 * Wie ein einzelnes Element nach ihrer Antwort steht. Drei Zustände, und der dritte ist der
 * wichtigste:
 *
 *   · `met`     — Code hat es gefunden: gezählt, verglichen, oder ein Zitat bestätigt.
 *   · `open`    — es ist noch nicht zu sehen. Kein „falsch": ein Element, das noch nicht da ist,
 *                 ist nicht falsch, es ist noch nicht geschrieben.
 *   · `unknown` — dazu liegt nichts vor, weil eine Beurteilung ausblieb, die nur das Modell
 *                 liefern könnte. Dann hat niemand etwas über ihren Text gemessen, und „fehlt"
 *                 wäre eine Behauptung auf nichts (Regel 5). Ein solches Element wird nie der
 *                 nächste Schritt und steht in keiner Zeile, die sie liest.
 *
 * `counted` trennt die zwei Arten von Wissen sichtbar: `true` heißt gezählt oder verglichen,
 * `false` heißt beurteilt — und Buddys Satz sagt es verschieden (bei einem gezählten Element,
 * dass es fehlt; bei einem beurteilten fragt er nach).
 */
export type RubricElementState = {
  /** Das Kürzel, das der SERVER aus der Position vergeben hat ('r1'); das Modell schreibt keine Ids. */
  ref: string;
  name: string;
  state: 'met' | 'open' | 'unknown';
  counted: boolean;
};

export type RubricOutcome = {
  kind: Rubric['kind'];
  form: string;
  elements: RubricElementState[];
  /** Jedes Element steht auf `met`. */
  all: boolean;
  /** Mindestens ein Element steht auf `met`. */
  some: boolean;
  step: RubricStep | null;
};

/** Gefaltet und mit Leerzeichen gerahmt, damit „Jahr" nicht in „Jahrhundert" gefunden wird. */
function padded(s: string): string {
  const folded = normalizeShortAnswer(s);
  return folded === '' ? '' : ` ${folded} `;
}

/** Steht dieser Wortlaut in dem Text — gefaltet (Groß-/Kleinschreibung, ß, Satzzeichen)? */
function says(text: string, phrase: string): boolean {
  const needle = padded(phrase);
  return needle !== '' && padded(text).includes(needle);
}

/** Wie viele Wörter sie geschrieben hat. */
export function wordsIn(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

/** Der Anfang ihres Textes: der erste Satz, mindestens aber `OPENING_CHARS` Zeichen. */
export function opening(text: string): string {
  const sentence = /^[\s\S]*?[.!?](?=\s|$)/.exec(text)?.[0] ?? '';
  return text.slice(0, Math.max(sentence.length, OPENING_CHARS));
}

/**
 * Wie viele Absätze ihr Text hat: Blöcke, getrennt durch einen Zeilenumbruch. Auf einem Handy
 * tippt niemand eine Leerzeile zwischen zwei Absätze, also zählt schon der Umbruch — und eine
 * leere Zeile mehr macht keinen Absatz mehr.
 */
export function paragraphsIn(text: string): number {
  return text.split(/\n+/).filter((p) => p.trim() !== '').length;
}

/**
 * Eine Zeilenangabe, wie sie in einer Analyse steht: „Z. 12", „Zeile 4", „(Z. 3–5)", „l. 7",
 * „ll. 3-4", „line 9", „V. 2", „Vers 5", „ligne 3", „línea 6", „riga 8". Ein Format, kein
 * Sprachverständnis: gelesen wird das Kürzel und die Zahl dahinter, nichts sonst. Ein Bereich zählt
 * als eine Angabe, und jede seiner beiden Zeilen muss es geben.
 */
const LINE_REF =
  /(?<![\p{L}\p{N}])(?:z|zl|zeile|zeilen|l|ll|line|lines|v|vv|vers|verse|ligne|lignes|lín|línea|líneas|linea|lineas|r|rr|riga|righe)\.?\s*(\d{1,4})(?:\s*[-–]\s*(\d{1,4}))?(?![\p{L}\p{N}])/giu;

export type LineRef = { cite: string; lines: number[] };

/** Die Zeilenangaben in ihrem Text, in ihrer Reihenfolge. */
export function lineRefsIn(text: string): LineRef[] {
  const out: LineRef[] = [];
  for (const m of text.matchAll(LINE_REF)) {
    const from = Number(m[1]);
    const to = m[2] === undefined ? null : Number(m[2]);
    out.push({ cite: m[0].trim(), lines: to === null ? [from] : [from, to] });
  }
  return out;
}

/**
 * Wie viele Zeilen das Material hat — die nicht leeren Zeilen seiner Abschrift. Die Abschrift
 * steht Zeile für Zeile so da, wie das Blatt sie druckt (`EXTRACT_SYSTEM`: „transcribe
 * faithfully"); genauer kann der Server es nicht wissen, und das ist eine Grenze in genau einer
 * Richtung: eine Zeile, die es auf dem Blatt gibt, wird nie als fehlend gemeldet, solange die
 * Abschrift nicht kürzer ist als der Druck.
 */
export function materialLines(material: string): number {
  return material.split('\n').filter((l) => l.trim() !== '').length;
}

type Decided = {
  state: 'met' | 'open' | 'unknown';
  verb: string | null;
  cite: string | null;
};

/** Wogegen ein Element außer ihrem Text noch gehalten wird. */
export type RubricContext = {
  /** Die Abschrift des Materials, aus dem die Aufgabe stammt; null ohne Material. */
  material?: string | null;
  /** Was Buddy zu dieser Frage schon gesagt hat — damit eine Nachfrage nicht zweimal kommt. */
  said?: readonly string[];
};

/**
 * Ein Element gegen ihren Text. Die zählbaren Prüfungen kennen kein Modell; `judged` verlangt ein
 * Zitat, das in ihrem Text steht — und, wo der Punkt eine Zahl oder Formel trägt, genau diesen Wert.
 */
function decide(
  element: RubricElement,
  text: string,
  claim: RubricClaim | undefined,
  ctx: RubricContext,
): Decided {
  const check = element.check;
  const none = { verb: null, cite: null };
  switch (check.by) {
    case 'word_count': {
      const n = wordsIn(text);
      const long = check.min === null || n >= check.min;
      const short = check.max === null || n <= check.max;
      return { state: long && short ? 'met' : 'open', ...none };
    }
    case 'mentions': {
      const where = check.where === 'opening' ? opening(text) : text;
      return { state: check.terms.every((x) => says(where, x)) ? 'met' : 'open', ...none };
    }
    case 'paragraphs':
      return { state: paragraphsIn(text) >= check.min ? 'met' : 'open', ...none };
    case 'line_refs': {
      const refs = lineRefsIn(text);
      if (refs.length < check.min) return { state: 'open', ...none };
      // Ob es die Zeilen gibt, weiß nur, wer das Material kennt. Ohne Material ist darüber
      // nichts gemessen — „stimmt" wäre so erfunden wie „stimmt nicht" (Regel 5).
      const material = ctx.material ?? null;
      if (material === null || material.trim() === '') return { state: 'unknown', ...none };
      const last = materialLines(material);
      const wrong = refs.find((r) => r.lines.some((n) => n < 1 || n > last)) ?? null;
      return wrong === null
        ? { state: 'met', ...none }
        : { state: 'open', verb: null, cite: wrong.cite };
    }
    case 'tense': {
      // Ohne Angabe des Modells ist über die Zeitform nichts gemessen — und „stimmt" wäre
      // dann genauso erfunden wie „stimmt nicht".
      if (claim === undefined) return { state: 'unknown', ...none };
      // Nur ein Verb, das wirklich in ihrem Text steht, zählt. Ein Modell, das sich eines
      // ausdenkt, bekommt damit kein Element gekippt (Regel 0 aus #224).
      const broken = claim.verbs.find((v) => says(text, v)) ?? null;
      return broken === null
        ? { state: 'met', ...none }
        : { state: 'open', verb: broken, cite: null };
    }
    case 'judged': {
      // Ein exakter Wert, der fehlt, ist gezählt — dafür braucht es kein Modell, und ein
      // „erfüllt" des Modells kauft ihn nicht (issue #236: „prüft Code diesen Teil exakt").
      const exactHolds = check.exact.every((group) => group.some((x) => says(text, x)));
      if (claim === undefined) return { state: exactHolds ? 'unknown' : 'open', ...none };
      // Der Beleg trägt, oder das Element gilt als nicht erfüllt — auch wenn das Modell
      // „erfüllt" gesagt hat. Ein Zitat, das nicht in ihrem Text steht, ist kein Beleg.
      if (claim.met && says(text, claim.quote) && exactHolds) return { state: 'met', ...none };
      return { state: 'open', ...none };
    }
  }
}

/** Gezählt (Code hat es gemessen) oder beurteilt — für die Wahl des nächsten Satzes. */
function countedCheck(element: RubricElement): boolean {
  return element.check.by !== 'judged';
}

/**
 * Ihre Antwort gegen die Rubrik, Element für Element.
 *
 * Der nächste Schritt ist das ERSTE offene Element in der Reihenfolge der Rubrik — die
 * Reihenfolge, in der die Textsorte ihre Teile verlangt. Ein `unknown`-Element kommt dafür nie
 * in Frage: dort hat niemand etwas gemessen, und ein Schritt, der auf nichts zeigt, wäre genau
 * die Behauptung, die #197 abgeschafft hat.
 *
 * Bei einer Erklärfrage (#236) ist der Schritt eine NACHFRAGE, und eine Nachfrage, die Buddy zu
 * dieser Frage schon gestellt hat (`ctx.said`), kommt nicht ein zweites Mal, solange ein anderer
 * Punkt noch keine bekommen hat — so fragt er nach, wie im Unterricht, und nicht im Kreis. Erst
 * wenn jeder offene Punkt schon gefragt wurde, bleibt es beim ersten.
 */
export function checkRubric(
  rubric: Rubric,
  text: string,
  claims: readonly RubricClaim[],
  ctx: RubricContext = {},
): RubricOutcome {
  const byRef = new Map<string, RubricClaim>();
  for (const c of claims) if (!byRef.has(c.element)) byRef.set(c.element, c);
  const decided = rubric.elements.map((element, i) => {
    const ref = refOf(i);
    const counted = countedCheck(element);
    return { ref, element, counted, ...decide(element, text, byRef.get(ref), ctx) };
  });
  const open = decided.filter((d) => d.state === 'open');
  const said = ctx.said ?? [];
  const askedBefore = (d: (typeof decided)[number]) =>
    d.element.ask !== null && said.some((x) => x.includes(d.element.ask ?? ''));
  const first =
    rubric.kind === 'explain' ? (open.find((d) => !askedBefore(d)) ?? open[0]) : open[0];
  return {
    kind: rubric.kind,
    form: rubric.form,
    elements: decided.map((d) => ({
      ref: d.ref,
      name: d.element.name,
      state: d.state,
      counted: d.counted,
    })),
    all: decided.every((d) => d.state === 'met'),
    some: decided.some((d) => d.state === 'met'),
    step: first
      ? {
          name: first.element.name,
          missing: first.element.missing,
          counted: first.counted,
          verb: first.verb,
          cite: first.cite,
          ask: rubric.kind === 'explain' ? first.element.ask : null,
        }
      : null,
  };
}

/**
 * Das Urteil aus den Elementen — nicht aus einem Gesamteindruck des Modells.
 *
 * Das ist der Punkt des Issues: „Rückmeldung pro Element statt eines Urteils". Hält alles, ist
 * die Aufgabe erfüllt; hält etwas, bleibt die Frage offen; hält nichts, ist sie noch nicht
 * beantwortet. Ein `unknown`-Element steht nicht auf `met`, also schließt es die Frage nicht —
 * ehrlicher, als eine Aufgabe für erledigt zu erklären, von der ein Teil ungeprüft ist.
 */
export function rubricVerdict(o: RubricOutcome): 'correct' | 'partially_correct' | 'incorrect' {
  if (o.all) return 'correct';
  return o.some ? 'partially_correct' : 'incorrect';
}

/**
 * Die Stellen zum Verbessern, die bei ihr ankommen (issue #258) — höchstens drei, und nur solche,
 * die wirklich auf ihren Text zeigen:
 *
 *   · das Zitat steht in ihrem Text (gefaltet verglichen, wie jedes Belegzitat). Eine Stelle, die
 *     es nicht gibt, ist keine Stelle, und sie zu zeigen hieße, ihr einen Satz unterzuschieben;
 *   · der Vorschlag trägt keine Ziffer. Das ist die mechanische Form von „keine Note, keine
 *     Punktzahl": eine Note, ein Punktwert und ein „7 von 10" brauchen alle eine Ziffer, und ein
 *     Vorschlag, wie eine Stelle besser wird, braucht keine. Verworfen, nicht repariert;
 *   · zwei Stellen mit demselben Zitat sind eine.
 */
export function spotsIn(text: string, spots: readonly RubricSpot[]): RubricSpotView[] {
  const seen = new Set<string>();
  const out: RubricSpotView[] = [];
  for (const sp of spots) {
    const key = normalizeShortAnswer(sp.quote);
    if (key === '' || seen.has(key) || sp.tip === '' || DIGIT.test(sp.tip)) continue;
    if (!says(text, sp.quote)) continue;
    seen.add(key);
    out.push({ quote: sp.quote, tip: sp.tip });
    if (out.length === RUBRIC_SPOTS_MAX) break;
  }
  return out;
}

/**
 * Was neben Buddys Satz steht: jedes Element, über das etwas gemessen wurde, mit seinem Stand —
 * ohne Zahl, ohne Anteil, ohne Note (Regel 6). Ein `unknown`-Element fehlt hier, wie es in jedem
 * Satz fehlt: über es ist nichts zu sagen.
 */
export function rubricFeedback(o: RubricOutcome, spots: RubricSpotView[] = []): RubricFeedback {
  return {
    kind: o.kind,
    points: o.elements
      .filter((e) => e.state !== 'unknown')
      .map((e) => ({ name: e.name, met: e.state === 'met' })),
    spots: o.kind === 'text' ? spots : [],
  };
}

/**
 * Was Buddy sagt: EIN nächster Schritt. Die Elemente mit ihrem Stand stehen daneben, als Liste
 * (`rubricFeedback`, angezeigt unter dem Satz), und werden hier nicht noch einmal aufgezählt.
 *
 * Die Worte sind die der App, nicht die des Modells — hier ist die Stelle, an der ein „Falsch!"
 * oder ein „vier von sechs" entstehen würde, und beides darf es nicht geben (Tonfall-Regel und
 * Regel 6). Was vom Modell kommt, ist nur der Satz `missing` oder die Nachfrage `ask` aus der
 * Rubrik, beim Erzeugen der Frage geschrieben und seitdem unverändert — vorbereiteter Text wie
 * ein vorbereiteter Tipp, kein Urteil im Moment.
 *
 * Steht alles, oder zeigt nichts auf eine Stelle, gibt es keinen nächsten Schritt: dann bleibt
 * Buddys eigener Satz stehen (`fallback`), denn dann hat die App nichts Genaueres zu sagen als er.
 */
export function rubricReply(locale: string, o: RubricOutcome, fallback: string): string {
  const step = o.step;
  // Buddys eigener Satz bleibt nur, solange er keine Ziffer trägt — dieselbe mechanische Form von
  // „keine Note, keine Punktzahl" wie bei einer Stelle (`spotsIn`): ein „Das ist eine 2+" oder
  // „6 von 6" wird verworfen, nicht repariert, und die App sagt ihren eigenen Satz (#258).
  if (step === null) return DIGIT.test(fallback) ? t(locale, 'practice.rubric.done') : fallback;
  if (step.ask !== null) {
    return t(locale, o.some ? 'practice.rubric.ask_next' : 'practice.rubric.ask_start', {
      ask: step.ask,
    });
  }
  const key: MessageKey = !o.some
    ? 'practice.rubric.start'
    : step.cite !== null
      ? 'practice.rubric.next_line'
      : step.verb !== null
        ? 'practice.rubric.next_verb'
        : step.counted
          ? 'practice.rubric.next_counted'
          : 'practice.rubric.next_judged';
  return t(locale, key, {
    name: step.name,
    missing: step.missing,
    verb: step.verb ?? '',
    cite: step.cite ?? '',
  });
}
