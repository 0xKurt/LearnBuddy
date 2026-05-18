// Upload progress screen. Doc 05 §Capture ("After upload, progress screen
// with phases mapped to SSE events from POST /materials").
//
// Slice C2 wiring. Drains the in-memory capture store via runUpload(),
// shows phase copy + per-photo upload progress, routes to the material
// screen on `done`. On error: surface a tone-correct retry prompt
// (CLAUDE.md §Tone — never harsh).

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn } from '../../components/lb/index.js';
import { getAccount } from '../../lib/api/account.js';
import { runUpload, type UploadProgress } from '../../lib/capture/upload.js';
import { useCaptureStore } from '../../lib/store/capture.js';
import { LB } from '../../lib/theme/colors.js';
import { ApiError } from '../../lib/api/client.js';

type ScreenState =
  | { kind: 'idle' }
  | { kind: 'progress'; progress: UploadProgress }
  | { kind: 'error'; code: string; message: string }
  | { kind: 'async' };

export default function UploadScreen() {
  const { t } = useTranslation('upload');
  const pending = useCaptureStore((s) => s.pending);
  const clearPending = useCaptureStore((s) => s.clearPending);
  const accountQuery = useQuery({ queryKey: ['account'], queryFn: getAccount });
  const learnerId = accountQuery.data?.learner?.id ?? null;
  const qc = useQueryClient();

  const [state, setState] = useState<ScreenState>({ kind: 'idle' });
  // Bumped to retrigger the upload effect after a retry. The effect itself
  // is gated by `startedRef` so StrictMode double-invokes don't double-fire.
  const [retryNonce, setRetryNonce] = useState(0);
  const startedRef = useRef(false);
  const finalizingStartedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    if (!learnerId || !pending) return;
    startedRef.current = true;
    finalizingStartedRef.current = false;
    void (async () => {
      try {
        const done = await runUpload(learnerId, pending, (p) => {
          if (p.phase === 'finalizing') finalizingStartedRef.current = true;
          setState({ kind: 'progress', progress: p });
        });
        qc.invalidateQueries({ queryKey: ['materials', pending.subject_id] });
        clearPending();
        router.replace({
          pathname: '/(learner)/material/[materialId]',
          params: { materialId: done.material_id },
        });
      } catch (err) {
        startedRef.current = false; // allow retry
        if (finalizingStartedRef.current) {
          // Server likely finished processing — invalidate cache so user can find their material
          qc.invalidateQueries({ queryKey: ['materials', pending.subject_id] });
          if (pending.folder_id) {
            qc.invalidateQueries({ queryKey: ['materials', 'folder', pending.folder_id] });
          }
          setState({ kind: 'async' });
        } else if (err instanceof ApiError) {
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
  }, [learnerId, pending, clearPending, qc, retryNonce]);

  if (!pending) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
        <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 16 }}>
          <Text style={{ fontSize: 18, color: LB.ink2, textAlign: 'center' }}>
            {t('no_pending')}
          </Text>
          <Btn onPress={() => router.replace('/(learner)/home')} full>
            {t('back')}
          </Btn>
        </View>
      </SafeAreaView>
    );
  }

  if (state.kind === 'async') {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
        <View style={{ flex: 1, padding: 26, justifyContent: 'center', gap: 16 }}>
          <Text style={{ fontSize: 24, fontWeight: '600', color: LB.ink, letterSpacing: -0.4 }}>
            {t('async.title')}
          </Text>
          <Text style={{ fontSize: 14, color: LB.ink2, lineHeight: 20 }}>{t('async.body')}</Text>
          <View style={{ height: 8 }} />
          <Btn
            full
            onPress={() => {
              clearPending();
              router.replace('/(learner)/home');
            }}
          >
            {t('async.view_list')}
          </Btn>
        </View>
      </SafeAreaView>
    );
  }

  if (state.kind === 'error') {
    const insufficient = state.code === 'insufficient_credits';
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
        <View style={{ flex: 1, padding: 26, justifyContent: 'center', gap: 16 }}>
          <Text style={{ fontSize: 24, fontWeight: '600', color: LB.ink, letterSpacing: -0.4 }}>
            {insufficient ? t('insufficient_credits.title') : t('error.title')}
          </Text>
          <Text style={{ fontSize: 14, color: LB.ink2, lineHeight: 20 }}>
            {insufficient ? t('insufficient_credits.body') : t('error.body')}
          </Text>
          <View style={{ height: 8 }} />
          {!insufficient && (
            <Btn
              full
              onPress={() => {
                startedRef.current = false;
                setState({ kind: 'idle' });
                setRetryNonce((n) => n + 1);
              }}
            >
              {t('error.retry')}
            </Btn>
          )}
          <Btn
            full
            variant="outline"
            onPress={() => {
              clearPending();
              router.replace('/(learner)/home');
            }}
          >
            {t('error.back')}
          </Btn>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
      <View style={{ flex: 1, padding: 26, justifyContent: 'center', gap: 22 }}>
        <Text style={{ fontSize: 26, fontWeight: '600', color: LB.ink, letterSpacing: -0.5 }}>
          {t('title')}
        </Text>
        <View style={{ alignItems: 'center', paddingVertical: 16 }}>
          <ActivityIndicator color={LB.primary} size="large" />
        </View>
        <Text style={{ fontSize: 14, color: LB.ink2, textAlign: 'center' }}>
          {phaseCopy(state.kind === 'progress' ? state.progress : null, t)}
        </Text>
      </View>
    </SafeAreaView>
  );
}

function phaseCopy(
  p: UploadProgress | null,
  t: (k: string, opts?: { uploaded: number; total: number }) => string,
): string {
  if (!p) return t('phases.reserving');
  switch (p.phase) {
    case 'reserving':
      return t('phases.reserving');
    case 'uploading':
      return t('phases.uploading', { uploaded: p.uploaded, total: p.total });
    case 'finalizing':
      return t('phases.extracting');
    case 'done':
      return t('phases.done');
  }
}
