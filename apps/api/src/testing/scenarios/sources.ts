// Scripted model answers for the browser walkthrough of the two sources besides a worksheet
// (tests/web/sources.spec.ts, issue #259): a corrected maths test with two tasks marked wrong,
// one right and the grade on top, and the notebook entry of a biology lesson. Each has its own
// learner, keyed by her age (14 and 15, nobody else's in the walkthrough), so no other spec's
// photo is read as hers (#313, #350). The answers say what the model would say — the source,
// the marked tasks, more questions than code keeps; every cut below is code's (sources.ts).
// Test tooling only.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import { readingRules } from './rules.js';

const question = (prompt: string, answer: string, topic: string, kind = 'numeric') => ({
  kind,
  prompt,
  answer,
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic,
  difficulty: 2,
  prompt_lang: null,
  lang: null,
  figure: null,
  source_excerpt: null,
});

const ADDITION = 'Rechne schriftlich: 37 + 48';
const PRODUCT = 'Rechne: 7 · 8';

export function scriptSources(): void {
  readingRules.add(
    {
      when: /LEARNER: 14 years/,
      system: /learner's study material/,
      answer: () => ({
        is_learning_material: true,
        readable: true,
        pages: [{ page: 1, read: 'all', problem: null }],
        title: 'Probe Rechnen',
        subject: { name: 'Mathe', kind: 'math' },
        source: 'corrected_test',
        extracted_text: `Note 3 – 14/20 Punkte\n1. ${ADDITION}\n2. ${PRODUCT}\n3. Rechne: 2 + 2`,
        marked: [
          { page: 1, task: ADDITION, questions: ['26 + 59', '37 + 48'] },
          { page: 1, task: PRODUCT, questions: ['6 · 9'] },
        ],
        items: [
          question('26 + 59', '85', 'Schriftlich addieren'),
          // The marked task itself, and one that was right: a worksheet would keep both.
          question('37 + 48', '85', 'Schriftlich addieren'),
          question('6 · 9', '54', 'Einmaleins'),
          question('2 + 2', '4', 'Kopfrechnen'),
        ],
        more_items: false,
      }),
    },
    {
      when: /LEARNER: 15 years/,
      system: /learner's study material/,
      answer: () => ({
        is_learning_material: true,
        readable: true,
        pages: [{ page: 1, read: 'all', problem: null }],
        title: 'Die Photosynthese',
        subject: { name: 'Biologie', kind: 'biology' },
        source: 'notebook_entry',
        extracted_text:
          '# Die Photosynthese\nPflanzen bilden im Blattgrün aus Wasser und Kohlenstoffdioxid mit Licht Traubenzucker und Sauerstoff.',
        items: [
          ['Wo in der Pflanze läuft die Photosynthese ab?', 'im Blattgrün'],
          ['Welche Energie braucht die Photosynthese?', 'Licht'],
          ['Welches Gas nimmt die Pflanze dafür auf?', 'Kohlenstoffdioxid'],
          ['Welcher Zucker entsteht?', 'Traubenzucker'],
          ['Welches Gas gibt die Pflanze ab?', 'Sauerstoff'],
          ['Was braucht die Pflanze außer Licht und Gas?', 'Wasser'],
          ['Wie heißt der grüne Farbstoff?', 'Chlorophyll'],
        ].map(([prompt, answer]) => question(prompt!, answer!, 'Photosynthese', 'short')),
        more_items: false,
      }),
    },
  );
}
