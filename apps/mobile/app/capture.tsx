// One attachment controller, on the full Capture page; leaving preserves requested work.
import { router } from 'expo-router';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { CapturePage } from '../components/capture/CapturePage.js';
import { ComposerPages } from '../components/buddy/ComposerPages.js';
import { useChatPages } from '../components/buddy/useChatPages.js';
import { keys, queryClient } from '../lib/api/queries.js';
import { currentSession } from '../lib/auth/session.js';
import { captureCaption } from '../lib/capture/sendCaption.js';
import { draftGeneration, updateDraft, useDraft } from '../lib/drafts.js';
import { useRouteFocused } from '../lib/useRouteFocused.js';

export default function CaptureRoute() {
  const { t } = useTranslation(['capture', 'buddy', 'common']);
  const focused = useRouteFocused();
  const { text } = useDraft('chat');
  const latest = useRef(text);
  latest.current = text;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/buddy'));
  const restorationGeneration = draftGeneration();
  const submittedIsCurrent = useRef<() => boolean>(() => false);
  const submittedOwner = useRef<string | undefined>(undefined);
  const { pages, menu, more } = useChatPages({
    focused,
    canComplete: () => submittedIsCurrent.current(),
    onResume: (draft) => {
      const caption = draft.caption;
      if (
        caption &&
        caption.owner === currentSession()?.user_id &&
        restorationGeneration === draftGeneration()
      )
        updateDraft('chat', (current) => (current.trim() ? current : caption.text));
    },
    onSent: () => {
      if (
        focused &&
        submittedIsCurrent.current() &&
        submittedOwner.current === currentSession()?.user_id
      )
        router.dismissTo('/buddy');
    },
  });

  const send = () => {
    const owner = currentSession()?.user_id;
    submittedOwner.current = owner;
    const caption = captureCaption(latest.current, pages.caption);
    submittedIsCurrent.current = caption.isCurrent;
    void pages.send(
      (_material, link, requestId) => {
        // Completion is submission-owned, not suppressed when the page has been left.
        if (owner === undefined || currentSession()?.user_id !== owner || !caption.isCurrent())
          return;
        if (link.add && link.completes)
          void queryClient.invalidateQueries({ queryKey: keys.material(link.completes) });
        void caption.complete(requestId);
      },
      { submission: caption.metadata, onAccepted: caption.reserve, onFailed: caption.restore },
    );
  };
  const title = pages.link.completes
    ? t(
        pages.link.add
          ? 'capture:again.title_add'
          : pages.link.pages
            ? 'capture:again.title_pages'
            : 'capture:again.title',
        { pages: pages.link.pages },
      )
    : pages.link.purpose === 'homework'
      ? t('capture:homework.title')
      : t('buddy:area.capture');
  const intro = pages.link.completes
    ? t(pages.link.add ? 'capture:again.intro_add' : 'capture:again.intro')
    : pages.link.purpose === 'homework'
      ? t('capture:homework.intro')
      : t('capture:page.intro');

  const photoCount = pages.photos.filter((uri) => !pages.pdfs[uri]).length;
  const fileCount = pages.photos.length - photoCount;
  const photoSubtitle = photoCount ? t('capture:page.count', { count: photoCount }) : '';
  const fileSubtitle = fileCount ? t('capture:page.files', { count: fileCount }) : '';
  const subtitle =
    photoCount && fileCount
      ? t('capture:page.combined_count', { photos: photoSubtitle, files: fileSubtitle })
      : photoSubtitle || fileSubtitle || undefined;

  return (
    <CapturePage
      title={title}
      intro={intro}
      count={pages.photos.length}
      subtitle={subtitle}
      focused={focused}
      busy={pages.busy}
      canSend={!pages.refused}
      onBack={back}
      onCamera={() => menu.choose('camera')}
      onPhotos={() => menu.choose('library')}
      onFiles={() => menu.choose('files')}
      onSend={send}
      pages={<ComposerPages pages={pages} onMore={more ?? (() => menu.choose('camera'))} />}
    />
  );
}
