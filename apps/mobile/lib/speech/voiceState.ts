// What Buddy's voice is doing right now, for anything on screen that follows it: talk mode's
// "speaking" state, the orb, and read-along highlighting (ADR 0008, gap 12). Pure (no React
// Native), unit-tested; lib/speech/listen.ts writes it, useBuddyVoice() reads it.
//
// Only real states: 'loading' while the audio of the sentence is being fetched, 'speaking'
// while it plays; progress is the player's real position in the sentence (null when the
// phone's own voice reads, which reports no position).

export type VoicePhase = 'idle' | 'loading' | 'speaking';

export type VoiceSnapshot = {
  phase: VoicePhase;
  /** The text being read, exactly as it was handed to speak() — to match it on screen. */
  text: string | null;
  /** That text in sentences, as they are read one by one. */
  sentences: readonly string[];
  /** The sentence being read or fetched; -1 when idle. */
  index: number;
  /** 0…1 within the current sentence (natural voice); null when unknown. */
  progress: number | null;
  /** Which voice reads the current sentence. */
  source: 'natural' | 'device' | null;
};

export const IDLE: VoiceSnapshot = {
  phase: 'idle',
  text: null,
  sentences: [],
  index: -1,
  progress: null,
  source: null,
};

export type VoiceStore = {
  get(): VoiceSnapshot;
  set(next: Partial<VoiceSnapshot>): void;
  reset(): void;
  subscribe(listener: () => void): () => void;
};

export function createVoiceStore(): VoiceStore {
  let state = IDLE;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const l of [...listeners]) l();
  };
  return {
    get: () => state,
    set(next) {
      const merged = { ...state, ...next };
      const same = (Object.keys(merged) as (keyof VoiceSnapshot)[]).every(
        (k) => merged[k] === state[k],
      );
      if (same) return;
      state = merged;
      emit();
    },
    reset() {
      if (state === IDLE) return;
      state = IDLE;
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The one store of the app. */
export const voiceStore = createVoiceStore();

/**
 * Which sentence of `text` to highlight now: its index while exactly this text is being read
 * (and the sentence is really playing or being fetched right after the one before), else null.
 */
export function highlightedSentence(snapshot: VoiceSnapshot, text: string): number | null {
  if (snapshot.phase === 'idle' || snapshot.text !== text) return null;
  return snapshot.index >= 0 && snapshot.index < snapshot.sentences.length ? snapshot.index : null;
}
