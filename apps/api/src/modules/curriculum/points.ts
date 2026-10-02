// The curriculum is a matter for the states, so the same answer can be right in one
// Bundesland and wrong in another. This file is the twelve places where that is verified
// (issue #214, from `docs/lehrplan-und-uebungsformen.md`, 01.10.2026).
//
// WHY A TABLE AND NOT A BRANCH. This is subject knowledge, not control flow: sixteen `if`
// chains in twelve files would be unreadable, unreviewable and impossible to check against a
// curriculum. So it is data — one entry per place, one ruling per state, each with the
// document it comes from — and exactly two pieces of code read it (`state.ts`): one that picks
// the rulings that apply to a learner, one that renders them for a prompt. CLAUDE.md rule 1:
// the table is code, the model may use it and never add to it. The model's only say is WHICH
// place a question belongs to (`ItemDraft.curriculum_point`, a closed enum of these keys);
// what then holds in her state is decided here.
//
// WHAT IS AND IS NOT CLAIMED (CLAUDE.md rule 5). `states` holds only the Bundesländer whose
// curriculum was actually read for that place. Every other state is NOT "no difference" — it
// is unresearched, and is treated exactly like `other` and `null`: no rule applied, a more
// cautious judgement. The report verified five to six states; the other ten are open, and
// that is visible here instead of being papered over with a plausible-looking entry.
//
// Every `source` names the document, the state and its year or retrieval date, as precisely
// as the report names it — and says so when the report does not date it. The report's §14
// lists the primary documents; `verifiedIn` points at the section that checked the claim.
//
// NO EXAMPLE SENTENCES. `about` and `expects` reach the model as state, and a sample sentence
// in a prompt comes back copied verbatim into a learner's questions. The places are described
// by their principle and their official terms, never by a specimen task.

import type { CurriculumRegion } from '@learnbuddy/shared-types/contracts';
import { z } from 'zod';

/** A Bundesland. `other` (a school outside Germany) is never a key here: it has no curriculum. */
export type StateCode = Exclude<CurriculumRegion, 'other'>;

/**
 * The twelve places, as keys. The model may tag a question with one of these and nothing else
 * (`ItemDraft.curriculum_point`); a value this list does not know means "no place", which is
 * the safe default.
 */
export const CurriculumPointId = z.enum([
  'satzglieder',
  'satzart',
  'metrum',
  'stilmittel_set',
  'operator_vergleichen',
  'operator_herleiten',
  'operator_beurteilen_bewerten',
  'hypothesentest',
  'matrizen',
  'puffer_rechnung',
  'klimaklassifikation',
  'informatik_programmiersprache',
]);
export type CurriculumPointId = z.infer<typeof CurriculumPointId>;

export type Ruling = {
  /**
   * What this state's curriculum expects, in one sentence. It reaches the model verbatim as
   * state, so it is written as an instruction about the answer, not as a note about the plan.
   */
  expects: string;
  /**
   * false: this state's curriculum does not have this place at the years below at all. Code
   * uses this (`offCurriculum`), it is not only prompt text: a practice TEST is meant to look
   * like her class test, so a question from outside her curriculum is dropped there.
   */
  taught: boolean;
  /** The years this state places it in, when they differ from the place's own range. */
  grades?: readonly [number, number];
  /** Which curriculum, which state, which year — the only thing that makes this checkable. */
  source: string;
};

export type CurriculumPoint = {
  /** What the place is called, in the words a teacher would use; it goes into the prompt line. */
  name: string;
  /** The subject, as the learner names it; it goes into the prompt line. */
  subject: string;
  /** What the place is, so the model can tell whether a question is one. No specimen tasks. */
  about: string;
  /** The years it can come up in at a Gymnasium (the widest range over the states below). */
  grades: readonly [number, number];
  /** What holds whatever the state — a KMK, IQB or association norm — or null. */
  shared: string | null;
  /**
   * Only the states whose curriculum was read for this place. A state that is missing is
   * unresearched, not "the same as everyone": it falls back to the cautious path.
   */
  states: Readonly<Partial<Record<StateCode, Ruling>>>;
  /** The section of docs/lehrplan-und-uebungsformen.md that verified this entry. */
  verifiedIn: string;
};

/**
 * The Bundesländer by name, for the one line a prompt may carry. Exhaustive so a new code in
 * `CurriculumRegion` is a compile error here rather than a state nobody can name.
 */
export const STATE_NAMES: { [S in StateCode]: string } = {
  bw: 'Baden-Württemberg',
  by: 'Bayern',
  be: 'Berlin',
  bb: 'Brandenburg',
  hb: 'Bremen',
  hh: 'Hamburg',
  he: 'Hessen',
  mv: 'Mecklenburg-Vorpommern',
  ni: 'Niedersachsen',
  nw: 'Nordrhein-Westfalen',
  rp: 'Rheinland-Pfalz',
  sl: 'Saarland',
  sn: 'Sachsen',
  st: 'Sachsen-Anhalt',
  sh: 'Schleswig-Holstein',
  th: 'Thüringen',
};

/**
 * The table. Keyed by the enum, so a new place is a compile error until it is filled in.
 *
 * Five of the twelve are the sharpest and were built first (issue #214): `satzglieder`,
 * `operator_vergleichen`, `hypothesentest`, `metrum`, `puffer_rechnung`.
 */
export const CURRICULUM: { [P in CurriculumPointId]: CurriculumPoint } = {
  // ───────────────────────────── Deutsch, Sekundarstufe I ─────────────────────────────
  satzglieder: {
    name: 'Satzglieder',
    subject: 'Deutsch',
    about:
      'naming the parts of a sentence (Satzglieder) — how finely they must be named differs by state',
    grades: [5, 10],
    shared:
      'The KMK list for the move from primary to secondary school knows only "Ergänzungen", so a learner arriving in year 5 may have been taught no finer term than that.',
    states: {
      nw: {
        expects:
          'Nordrhein-Westfalen names Subjekt, Objekt and Adverbial without the case: "Objekt" is the complete answer and must not be marked incomplete for leaving the case out. A finer answer that names the case is also right.',
        taught: true,
        source: 'NRW, Kernlehrplan Deutsch Gymnasium SI (G9), 23.06.2019',
      },
      by: {
        expects:
          'Bayern names the case and the semantic type: Dativobjekt, Akkusativobjekt, Temporaladverbiale. A bare "Objekt" or "Adverbiale" is not yet the whole answer here — name what is missing, do not call it wrong.',
        taught: true,
        source: 'Bayern, LehrplanPLUS Gymnasium Deutsch 5–10 (abgerufen 01.10.2026)',
      },
      bw: {
        expects:
          'Baden-Württemberg names the case as a separate statement (Objekt im Dativ, Objekt im Akkusativ, adverbiale Bestimmung) and additionally analyses the sentence by fields (Vorfeld, Satzklammer, Mittelfeld, Nachfeld) — the Feldermodell exists only here.',
        taught: true,
        source: 'Baden-Württemberg, Bildungsplan 2016 Gymnasium Deutsch',
      },
    },
    verifiedIn: 'docs/lehrplan-und-uebungsformen.md §6.2',
  },
  satzart: {
    name: 'Satzart',
    subject: 'Deutsch',
    about: 'naming the kind of sentence (Satzart) — the official term for a command differs',
    grades: [5, 10],
    shared: null,
    states: {
      nw: {
        expects:
          'Nordrhein-Westfalen names a command Aufforderungssatz, alongside Aussage-, Frage- and Ausrufesatz.',
        taught: true,
        source: 'NRW, Kernlehrplan Deutsch Gymnasium SI (G9), 23.06.2019',
      },
      bw: {
        expects:
          'Baden-Württemberg names it by the position of the verb — Verberstsatz — not Aufforderungssatz.',
        taught: true,
        source: 'Baden-Württemberg, Bildungsplan 2016 Gymnasium Deutsch',
      },
    },
    // The report also reads Niedersachsen and Brandenburg as "Aufforderungssatz", but §14
    // dates no Sek-I German plan for either, so neither is claimed here: they stay on the
    // cautious path rather than carry a source nobody can look up (CLAUDE.md rule 5).
    verifiedIn: 'docs/lehrplan-und-uebungsformen.md §6.2',
  },
  metrum: {
    name: 'Metrum',
    subject: 'Deutsch',
    about: 'determining the metre of a verse (Jambus, Trochäus, Daktylus, Anapäst)',
    grades: [5, 10],
    shared: null,
    states: {
      bw: {
        expects:
          'Baden-Württemberg teaches the metre from years 5/6 on, so it may be asked for by name.',
        taught: true,
        grades: [5, 10],
        source: 'Baden-Württemberg, Bildungsplan 2016 Gymnasium Deutsch',
      },
      nw: {
        expects:
          'Nordrhein-Westfalen teaches the metre from years 5/6 on, so it may be asked for by name.',
        taught: true,
        grades: [5, 10],
        source: 'NRW, Kernlehrplan Deutsch Gymnasium SI (G9), 23.06.2019',
      },
      bb: {
        expects:
          'Brandenburg places the metre at Niveaustufe H, which is year 10: before that it is not her material, and not knowing it is no gap.',
        taught: true,
        grades: [10, 10],
        source: 'Brandenburg, Rahmenlehrplan 1–10 Teil C Deutsch, amtliche Fassung 10./16.11.2015',
      },
      by: {
        expects:
          'Bayern does not name the metre anywhere in years 5–10: it is not her material, and she has not been taught it.',
        taught: false,
        source: 'Bayern, LehrplanPLUS Gymnasium Deutsch 5–10 (abgerufen 01.10.2026)',
      },
    },
    verifiedIn: 'docs/lehrplan-und-uebungsformen.md §6.1',
  },
  stilmittel_set: {
    name: 'Stilmittel-Liste',
    subject: 'Deutsch',
    about:
      'naming a rhetorical device at a given place in a text — which terms count is a state list',
    grades: [5, 10],
    shared: null,
    states: {
      bb: {
        expects:
          'Brandenburg fixes the terms per Niveaustufe: E Vergleich and sprachliches Bild · F (year 8) rhetorische Figur, rhetorische Frage, Alliteration, Anapher, Ellipse, Metapher, Symbol · G Personifikation, Wort-, Satz- and Gedankenfiguren · H Klimax, Inversion, Neologismus, Parallelismus, Hyperbel, Ironie. Stay inside the set for her year.',
        taught: true,
        source: 'Brandenburg, Rahmenlehrplan 1–10 Teil C Deutsch, amtliche Fassung 10./16.11.2015',
      },
      by: {
        expects:
          'Bayern asks only for "auffällige sprachliche Mittel" and fixes no list of terms, so no particular term may be demanded as the one right answer: accept any term that fits the place in the text.',
        taught: true,
        source: 'Bayern, LehrplanPLUS Gymnasium Deutsch 5–10 (abgerufen 01.10.2026)',
      },
    },
    verifiedIn: 'docs/lehrplan-und-uebungsformen.md §6.1',
  },

  // ───────────────────────────── Operators ─────────────────────────────
  operator_vergleichen: {
    name: 'Operator „vergleichen“',
    subject: 'Geschichte',
    about:
      'the operator "vergleichen" — whether the answer must end in a judgement at all differs by state',
    grades: [10, 13],
    shared:
      'The KMK EPA Geschichte put "vergleichen" in Anforderungsbereich III, worded as "… zu beurteilen".',
    states: {
      by: {
        expects:
          'Bayern requires a closing judgement: a comparison that only lists criteria side by side is not finished here. Ask for the judgement, do not mark the comparison wrong.',
        taught: true,
        source: 'Bayern, Operatoren Geschichte, Stand März 2025',
      },
      ni: {
        expects:
          'Niedersachsen expects a criterion-led presentation and explicitly NO judgement: an answer without one is complete, and an added judgement is not an error either.',
        taught: true,
        source:
          'Niedersachsen, Operatorenverzeichnis der Kerncurricula gymnasiale Oberstufe (Fassung im Bericht nicht datiert)',
      },
      bw: {
        expects:
          'Baden-Württemberg expects a criterion-led presentation without a judgement: an answer that stops before judging is complete.',
        taught: true,
        source: 'Baden-Württemberg, Bildungsplan 2016 Gymnasium, Operatorenkapitel',
      },
      nw: {
        expects:
          'Nordrhein-Westfalen has two operator lists of its own and they contradict each other here, so neither may be held against her: do not require a judgement and do not treat one as surplus.',
        taught: true,
        source:
          'NRW, Operatorenübersichten Geschichte — zwei Fassungen, die sich bei diesem Operator widersprechen (im Bericht nicht datiert)',
      },
    },
    verifiedIn: 'docs/lehrplan-und-uebungsformen.md §0.3',
  },
  operator_herleiten: {
    name: 'Operator „herleiten“',
    subject: 'Mathematik und Naturwissenschaften',
    about:
      'the operator "herleiten" — in some states rearranging a formula, in others deriving from a law',
    grades: [7, 13],
    shared:
      'The IQB operator stock for the sciences reads "herleiten" as deriving a statement from laws and principles, not as rearranging a formula.',
    states: {
      ni: {
        expects:
          'In Niedersachsen "herleiten" in years 5–10 means rearranging a formula to the quantity asked for; from the Oberstufe on it means deriving from laws. Judge against the meaning for her year, not the other one.',
        taught: true,
        source:
          'Niedersachsen, Kerncurriculum Gymnasium Schuljahrgänge 5–10 Naturwissenschaften (2015), Operatorenanhang; IQB, Grundstock von Operatoren Naturwissenschaften, 31.03.2022',
      },
      bw: {
        expects:
          'Baden-Württemberg calls the rearranging of a formula "lösen", so "herleiten" here is the derivation from laws.',
        taught: true,
        source: 'Baden-Württemberg, Bildungsplan 2016 Gymnasium, Operatorenkapitel',
      },
    },
    verifiedIn: 'docs/lehrplan-und-uebungsformen.md §0.3',
  },
  operator_beurteilen_bewerten: {
    name: 'Operatoren „beurteilen“ und „bewerten“',
    subject: 'Geschichte, Geographie, Naturwissenschaften, Informatik',
    about:
      'the operators "beurteilen" and "bewerten" — whether they are two different answers or one',
    grades: [7, 13],
    shared:
      'The IQB norm for the sciences separates them: "beurteilen" reaches a Sachurteil without a personal standard, "bewerten" adds one\'s own, disclosed standards and reaches a Werturteil. In Mathematik the operator "bewerten" does not exist at all — only "beurteilen", whose judgement must be justified.',
    states: {
      bw: {
        expects:
          'Baden-Württemberg does not use "beurteilen" and merges both into one: do not require the Sachurteil / Werturteil distinction from her.',
        taught: true,
        source: 'Baden-Württemberg, Bildungsplan 2016 Gymnasium, Operatorenkapitel',
      },
      ni: {
        expects:
          'In Niedersachsen "beurteilen" in the Sekundarstufe I means taking a stance (Stellung nehmen), so her own position belongs in the answer rather than being an error in it.',
        taught: true,
        grades: [7, 10],
        source:
          'Niedersachsen, Operatorenverzeichnis Sekundarstufe I (im Bericht als „Niedersachsen Sek I" belegt, Dokument dort nicht einzeln benannt)',
      },
      nw: {
        expects:
          'In Geographie, Nordrhein-Westfalen defines both operators identically, so nothing may be marked missing for not distinguishing them.',
        taught: true,
        source: 'NRW, Operatorenübersicht Geographie, 24.09.2015',
      },
    },
    verifiedIn: 'docs/lehrplan-und-uebungsformen.md §0.3, §9.1',
  },

  // ───────────────────────────── Sekundarstufe II ─────────────────────────────
  hypothesentest: {
    name: 'Hypothesentest',
    subject: 'Mathematik',
    about:
      'significance and hypothesis tests (Ablehnungsbereich, Entscheidung, Fehler 1. und 2. Art)',
    grades: [11, 13],
    shared:
      'The KMK standards leave the states a real choice between estimating parameters (B1) and testing hypotheses (B2), and the states chose differently.',
    states: {
      be: {
        expects:
          'Berlin teaches both, including one- and two-sided significance tests and the errors of the first and second kind: this is her material.',
        taught: true,
        source: 'Berlin, Prüfungsschwerpunkte 2026 Mathematik (GK und LK)',
      },
      bb: {
        expects: 'Brandenburg chose B2: testing hypotheses is her material.',
        taught: true,
        source: 'Brandenburg, Rahmenlehrplan gymnasiale Oberstufe Teil C Mathematik (2022)',
      },
      bw: {
        expects: 'Baden-Württemberg chose B2: testing hypotheses is her material.',
        taught: true,
        source:
          'Baden-Württemberg, Bildungsplan 2016 Gymnasium Mathematik; Leistungsfach Mathematik — Schriftliche Abiturprüfung ab 2023',
      },
      nw: {
        expects:
          'Nordrhein-Westfalen chose B1: hypothesis tests do not appear in her curriculum at all. Correct in the subject, but not her material — she has not had it.',
        taught: false,
        source: 'NRW, Kernlehrplan Mathematik GOSt, 07.06.2023',
      },
      by: {
        expects:
          'Bayern teaches neither B1 nor B2: the significance test is absent from years 11, 12 and 13. Not her material.',
        taught: false,
        source: 'Bayern, LehrplanPLUS Gymnasium Mathematik 11/12/13 (abgerufen 01.10.2026)',
      },
    },
    verifiedIn: 'docs/lehrplan-und-uebungsformen.md §3, §3.1',
  },
  matrizen: {
    name: 'Matrizen',
    subject: 'Mathematik',
    about: 'describing processes with matrices (Matrix, Grenzmatrix, Fixvektor)',
    grades: [11, 13],
    shared:
      'The KMK standards let a state choose between describing processes by matrices (A1) and vector analytic geometry (A2). Every state whose plan was read chose A2, so a matrix question is outside the curriculum everywhere it was checked.',
    states: {
      nw: {
        expects:
          'Nordrhein-Westfalen chose A2; matrices do not appear in her plan. Not her material.',
        taught: false,
        source: 'NRW, Kernlehrplan Mathematik GOSt, 07.06.2023',
      },
      by: {
        expects: 'Bayern chose A2; matrices are not her material.',
        taught: false,
        source: 'Bayern, LehrplanPLUS Gymnasium Mathematik 11/12/13 (abgerufen 01.10.2026)',
      },
      bw: {
        expects: 'Baden-Württemberg chose A2; matrices are not her material.',
        taught: false,
        source: 'Baden-Württemberg, Bildungsplan 2016 Gymnasium Mathematik',
      },
      be: {
        expects: 'Berlin chose A2; matrices are not her material.',
        taught: false,
        source: 'Berlin, Prüfungsschwerpunkte 2026 Mathematik (GK und LK)',
      },
      bb: {
        expects: 'Brandenburg chose A2; matrices are not her material.',
        taught: false,
        source: 'Brandenburg, Rahmenlehrplan gymnasiale Oberstufe Teil C Mathematik (2022)',
      },
    },
    verifiedIn: 'docs/lehrplan-und-uebungsformen.md §3, §3.1',
  },
  puffer_rechnung: {
    name: 'Pufferrechnung',
    subject: 'Chemie',
    about: 'calculating the pH of a buffer with the Henderson-Hasselbalch equation',
    grades: [11, 13],
    shared: null,
    states: {
      nw: {
        expects:
          'Nordrhein-Westfalen has the calculation in the Leistungskurs of the Qualifikationsphase: it is her material there.',
        taught: true,
        grades: [12, 13],
        source:
          'NRW, Kernlehrplan Chemie GOSt, 07.06.2022, mit den Vorgaben zum Zentralabitur 2027/2028/2029',
      },
      be: {
        expects:
          'Berlin rules the buffer calculation out expressly, also in the Leistungskurs: not her material.',
        taught: false,
        source: 'Berlin, Rahmenlehrplan gymnasiale Oberstufe Teil C Chemie (2021)',
      },
      bb: {
        expects:
          'Brandenburg rules the buffer calculation out expressly, also in the Leistungskurs: not her material.',
        taught: false,
        source: 'Brandenburg, Rahmenlehrplan gymnasiale Oberstufe Teil C Chemie (2021)',
      },
      bw: {
        expects:
          'Baden-Württemberg treats buffers qualitatively only: explaining how a buffer works is her material, calculating its pH is not.',
        taught: true,
        source: 'Baden-Württemberg, Bildungsplan 2016 Gymnasium Chemie',
      },
    },
    verifiedIn: 'docs/lehrplan-und-uebungsformen.md §4 (Chemie, Aufgabenformen)',
  },
  klimaklassifikation: {
    name: 'Klimaklassifikation',
    subject: 'Geographie',
    about: 'assigning climate data to a climate zone or climate type',
    grades: [9, 13],
    shared:
      'The answer only has one solution once the classification is fixed; different classifications give different labels for the same data.',
    states: {
      bw: {
        expects:
          'Baden-Württemberg says so itself — the assignment is made "entsprechend der verwendeten Klimaklassifikation". Judge against the classification her material uses, and never against another one.',
        taught: true,
        source: 'Baden-Württemberg, Bildungsplan 2016 Gymnasium Geographie',
      },
    },
    verifiedIn: 'docs/lehrplan-und-uebungsformen.md §9.2',
  },
  informatik_programmiersprache: {
    name: 'Programmiersprache',
    subject: 'Informatik',
    about: 'which programming language and which given classes a solution may use',
    grades: [10, 13],
    shared:
      'The KMK EPA ask for at least two modelling techniques in the Grundkurs and three in the Leistungskurs, but name no language.',
    states: {
      nw: {
        expects:
          'Nordrhein-Westfalen prescribes Java and SQL by name and publishes the classes a solution may assume (Stack, Queue, List, BinaryTree, BinarySearchTree; in the Leistungskurs also Graph, Vertex, Edge). Code in another language is not what her exam asks for.',
        taught: true,
        source: 'NRW, Vorgaben zum Zentralabitur Informatik 2027/2028/2029',
      },
      by: {
        expects:
          'Bayern fixes no language — the Fachausschuss of her school names the permitted object-oriented languages on the exam itself. Never insist on one language.',
        taught: true,
        source: 'Bayern, Abiturprüfung 2026 Informatik gA und eA (Deckblatt)',
      },
      bw: {
        expects:
          'Baden-Württemberg fixes no language (year 7 expressly block-based, textual from IMP in year 9 on). Never insist on one language.',
        taught: true,
        source:
          'Baden-Württemberg, Bildungsplan 2016 (Aufbaukurs Informatik Klasse 7; IMP Klassen 8–10)',
      },
      ni: {
        expects:
          'Niedersachsen deliberately fixes no language and standardises the notation instead: the forms of representation and the function set are what count, not the language.',
        taught: true,
        source: 'Niedersachsen, Kerncurriculum gymnasiale Oberstufe Informatik (2017)',
      },
      be: {
        expects:
          'Berlin requires a second paradigm in the Leistungskurs — applicative programming, functional or logical — so an answer in one paradigm may be only half of what is asked there.',
        taught: true,
        source: 'Berlin, Rahmenlehrplan gymnasiale Oberstufe Teil C Informatik (2022)',
      },
    },
    verifiedIn: 'docs/lehrplan-und-uebungsformen.md §5.2',
  },
};
