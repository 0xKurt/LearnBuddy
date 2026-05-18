// VoiceButton — dual-mode voice answer affordance.
// Doc 05 §session-voice + USER-FLOWS-DEEP §1.3.
//
// Two interaction modes, transparent to the learner:
//   1. Tap → start recording, latched on. Tap again → stop + submit.
//   2. Press and hold (>= 400ms) → record while held, release → stop + submit.
//
// We don't trust Voice.isAvailable() as a permission gate (it's a capability
// check that returns 0 on a fresh install until the system prompt resolves).
// Instead we call startListening() unconditionally; iOS triggers the
// authorization prompt on first invocation and a denial surfaces via
// onError as a soft inline banner.
//
// The component is intentionally dumb about i18n strings: the parent owns
// every label (rationale, idle/active copy, error fallback) so the session
// screen can swap tone per profile age (warmer for minors) without touching
// this file.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import {
  isVoiceAvailable,
  startListening,
  stopListening,
  type VoiceState,
} from '../../lib/voice.js';
import { LB } from '../../lib/theme/colors.js';

// Below this threshold a press is treated as a tap (latched recording);
// above it, as a hold (stops on release). 400ms matches iOS HIG long-press.
const TAP_HOLD_THRESHOLD_MS = 400;

type Props = {
  /** Locale code passed to the native recognizer (e.g. 'de-DE'). */
  locale: string;
  /** Idle-state label (e.g. "Tippen oder halten zum Sprechen"). */
  labelIdle: string;
  /** Active-state label (e.g. "Ich höre … (tippen zum Beenden)"). */
  labelActive: string;
  /** Shown when the OS denied mic / speech permission. */
  permissionRationale: string;
  /** Shown when the native module is missing (e.g. Expo Go). */
  unavailableLabel: string;
  /** Fires exactly once per recording session with the final transcript. */
  onTranscript: (text: string) => void;
  /** Fires when voice can't be used here (module missing or an error),
   *  so the parent can fall back to the keyboard. `permission` is true
   *  when the failure looks like a denied mic/speech permission. */
  onUnavailable?: (permission: boolean) => void;
  disabled?: boolean;
};

export function VoiceButton({
  locale,
  labelIdle,
  labelActive,
  permissionRationale,
  unavailableLabel,
  onTranscript,
  onUnavailable,
  disabled = false,
}: Props) {
  const available = isVoiceAvailable();

  // Tell the parent once if the native recognizer isn't linked at all, so
  // it can switch to the keyboard instead of stranding the learner.
  useEffect(() => {
    if (!available) onUnavailable?.(false);
  }, [available, onUnavailable]);
  const [state, setState] = useState<VoiceState>('idle');
  const [partial, setPartial] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const transcriptRef = useRef<string>('');
  const pressStartRef = useRef<number>(0);

  // Stop any in-flight session if the component unmounts mid-recording.
  useEffect(() => {
    return () => {
      void stopListening();
    };
  }, []);

  const finishAndSubmit = useCallback(async () => {
    setState('stopping');
    try {
      await stopListening();
    } catch {
      /* swallow — final transcript was already captured via onFinal */
    }
    const final = transcriptRef.current.trim();
    setState('idle');
    setPartial('');
    if (final) onTranscript(final);
  }, [onTranscript]);

  const onPressIn = useCallback(async () => {
    if (!available || disabled) return;

    // Already recording (latched from a previous tap) → this press stops it.
    if (state === 'listening' || state === 'starting') {
      await finishAndSubmit();
      return;
    }

    pressStartRef.current = Date.now();
    setError(null);
    setPartial('');
    transcriptRef.current = '';
    setState('starting');

    try {
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
          // Heuristic: iOS / Android both include "denied" or "permission"
          // in the message when authorization was refused.
          const looksLikePermission = /denied|permission|not.?authorized/i.test(msg);
          setError(looksLikePermission ? permissionRationale : msg);
          onUnavailable?.(looksLikePermission);
        },
      });
    } catch {
      setState('error');
      setError(unavailableLabel);
      onUnavailable?.(false);
    }
  }, [
    available,
    disabled,
    state,
    locale,
    permissionRationale,
    unavailableLabel,
    finishAndSubmit,
    onUnavailable,
  ]);

  const onPressOut = useCallback(async () => {
    if (!available || disabled) return;
    if (state !== 'listening' && state !== 'starting') return;

    const heldFor = Date.now() - pressStartRef.current;
    if (heldFor < TAP_HOLD_THRESHOLD_MS) {
      // Quick tap → latch. Recording continues; next press will stop it.
      return;
    }
    // Long press → stop + submit on release.
    await finishAndSubmit();
  }, [available, disabled, state, finishAndSubmit]);

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
