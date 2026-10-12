// The pages that go with her message (issues #82, #519): the + menu, the camera or picker a
// place asked for (lib/capture/attachRequest.ts), "Noch ein Foto" after a photo from the camera,
// and the pages left from before when she goes on with them. The pages themselves —
// preparing, the draft, the upload — are lib/capture/useAttachments.ts.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { keys, queryClient } from '../../lib/api/queries.js';
import { CHAT_LINK, useAttachRequest, type AttachOpen } from '../../lib/capture/attachRequest.js';
import type { DraftLink } from '../../lib/capture/draft.js';
import { pageHandler } from '../../lib/capture/pages.js';
import { useAttachments } from '../../lib/capture/useAttachments.js';
import { toast } from '../lb/Toast.js';

type Source = Exclude<AttachOpen, 'menu'>;

export function useChatPages({ focused, onSent }: { focused: boolean; onSent: () => void }) {
  const { t } = useTranslation('capture');
  const pages = useAttachments({
    droppable: focused,
    onSent: (_material, link) => {
      if (link.add && link.completes) {
        // A page added to a sheet: its questions join that sheet once read (p2-J-06).
        void queryClient.invalidateQueries({ queryKey: keys.material(link.completes) });
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
    if (!request) return;
    useAttachRequest.getState().take();
    // Without a domain that takes pages nothing can be attached (lib/capture/pages.ts).
    if (!pageHandler.get()) return;
    if (request.resume) {
      void pages.resumeDraft(request.pending);
      return;
    }
    if (request.open === 'menu') {
      setAsked(request.link);
      setMenu(true);
    } else if (request.open) void choose(request.open, request.link);
  }, [request]);

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
