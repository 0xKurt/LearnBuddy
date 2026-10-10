import { describe, expect, it } from 'vitest';

import {
  mergeTranscript,
  MAX_TRANSCRIBE_CONTEXT,
  replyAfter,
  spokenText,
  transcriptContext,
  transcriptLang,
} from '../spoken.js';

// The real German words (locales/de/math.json), not a copy — see lib/math/__tests__/words.ts.
import { DE as WORDS } from '../../math/__tests__/words.js';
import { sayMath } from '../../math/speak.js';

describe('spokenText', () => {
  it('reads math in words and drops **bold** markers', () => {
    expect(spokenText('Kürze **zuerst** $\\frac{6}{8}$', sayMath(WORDS))).toBe(
      'Kürze zuerst 6 Achtel',
    );
  });
  it('says a text as written where no domain gives words for its notation', () => {
    expect(spokenText('- **Tipp:** erst\n- dann', (t) => t)).toBe('Tipp: erst. dann.');
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

  it('adds a dictated line under a written path (issue #221)', () => {
    expect(mergeTranscript('2x + 3 = 7\n2x = 4', 'x = 2', 'line', 2000)).toBe(
      '2x + 3 = 7\n2x = 4\nx = 2',
    );
    // She already started the next line with the key: no empty line in between.
    expect(mergeTranscript('2x + 3 = 7\n', 'x = 2', 'line', 2000)).toBe('2x + 3 = 7\nx = 2');
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
