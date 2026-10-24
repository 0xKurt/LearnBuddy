// requires live verification in Claude Code session (fixed owner regressions, #944)
import { LEARNING } from '../asks/learning.js';

export type Goal = {
  id: string;
  issue: number;
  wants: string;
  messages: string[];
  expect:
    | 'vocab'
    | 'chat-vocab'
    | 'offer'
    | 'picture'
    | 'clean'
    | 'summary'
    | 'reminder'
    | 'history'
    | 'answer'
    | 'photo';
  count?: number;
};
export const OWNER: Goal[] = [
  {
    id: 'topic-vocabulary',
    issue: 940,
    wants: '20 English school vocabulary pairs, German to English practice',
    messages: [
      'Denk dir bitte 20 englische Basisvokabeln zum Thema Schule aus. Frag mich von Deutsch nach Englisch ab.',
    ],
    expect: 'vocab',
    count: 20,
  },
  {
    id: 'twenty-in-chat',
    issue: 940,
    wants: '20 bilingual vocabulary pairs immediately in chat',
    messages: [
      'Ich bin ein deutsches Kind und möchte englische Vokabeln lernen.',
      'Denk du dir Basisvokabeln aus.',
      'Sende mir bitte hier im Chat 20 Vokabeln mit deutscher Übersetzung.',
    ],
    expect: 'chat-vocab',
    count: 20,
  },
  {
    id: 'vocab-not-cloze',
    issue: 940,
    wants: 'Five English animal vocabulary pairs; quiz German to English, never cloze exercises',
    messages: [
      'Ich will englische Vokabeln üben, Thema Tiere. Denk dir 5 Wörter aus und frag mich von Deutsch nach Englisch ab. Keine Lückentexte.',
    ],
    expect: 'vocab',
    count: 5,
  },
  {
    id: 'clarification-chain',
    issue: 938,
    wants: 'A vocabulary request continues after answering the language question',
    messages: [
      'Kannst du mir einen Test mit 20 Vokabeln zusammenstellen?',
      'Deutsch und Englisch.',
    ],
    expect: 'offer',
  },
  {
    id: 'with-picture',
    issue: 934,
    wants: 'A real picture of the skeleton',
    messages: ['Erkläre mir das menschliche Skelett.', 'Am besten komplett mit Bild.'],
    expect: 'picture',
  },
  {
    id: 'no-internals',
    issue: 934,
    wants: 'Readable child-facing explanation, no internal protocol',
    messages: ['Erklär mir bitte ausführlich wie du mir beim Lernen hilfst.'],
    expect: 'clean',
  },
  {
    id: 'summary-not-repeat',
    issue: 937,
    wants: 'A structured condensation of the conversation',
    messages: [
      'Erzähl mir ausführlich alles über das menschliche Skelett.',
      'Mach mir bitte eine kurze Zusammenfassung davon.',
    ],
    expect: 'summary',
  },
  {
    id: 'reminder-next-step',
    issue: 941,
    wants: 'Remind me in five minutes to practise English, with content and a valid next step',
    messages: ['Erinner mich in 5 Minuten daran, dass ich Englisch üben muss.'],
    expect: 'reminder',
  },
  {
    id: 'history-restart',
    issue: 937,
    wants: 'Full server conversation after switching mode and restarting',
    messages: ['Erkläre mir Brüche.', 'Wie addiere ich sie?', 'Fass das bitte zusammen.'],
    expect: 'history',
  },
];
export const GOALS: Goal[] = [
  ...OWNER,
  ...LEARNING.filter((c) => ['learning-001', 'learning-002'].includes(c.id)).map((c) => ({
    id: c.id,
    issue: 106,
    wants: c.wants,
    messages: [c.says],
    expect: 'answer' as const,
  })),
  {
    id: 'photo-to-practice',
    issue: 944,
    wants: 'Practice based on my photographed fractions worksheet',
    messages: ['Ich möchte die Aufgaben auf meinem Blatt üben.'],
    expect: 'photo',
  },
];

// Fixed initial requests keep the code predicate's exact demand independent of actor improvisation.
const LOCAL_REQUESTS: Record<string, Record<string, string[]>> = {
  en: {
    'topic-vocabulary': [
      'Make up 20 basic English school vocabulary words. Quiz me from German to English.',
    ],
    'twenty-in-chat': [
      'I am a German child learning English vocabulary.',
      'Please choose basic vocabulary yourself.',
      'Send me 20 words with their German translations here in the chat.',
    ],
    'vocab-not-cloze': [
      'I want to practise English animal vocabulary. Make up 5 words and quiz me from German to English. No fill-in-the-blank exercises.',
    ],
  },
  fr: {
    'clarification-chain': [
      'Peux-tu me préparer un test de 20 mots de vocabulaire ?',
      'Allemand et anglais.',
    ],
    'with-picture': [
      'Explique-moi le squelette humain.',
      'De préférence en entier avec une image.',
    ],
    'no-internals': ['Explique-moi en détail comment tu peux m’aider à apprendre.'],
  },
  es: {
    'summary-not-repeat': [
      'Cuéntame en detalle todo sobre el esqueleto humano.',
      'Hazme un resumen breve de eso.',
    ],
    'reminder-next-step': ['Recuérdame dentro de 5 minutos que tengo que practicar inglés.'],
    'history-restart': ['Explícame las fracciones.', '¿Cómo se suman?', 'Resúmelo, por favor.'],
  },
  it: {
    'learning-001': ['spiegami le frazioni ma in modo semplice'],
    'learning-002': ['non ho ancora capito puoi spiegarlo in un altro modo'],
    'photo-to-practice': ['Vorrei esercitarmi con i problemi sul mio foglio.'],
  },
};
export function initialRequests(goal: Goal, locale: string): string[] {
  if (locale === 'de') return goal.messages;
  const translated = LOCAL_REQUESTS[locale]?.[goal.id];
  if (!translated) throw new Error(`simulator: missing fixed request ${locale}/${goal.id}`);
  return translated;
}
