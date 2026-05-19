// Upload + processing screen. ADR 0003: extraction runs in a server worker,
// so after enqueue we POLL material status instead of holding a stream open.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
  const [retryNonce, setRetryNonce] = useState(0);
  const startedRef = useRef(false);
  const materialIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (startedRef.current) return;
    if (!learnerId || !pending) return;
    startedRef.current = true;
    let cancelled = false;

    const invalidate = () => {
      qc.invalidateQueries({ queryKey: ['materials', pending.subject_id] });
      if (pending.folder_id) {
        qc.invalidateQueries({ queryKey: ['materials', 'folder', pending.folder_id] });
      }
    };

    const poll = async (materialId: string) => {
      for (let i = 0; i < POLL_MAX; i++) {
        if (cancelled) return;
        await new Promise((r) => setTimeout(r, POLL_MS));
        if (cancelled) return;
        try {
          const m = await getMaterial(learnerId, materialId);
          if (m.extraction_status === 'ready') {
            invalidate();
            clearPending();
            router.replace({
              pathname: '/(learner)/material/[materialId]',
              params: { materialId },
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
      invalidate();
      setState({ kind: 'slow' }); // worker/cron will still finish it
    };

    void (async () => {
      try {
        const res = await runUpload(learnerId, pending, (p) => {
          if (!cancelled) setState({ kind: 'progress', progress: p });
        });
        materialIdRef.current = res.material_id;
        if (cancelled) return;
        setState({ kind: 'polling' });
        await poll(res.material_id);
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
  }, [learnerId, pending, clearPending, qc, retryNonce, t]);

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
          <Btn
            full
            onPress={() => {
              const id = materialIdRef.current;
              if (!id || !learnerId) return;
              setState({ kind: 'polling' });
              void (async () => {
                try {
                  await retryMaterial(learnerId, id);
                  startedRef.current = true;
                  setRetryNonce((n) => n + 1);
                } catch {
                  setState({ kind: 'failed' });
                }
              })();
            }}
          >
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
