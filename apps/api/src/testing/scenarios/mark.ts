// Scripted model answers for the browser shots of marking (issue #234, tests/web/mark.spec.ts).
// Its own learner sentences, so no other spec shifts these answers (#313). Test tooling only;
// answers are keyed by the learner's text.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)
//
// The model writes the text and NAMES the words to mark (or writes the commas and hyphens); code
// splits, finds and keeps the places (Regel 0). Each case is the LARGEST its mode may be
// (contracts/structured.ts, MARK_*), so the shots measure the worst case on 360×740 (rule 16):
// 24 words to tap, 8 words sorted into three categories with the longest category name, a
// sentence of 16 words with two commas to set, three words of up to 12 letters to split.

import { scriptGenerations } from './generations.js';
import { says, scriptTurns } from './turns.js';

type Case = { when: RegExp; reply: string; ask: string; title: string; task: object };

const CASES: Case[] = [
  {
    when: /nomen markieren/i,
    reply: 'Gern – tipp die Nomen an.',
    ask: 'Nomen markieren',
    title: 'Nomen erkennen',
    task: {
      prompt: 'Tippe alle Nomen an.',
      mode: 'words',
      text: 'am montag fährt die familie mit dem auto ans meer. der bruder baut eine burg aus sand und die schwester sammelt muscheln am strand.',
      targets: [
        'montag',
        'familie',
        'auto',
        'meer',
        'bruder',
        'burg',
        'sand',
        'schwester',
        'muscheln',
        'strand',
      ].map((word) => ({ word, occurrence: null, category: null })),
      categories: null,
      corrected: null,
    },
  },
  {
    when: /satzglieder bestimmen/i,
    reply: 'Klar – erst die Art wählen, dann die Wörter antippen.',
    ask: 'Satzglieder bestimmen',
    title: 'Satzglieder',
    task: {
      prompt: 'Markiere Subjekt, Prädikat und Akkusativobjekt.',
      mode: 'words',
      text: 'Die Oma liest den Kindern eine Geschichte vor.',
      targets: [
        { word: 'Die Oma', occurrence: null, category: 'Subjekt' },
        { word: 'liest', occurrence: null, category: 'Prädikat' },
        { word: 'vor', occurrence: null, category: 'Prädikat' },
        { word: 'eine Geschichte', occurrence: null, category: 'Akkusativobjekt' },
      ],
      categories: ['Subjekt', 'Prädikat', 'Akkusativobjekt'],
      corrected: null,
    },
  },
  {
    when: /kommas setzen/i,
    reply: 'Gut – tipp das Wort an, hinter das ein Komma gehört.',
    ask: 'Kommas setzen',
    title: 'Kommas',
    task: {
      prompt: 'Setze die fehlenden Kommas.',
      mode: 'gaps',
      text: 'Als wir am Bahnhof ankamen, war der Zug schon weg, weil er zu früh losgefahren war.',
      targets: null,
      categories: null,
      corrected: null,
    },
  },
  {
    when: /silben trennen/i,
    reply: 'Los geht’s – tipp den Buchstaben an, nach dem eine Silbe endet.',
    ask: 'Silben trennen',
    title: 'Silben',
    task: {
      prompt: 'Trenne die Wörter nach Silben.',
      mode: 'syllables',
      text: 'Re-gen-bo-gen Scho-ko-la-de Ki-cher-erb-se',
      targets: null,
      categories: null,
      corrected: null,
    },
  },
];

export function scriptMark(): void {
  scriptTurns(
    ...CASES.map((c) => ({
      when: c.when,
      answer: says(c.reply, [{ tool: 'offer_learning', args: { kind: 'practice', text: c.ask } }]),
    })),
  );
  for (const c of CASES) {
    scriptGenerations({
      when: new RegExp(`LEARNER'S TEXT:\\n[^\\n]*${c.ask}`, 'i'),
      answer: () => ({
        usable: true,
        title: c.title,
        subject: { name: 'Deutsch', kind: 'german' },
        items: [],
        structured: [{ type: 'mark', ...c.task, topic: c.title, difficulty: 2, prompt_lang: 'de' }],
      }),
    });
  }
}
