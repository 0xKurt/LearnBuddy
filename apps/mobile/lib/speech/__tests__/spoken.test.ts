import { describe, expect, it } from 'vitest';

import type { SpokenWords } from '../../math/speak.js';
import {
  choiceLetter,
  endSentence,
  feedbackReadText,
  mergeTranscript,
  MAX_TRANSCRIBE_CONTEXT,
  questionReadText,
  replyAfter,
  spokenText,
  transcriptContext,
  transcriptLang,
} from '../spoken.js';

// The German words from locales/de/math.json "spoken" (only what these tests need).
const WORDS: SpokenWords = {
  frac: '{{num}} durch {{den}}',
  frac_long: 'Bruch: {{num}} durch {{den}}',
  power: 'hoch {{exp}}',
  squared: 'hoch 2',
  cubed: 'hoch 3',
  sub: 'Index {{sub}}',
  sqrt: 'Wurzel aus {{body}}',
  root: '{{index}}. Wurzel aus {{body}}',
  cbrt: 'dritte Wurzel aus {{body}}',
  symbols: { '+': 'plus', '=': 'gleich', '<': 'kleiner als', '>': 'größer als' },
};

describe('spokenText', () => {
  it('reads math in words and drops **bold** markers', () => {
    expect(spokenText('Kürze **zuerst** $\\frac{6}{8}$', WORDS)).toBe('Kürze zuerst 6 durch 8');
  });
});

describe('endSentence', () => {
  it('adds a full stop only when the sentence has no ending', () => {
    expect(endSentence('Wie viel ist das')).toBe('Wie viel ist das.');
    expect(endSentence('Wie viel ist das?')).toBe('Wie viel ist das?');
    expect(endSentence('  ')).toBe('');
  });
});

describe('questionReadText', () => {
  it('reads a question without choices as it is', () => {
    expect(questionReadText('Was ist $3 + 4$?', null, WORDS)).toBe('Was ist 3 plus 4?');
  });

  it('reads the choices as "A: …, B: …" after the question', () => {
    expect(
      questionReadText(
        'Welcher Bruch ist größer?',
        ['$\\frac{1}{2}$', '$\\frac{3}{4}$', 'beide gleich'],
        WORDS,
      ),
    ).toBe('Welcher Bruch ist größer? A: 1 durch 2, B: 3 durch 4, C: beide gleich.');
  });

  it('ends a question without punctuation before the choices', () => {
    expect(questionReadText('Wähle das Verb', ['laufen', 'Haus'], WORDS)).toBe(
      'Wähle das Verb. A: laufen, B: Haus.',
    );
  });

  it('skips empty choices without shifting the others', () => {
    expect(questionReadText('Welche?', ['eins', ' ', 'drei'], WORDS)).toBe(
      'Welche? A: eins, C: drei.',
    );
  });
});

describe('choiceLetter', () => {
  it('counts A to Z, then numbers', () => {
    expect(choiceLetter(0)).toBe('A');
    expect(choiceLetter(25)).toBe('Z');
    expect(choiceLetter(26)).toBe('27');
  });
});

describe('feedbackReadText', () => {
  it('puts the verdict word before the reply', () => {
    expect(feedbackReadText('Richtig', 'Genau, **28 cm²**.', WORDS)).toBe(
      'Richtig. Genau, 28 cm².',
    );
  });

  it('does not say the word twice when the reply starts with it', () => {
    expect(feedbackReadText('Richtig', 'Richtig! Gut gemacht.', WORDS)).toBe(
      'Richtig! Gut gemacht.',
    );
  });

  it('reads only the reply without a verdict word', () => {
    expect(feedbackReadText(null, 'Was weißt du über Rechtecke?', WORDS)).toBe(
      'Was weißt du über Rechtecke?',
    );
  });
});

describe('transcriptLang', () => {
  it('sends a two-letter language, otherwise null', () => {
    expect(transcriptLang('fr')).toBe('fr');
    expect(transcriptLang('fr-FR')).toBe('fr');
    expect(transcriptLang('EN')).toBe('en');
    expect(transcriptLang('gsw')).toBeNull();
    expect(transcriptLang(null)).toBeNull();
    expect(transcriptLang('')).toBeNull();
  });
});

describe('transcriptContext', () => {
  it('passes the question, squashed and within the limit', () => {
    expect(transcriptContext('  Was ist\n $\\frac{3}{4}$ ?')).toBe('Was ist $\\frac{3}{4}$ ?');
    expect(transcriptContext('')).toBeNull();
    const long = transcriptContext('x'.repeat(900));
    expect(long?.length).toBe(MAX_TRANSCRIBE_CONTEXT);
  });
});

describe('mergeTranscript', () => {
  it('replaces a short answer', () => {
    expect(mergeTranscript('27', '28 cm²', 'replace', 2000)).toBe('28 cm²');
  });

  it('appends to a message dictated in parts', () => {
    expect(mergeTranscript('Ich habe am Freitag', 'eine Mathearbeit', 'append', 2000)).toBe(
      'Ich habe am Freitag eine Mathearbeit',
    );
    expect(mergeTranscript('', ' Hallo ', 'append', 2000)).toBe('Hallo');
  });

  it('keeps the field when nothing was understood, and respects the limit', () => {
    expect(mergeTranscript('Hallo', '  ', 'append', 2000)).toBe('Hallo');
    expect(mergeTranscript('abc', 'defgh', 'append', 6)).toBe('abc de');
  });
});

describe('replyAfter', () => {
  const msg = (
    role: 'learner' | 'buddy',
    text: string,
    status: 'processing' | 'done' | 'failed' = 'done',
    client_message_id: string | null = null,
  ) => ({ role, text, status, client_message_id });

  it('finds Buddy’s latest finished reply after her message', () => {
    const thread = [
      msg('buddy', 'Hallo Lena'),
      msg('learner', 'Ich schreibe Freitag Mathe', 'done', 'c1'),
      msg('buddy', 'Super, dann üben wir.'),
      msg('buddy', 'Magst du gleich anfangen?'),
    ];
    expect(replyAfter(thread, 'c1')?.text).toBe('Magst du gleich anfangen?');
  });

  it('is null while Buddy is still thinking or her message is unknown', () => {
    const thread = [
      msg('buddy', 'Hallo Lena'),
      msg('learner', 'Hi', 'processing', 'c2'),
      msg('buddy', '', 'processing'),
    ];
    expect(replyAfter(thread, 'c2')).toBeNull();
    expect(replyAfter(thread, 'unknown')).toBeNull();
  });

  it('never reads a Buddy message from before her message', () => {
    const thread = [msg('buddy', 'Alt'), msg('learner', 'Neu', 'done', 'c3')];
    expect(replyAfter(thread, 'c3')).toBeNull();
  });
});
