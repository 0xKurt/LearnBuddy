// Speech → text on the phone itself (expo-speech-recognition), strictly
// on-device: the audio never leaves the phone, and the words appear while she
// speaks. Whether the device may be used is decided in engine.ts; when the
// recogniser can't do it after all (language not installed, busy …), the same
// tap continues with a recording for our EU path (onFallback).
// requires live verification on a real iPhone / Android phone (not testable
// in the browser or the Node test runner).

import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import {
  chooseEngine,
  fallsBackToServer,
  hearResult,
  heardText,
  installedMatch,
  NOTHING_HEARD,
  type Heard,
  type SpeechEngine,
} from './engine.js';

/** Locales that failed on the device during this app run: straight to the EU path next time. */
const failedLocales = new Set<string>();
/**
 * Speech-recognition permission refused (iOS asks for it apart from the
 * microphone): she can still talk — via a recording, which only needs the mic.
 */
let refused = false;
let installed: Promise<readonly string[] | null> | null = null;

function installedLocales(): Promise<readonly string[] | null> {
  if (Platform.OS !== 'android') return Promise.resolve(null);
  installed ??= ExpoSpeechRecognitionModule.getSupportedLocales({})
    .then((r) => r.installedLocales)
    .catch(() => {
      installed = null;
      return null;
    });
  return installed;
}

/** Which engine this tap uses for `locale`. Never throws: anything unclear means our EU path. */
export async function engineFor(locale: string): Promise<SpeechEngine> {
  try {
    const platform = Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'other';
    return chooseEngine({
      platform,
      available: ExpoSpeechRecognitionModule.isRecognitionAvailable(),
      onDeviceSupported: ExpoSpeechRecognitionModule.supportsOnDeviceRecognition(),
      installedLocales: await installedLocales(),
      locale,
      failedBefore: refused || failedLocales.has(locale),
    });
  } catch {
    return 'server';
  }
}

export type DevicePhase = 'idle' | 'starting' | 'listening' | 'stopping';
export type DeviceFailure = 'empty' | 'failed';

type Handlers = {
  onText: (text: string) => void;
  /** The device can't do it here: continue with a recording (same tap). */
  onFallback: () => void;
  onFailed: (why: DeviceFailure) => void;
};

export function useDeviceRecognition({ maxMs, ...handlers }: Handlers & { maxMs: number }) {
  const [phase, setPhaseState] = useState<DevicePhase>('idle');
  const [heard, setHeard] = useState<Heard>(NOTHING_HEARD);
  const [elapsedMs, setElapsed] = useState(0);
  const phaseRef = useRef<DevicePhase>('idle');
  const heardRef = useRef<Heard>(NOTHING_HEARD);
  /** Only the hook instance that started listening reacts to the (app-wide) recogniser events. */
  const mine = useRef(false);
  const outcome = useRef<'none' | 'fallback' | 'failed'>('none');
  const locale = useRef('');
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const mounted = useRef(true);
  const h = useRef(handlers);
  h.current = handlers;

  const setPhase = useCallback((p: DevicePhase) => {
    phaseRef.current = p;
    if (mounted.current) setPhaseState(p);
  }, []);

  const clearTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  const stop = useCallback(() => {
    if (!mine.current || phaseRef.current === 'idle' || phaseRef.current === 'stopping') return;
    setPhase('stopping');
    clearTimer();
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      ExpoSpeechRecognitionModule.abort();
    }
  }, [setPhase]);

  useEffect(() => {
    mounted.current = true;
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active' && mine.current) {
        outcome.current = 'failed';
        ExpoSpeechRecognitionModule.abort();
      }
    });
    return () => {
      mounted.current = false;
      sub.remove();
      clearTimer();
      if (mine.current) ExpoSpeechRecognitionModule.abort();
    };
  }, []);

  useSpeechRecognitionEvent('start', () => {
    if (!mine.current) return;
    startedAt.current = Date.now();
    setElapsed(0);
    setPhase('listening');
    clearTimer();
    timer.current = setInterval(() => {
      const ms = Date.now() - startedAt.current;
      if (mounted.current) setElapsed(ms);
      if (ms >= maxMs) stop();
    }, 250);
  });

  useSpeechRecognitionEvent('result', (e) => {
    if (!mine.current) return;
    const best = e.results[0]?.transcript ?? '';
    heardRef.current = hearResult(heardRef.current, best, e.isFinal);
    if (mounted.current) setHeard(heardRef.current);
  });

  useSpeechRecognitionEvent('error', (e) => {
    if (!mine.current) return;
    if (e.error === 'aborted') return;
    if (e.error === 'no-speech' || e.error === 'speech-timeout') return; // 'end' says "nothing heard"
    if (e.error === 'not-allowed') refused = true;
    if (
      (e.error === 'not-allowed' || fallsBackToServer(e.error)) &&
      heardText(heardRef.current) === ''
    ) {
      failedLocales.add(locale.current);
      outcome.current = 'fallback';
      return;
    }
    outcome.current = 'failed';
    if (heardText(heardRef.current) === '') h.current.onFailed('failed');
  });

  useSpeechRecognitionEvent('end', () => {
    if (!mine.current) return;
    mine.current = false;
    clearTimer();
    const text = heardText(heardRef.current);
    const how = outcome.current;
    heardRef.current = NOTHING_HEARD;
    if (mounted.current) setHeard(NOTHING_HEARD);
    setPhase('idle');
    if (!mounted.current) return;
    if (text) h.current.onText(text);
    else if (how === 'fallback') h.current.onFallback();
    else if (how === 'none') h.current.onFailed('empty');
  });

  const start = useCallback(
    async (lang: string): Promise<void> => {
      if (phaseRef.current !== 'idle') return;
      setPhase('starting');
      try {
        let perm = await ExpoSpeechRecognitionModule.getPermissionsAsync();
        if (!perm.granted && perm.canAskAgain)
          perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!perm.granted) {
          refused = true;
          setPhase('idle');
          if (mounted.current) h.current.onFallback();
          return;
        }
        if (!mounted.current) {
          setPhase('idle');
          return;
        }
        const installedList = await installedLocales();
        locale.current = lang;
        heardRef.current = NOTHING_HEARD;
        setHeard(NOTHING_HEARD);
        outcome.current = 'none';
        mine.current = true;
        ExpoSpeechRecognitionModule.start({
          lang: (installedList && installedMatch(installedList, lang)) || lang,
          interimResults: true,
          continuous: true,
          requiresOnDeviceRecognition: true,
          addsPunctuation: true,
          maxAlternatives: 1,
        });
      } catch {
        mine.current = false;
        failedLocales.add(lang);
        setPhase('idle');
        h.current.onFallback();
      }
    },
    [setPhase],
  );

  return {
    phase,
    heard: heardText(heard),
    elapsedMs,
    start,
    stop,
  };
}
