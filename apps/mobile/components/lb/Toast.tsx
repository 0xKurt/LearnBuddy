// Toast / snackbar primitive. Doc 05 §error-handling.
//
// Replaces ad-hoc `Alert.alert` + `console.log` in the codebase. A single
// host lives in the root layout; surfaces dispatch via the `useToast()` hook
// (or `toast.show()` from outside the React tree, e.g. from API client error
// paths). Auto-dismiss after 3.5s; long-tap to copy the body.
//
// Tone: never harsh. CLAUDE.md §tone — error copy comes from `errors.json`.

import { create } from 'zustand';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './Icon.js';
import { i18n } from '../../lib/i18n/index.js';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

type ToastItem = {
  id: string;
  tone: ToastTone;
  title: string;
  body?: string;
  duration?: number;
  action?: { label: string; onPress: () => void };
};

type ToastStore = {
  queue: ToastItem[];
  show: (t: Omit<ToastItem, 'id'>) => string;
  dismiss: (id: string) => void;
};

let counter = 0;

export const useToastStore = create<ToastStore>((set) => ({
  queue: [],
  show: (t) => {
    const id = `tst-${++counter}`;
    set((s) => ({ queue: [...s.queue, { id, ...t }] }));
    return id;
  },
  dismiss: (id) => set((s) => ({ queue: s.queue.filter((t) => t.id !== id) })),
}));

/** Imperative facade so non-React code (api client, sentry hooks) can fire toasts. */
export const toast = {
  info: (title: string, body?: string, action?: ToastItem['action']) =>
    useToastStore.getState().show({ tone: 'info', title, body, action }),
  success: (title: string, body?: string, action?: ToastItem['action']) =>
    useToastStore.getState().show({ tone: 'success', title, body, action }),
  warn: (title: string, body?: string, action?: ToastItem['action']) =>
    useToastStore.getState().show({ tone: 'warning', title, body, action, duration: 6000 }),
  error: (title: string, body?: string, action?: ToastItem['action']) =>
    useToastStore.getState().show({ tone: 'error', title, body, action, duration: 6000 }),
};

/** Hook for use inside React components. */
export function useToast() {
  return useToastStore((s) => s.show);
}

const TONE_BG: Record<ToastTone, string> = {
  info: '#1d1b22',
  success: '#3f5e3f',
  warning: '#7a5c25',
  error: '#7a2e25',
};

const TONE_ICON: Record<ToastTone, 'check' | 'shield' | 'clock' | 'close'> = {
  info: 'clock',
  success: 'check',
  warning: 'shield',
  error: 'close',
};

export function ToastHost() {
  const queue = useToastStore((s) => s.queue);
  const dismiss = useToastStore((s) => s.dismiss);
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        bottom: Math.max(insets.bottom, 16) + 64,
        left: 16,
        right: 16,
        gap: 8,
      }}
    >
      {queue.map((t) => (
        <ToastRow key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </View>
  );
}

function ToastRow({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    const ms = item.duration ?? (item.tone === 'success' || item.tone === 'info' ? 3500 : 6000);
    const handle = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
        onDismiss();
      });
    }, ms);
    return () => clearTimeout(handle);
  }, []);

  return (
    <Animated.View
      style={{
        opacity,
        backgroundColor: TONE_BG[item.tone],
        borderRadius: 14,
        paddingHorizontal: 16,
        paddingVertical: 12,
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.title}${item.body ? `. ${item.body}` : ''}`}
        onPress={onDismiss}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name={TONE_ICON[item.tone]} size={16} color="rgba(255,255,255,0.9)" />
          <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14, flex: 1 }}>
            {item.title}
          </Text>
        </View>
        {item.body && (
          <Text
            style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 4, marginLeft: 24 }}
          >
            {item.body}
          </Text>
        )}
        {item.action && (
          <Pressable
            onPress={() => {
              item.action?.onPress();
              onDismiss();
            }}
            style={{ marginTop: 6, marginLeft: 24 }}
          >
            <Text
              style={{
                color: 'rgba(255,255,255,0.9)',
                fontSize: 13,
                fontWeight: '600',
                textDecorationLine: 'underline',
              }}
            >
              {item.action.label}
            </Text>
          </Pressable>
        )}
      </Pressable>
    </Animated.View>
  );
}

/**
 * Maps an ApiError (or any thrown value) to a tone-correct toast.
 * Doc 05 §errors — never harsh, never blame, always actionable.
 * Strings live in locales/{lang}/errors.json under the "api_*" keys.
 */
export function showApiErrorToast(
  err: unknown,
  fallback?: string,
  navigateToSubscription?: () => void,
): string {
  const code = isApiError(err) ? err.code : 'unknown';
  const t = (k: string) => i18n.t(`errors:${k}`);
  const fb = fallback ?? t('generic');

  type Entry = { title: string; body?: string; tone: ToastTone; action?: ToastItem['action'] };
  const known: Record<string, Entry> = {
    insufficient_credits: {
      title: t('api_insufficient_credits_title'),
      body: t('api_insufficient_credits_body'),
      tone: 'warning',
      action: navigateToSubscription
        ? { label: t('api_insufficient_credits_action'), onPress: navigateToSubscription }
        : undefined,
    },
    not_educational: {
      title: t('api_not_educational_title'),
      body: t('api_not_educational_body'),
      tone: 'warning',
    },
    rate_limited: {
      title: t('api_rate_limited_title'),
      body: t('api_rate_limited_body'),
      tone: 'info',
    },
    safety_blocked: {
      title: t('api_safety_blocked_title'),
      body: t('api_safety_blocked_body'),
      tone: 'warning',
    },
    extraction_failed: {
      title: t('api_extraction_failed_title'),
      body: t('api_extraction_failed_body'),
      tone: 'error',
    },
    evaluation_failed: {
      title: t('api_evaluation_failed_title'),
      body: t('api_evaluation_failed_body'),
      tone: 'error',
    },
    upload_failed: {
      title: t('api_upload_failed_title'),
      body: t('api_upload_failed_body'),
      tone: 'error',
    },
    unauthenticated: {
      title: t('api_unauthenticated_title'),
      body: t('api_unauthenticated_body'),
      tone: 'info',
    },
    forbidden: {
      title: t('api_forbidden_title'),
      tone: 'warning',
    },
    not_found: {
      title: t('api_not_found_title'),
      body: t('api_not_found_body'),
      tone: 'info',
    },
    validation_failed: {
      title: t('api_validation_failed_title'),
      body: t('api_validation_failed_body'),
      tone: 'warning',
    },
    internal: {
      title: fb,
      body: t('api_internal_body'),
      tone: 'error',
    },
  };
  const m = known[code] ?? { title: fb, tone: 'error' as const };
  return useToastStore
    .getState()
    .show({ ...m, duration: m.tone === 'error' || m.tone === 'warning' ? 6000 : 3500 });
}

function isApiError(err: unknown): err is { code: string; message: string; status?: number } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string'
  );
}
