// requires live verification on a real iPhone / Android phone
import { useEffect, useRef, useState } from 'react';
import { DevSettings, Platform, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Btn } from '../lb/Btn.js';
import { Sheet, SHEET_TEXT } from '../lb/Sheet.js';
import { pronunciationPacks } from '../../lib/speech/pronunciation.js';
import { usePronunciationLab } from '../../lib/speech/pronunciationLab.js';
import type { PackState } from '../../lib/speech/pronunciationPacks.js';
import { useMicRecorder } from '../voice/useMicRecorder.js';
import { MicButton, MicStatus } from '../voice/MicButton.js';
import { voskChecker } from '../../lib/speech/vosk.js';
import { nativeVosk, pronunciationPcm } from '../../lib/speech/voskNative.js';
import { SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';

/** Dev menu modal, deliberately outside expo-router and the learner navigation. */
export function PronunciationLab() {
  const { t } = useTranslation(['practice', 'common']);
  useTheme();
  const { open, plan } = usePronunciationLab();
  const [pack, setPack] = useState<PackState>({ state: 'unavailable' });
  const [result, setResult] = useState('');
  const [checking, setChecking] = useState(false);
  const ended = useRef(0);
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    if (typeof __DEV__ === 'undefined' || !__DEV__) return;
    if (Platform.OS !== 'web')
      DevSettings.addMenuItem('Vosk pronunciation', () =>
        usePronunciationLab.setState({ open: true }),
      );
  }, []);
  useEffect(() => {
    if (open && plan) void pronunciationPacks.state(plan.language).then(setPack);
    return () => active.current?.abort();
  }, [open, plan]);
  const rec = useMicRecorder({
    onRecorded: async (recording) => {
      const bridge = nativeVosk();
      if (!plan || !bridge || pack.state !== 'ready') return;
      setChecking(true);
      const controller = new AbortController();
      active.current = controller;
      try {
        const checked = await voskChecker(bridge, pack.path, pronunciationPcm).check(
          plan,
          {
            mime: recording.mime,
            audio_base64: recording.base64,
          },
          controller.signal,
        );
        // Tap-to-verdict includes recorder stop/read, decode, cold/warm model load and code scoring.
        const elapsed = performance.now() - (recording.endedAtMs ?? ended.current);
        if (!controller.signal.aborted)
          setResult(
            `${elapsed.toFixed(0)} ms · ${checked.result.overall}\n${checked.result.words.map((w) => `${w.expected}: ${w.verdict} (${w.confidence.toFixed(2)})`).join('\n')}`,
          );
      } catch {
        if (!controller.signal.aborted) setResult(t('practice:speak.lab_failed'));
      } finally {
        setChecking(false);
      }
    },
    onFailed: () => setResult(t('practice:speak.lab_failed')),
  });
  const close = () => {
    active.current?.abort();
    void rec.cancel();
    usePronunciationLab.setState({ open: false });
  };
  if (typeof __DEV__ === 'undefined' || !__DEV__) return null;
  const busy = checking || ['downloading', 'verifying', 'installing'].includes(pack.state);
  return (
    <Sheet
      visible={open}
      title={t('practice:speak.lab_title')}
      closeLabel={t('common:actions.close')}
      onClose={close}
      scrollTestID="scroll-list"
    >
      <View style={{ gap: SPACE.md }}>
        <Text style={[TYPE.body, SHEET_TEXT]}>
          {plan?.words.map((w) => w.expected).join(' ') ?? t('practice:speak.lab_target')}
        </Text>
        <Text accessibilityLiveRegion="polite" style={[TYPE.meta, SHEET_TEXT]}>
          {t(`practice:speak.pack_${pack.state}`)}
        </Text>
        <Text style={[TYPE.meta, SHEET_TEXT]}>{t('practice:speak.lab_notice')}</Text>
        <Btn
          disabled={!plan || busy || pack.state === 'unavailable' || rec.phase !== 'idle'}
          onPress={() => {
            if (plan) void pronunciationPacks.install(plan.language, setPack);
          }}
        >
          {t('practice:speak.pack_download')}
        </Btn>
        <Btn
          variant="ghost"
          disabled={!plan || busy || pack.state !== 'ready' || rec.phase !== 'idle'}
          onPress={() => {
            if (plan) void pronunciationPacks.remove(plan.language).then(setPack);
          }}
        >
          {t('practice:speak.pack_remove')}
        </Btn>
        <View style={SHEET_TEXT}>
          <MicStatus voice={rec.voice} />
        </View>
        <MicButton
          voice={rec.voice}
          presentation="recorder"
          label={t('practice:speak.record')}
          busy={busy}
          disabled={pack.state !== 'ready'}
          onPress={() => {
            if (rec.phase === 'recording') {
              ended.current = performance.now();
              void rec.stop();
            } else {
              setResult('');
              void rec.start();
            }
          }}
        />
        {result ? (
          <Text accessibilityLiveRegion="polite" style={[TYPE.meta, SHEET_TEXT]}>
            {result}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}
