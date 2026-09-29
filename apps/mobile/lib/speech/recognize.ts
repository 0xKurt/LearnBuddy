// Speech → text on the phone itself (expo-speech-recognition), strictly
// on-device: the audio never leaves the phone, and the words appear while she
// speaks. Whether the device may be used is decided in engine.ts; when the
// recogniser can't do it after all (language not installed, busy …), the same
// tap continues with a recording for our EU path (onFallback).
// requires live verification on a real iPhone / Android phone (not testable
// in the browser or the Node test runner).

import { getLocales } from 'expo-localization';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import {
  chooseEngine,
  GrantMemory,
  pickRecognitionService,
  fallsBackToServer,
  hearResult,
  heardText,
  installedMatch,
  NOTHING_HEARD,
  type Heard,
  type SpeechEngine,
} from './engine.js';
import { deviceEnd } from './deviceEnd.js';
import NetInfo from '@react-native-community/netinfo';

import { levelFromRecognizer } from './level.js';

/** Locales that failed on the device during this app run: straight to the EU path next time. */
const failedLocales = new Set<string>();
/**
 * Speech-recognition permission refused (iOS asks for it apart from the
 * microphone): she can still talk — via a recording, which only needs the mic.
 */
let refused = false;
let installed: Promise<readonly string[] | null> | null = null;
let service: string | null | undefined;
/** Locales whose offline pack download was already asked for in this run. */
const packAsked = new Set<string>();

/**
 * A granted permission holds while the app stays in the foreground (engine.ts): listening
 * again between two turns of a conversation then skips the system's permission round-trip
 * (issue #41 — it sat between Buddy's last word and the mic).
 */
const grant = new GrantMemory();
AppState.addEventListener('change', (s) => grant.appState(s));

/** Whether she allows listening — asked of the system once, then remembered (see `grant`). */
async function permissionGranted(): Promise<boolean> {
  if (grant.held) return true;
  let perm = await ExpoSpeechRecognitionModule.getPermissionsAsync();
  if (!perm.granted && perm.canAskAgain)
    perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
  grant.note(perm.granted);
  return perm.granted;
}

/**
 * Fills, before the first listen, everything a listen would otherwise wait on (issue #41):
 * the Android service choice with its installed languages, the engine decision, and the
 * permission answer (asked quietly — never a dialog). The talk screen calls it on opening;
 * every listen and re-listen then goes straight to the recogniser. What remains is the
 * recogniser's own start (Android binds a service), measured per turn as `relisten`
 * (lib/perf.ts) — a number only a real phone can give.
 */
export function warmRecognition(locale: string): void {
  // The browser records and uploads — there is nothing to warm, and the native module
  // is absent there: touching it crashed the talk screen into the error boundary.
  if (Platform.OS === 'web') return;
  try {
    void engineFor(locale);
    void ExpoSpeechRecognitionModule.getPermissionsAsync()
      .then((p) => grant.note(p.granted))
      .catch(() => undefined);
  } catch {
    // Warming is an optimisation: a device without the module simply warms nothing.
  }
}

/**
 * The Android service recognition binds to — explicitly a Google one where
 * present (issue #13): OEM services are the documented failure class behind
 * "unavailable" (expo-speech-recognition #138). Cached for the app run.
 */
function recognitionService(): string | null {
  if (Platform.OS !== 'android') return null;
  if (service !== undefined) return service;
  try {
    service = pickRecognitionService(ExpoSpeechRecognitionModule.getSpeechRecognitionServices());
  } catch {
    service = null;
  }
  return service;
}

function installedLocales(): Promise<readonly string[] | null> {
  if (Platform.OS !== 'android') return Promise.resolve(null);
  installed ??= ExpoSpeechRecognitionModule.getSupportedLocales({
    ...(recognitionService() ? { androidRecognitionServicePackage: recognitionService()! } : {}),
  })
    .then((r) => r.installedLocales)
    .catch(() => {
      installed = null;
      return null;
    });
  return installed;
}

/**
 * The offline language pack, fetched once per locale when it is missing —
 * only on an unmetered connection (a family's mobile data must not pay for a
 * model download). Fire-and-forget: recognition falls back to the EU path
 * until the pack is there, and the next tap simply finds it installed.
 */
function fetchOfflinePack(lang: string, installedList: readonly string[] | null): void {
  if (Platform.OS !== 'android' || packAsked.has(lang)) return;
  if (installedList && installedMatch(installedList, lang)) return;
  packAsked.add(lang);
  void NetInfo.fetch()
    .then((net) => {
      if (
        net.details &&
        'isConnectionExpensive' in net.details &&
        net.details.isConnectionExpensive
      )
        return;
      return ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({ locale: lang }).then(
        () => {
          // The service knows a new locale now: ask again next time.
          installed = null;
        },
      );
    })
    .catch(() => undefined);
}

/**
 * iOS: the locale SFSpeechRecognizer() (no locale given) stands for — the phone's first
 * language with its region. The on-device check of expo-speech-recognition refers to it.
 * requires live verification on a real iPhone (docs/privacy.md §Processors).
 */
function iosRecognizerLocale(): string | null {
  if (Platform.OS !== 'ios') return null;
  const first = getLocales()[0];
  if (!first) return null;
  return first.regionCode && !first.languageTag.includes('-')
    ? `${first.languageTag}-${first.regionCode}`
    : first.languageTag;
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
      deviceLocale: iosRecognizerLocale(),
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
  const [level, setLevel] = useState(0);
  const [elapsedMs, setElapsed] = useState(0);
  const phaseRef = useRef<DevicePhase>('idle');
  const heardRef = useRef<Heard>(NOTHING_HEARD);
  /** Only the hook instance that started listening reacts to the (app-wide) recogniser events. */
  const mine = useRef(false);
  const outcome = useRef<'none' | 'fallback' | 'failed'>('none');
  /** The system ended the listening (not she): what was heard so far is no answer. */
  const interrupted = useRef(false);
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
        interrupted.current = true;
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

  useSpeechRecognitionEvent('volumechange', (e) => {
    if (mine.current && mounted.current) setLevel(levelFromRecognizer(e.value));
  });

  useSpeechRecognitionEvent('result', (e) => {
    if (!mine.current) return;
    const best = e.results[0]?.transcript ?? '';
    heardRef.current = hearResult(heardRef.current, best, e.isFinal);
    if (mounted.current) setHeard(heardRef.current);
  });

  useSpeechRecognitionEvent('error', (e) => {
    if (!mine.current) return;
    // Aborted while she was not ending it herself: a call, Control Centre, another app.
    if (e.error === 'aborted') {
      if (phaseRef.current !== 'stopping') interrupted.current = true;
      return;
    }
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
    const end = deviceEnd(heardText(heardRef.current), outcome.current, interrupted.current);
    interrupted.current = false;
    heardRef.current = NOTHING_HEARD;
    if (mounted.current) setHeard(NOTHING_HEARD);
    setPhase('idle');
    if (!mounted.current) return;
    if (end.kind === 'text') h.current.onText(end.text);
    else if (end.kind === 'fallback') h.current.onFallback();
    else if (end.kind === 'empty') h.current.onFailed('empty');
    else if (end.kind === 'failed') h.current.onFailed('failed');
  });

  const start = useCallback(
    async (lang: string, opts: { untilPause?: boolean } = {}): Promise<void> => {
      if (phaseRef.current !== 'idle') return;
      setPhase('starting');
      try {
        if (!(await permissionGranted())) {
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
        interrupted.current = false;
        mine.current = true;
        fetchOfflinePack(lang, installedList);
        ExpoSpeechRecognitionModule.start({
          lang: (installedList && installedMatch(installedList, lang)) || lang,
          interimResults: true,
          // untilPause: the recogniser ends by itself when she stops speaking (conversation).
          continuous: !opts.untilPause,
          requiresOnDeviceRecognition: true,
          addsPunctuation: true,
          maxAlternatives: 1,
          // A Google service where present (issue #13): OEM recognisers are the
          // documented failure class on e.g. MIUI.
          ...(recognitionService()
            ? { androidRecognitionServicePackage: recognitionService()! }
            : {}),
          volumeChangeEventOptions: { enabled: true, intervalMillis: 120 },
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
    level: phase === 'listening' ? level : 0,
    elapsedMs,
    start,
    stop,
  };
}
