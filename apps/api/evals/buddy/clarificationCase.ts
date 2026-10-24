// Replay the wish/question boundary; a topic makes language the only missing detail (#938).
// requires live verification in Claude Code session
import { must, type Case } from './caseChecks.js';

export const clarificationCase: Case = {
  id: 'de_vocab_test_after_clarification',
  setup: async (env, learner) => {
    const wish = await env.db.one<{ id: string }>(
      `insert into buddy_messages (learner_id, role, text, status, created_at)
       values ($1, 'learner', $2, 'done', $3) returning id`,
      [
        learner.learnerId,
        'Kannst du mir einen Test mit 20 Vokabeln zum Thema Alltag zusammenstellen?',
        env.clock.now(),
      ],
    );
    await env.db.query(
      `insert into buddy_messages (learner_id, role, text, reply_to_id, ask, created_at)
       values ($1, 'buddy', $2, $3, $4, $5)`,
      [
        learner.learnerId,
        'In welcher Sprache?',
        wish.id,
        JSON.stringify({ options: ['Deutsch und Englisch', 'Französisch'] }),
        env.clock.now(),
      ],
    );
  },
  message: 'Deutsch und Englisch.',
  check: (outcome) =>
    must(
      outcome.offers.some((offer) => offer.kind === 'test'),
      'offers the requested vocabulary test after the clarification',
    ),
};
