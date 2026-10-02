// Tasks with several parts as the model writes them (issue #297): one per subject the issue names
// — Mathe, Physik, Chemie, Geschichte, Deutsch. Used by the integration test and by the scripted
// model of the browser walkthrough. Every number a part calculates with stands in its material,
// and every key is what its calculation gives, so code (Regel 0) lets them through; the tests make
// them fail on purpose by changing exactly one thing.
//
// Written like a class-10 sheet, not like a demo: the material carries the situation and its
// values, the parts carry the operators. The texts are invented for the tests (no real source).
// Test tooling only.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

const base = {
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  tolerance: null,
  uses: [],
  calc: null,
  hints: [],
  points: [],
  difficulty: 3,
};

/** Physik: speed from distance and time, then the kinetic energy WITH that speed, then a reason. */
export const PHYSIK = {
  title: 'Radfahrt',
  topic: 'Geschwindigkeit und Energie',
  lang: 'de',
  lines: [
    'Lena fährt mit dem Rad auf einer',
    'geraden Strecke 100 m in 8 s.',
    'Lena und ihr Rad haben zusammen',
    'eine Masse von 80 kg.',
  ],
  figure: null,
  givens: [
    { name: 's', value: 100, unit: 'm' },
    { name: 't', value: 8, unit: 's' },
    { name: 'm', value: 80, unit: 'kg' },
  ],
  parts: [
    {
      ...base,
      kind: 'numeric',
      prompt: 'Berechne Lenas Geschwindigkeit in m/s.',
      answer: '12.5',
      unit: 'm/s',
      calc: 's / t',
      hints: ['Geschwindigkeit ist Strecke durch Zeit.'],
    },
    {
      ...base,
      kind: 'numeric',
      prompt: 'Berechne mit deinem Ergebnis aus a) die Bewegungsenergie.',
      answer: '6250',
      unit: 'J',
      calc: '0.5 * m * [a]^2',
      hints: ['Die Formel ist $E = \\frac{1}{2} m v^{2}$.'],
    },
    {
      ...base,
      kind: 'long',
      prompt:
        'Begründe, warum sich die Bewegungsenergie vervierfacht, wenn Lena doppelt so schnell fährt.',
      answer: 'Die Energie hängt vom Quadrat der Geschwindigkeit ab: 2² = 4.',
      uses: ['b'],
    },
  ],
};

/** Mathe: a linear tariff — the equation, the cost of one month, the share of the base fee. */
export const MATHE = {
  title: 'Handytarif',
  topic: 'Lineare Funktionen',
  lang: 'de',
  lines: [
    'Ein Handytarif kostet im Monat',
    '9,99 € Grundgebühr und 0,09 € für',
    'jede Minute. Im Mai telefoniert',
    'Tim 120 Minuten.',
  ],
  // The material carries a graph the app draws: the tariff as a line, with Tim's month on it.
  figure: {
    type: 'function_plot',
    functions: [{ expr: '0.09*x+9.99', label: 'Kosten in €' }],
    x_min: 0,
    x_max: 200,
    y_min: 0,
    y_max: 30,
    points: [{ x: 120, y: 20.79, label: 'Mai' }],
  },
  givens: [
    { name: 'G', value: 9.99, unit: '€' },
    { name: 'p', value: 0.09, unit: '€' },
    { name: 'n', value: 120, unit: 'min' },
  ],
  parts: [
    {
      ...base,
      kind: 'formula',
      prompt: 'Stelle die Gleichung der Kosten $y$ für $x$ Minuten auf.',
      answer: 'y = 0.09x + 9.99',
      accepted_answers: ['y = 9.99 + 0.09x'],
    },
    {
      ...base,
      kind: 'numeric',
      prompt: 'Berechne Tims Kosten im Mai.',
      answer: '20.79',
      unit: '€',
      calc: 'G + p * n',
    },
    {
      ...base,
      kind: 'numeric',
      prompt:
        'Wie viel Prozent seiner Kosten im Mai ist die Grundgebühr? Runde auf eine Nachkommastelle.',
      answer: '48.1',
      unit: '%',
      calc: 'G / [b] * 100',
    },
  ],
};

/** Chemie: the reaction equation, the amount of substance, the mass of the product from it. */
export const CHEMIE = {
  title: 'Magnesium verbrennt',
  topic: 'Stöchiometrie',
  lang: 'de',
  lines: [
    'Magnesium verbrennt an der Luft mit',
    'heller Flamme zu Magnesiumoxid.',
    'Im Versuch verbrennen 4,8 g Magnesium.',
    'M(Mg) = 24,3 g/mol',
    'M(MgO) = 40,3 g/mol',
  ],
  figure: null,
  givens: [
    { name: 'm', value: 4.8, unit: 'g' },
    { name: 'M', value: 24.3, unit: 'g/mol' },
    { name: 'M2', value: 40.3, unit: 'g/mol' },
  ],
  parts: [
    {
      ...base,
      kind: 'formula',
      prompt: 'Stelle die Reaktionsgleichung auf.',
      answer: '2 Mg + O2 -> 2 MgO',
    },
    {
      ...base,
      kind: 'numeric',
      prompt: 'Berechne die Stoffmenge des Magnesiums. Runde auf drei Nachkommastellen.',
      answer: '0.198',
      unit: 'mol',
      calc: 'm / M',
    },
    {
      ...base,
      kind: 'numeric',
      prompt:
        'Berechne mit deinem Ergebnis aus b) die Masse des entstehenden Magnesiumoxids. Runde auf zwei Nachkommastellen.',
      answer: '7.98',
      unit: 'g',
      calc: '[b] * M2',
    },
  ],
};

/** Geschichte: a source — describe, place, judge (the judgement checked by its key points). */
export const GESCHICHTE = {
  title: 'Brief eines Kölner Bürgers, März 1848',
  topic: 'Revolution 1848',
  lang: 'de',
  lines: [
    'Köln, den 20. März 1848',
    '',
    'Lieber Bruder,',
    'in Berlin haben die Bürger auf den',
    'Barrikaden gekämpft, und der König',
    'hat nachgeben müssen. Endlich wird',
    'man uns frei reden und schreiben',
    'lassen! Doch ich fürchte, dass die',
    'Fürsten ihr Wort bald vergessen.',
    'Wir brauchen eine Verfassung für',
    'ganz Deutschland, nicht nur leere',
    'Versprechen.',
    '  Dein Heinrich',
  ],
  figure: null,
  givens: [],
  parts: [
    {
      ...base,
      kind: 'short',
      prompt: 'Nenne zwei Forderungen, die Heinrich in dem Brief stellt.',
      answer: 'Meinungs- und Pressefreiheit, eine Verfassung für ganz Deutschland',
      accepted_answers: ['Pressefreiheit und Verfassung', 'Verfassung und freie Rede'],
    },
    {
      ...base,
      kind: 'multiple_choice',
      prompt: 'Ordne die Quelle ein: Zu welchem Ereignis gehört sie?',
      answer: 'zur Märzrevolution 1848',
      choices: [
        'zur Märzrevolution 1848',
        'zur Reichsgründung 1871',
        'zur Novemberrevolution 1918',
      ],
      correct_choice: 0,
    },
    {
      ...base,
      kind: 'long',
      prompt: 'Beurteile, ob Heinrich der Zukunft der Revolution vertraut. Belege mit dem Text.',
      answer: 'Er freut sich, misstraut aber den Fürsten (Z. 8–9).',
      uses: ['a', 'b'],
      points: ['Eigenes Urteil', 'Textbeleg'],
    },
  ],
};

/** Deutsch: a short text — summarise, name a figure of speech in a line, take a position. */
export const DEUTSCH = {
  title: 'Der Anruf',
  topic: 'Kurzgeschichte',
  lang: 'de',
  lines: [
    'Das Handy lag auf dem Tisch wie ein',
    'schlafendes Tier. Seit Stunden schon',
    'wartete Jonas, dass es endlich',
    'aufwachte. Sein Herz war ein Stein.',
    'Als es dann klingelte, ließ er es',
    'klingeln. Er wusste nicht mehr, was',
    'er sagen wollte.',
  ],
  figure: null,
  givens: [],
  parts: [
    {
      ...base,
      kind: 'short',
      prompt: 'Worauf wartet Jonas?',
      answer: 'auf einen Anruf',
      accepted_answers: ['dass das Handy klingelt', 'auf das Klingeln'],
    },
    {
      ...base,
      kind: 'multiple_choice',
      prompt: 'Welches sprachliche Mittel steht in Z. 4?',
      answer: 'Metapher',
      choices: ['Vergleich', 'Metapher', 'Alliteration'],
      correct_choice: 1,
    },
    {
      ...base,
      kind: 'long',
      prompt: 'Nimm Stellung: Hat Jonas richtig gehandelt, als er nicht abhob?',
      answer: 'Eine begründete eigene Meinung mit Bezug auf den Text.',
      points: ['Position', 'Begründung'],
    },
  ],
};
