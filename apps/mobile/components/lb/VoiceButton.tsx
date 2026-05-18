// VoiceButton — push-and-hold voice answer affordance.
// Doc 05 §session-voice + USER-FLOWS-DEEP §1.3.
//
// Behavior when the native ASR module is wired up:
//   - press-and-hold → request mic permission (first launch only), start
//     listening, show live partial transcript inside the button.
//   - release → stop, fire `onTranscript(finalText)` once with the final.
//   - errors surface as a soft inline banner; submission flow is unaffected.
//
// Behavior today (see `lib/voice.ts` — native module is not yet bundled):
//   - the button renders the calm "Voice coming soon" tone-correct copy
//     supplied by the caller (i18n), is disabled, and never calls back.
//
// The component is intentionally dumb about i18n strings: the parent owns
// every label (rationale, "hold to talk", error fallback) so that the
// session screen can swap the tone copy per profile age (warmer/slower for
// minors) without touching this file.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import {
  isVoiceAvailable,
  requestMicPermission,
  startListening,
  stopListening,
  type VoiceState,
} from '../../lib/voice.js';
import { LB } from '../../lib/theme/colors.js';

type Props = {
  /** Locale code passed to the native recognizer (e.g. 'de-DE'). */
  locale: string;
  /** Idle-state label (e.g. "Halten zum Sprechen"). */
  labelIdle: string;
  /** Active-state label (e.g. "Ich höre…"). */
  labelActive: string;
  /** Shown the first time we have to ask for the mic permission. */
  permissionRationale: string;
  /** Shown when the native module is missing or the permission was denied. */
  unavailableLabel: string;
  /** Fires exactly once per press with the final transcript. */
  onTranscript: (text: string) => void;
  disabled?: boolean;
};

export function VoiceButton({
  locale,
  labelIdle,
  labelActive,
  permissionRationale,
  unavailableLabel,
  onTranscript,
  disabled = false,
}: Props) {
  const available = isVoiceAvailable();
  const [state, setState] = useState<VoiceState>('idle');
  const [partial, setPartial] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const transcriptRef = useRef<string>('');

  // Stop any in-flight session if the component unmounts mid-recording.
  useEffect(() => {
    return () => {
      if (state === 'listening' || state === 'starting') {
        void stopListening();
      }
    };
    // We intentionally only want this on unmount; capturing `state` in deps
    // would re-run the cleanup on every state change.
  }, []);

  const onPressIn = useCallback(async () => {
    if (!available || disabled) return;
    setError(null);
    setPartial('');
    transcriptRef.current = '';
    setState('starting');
    try {
      const granted = await requestMicPermission();
      if (!granted) {
        setState('error');
        setError(permissionRationale);
        return;
      }
      await startListening(locale, {
        onStart: () => setState('listening'),
        onPartial: (text) => {
          transcriptRef.current = text;
          setPartial(text);
        },
        onFinal: (text) => {
          transcriptRef.current = text;
        },
        onError: (msg) => {
          setState('error');
          setError(msg);
        },
      });
    } catch {
      setState('error');
      setError(unavailableLabel);
    }
  }, [available, disabled, locale, permissionRationale, unavailableLabel]);

  const onPressOut = useCallback(async () => {
    if (!available || disabled) return;
    if (state !== 'listening' && state !== 'starting') return;
    setState('stopping');
    try {
      await stopListening();
    } catch {
      /* swallow — the final transcript was already captured via onFinal */
    }
    const final = transcriptRef.current.trim();
    setState('idle');
    setPartial('');
    if (final) onTranscript(final);
  }, [available, disabled, state, onTranscript]);

  const active = state === 'listening' || state === 'starting';
  const label = active ? labelActive : labelIdle;

  if (!available) {
    return (
      <View
        accessibilityRole="button"
        accessibilityState={{ disabled: true }}
        accessibilityLabel={unavailableLabel}
        style={{
          alignSelf: 'stretch',
          minHeight: 64,
          paddingHorizontal: 22,
          paddingVertical: 18,
          borderRadius: 32,
          backgroundColor: LB.bg,
          borderColor: LB.hairline,
          borderWidth: 1,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 14, color: LB.ink2, fontWeight: '500', textAlign: 'center' }}>
          {unavailableLabel}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 8 }}>
      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={labelIdle}
        accessibilityState={{ busy: active, disabled }}
        style={{ alignSelf: 'stretch', opacity: disabled ? 0.5 : 1 }}
      >
        {({ pressed }) => (
          <View
            style={{
              minHeight: 64,
              paddingHorizontal: 26,
              paddingVertical: 18,
              borderRadius: 32,
              backgroundColor: active ? LB.primary : LB.primaryLt,
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ scale: pressed ? 0.98 : 1 }],
            }}
          >
            <Text
              style={{
                fontSize: 15,
                fontWeight: '600',
                color: active ? '#fff' : LB.primaryDk,
                letterSpacing: -0.1,
                textAlign: 'center',
              }}
            >
              {partial || label}
            </Text>
          </View>
        )}
      </Pressable>
      {error && (
        <View
          style={{
            paddingHorizontal: 14,
            paddingVertical: 10,
            backgroundColor: 'rgba(177,73,60,0.08)',
            borderRadius: 12,
            borderColor: 'rgba(177,73,60,0.20)',
            borderWidth: 1,
          }}
        >
          <Text style={{ fontSize: 12, color: LB.danger, lineHeight: 17 }}>{error}</Text>
        </View>
      )}
    </View>
  );
}
