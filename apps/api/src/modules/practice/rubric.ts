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
// `answer.ts` schickt dasselbe eine Mal). Der Integrationstest beweist das, indem er genau
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
//      Bewertung, wenn er richtig war (`answer.ts`, `rateable`).
//   3. **Der Satz nennt EINEN nächsten Schritt, keine Abarbeitungsliste.** Dieselbe
//      Entscheidung, die `chemistry.ts` bei mehreren unausgeglichenen Elementen trifft und
//      begründet: „alle auf einmal zu nennen ist eine Liste statt eines nächsten Schritts."
//      Die Elemente selbst stehen daneben, jedes mit seinem Stand — das ist die Rückmeldung
//      pro Element, die #211 verlangt; der SATZ ist einer.
//   4. **Keine Zahl, kein Punktestand, keine Note.** Nicht „vier von sechs": das wäre eine Note
//      mit einem anderen Namen (CLAUDE.md Regel 6, Abnahme von #211). Die Elemente stehen als
//      „steht" und „noch nicht" da, ohne Symbol — eine Zeile, die auch eine Vorleseansage
//      aussprechen kann.

import {
  RUBRIC_QUOTE_MAX,
  RUBRIC_VERBS_MAX,
  StoredRubric as StoredRubricSchema,
  type Rubric,
  type StoredRubric,
  type StoredRubricElement,
} from '@learnbuddy/shared-types/contracts';
import { normalizeShortAnswer } from '@learnbuddy/shared-math';
import { z } from 'zod';

import { t, type MessageKey } from '../../i18n/index.js';
import { kindIn, RUBRIC_KINDS } from './itemFields.js';

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
export function rubricOf(stored: unknown): StoredRubric | null {
  if (stored === null || stored === undefined) return null;
  const r = StoredRubricSchema.safeParse(stored);
  return r.success ? r.data : null;
}

/**
 * Die Kernpunkte einer Erklärfrage („Erklär mal", issue #236) — eine Rubrik, die ganz aus
 * `key_point` besteht. Nur Code baut sie (`teachBack.ts`); eine gemischte gilt als keine.
 */
export function isExplanation(rubric: StoredRubric): boolean {
  return rubric.elements.every((e) => e.check.by === 'key_point');
}

/**
 * Die Rubrik, die angelegt wird — oder null, und null heißt: die FRAGE bleibt, nur ohne Rubrik.
 * Dasselbe Verhalten, das eine nicht haltbare Figur schon bekommt (`usableFigure`), und aus
 * demselben Grund: eine halbe Rubrik würde Elemente abhaken, die niemand geprüft hat.
 *
 * Vier Gründe, eine Rubrik zu verwerfen, und jeder davon macht sie unprüfbar:
 *
 *   · sie hängt an einer Frage, die kein freier Text ist. Für eine Zahl oder ein Vokabelpaar
 *     gibt es keine Pflichtelemente, und ein Modell, das trotzdem eine schreibt, hat die
 *     Aufgabe missverstanden;
 *   · zwei Elemente mit demselben Namen — sie stünden zweimal in derselben Zeile und niemand
 *     könnte sagen, welches gemeint ist;
 *   · eine Wortzahl ohne jede Grenze (beides null) oder mit vertauschten Grenzen: da ist nichts
 *     zu zählen;
 *   · eine Pflichtangabe, von der nach dem Falten kein Zeichen übrig bleibt (nur Satzzeichen):
 *     die würde in jedem Text „gefunden".
 */
export function usableRubric(rubric: Rubric | null | undefined, kind: string): Rubric | null {
  if (!rubric) return null;
  if (!kindIn(RUBRIC_KINDS, kind)) return null;
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
  }
  return rubric;
}

// ─────────────── was das Modell gefragt wird (und was nicht) ───────────────

/** Ein Element, über das nur das Modell etwas sagen kann — mit dem Kürzel, das der Server vergibt. */
export type AskedElement = { ref: string; name: string; check: StoredRubricElement['check'] };

/**
 * Die Elemente, über die das Modell befragt wird: `tense`, `judged` und die Kernpunkte einer
 * Erklärung (`key_point`, #236) oder einer Textsorte (`essay_point`, #258). Und nur die.
 *
 * Eine Wortzahl und eine Pflichtangabe stehen hier bewusst nicht drin. Sie werden gezählt und
 * verglichen, also wird das Modell dazu nicht gefragt — es erfährt nicht einmal, dass sie zur
 * Rubrik gehören. Damit kann es einer Angabe, die in ihrem Text steht, nicht widersprechen; es
 * gibt keinen Konflikt, der aufgelöst werden müsste (CLAUDE.md Regel 1).
 *
 * Ist die Liste leer, ist der Tutor-Aufruf der gewöhnliche: dieselbe Antwort, dasselbe Schema,
 * ein Aufruf.
 */
export function askedElements(
  rubric: StoredRubric,
  /** Kernpunkte, die in diesem Lauf schon belegt sind (#236): danach wird nicht mehr gefragt. */
  settled: readonly string[] = [],
): AskedElement[] {
  return rubric.elements
    .map((e, i) => ({ ref: refOf(i), name: e.name, check: e.check }))
    .filter((e) => e.check.by !== 'word_count' && e.check.by !== 'mentions')
    .filter((e) => !settled.includes(e.ref));
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

// ─────────────── prüfen ───────────────

/** Der eine nächste Schritt — nie eine Liste davon (siehe den Kopf dieser Datei). */
export type RubricStep = {
  name: string;
  missing: string;
  /** Code hat es gemessen (`word_count`, `mentions`, ein bestätigtes Verb) — kein Urteil. */
  counted: boolean;
  /** Das Verb aus IHREM Text, dessen Zeitform nicht passt; null sonst. */
  verb: string | null;
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
  form: string;
  /** Eine Erklärfrage (#236): die Rückmeldung nennt Kernpunkte und stellt eine Nachfrage. */
  explain: boolean;
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
export function says(text: string, phrase: string): boolean {
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

/** Das Ende ihres Textes: der letzte Satz, mindestens aber `OPENING_CHARS` Zeichen. */
function ending(text: string): string {
  const body = text.trimEnd();
  const sentence = /[^.!?]*[.!?]?$/.exec(body)?.[0] ?? '';
  return body.slice(-Math.max(sentence.length, OPENING_CHARS));
}

/**
 * Der Teil eines Aufsatzes, in dem ein Kernpunkt stehen muss (#258): die Einleitung im ersten
 * Absatz, der Schluss im letzten. Großzügig in derselben einen Richtung wie `opening`: es gilt das
 * Längere aus Absatz und Satzspanne — eine Überschrift als erster Absatz lässt die Einleitung
 * nicht „fehlen".
 */
function partOf(text: string, part: 'opening' | 'body' | 'closing'): string {
  if (part === 'body') return text;
  const paragraphs = text.split(/\n+/).filter((p) => p.trim() !== '');
  const paragraph = (part === 'opening' ? paragraphs[0] : paragraphs.at(-1)) ?? '';
  const span = part === 'opening' ? opening(text) : ending(text);
  return paragraph.length >= span.length ? paragraph : span;
}

type Decided = { state: 'met' | 'open' | 'unknown'; verb: string | null };

/**
 * Ein Element gegen ihren Text. Die drei zählbaren Prüfungen kennen kein Modell; `judged`
 * verlangt ein Zitat, das in ihrem Text steht.
 */
function decide(
  element: StoredRubricElement,
  text: string,
  claim: RubricClaim | undefined,
  cites: (quote: string) => boolean,
): Decided {
  const check = element.check;
  switch (check.by) {
    case 'word_count': {
      const n = wordsIn(text);
      const long = check.min === null || n >= check.min;
      const short = check.max === null || n <= check.max;
      return { state: long && short ? 'met' : 'open', verb: null };
    }
    case 'mentions': {
      const where = check.where === 'opening' ? opening(text) : text;
      return { state: check.terms.every((x) => says(where, x)) ? 'met' : 'open', verb: null };
    }
    case 'tense': {
      // Ohne Angabe des Modells ist über die Zeitform nichts gemessen — und „stimmt" wäre
      // dann genauso erfunden wie „stimmt nicht".
      if (claim === undefined) return { state: 'unknown', verb: null };
      // Nur ein Verb, das wirklich in ihrem Text steht, zählt. Ein Modell, das sich eines
      // ausdenkt, bekommt damit kein Element gekippt (Regel 0 aus #224).
      const broken = claim.verbs.find((v) => says(text, v)) ?? null;
      return broken === null ? { state: 'met', verb: null } : { state: 'open', verb: broken };
    }
    case 'judged': {
      if (claim === undefined) return { state: 'unknown', verb: null };
      // Der Beleg trägt, oder das Element gilt als nicht erfüllt — auch wenn das Modell
      // „erfüllt" gesagt hat. Ein Zitat, das nicht in ihrem Text steht, ist kein Beleg.
      if (claim.met && says(text, claim.quote)) return { state: 'met', verb: null };
      return { state: 'open', verb: null };
    }
    case 'key_point': {
      if (claim === undefined) return { state: 'unknown', verb: null };
      // Wie `judged`, und dazu gehört jede exakte Angabe des Punktes (eine Zahl, eine Formel, ein
      // Fachwort) wörtlich in ihre Erklärung — das prüft Code, nicht das Modell (#236).
      const held = claim.met && says(text, claim.quote) && check.exact.every((x) => says(text, x));
      return { state: held ? 'met' : 'open', verb: null };
    }
    case 'essay_point': {
      if (claim === undefined) return { state: 'unknown', verb: null };
      // Wie `judged`, und das Zitat steht an seinem Platz (die Einleitung vorn, der Schluss hinten);
      // ein Zitat mit Zeilenangabe nennt Zeilen, die es gibt — beides prüft Code (#258).
      const held =
        claim.met &&
        says(partOf(text, check.part), claim.quote) &&
        (!check.lines || cites(claim.quote));
      return { state: held ? 'met' : 'open', verb: null };
    }
  }
}

/**
 * Ihre Antwort gegen die Rubrik, Element für Element.
 *
 * Der nächste Schritt ist das ERSTE offene Element in der Reihenfolge der Rubrik — die
 * Reihenfolge, in der die Textsorte ihre Teile verlangt. Ein `unknown`-Element kommt dafür nie
 * in Frage: dort hat niemand etwas gemessen, und ein Schritt, der auf nichts zeigt, wäre genau
 * die Behauptung, die #197 abgeschafft hat.
 */
export function checkRubric(
  rubric: StoredRubric,
  text: string,
  claims: readonly RubricClaim[],
  /** Kernpunkte, die in diesem Lauf schon belegt sind (#236): sie bleiben belegt. */
  settled: readonly string[] = [],
  /** Ob ein Zitat Zeilen nennt, die es im Text gibt (#258, `essay.ts`); ohne Text nie. */
  cites: (quote: string) => boolean = () => false,
): RubricOutcome {
  const byRef = new Map<string, RubricClaim>();
  for (const c of claims) if (!byRef.has(c.element)) byRef.set(c.element, c);
  const decided = rubric.elements.map((element, i) => {
    const ref = refOf(i);
    // Gezählt heißt: Code hat es gemessen. Was ein Zitat aus ihrem Text braucht, ist beurteilt.
    const counted = !['judged', 'key_point', 'essay_point'].includes(element.check.by);
    const was = element.check.by === 'key_point' && settled.includes(ref);
    const now: Decided = was
      ? { state: 'met', verb: null }
      : decide(element, text, byRef.get(ref), cites);
    return { ref, element, counted, ...now };
  });
  const first = decided.find((d) => d.state === 'open');
  return {
    form: rubric.form,
    explain: isExplanation(rubric),
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
 * Was Buddy sagt: die Elemente mit ihrem Stand, und darunter EIN nächster Schritt.
 *
 * Die Worte sind die der App, nicht die des Modells — hier ist die Stelle, an der ein „Falsch!"
 * oder ein „vier von sechs" entstehen würde, und beides darf es nicht geben (Tonfall-Regel und
 * Regel 6). Was vom Modell kommt, ist nur der Satz `missing` aus der Rubrik, beim Einlesen des
 * Blattes geschrieben und seitdem unverändert — vorbereiteter Text wie ein vorbereiteter Tipp,
 * kein Urteil im Moment.
 *
 * Steht alles, oder zeigt nichts auf eine Stelle, gibt es keinen nächsten Schritt: dann bleibt
 * Buddys eigener Satz stehen (`fallback`), denn dann hat die App nichts Genaueres zu sagen als er.
 */
export function rubricReply(
  locale: string,
  o: RubricOutcome,
  fallback: string,
  /** Ihr letzter Versuch an dieser Frage: eine Erklärfrage schließt dann ab, statt nachzufragen. */
  last = false,
): string {
  if (o.explain) return explainReply(locale, o, fallback, last);
  const named = o.elements.filter((e) => e.state !== 'unknown');
  const line = named
    .map((e) =>
      t(
        locale,
        e.state === 'met' ? 'practice.rubric.element_met' : 'practice.rubric.element_open',
        {
          name: e.name,
        },
      ),
    )
    .join(' · ');
  const step = o.step;
  if (step === null) return line === '' ? fallback : `${line}\n${fallback}`;
  const key: MessageKey = !o.some
    ? 'practice.rubric.start'
    : step.verb !== null
      ? 'practice.rubric.next_verb'
      : step.counted
        ? 'practice.rubric.next_counted'
        : 'practice.rubric.next_judged';
  const sentence = t(locale, key, {
    name: step.name,
    missing: step.missing,
    verb: step.verb ?? '',
  });
  return line === '' ? sentence : `${line}\n${sentence}`;
}

/**
 * Was Buddy zu einer Erklärung sagt („Erklär mal", issue #236): jeder Kernpunkt mit „✓" oder
 * „fehlt noch", darunter EINE Nachfrage zum ersten fehlenden Punkt — die, die beim Erzeugen
 * geschrieben und geprüft wurde, wie eine Lehrkraft sie im Unterricht stellt. Keine Note, keine
 * Zahl, keine Lösung.
 *
 * Hält noch kein Punkt, steht keine Liste aus lauter „fehlt noch" da, sondern nur die Nachfrage:
 * drei Zeilen „fehlt noch" nach ihrem ersten Satz wären das „Falsch!", das die App nie sagt. Beim
 * letzten Versuch kommt statt der Nachfrage ein Abschluss, der nichts verrät. Hat niemand etwas
 * gemessen (das Modell blieb aus), bleibt Buddys eigener Satz stehen.
 */
function explainReply(locale: string, o: RubricOutcome, fallback: string, last: boolean): string {
  const line = pointLine(locale, o.elements);
  // The follow-up is its own paragraph: it is what she answers next, not part of the list.
  const then = (s: string) => (line === '' ? s : `${line}\n\n${s}`);
  if (o.all) return then(t(locale, 'practice.explain.all'));
  const step = o.step;
  if (step === null) return then(fallback);
  if (last) {
    const closing = t(locale, 'practice.explain.closing');
    return o.some ? then(closing) : closing;
  }
  return o.some ? then(step.missing) : t(locale, 'practice.explain.start', { ask: step.missing });
}

/**
 * Die Kernpunkte in einer Zeile: „✓ Licht · Ort fehlt noch" (#236, #258). Ein Punkt ohne Urteil
 * (`unknown`) steht nicht darin: über ihn hat niemand etwas gemessen.
 */
export function pointLine(locale: string, elements: readonly RubricElementState[]): string {
  return elements
    .filter((e) => e.state !== 'unknown')
    .map((e) =>
      t(locale, e.state === 'met' ? 'practice.explain.point_met' : 'practice.explain.point_open', {
        name: e.name,
      })
        // One point never breaks across two lines („Ort / fehlt noch" reads as two things).
        .replace(/ /g, NBSP),
    )
    .join(' · ');
}

/** A space that does not break a line. */
const NBSP = ' ';

/** Die Kernpunkte, die diese Antwort neu belegt hat (#236): was `session_items.explained` dazubekommt. */
export function newlyExplained(o: RubricOutcome, settled: readonly string[]): string[] {
  if (!o.explain) return [];
  return o.elements.filter((e) => e.state === 'met' && !settled.includes(e.ref)).map((e) => e.ref);
}
