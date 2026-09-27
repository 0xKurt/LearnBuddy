// "Teilen an LearnBuddy" (docs/architecture.md §Material, gaps.md #6): an image or PDF
// shared from WhatsApp, IServ, Schul-Cloud or Dateien lands in the capture screen with
// the files already there. Android: an intent filter for SEND/SEND_MULTIPLE; iOS: a
// share extension — both from expo-share-intent's config plugin (app.json). Needs a
// native build; in the browser and in Expo Go the module is absent and this does nothing.

import { router } from 'expo-router';
import { useShareIntent, type ShareIntentFile } from 'expo-share-intent';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useTranslation } from 'react-i18next';

import { currentSession } from '../../lib/auth/session.js';
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
    // Only the hand-over is reset here; the files are copied by the capture screen.
    resetShareIntent();
    if (files.length === 0) {
      // Text or a link: nothing to read as a sheet.
      toast.show(t('share.nothing'));
      return;
    }
    if (!currentSession()) {
      toast.show(t('share.signed_out'));
      return;
    }
    if (!handIn(files)) router.push({ pathname: '/capture', params: { shared: '1' } });
  }, [hasShareIntent]);

  return null;
}
