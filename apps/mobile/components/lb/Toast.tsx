// Toast / snackbar primitive. Doc 05 §error-handling.
//
// Replaces ad-hoc `Alert.alert` + `console.log` in the codebase. A single
// host lives in the root layout; surfaces dispatch via the `useToast()` hook
// (or `toast.show()` from outside the React tree, e.g. from API client error
// paths). Auto-dismiss after 3.5s; long-tap to copy the body.
//
// Tone: never harsh. CLAUDE.md §tone — error copy comes from `errors.json`.

import { create } from 'zustand';
import { useEffect } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

type ToastItem = {
  id: string;
  tone: ToastTone;
  title: string;
  body?: string;
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
  info: (title: string, body?: string) =>
    useToastStore.getState().show({ tone: 'info', title, body }),
  success: (title: string, body?: string) =>
    useToastStore.getState().show({ tone: 'success', title, body }),
  warn: (title: string, body?: string) =>
    useToastStore.getState().show({ tone: 'warning', title, body }),
  error: (title: string, body?: string) =>
    useToastStore.getState().show({ tone: 'error', title, body }),
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
  const opacity = new Animated.Value(0);
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    const handle = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
        onDismiss();
      });
    }, 3500);
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
        <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>{item.title}</Text>
        {item.body && (
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2 }}>
            {item.body}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

/**
 * Maps an ApiError (or any thrown value) to a tone-correct toast.
 * Doc 05 §errors — never harsh, never blame, always actionable.
 */
export function showApiErrorToast(err: unknown, fallback = 'Etwas hat nicht geklappt'): string {
  const code = isApiError(err) ? err.code : 'unknown';
  const known: Record<string, { title: string; body?: string; tone: ToastTone }> = {
    insufficient_credits: {
      title: 'Nicht genug Credits',
      body: 'Verlängere im Konto, dann geht es weiter.',
      tone: 'warning',
    },
    not_educational: {
      title: 'Das sieht nicht nach Schulmaterial aus',
      body: 'Probier ein anderes Foto — am besten eine Buchseite.',
      tone: 'warning',
    },
    rate_limited: {
      title: 'Einen Moment',
      body: 'Du warst sehr schnell. Probier’s in einer Minute nochmal.',
      tone: 'info',
    },
    safety_blocked: {
      title: 'Nicht zum Lernen geeignet',
      body: 'Wähle ein anderes Material.',
      tone: 'warning',
    },
    extraction_failed: {
      title: 'Foto-Auswertung hat nicht geklappt',
      body: 'Probier es nochmal — vielleicht heller oder näher.',
      tone: 'error',
    },
    evaluation_failed: {
      title: 'Bewertung gerade nicht möglich',
      body: 'Versuche es in einem Moment nochmal.',
      tone: 'error',
    },
    upload_failed: {
      title: 'Hochladen hat nicht geklappt',
      body: 'Prüf kurz dein Netz und versuch es nochmal.',
      tone: 'error',
    },
    unauthenticated: {
      title: 'Bitte erneut anmelden',
      body: 'Deine Sitzung ist abgelaufen.',
      tone: 'info',
    },
    forbidden: {
      title: 'Dafür hast du keine Berechtigung',
      tone: 'warning',
    },
    not_found: {
      title: 'Nicht gefunden',
      body: 'Vielleicht wurde es schon gelöscht.',
      tone: 'info',
    },
    validation_failed: {
      title: 'Eingabe prüfen',
      body: 'Da ist etwas nicht ganz richtig.',
      tone: 'warning',
    },
    internal: {
      title: fallback,
      body: 'Wir wissen Bescheid und schauen uns das an.',
      tone: 'error',
    },
  };
  const m = known[code] ?? { title: fallback, tone: 'error' as const };
  return useToastStore.getState().show(m);
}

function isApiError(err: unknown): err is { code: string; message: string; status?: number } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string'
  );
}
