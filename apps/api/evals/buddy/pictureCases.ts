// requires live verification in Claude Code session (real model evaluation)
import { ChatFigure } from '@learnbuddy/shared-types/contracts';
import { replyFormatErrors } from '../../src/modules/buddy/replyFormat.js';
import { must, type Case, type Outcome } from './caseChecks.js';
import { reviewPictureFollowup } from './pictureReview.js';

export const SKELETON_REPLY =
  'Das Skelett gibt dem Körper Halt, schützt wichtige Organe und macht Bewegung möglich. Der Schädel schützt das Gehirn, die Wirbelsäule trägt den Körper, der Brustkorb schützt Herz und Lunge, und Arme und Beine helfen beim Greifen und Laufen.';

type PictureOutcome = Pick<Outcome, 'reply' | 'tools' | 'pictures' | 'pictureReview'>;

function picture(o: PictureOutcome, kind: 'schematic' | 'fraction'): string[] {
  const figures = (o.pictures ?? []).map((p) => ChatFigure.safeParse(p.figure));
  return [
    ...must(o.tools.includes('show_figure'), 'real picture act'),
    ...must(
      figures.some(
        (p) =>
          p.success &&
          p.data.type === kind &&
          (p.data.type !== 'schematic' || (p.data.d === 'skeleton' && p.data.n.length > 0)) &&
          (p.data.type !== 'fraction' ||
            (p.data.shape === 'circle' &&
              p.data.fractions.some((f) => f.parts === 4 && f.filled === 3))),
      ),
      'correct validated figure',
    ),
    ...must(replyFormatErrors(o.reply ?? '').length === 0, 'no code fence or text drawing'),
  ];
}

export const PICTURE_CASES: Array<
  Omit<Case, 'check'> & { check: (o: PictureOutcome) => string[] }
> = [
  {
    id: 'de_anatomy_picture',
    repeat: { runs: 3, maxFailures: 0 },
    message: 'Erkläre mir den Aufbau eines menschlichen Skeletts mit einem beschrifteten Bild.',
    check: (o) => picture(o, 'schematic'),
  },
  {
    id: 'de_maths_picture',
    repeat: { runs: 3, maxFailures: 0 },
    message: 'Erkläre mir drei Viertel mit einem Kreisbild.',
    check: (o) => picture(o, 'fraction'),
  },
  {
    id: 'de_picture_followup',
    repeat: { runs: 3, maxFailures: 0 },
    setup: async (env, l) => {
      for (const [role, text] of [
        ['learner', 'Kannst du mir den Aufbau eines menschlichen Skeletts erklären'],
        ['buddy', SKELETON_REPLY],
      ]) {
        await env.db.query(
          'insert into buddy_messages (learner_id, role, text, status, created_at) values ($1, $2, $3, $4, $5)',
          [l.learnerId, role, text, 'done', env.deps.now()],
        );
      }
    },
    message: 'Am besten komplett mit Bild',
    review: (examiner, outcome) => reviewPictureFollowup(examiner, SKELETON_REPLY, outcome),
    check: (o) => [
      ...picture(o, 'schematic'),
      ...must(
        o.pictureReview?.reply === o.reply &&
          o.pictureReview?.adds_missing_context === true &&
          o.pictureReview?.repeats_explanation === false,
        'adds the picture without repeating the explanation',
      ),
    ],
  },
];
