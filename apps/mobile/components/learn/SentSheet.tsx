// Her message for a sheet she sent (issue #632), in place of an empty bubble: her pages from the
// phone's own copy (lib/capture/draft.ts `sentPages`, kept a day) and the server's word for where
// the reading stands (`MessageView.sheet.stage`, CLAUDE.md rule 5). A sheet that could not be read
// says so here; the card with the ways on ("Neues Foto", "Nochmal lesen") is the home's
// (components/buddy/HomeNotices.tsx `FailedNotice`), after it in the conversation.

import type { SheetMessage } from '@learnbuddy/shared-types/contracts';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { SheetBubble, type SheetLineTone } from '../buddy/SheetBubble.js';
import { drafts } from '../../lib/capture/draftStorage.js';

const NONE: readonly string[] = [];

/** The line under her pages for the stage the server reports; null says nothing. */
function sheetLine(
  stage: SheetMessage['stage'],
  t: (key: string) => string,
): { text: string; tone: SheetLineTone } | null {
  switch (stage) {
    case 'waiting':
      return { text: t('capture:sent.waiting'), tone: 'busy' };
    case 'reading':
      return { text: t('capture:sent.reading'), tone: 'busy' };
    case 'building':
      return { text: t('capture:sent.building'), tone: 'busy' };
    case 'ready':
      return { text: t('capture:sent.ready'), tone: 'done' };
    case 'failed':
      return { text: t('capture:sent.failed'), tone: 'failed' };
    case 'deleted':
      return { text: t('capture:sent.deleted'), tone: 'quiet' };
    case null:
      return null;
  }
}

export function SentSheet({ sheet }: { sheet: SheetMessage }) {
  const { t } = useTranslation('capture');
  const [uris, setUris] = useState<readonly string[]>(NONE);
  useEffect(() => {
    let alive = true;
    void drafts.sentPages(sheet.material_id).then((found) => {
      if (alive) setUris(found);
    });
    return () => {
      alive = false;
    };
  }, [sheet.material_id]);
  const line = sheetLine(sheet.stage, t);
  const counted =
    line && sheet.pages > 1
      ? { ...line, text: `${t('capture:sent.photos', { count: sheet.pages })} · ${line.text}` }
      : line;
  return (
    <SheetBubble
      uris={uris}
      pages={sheet.pages}
      label={t('capture:sent.label', { count: sheet.pages })}
      line={counted}
    />
  );
}
