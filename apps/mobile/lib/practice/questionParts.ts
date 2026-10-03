// What voice mode reads when a question appears (docs/architecture.md §Voice): the
// instruction and the prompt in their languages, the options only when they are words. Its own
// file so the practice screen stays within its size (docs/engineering-guards.md, rule 4).

import type { ItemView } from '@learnbuddy/shared-types/contracts';
import type { TFunction } from 'i18next';

import { currentLocale } from '../i18n/index.js';
import type { SpokenWords } from '../math/speak.js';
import type { SpokenPart } from '../speech/listen.js';
import { questionReadText, spokenText } from '../speech/spoken.js';

/** What voice mode reads when a question appears (never the topic). */
export function questionParts(item: ItemView, words: SpokenWords, t: TFunction): SpokenPart[] {
  const app = currentLocale();
  switch (item.kind) {
    case 'speak':
      return [
        { text: t('practice:speak.instruction'), lang: app },
        { text: item.prompt, lang: item.lang ?? item.prompt_lang ?? app },
      ];
    case 'vocab':
      return [{ text: spokenText(item.prompt, words), lang: item.prompt_lang ?? app }];
    default:
      return [
        {
          text: questionReadText(
            item.prompt,
            // Options that are pictures are not read by their texts: the text may be the
            // very formula the question asks about (issue #231). They are seen, and a screen
            // reader hears each one described.
            item.kind === 'multiple_choice' && !item.choice_figures ? item.choices : null,
            words,
          ),
          // The sheet's language (a German biology sheet stays German on an English phone).
          lang: item.prompt_lang ?? app,
        },
      ];
  }
}
