// The single Capture page controller: consume each source/resume wish once and reuse
// the existing attachment preparation, draft and upload lifecycle.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CHAT_LINK, useAttachRequest, type AttachOpen } from '../../lib/capture/attachRequest.js';
import type { CaptureDraft, DraftLink } from '../../lib/capture/draft.js';
import { pageHandler } from '../../lib/capture/pages.js';
import { useAttachments } from '../../lib/capture/useAttachments.js';
import { toast } from '../lb/Toast.js';

type Source = Exclude<AttachOpen, 'menu'>;

export function useChatPages({
  focused,
  onSent,
  onResume,
  canComplete,
}: {
  focused: boolean;
  onSent: () => void;
  onResume?: (draft: CaptureDraft) => void;
  canComplete?: () => boolean;
}) {
  const { t } = useTranslation('capture');
  const pages = useAttachments({
    droppable: focused,
    onSent: (_material, link) => {
      if (!focused || canComplete?.() === false) return;
      if (link.add && link.completes) {
        // A page added to a sheet: its questions join that sheet once read (p2-J-06).
        toast.show(t('again.added'), 'info');
      }
      onSent();
    },
  });
  /** The + menu is open. */
  const [menu, setMenu] = useState(false);
  /** What a place asked the next pages to be for, until they are taken. */
  const [asked, setAsked] = useState<DraftLink | null>(null);
  /** The last pages came from the camera: the strip offers "Noch ein Foto". */
  const [fromCamera, setFromCamera] = useState(false);

  /** Straight into the camera or a picker; the pages land above her text. */
  async function choose(source: Source, link: DraftLink | null): Promise<void> {
    setMenu(false);
    setAsked(null);
    // New pages join the ones already there, and with them what they are for.
    const first = pages.photos.length === 0;
    if (first && link) pages.setLink(link);
    const took = source === 'files' ? await pages.pickFiles() : await pages.pick(source);
    if (took) setFromCamera(source === 'camera');
    // Nothing taken: the next pages are the chat's own again.
    else if (first) pages.setLink(CHAT_LINK);
  }

  // A place asked for a page (lib/capture/attachRequest.ts): answered once.
  const request = useAttachRequest((s) => s.request);
  useEffect(() => {
    if (!focused || !request) return;
    useAttachRequest.getState().take();
    // Without a domain that takes pages nothing can be attached (lib/capture/pages.ts).
    if (!pageHandler.get()) return;
    if (request.resume) {
      void pages.resumeDraft(request.pending).then((draft) => {
        if (draft) onResume?.(draft);
      });
      return;
    }
    if (request.open === 'menu') {
      if (pages.photos.length === 0) pages.setLink(request.link);
      setAsked(request.link);
      setMenu(true);
    } else if (request.open) void choose(request.open, request.link);
    else if (pages.photos.length === 0) pages.setLink(request.link);
  }, [request, focused]);

  return {
    pages,
    menu: {
      visible: menu,
      link: asked ?? pages.link,
      open: () => setMenu(true),
      close: () => {
        setMenu(false);
        setAsked(null);
      },
      choose: (source: Source) => void choose(source, asked),
    },
    /** "Noch ein Foto" at the end of the strip, after a photo from the camera. */
    more: fromCamera ? () => void choose('camera', null) : null,
  };
}
