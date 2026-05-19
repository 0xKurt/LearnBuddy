// Upload + processing screen. ADR 0003: extraction runs in a server worker,
// so after enqueue we POLL material status instead of holding a stream open.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn } from '../../components/lb/index.js';
import { getAccount } from '../../lib/api/account.js';
import { getMaterial, retryMaterial } from '../../lib/api/materials.js';
import { runUpload, type UploadProgress } from '../../lib/capture/upload.js';
import { useCaptureStore } from '../../lib/store/capture.js';
import { LB } from '../../lib/theme/colors.js';
import { ApiError } from '../../lib/api/client.js';

const POLL_MS = 3000;
const POLL_MAX = 40; // ~2 min before we tell the user it's taking a while

type ScreenState =
  | { kind: 'idle' }
  | { kind: 'progress'; progress: UploadProgress }
  | { kind: 'polling' }
  | { kind: 'slow' }
  | { kind: 'failed' }
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
  const [pollNonce, setPollNonce] = useState(0);
  const startedRef = useRef(false);
  const materialIdRef = useRef<string | null>(null);

  const invalidate = useCallback(() => {
    if (!pending) return;
    qc.invalidateQueries({ queryKey: ['materials', pending.subject_id] });
    if (pending.folder_id) {
      qc.invalidateQueries({ queryKey: ['materials', 'folder', pending.folder_id] });
    }
    const id = materialIdRef.current;
    if (id) qc.invalidateQueries({ queryKey: ['material', id] });
  }, [pending, qc]);

  // 1) Upload phase — runs once per uploadNonce. Once successful, the
  //    material id is in materialIdRef and the poll effect takes over.
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
        // Order matters: bail on cancelled FIRST so we don't leave a stale
        // material id in the ref after the component has torn down.
        if (cancelled) return;
        materialIdRef.current = res.material_id;
        setState({ kind: 'polling' });
        setPollNonce((n) => n + 1);
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
  }, [learnerId, pending, uploadNonce, t]);

  // 2) Poll phase — runs every time pollNonce ticks (initial entry + retry).
  //    After POLL_MAX iterations we do ONE final fetch so a material that
  //    flipped to 'failed' just past the window doesn't sit on the 'slow'
  //    screen indefinitely (the slow screen has no retry — failed does).
  useEffect(() => {
    if (pollNonce === 0) return;
    const id = materialIdRef.current;
    if (!id || !learnerId) return;
    let cancelled = false;

    void (async () => {
      for (let i = 0; i < POLL_MAX; i++) {
        if (cancelled) return;
        await new Promise((r) => setTimeout(r, POLL_MS));
        if (cancelled) return;
        try {
          const m = await getMaterial(learnerId, id);
          if (m.extraction_status === 'ready') {
            invalidate();
            clearPending();
            router.replace({
              pathname: '/(learner)/material/[materialId]',
              params: { materialId: id },
            });
            return;
          }
          if (m.extraction_status === 'failed') {
            invalidate();
            setState({ kind: 'failed' });
            return;
          }
        } catch {
          // transient — keep polling
        }
      }
      // Window expired. Re-fetch once before declaring "slow" — the material
      // may have just flipped to a terminal state in the last 3 seconds.
      invalidate();
      try {
        const m = await getMaterial(learnerId, id);
        if (cancelled) return;
        if (m.extraction_status === 'ready') {
          clearPending();
          router.replace({
            pathname: '/(learner)/material/[materialId]',
            params: { materialId: id },
          });
          return;
        }
        if (m.extraction_status === 'failed') {
          setState({ kind: 'failed' });
          return;
        }
      } catch {
        /* keep slow on error */
      }
      if (!cancelled) setState({ kind: 'slow' }); // worker/cron will still finish it
    })();

    return () => {
      cancelled = true;
    };
  }, [pollNonce, learnerId, invalidate, clearPending]);

  const doRetry = useCallback(() => {
    const id = materialIdRef.current;
    if (!id || !learnerId) return;
    setState({ kind: 'polling' });
    void (async () => {
      try {
        await retryMaterial(learnerId, id);
        setPollNonce((n) => n + 1);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'max_attempts_reached') {
          setState({
            kind: 'error',
            code: err.code,
            message: t('error.max_retries', { defaultValue: err.message }),
          });
        } else {
          setState({ kind: 'failed' });
        }
      }
    })();
  }, [learnerId, t]);

  const doCheckAgain = useCallback(() => {
    if (!materialIdRef.current || !learnerId) return;
    setState({ kind: 'polling' });
    setPollNonce((n) => n + 1);
  }, [learnerId]);

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

  if (state.kind === 'failed') {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
        <View style={{ flex: 1, padding: 26, justifyContent: 'center', gap: 16 }}>
          <Text style={{ fontSize: 24, fontWeight: '600', color: LB.ink, letterSpacing: -0.4 }}>
            {t('worker.failed_title')}
          </Text>
          <Text style={{ fontSize: 14, color: LB.ink2, lineHeight: 20 }}>
            {t('worker.failed_body')}
          </Text>
          <View style={{ height: 8 }} />
          <Btn full onPress={doRetry}>
            {t('error.retry')}
          </Btn>
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

  if (state.kind === 'slow') {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
        <View style={{ flex: 1, padding: 26, justifyContent: 'center', gap: 16 }}>
          <Text style={{ fontSize: 24, fontWeight: '600', color: LB.ink, letterSpacing: -0.4 }}>
            {t('worker.slow_title')}
          </Text>
          <Text style={{ fontSize: 14, color: LB.ink2, lineHeight: 20 }}>
            {t('worker.slow_body')}
          </Text>
          <View style={{ height: 8 }} />
          <Btn full onPress={doCheckAgain}>
            {t('worker.check_again', { defaultValue: t('error.retry') })}
          </Btn>
          <Btn
            full
            variant="outline"
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
    const maxRetries = state.code === 'max_attempts_reached';
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

  const detail =
    state.kind === 'progress'
      ? phaseCopy(state.progress, t)
      : state.kind === 'polling'
        ? t('worker.processing')
        : t('phases.reserving');

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
      <View style={{ flex: 1, padding: 26, justifyContent: 'center', gap: 22 }}>
        <Text style={{ fontSize: 26, fontWeight: '600', color: LB.ink, letterSpacing: -0.5 }}>
          {t('title')}
        </Text>
        <View style={{ alignItems: 'center', paddingVertical: 16 }}>
          <ActivityIndicator color={LB.primary} size="large" />
        </View>
        <Text style={{ fontSize: 14, color: LB.ink2, textAlign: 'center' }}>{detail}</Text>
      </View>
    </SafeAreaView>
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
      return t('worker.processing');
  }
}
