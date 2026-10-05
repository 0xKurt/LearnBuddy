// Scripted model answers for the browser shots of marking (issue #234, tests/web/mark.spec.ts).
// Its own learner sentences, so no other spec shifts these answers (#313). Test tooling only;
// answers are keyed by the learner's text.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)
//
// The model writes the text and NAMES the words to mark (or writes the commas and hyphens); code
// splits, finds and keeps the places (Regel 0). Each case is the LARGEST its mode may be
// (contracts/structured.ts, MARK_*), so the shots measure the worst case on 360×740 (rule 16):
// 24 words to tap, a sentence sorted into three categories (three times: a usual set, three long
// school terms on two rows of buttons, and a long Satzglieder sentence of ten words, #368), a
// sentence of 16 words with two commas to set, four words of up to 10 letters to split.

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
      text: 'Oma liest den Kindern eine Geschichte vor.',
      targets: [
        { word: 'Oma', occurrence: null, category: 'Subjekt' },
        { word: 'liest', occurrence: null, category: 'Prädikat' },
        { word: 'vor', occurrence: null, category: 'Prädikat' },
        { word: 'eine Geschichte', occurrence: null, category: 'Akkusativobjekt' },
      ],
      categories: ['Subjekt', 'Prädikat', 'Akkusativobjekt'],
      corrected: null,
    },
  },
  {
    // The worst case of sorting: three long school terms on two rows of buttons, the most words.
    when: /objekte unterscheiden/i,
    reply: 'Gern – drei Arten von Objekten, erst die Art wählen.',
    ask: 'Objekte unterscheiden',
    title: 'Objekte',
    task: {
      prompt: 'Markiere Dativobjekt, Präpositionalobjekt und Subjekt.',
      mode: 'words',
      // Long words up to the measured characters: two rows of tiles under two rows of buttons.
      text: 'Großvater erzählt den Enkeln von Abenteuern.',
      targets: [
        { word: 'den Enkeln', occurrence: null, category: 'Dativobjekt' },
        { word: 'von Abenteuern', occurrence: null, category: 'Präpositionalobjekt' },
        { word: 'Großvater', occurrence: null, category: 'Subjekt' },
      ],
      categories: ['Dativobjekt', 'Präpositionalobjekt', 'Subjekt'],
      corrected: null,
    },
  },
  {
    // A real Satzglieder sentence of grades 5–7 (#368): ten words, 65 characters, three long
    // school terms on two rows of buttons. Before #368 it was refused (at most seven words).
    when: /satzglieder im langen satz/i,
    reply: 'Gern – ein langer Satz, erst die Art wählen.',
    ask: 'Satzglieder im langen Satz',
    title: 'Satzglieder im langen Satz',
    task: {
      prompt: 'Markiere Dativobjekt, Akkusativobjekt und Subjekt.',
      mode: 'words',
      text: 'Am Wochenende schenkt der Vater seiner Tochter ein neues Fahrrad.',
      targets: [
        { word: 'seiner Tochter', occurrence: null, category: 'Dativobjekt' },
        { word: 'ein neues Fahrrad', occurrence: null, category: 'Akkusativobjekt' },
        { word: 'der Vater', occurrence: null, category: 'Subjekt' },
      ],
      categories: ['Dativobjekt', 'Akkusativobjekt', 'Subjekt'],
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
      text: 'Re-gen-bo-gen Scho-ko-la-de Mu-si-kan-ten Lö-wen-zahn',
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
