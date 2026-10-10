// The grade-10 probe (issues #297 and #298, plan step 1 „Erst messen"): what a learner in Klasse 10
// asks Buddy to explain, and the material of class-test tasks in parts she practises from. The
// subjects and topics are the ones #298 names; the materials are written for this eval in the shape
// of a Klasse-10 class test (no textbook text is copied), the history source is public domain.
// Real sheets from a learner are the owner's to add (`TASK_CASES` takes them as they are typed).
// requires live verification in Claude Code session (eval cases for the live model)

/** One thing she asks Buddy to explain, in her words. */
export type ExplainCase = {
  id: string;
  /** Subject and topic, for the report and the judge. */
  what: string;
  message: string;
};

export const EXPLAIN_CASES: readonly ExplainCase[] = [
  {
    id: 'parabel-a',
    what: 'Mathe 10: quadratische Funktionen (Streckfaktor a)',
    message: 'was macht das a bei f(x) = a·x² mit der parabel?',
  },
  {
    id: 'trigonometrie',
    what: 'Mathe 10: Trigonometrie im rechtwinkligen Dreieck',
    message: 'wann nehm ich sinus und wann kosinus?',
  },
  {
    id: 'exponentiell',
    what: 'Mathe 10: exponentielles Wachstum',
    message: 'erklär mir exponentielles wachstum, was ist der unterschied zu linear',
  },
  {
    id: 'energie',
    what: 'Physik 10: Energieerhaltung',
    message: 'warum geht energie nie verloren, wenn ein ball doch irgendwann liegen bleibt?',
  },
  {
    id: 'elektrik',
    what: 'Physik 10: Reihen- und Parallelschaltung',
    message: 'warum ist der gesamtwiderstand bei parallelschaltung kleiner?',
  },
  {
    id: 'redox',
    what: 'Chemie 10: Redoxreaktionen',
    message: 'ich versteh oxidation und reduktion nicht, wer gibt da was ab?',
  },
  {
    id: 'stoechiometrie',
    what: 'Chemie 10: Stöchiometrie',
    message: 'wie rechne ich aus wie viel gramm bei einer reaktion rauskommen?',
  },
  {
    id: 'eroerterung',
    what: 'Deutsch 10: Erörterung',
    message: 'wie baue ich eine dialektische erörterung auf?',
  },
  {
    id: 'english-reading',
    what: 'Englisch 10: Reading comprehension',
    message: 'how do I find the main idea of a text quickly?',
  },
  {
    id: 'english-writing',
    what: 'Englisch 10: Writing (argumentative essay)',
    message: 'what makes a good topic sentence in an argumentative essay?',
  },
  {
    id: 'quellenarbeit',
    what: 'Geschichte 10: Quellenarbeit',
    message: 'wie analysiere ich eine historische quelle?',
  },
];

/** One class-test task as she types it in to practise from: its material and its subtasks. */
export type TaskCase = {
  id: string;
  what: string;
  /** What she types: the task as printed, material and subtasks a), b), c). */
  text: string;
};

export const TASK_CASES: readonly TaskCase[] = [
  {
    id: 'parabel-bruecke',
    what: 'Mathe 10: Parabel im Sachzusammenhang',
    text: [
      'Klassenarbeit-Aufgabe zum Üben:',
      'Ein Brückenbogen hat die Form der Parabel f(x) = -0,02x² + 8 (x und f(x) in Metern).',
      'a) Wie hoch ist der Bogen an der höchsten Stelle?',
      'b) Berechne die Spannweite des Bogens am Boden.',
      'c) Begründe, warum ein 7 m hohes Fahrzeug nicht überall unter dem Bogen durchpasst.',
    ].join('\n'),
  },
  {
    id: 'elektrik-messwerte',
    what: 'Physik 10: Messwerte in einer Tabelle',
    text: [
      'Aufgabe: An einem Widerstand wurden diese Werte gemessen:',
      'U in V: 2, 4, 6, 8 — I in A: 0,1; 0,2; 0,3; 0,4',
      'a) Berechne den Widerstand.',
      'b) Welche Stromstärke fließt bei 12 V?',
      'c) Erkläre, woran man in der Tabelle erkennt, dass das ohmsche Gesetz gilt.',
    ].join('\n'),
  },
  {
    id: 'stoechiometrie-kalk',
    what: 'Chemie 10: Stöchiometrie',
    text: [
      'Kalk zerfällt beim Erhitzen: CaCO3 → CaO + CO2. Es werden 50 g Kalk erhitzt',
      '(M(CaCO3) = 100 g/mol, M(CO2) = 44 g/mol).',
      'a) Welche Stoffmenge Kalk ist das?',
      'b) Wie viel Gramm Kohlenstoffdioxid entstehen?',
      'c) Erkläre, warum das Gemisch nach dem Erhitzen leichter ist.',
    ].join('\n'),
  },
  {
    id: 'quelle-artikel48',
    what: 'Geschichte 10: Quellenarbeit (Weimarer Verfassung, Art. 48)',
    text: [
      'Quelle: Weimarer Reichsverfassung, Artikel 48, Absatz 2 (1919):',
      '„Der Reichspräsident kann, wenn im Deutschen Reiche die öffentliche Sicherheit und Ordnung',
      'erheblich gestört oder gefährdet wird, die zur Wiederherstellung der öffentlichen Sicherheit',
      'und Ordnung nötigen Maßnahmen treffen, erforderlichenfalls mit Hilfe der bewaffneten Macht',
      'einschreiten. Zu diesem Zwecke darf er vorübergehend die in den Artikeln 114, 115, 117, 118,',
      '123, 124 und 153 festgesetzten Grundrechte ganz oder zum Teil außer Kraft setzen.“',
      'a) Gib wieder, was der Artikel dem Reichspräsidenten erlaubt.',
      'b) Ordne den Artikel in die Geschichte der Weimarer Republik ein.',
      'c) Beurteile, welche Gefahr der Artikel für die Demokratie barg.',
    ].join('\n'),
  },
  {
    id: 'deutsch-erörterung',
    what: 'Deutsch 10: Erörterung vorbereiten',
    text: [
      'Thema: „Sollte die Schule erst um 9 Uhr beginnen?“',
      'Material: Schlafforscher sagen, dass Jugendliche abends später müde werden. Viele Eltern',
      'müssen aber früh zur Arbeit, und Busse fahren nach festen Plänen.',
      'a) Nenne zwei Argumente für einen späteren Schulbeginn.',
      'b) Nenne ein Gegenargument.',
      'c) Nimm begründet Stellung.',
    ].join('\n'),
  },
];

/**
 * What the judge checks an explanation on (#298 plan step 1): subject-correct, followable at 15/16,
 * on the curriculum of grade 10, short enough. Each a yes/no the judge answers.
 */
export const EXPLAIN_CRITERIA = {
  correct: 'true if everything it states is subject-correct (no wrong fact, rule or example)',
  followable: 'true if a 15/16-year-old in grade 10 can follow it on her own',
  on_curriculum: 'true if it stays on what grade 10 in Germany is taught, neither below nor beyond',
  short_enough: 'true if it reads in under a minute on a phone',
} as const;

/** What the judge checks a task in parts on (#297): the task, its keys, its level. */
export const TASK_CRITERIA = {
  keys_right: 'true if every part’s answer is subject-correct for the material',
  parts_build: 'true if the parts build on each other like a class test (find, use, judge)',
  on_material: 'true if every part can be answered from the material and grade-10 knowledge',
  on_curriculum: 'true if it fits grade 10 in Germany',
} as const;
