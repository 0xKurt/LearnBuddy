// One validated vocabulary inventory for chat and practice (#940).
import type { StartTopicRequest, VocabularyRequest } from '@learnbuddy/shared-types/contracts';
import type { Db } from '../../lib/db.js';
import { normalizeForMatch as vocabKey } from '../buddy/text.js';
import { AppError } from '../../lib/errors.js';
import type { ItemDraft, StoredItem } from './items.js';

/** A whole pair must occur together, in either order; scattered words are not a list. */
function typedPair(prompt: string, answer: string, text: string): boolean {
  const quote = (s: string) => vocabKey(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const left = quote(prompt);
  const right = quote(answer);
  const separator = '(?:\\s*[–—=:|\\t-]+\\s*|\\s+)';
  const boundary = "(?<![\\p{L}\\p{N}'-])";
  return new RegExp(
    `${boundary}(?:${left}${separator}${right}|${right}${separator}${left})(?![\\p{L}\\p{N}'-])`,
    'u',
  ).test(vocabKey(text));
}

export function vocabularyItems(items: ItemDraft[], input: StartTopicRequest): ItemDraft[] {
  const request = input.vocabulary;
  const seen = new Set<string>();
  const kept = items.filter((item) => {
    if (item.kind !== 'vocab' || !item.lang || !item.prompt_lang || item.lang === item.prompt_lang)
      return false;
    if (request && (item.prompt_lang !== request.prompt_lang || item.lang !== request.lang))
      return false;
    if (request?.source !== 'topic' && !typedPair(item.prompt, item.answer, input.text))
      return false;
    const key = [
      item.prompt_lang + ':' + vocabKey(item.prompt),
      item.lang + ':' + vocabKey(item.answer),
    ]
      .sort()
      .join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (kept.length === 0 || (request && kept.length !== request.count)) {
    throw new AppError('invalid_input', 'Vocabulary count was not fulfilled', {
      reason: 'not_usable',
    });
  }
  return kept;
}

/** Count overflow is refused, never silently presented as a completed smaller request. */
export function vocabularyProblem(request: VocabularyRequest): string | null {
  if (request.count > 25)
    return 'At most 25 vocabulary pairs fit in one set. Explain the limit and ask which first batch she wants; do not claim the whole request was fulfilled.';
  if (request.prompt_lang === request.lang)
    return 'Vocabulary needs two different languages; ask which translation language she wants.';
  return null;
}

/** Load once, scoped to the learner; callers hold her settings lock through insertion. */
export async function knownVocabulary(db: Db, learnerId: string) {
  return db.query<{
    id: string;
    prompt: string;
    answer: string;
    accepted_answers: string[];
    prompt_lang: string;
    lang: string;
  }>(
    `select id, prompt, answer, accepted_answers, prompt_lang, lang from items
      where learner_id = $1 and kind = 'vocab' and archived_at is null order by id`,
    [learnerId],
  );
}

export function sameVocabulary(
  left: Pick<StoredItem, 'prompt' | 'answer' | 'prompt_lang' | 'lang'>,
  right: Pick<StoredItem, 'prompt' | 'answer' | 'prompt_lang' | 'lang'>,
): boolean {
  return (
    left.prompt_lang === right.prompt_lang &&
    left.lang === right.lang &&
    vocabKey(left.prompt) === vocabKey(right.prompt) &&
    vocabKey(left.answer) === vocabKey(right.answer)
  );
}

/** Written in the session transaction, so a list never advertises uncommitted cards. */
export async function publishVocabulary(
  db: Db,
  learnerId: string,
  input: StartTopicRequest,
  items: ItemDraft[],
): Promise<void> {
  if (input.vocabulary?.output !== 'chat') return;
  const list = items
    .map((item, index) => `${index + 1}. ${item.prompt} – ${item.answer}`)
    .join('\n');
  await db.query(
    `update buddy_messages m set text = $3, ask = null
      where m.learner_id = $1 and m.role = 'buddy' and m.decision_id = (
        select decision_id from buddy_actions where id = $2 and learner_id = $1
          and tool = 'offer_learning' and status = 'applied')`,
    [learnerId, input.client_request_id, list],
  );
}

/** The offer is authoritative on tap, also when its first preparation was interrupted. */
export async function requestForOffer(
  db: Db,
  learnerId: string,
  input: StartTopicRequest,
): Promise<StartTopicRequest> {
  const offer = await db.maybeOne<{ result: Omit<StartTopicRequest, 'client_request_id'> }>(
    "select result from buddy_actions where id = $1 and learner_id = $2 and tool = 'offer_learning' and status = 'applied'",
    [input.client_request_id, learnerId],
  );
  const request = offer ? { ...offer.result, client_request_id: input.client_request_id } : input;
  if (!request.vocabulary) return request;
  const problem = vocabularyProblem(request.vocabulary);
  if (request.kind !== 'vocab' || problem)
    throw new AppError('invalid_input', problem ?? 'Vocabulary requires vocab', {
      reason: 'not_usable',
    });
  return {
    ...request,
    // The request describes the question she wants to see. Existing storage always
    // keeps the foreign side first; produce will select its reverse card exactly once.
    vocabulary:
      request.vocabulary.direction === 'produce'
        ? {
            ...request.vocabulary,
            prompt_lang: request.vocabulary.lang,
            lang: request.vocabulary.prompt_lang,
          }
        : request.vocabulary,
    direction: request.vocabulary.direction === 'both' ? null : request.vocabulary.direction,
  };
}
