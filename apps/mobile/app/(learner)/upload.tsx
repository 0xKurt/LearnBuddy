// Upload screen. ADR 0003: extraction runs in a server worker, so the
// mobile *no longer* sits on a spinner waiting for it. The upload
// screen is short-lived — it shows photo-upload progress (5-15 s of
// actual blocking work) and then redirects to the originating
// Subject / Folder grid, where the new material card appears with a
// "Wird vorbereitet" status and the user can keep doing other things.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';

import { Btn } from '../../components/lb/index.js';
import { getAccount } from '../../lib/api/account.js';
import { runUpload, type UploadProgress } from '../../lib/capture/upload.js';
import { useCaptureStore } from '../../lib/store/capture.js';
import { LB } from '../../lib/theme/colors.js';
import { ApiError } from '../../lib/api/client.js';

type ScreenState =
  | { kind: 'idle' }
  | { kind: 'progress'; progress: UploadProgress }
  | { kind: 'error'; code: string; message: string };

export default function UploadScreen() {
  const { t } = useTranslation('upload');
  const pending = useCaptureStore((s) => s.pending);
  const clearPending = useCaptureStore((s) => s.clearPending);
  const accountQuery = useQuery({ queryKey: ['account'], queryFn: getAccount });
  const learnerId = accountQuery.data?.learner?.id ?? null;
  const qc = useQueryClient();

  const [state, setState] = useState<ScreenState>({ kind: 'idle' });
  const [uploadNonce, setUploadNonce] = useState(0);
  const startedRef = useRef(false);

  // Upload phase only — once enqueueMaterial returns 202, the server worker
  // takes over and the user is redirected to the originating grid, where
  // the polled list surfaces ready / failed state.
  useEffect(() => {
    if (startedRef.current) return;
    if (!learnerId || !pending) return;
    startedRef.current = true;
    let cancelled = false;

    void (async () => {
      try {
        const res = await runUpload(learnerId, pending, (p) => {
          if (!cancelled) setState({ kind: 'progress', progress: p });
        });
        if (cancelled) return;

        // Invalidate so the grid we're about to land on includes the
        // freshly-enqueued material immediately (even before the first
        // poll round-trip).
        qc.invalidateQueries({ queryKey: ['materials', 'subject', pending.subject_id] });
        if (pending.folder_id) {
          qc.invalidateQueries({ queryKey: ['materials', 'folder', pending.folder_id] });
        }
        const subjectId = pending.subject_id;
        const folderId = pending.folder_id;
        clearPending();
        // Land back where the user was: folder grid if they came from a
        // folder, otherwise the subject's Material tab.
        if (folderId) {
          router.replace({
            pathname: '/(learner)/folder/[folderId]',
            params: { folderId, subjectId },
          });
        } else {
          router.replace({
            pathname: '/(learner)/subject/[subjectId]',
            params: { subjectId },
          });
        }
        // Reference to silence unused — material id only matters for the
        // grid which fetches it via the list endpoint.
        void res.material_id;
      } catch (err) {
        startedRef.current = false; // allow retry of the upload itself
        if (cancelled) return;
        if (err instanceof ApiError) {
          setState({ kind: 'error', code: err.code, message: err.message });
        } else {
          setState({
            kind: 'error',
            code: 'unknown',
            message: err instanceof Error ? err.message : t('error.unknown'),
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [learnerId, pending, uploadNonce, clearPending, qc, t]);

  const onCancelToHome = useCallback(() => {
    clearPending();
    router.replace('/(learner)/home');
  }, [clearPending]);

  if (!pending) {
    return (
      <View style={{ flex: 1, backgroundColor: LB.paper }}>
        <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 16 }}>
          <Text style={{ fontSize: 18, color: LB.ink2, textAlign: 'center' }}>
            {t('no_pending')}
          </Text>
          <Btn onPress={onCancelToHome} full>
            {t('back')}
          </Btn>
        </View>
      </View>
    );
  }

  if (state.kind === 'error') {
    const insufficient = state.code === 'insufficient_credits';
    const maxRetries = state.code === 'max_attempts_reached';
    return (
      <View style={{ flex: 1, backgroundColor: LB.paper }}>
        <View style={{ flex: 1, padding: 26, justifyContent: 'center', gap: 16 }}>
          <Text style={{ fontSize: 24, fontWeight: '600', color: LB.ink, letterSpacing: -0.4 }}>
            {insufficient ? t('insufficient_credits.title') : t('error.title')}
          </Text>
          <Text style={{ fontSize: 14, color: LB.ink2, lineHeight: 20 }}>
            {insufficient ? t('insufficient_credits.body') : t('error.body')}
          </Text>
          <View style={{ height: 8 }} />
          {!insufficient && !maxRetries && (
            <Btn
              full
              onPress={() => {
                startedRef.current = false;
                setState({ kind: 'idle' });
                setUploadNonce((n) => n + 1);
              }}
            >
              {t('error.retry')}
            </Btn>
          )}
          <Btn full variant="outline" onPress={onCancelToHome}>
            {t('error.back')}
          </Btn>
        </View>
      </View>
    );
  }

  // In-progress: show the current phase + a progress bar derived from
  // the upload counter. Lasts ~5-15 s under normal conditions, after
  // which we navigate away.
  const progress = state.kind === 'progress' ? state.progress : null;
  const fraction =
    progress?.phase === 'uploading' && progress.total > 0
      ? Math.max(0.05, progress.uploaded / progress.total)
      : progress?.phase === 'enqueuing'
        ? 0.95
        : 0.1;
  const detail = progress ? phaseCopy(progress, t) : t('phases.reserving');

  return (
    <View style={{ flex: 1, backgroundColor: LB.paper }}>
      <View style={{ flex: 1, padding: 26, justifyContent: 'center', gap: 22 }}>
        <Text style={{ fontSize: 26, fontWeight: '600', color: LB.ink, letterSpacing: -0.5 }}>
          {t('title')}
        </Text>
        <View style={{ alignItems: 'center', paddingVertical: 16 }}>
          <ActivityIndicator color={LB.primary} size="large" />
        </View>
        {/* Determinate progress bar based on photo count. */}
        <View
          style={{
            height: 6,
            borderRadius: 3,
            backgroundColor: 'rgba(0,0,0,0.06)',
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${Math.round(fraction * 100)}%`,
              height: '100%',
              backgroundColor: LB.primary,
            }}
          />
        </View>
        <Text style={{ fontSize: 14, color: LB.ink2, textAlign: 'center' }}>{detail}</Text>
      </View>
    </View>
  );
}

function phaseCopy(
  p: UploadProgress,
  t: (k: string, opts?: { uploaded: number; total: number }) => string,
): string {
  switch (p.phase) {
    case 'reserving':
      return t('phases.reserving');
    case 'uploading':
      return t('phases.uploading', { uploaded: p.uploaded, total: p.total });
    case 'enqueuing':
      return t('phases.finishing');
  }
}
