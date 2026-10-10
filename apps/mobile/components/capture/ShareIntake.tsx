// "Teilen an LearnBuddy" (docs/architecture.md §Material, gaps.md #6): an image or PDF
// shared from WhatsApp, IServ, Schul-Cloud or Dateien lands in the chat's input bar with
// the files already there (issue #519). Android: an intent filter for SEND/SEND_MULTIPLE; iOS: a
// share extension — both from expo-share-intent's config plugin (app.json). Needs a
// native build; in the browser and in Expo Go the module is absent and this does nothing.

import { useShareIntent, type ShareIntentFile } from 'expo-share-intent';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useTranslation } from 'react-i18next';

import { currentSession } from '../../lib/auth/session.js';
import { attachInChat } from '../../lib/capture/attachRequest.js';
import type { IncomingFile } from '../../lib/capture/files.js';
import { handIn } from '../../lib/capture/incoming.js';
import { toast } from '../lb/Toast.js';

function asIncoming(f: ShareIntentFile): IncomingFile | null {
  if (!f.path) return null;
  return {
    uri: f.path.startsWith('/') ? `file://${f.path}` : f.path,
    name: f.fileName ?? null,
    mimeType: f.mimeType ?? null,
    size: f.size ?? null,
  };
}

export function ShareIntake() {
  const { t } = useTranslation('capture');
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent({
    disabled: Platform.OS === 'web',
    resetOnBackground: true,
  });

  useEffect(() => {
    if (!hasShareIntent) return;
    const files = (shareIntent.files ?? [])
      .map(asIncoming)
      .filter((f): f is IncomingFile => f !== null);
    // Only the hand-over is reset here; the files are copied by the chat's bar.
    resetShareIntent();
    if (files.length === 0) {
      // Text or a link: nothing to read as a sheet. A share can cold-start the app,
      // whose start route still settles — the word holds across that (issue #91).
      toast.show(t('share.nothing'), 'info', { survivesNavigation: true });
      return;
    }
    if (!currentSession()) {
      // The files stay queued (lib/capture/incoming.ts); after sign-in the
      // layout opens the chat with them (share-dropped-when-signed-out). The
      // sign-in screen is exactly where she reads this, so it survives the
      // routing there (issue #91).
      handIn(files);
      toast.show(t('share.signed_out'), 'info', { survivesNavigation: true });
      return;
    }
    // The chat's bar takes them (now, or as soon as it is there), and she sees them there.
    handIn(files);
    attachInChat({ open: null });
  }, [hasShareIntent]);

  return null;
}
