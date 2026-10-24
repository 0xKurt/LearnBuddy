// requires live verification in Claude Code session
import { must, type Case } from './caseChecks.js';
export const VOCABULARY_CASES: Case[] = [
  {
    id: 'de_vocab_known_pairs',
    message: 'Frag mich ab: the kitchen – die Küche; the room – das Zimmer.',
    check: (o) =>
      must(
        o.offers.some((f) => f.kind === 'vocab'),
        'typed list uses vocabulary',
      ),
  },
  {
    id: 'de_vocab_unknown_list',
    message: 'Frag mich meine Vokabeln aus Unit 3 ab.',
    check: (o) => [
      ...must(o.offers.length === 0, 'unknown list is not invented'),
      ...must(/[?]|schick|schreib|sende|lade/iu.test(o.reply ?? ''), 'asks for the list'),
    ],
  },
  {
    id: 'de_vocab_explicit_topic',
    message:
      'Denk dir 20 englische Basisvokabeln zur Wohnung mit deutscher Übersetzung für Klasse 6 aus und frag mich in beide Richtungen ab.',
    check: (o) =>
      must(
        o.offers.some((f) => f.kind === 'vocab'),
        'topic vocabulary uses vocab, never cloze',
      ),
  },
  {
    id: 'fr_vocab_typed_offer',
    learner: { relation: 'child', birthDate: '2014-02-10' },
    message:
      'frag mich meine vokabeln ab: la chambre das zimmer, le lit das bett, la fenêtre das fenster',
    check: (o) => must(o.tools.includes('offer_learning'), 'offers a vocabulary quiz'),
  },
];
