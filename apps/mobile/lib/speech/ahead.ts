// Audio fetched before it is needed (issue #59: "Was Buddy ohnehin gleich braucht, wird
// vorbereitet"). In voice mode every new question is read aloud, and its first audio used to be
// requested only once it was on screen — one synthesis plus the way to the server, silence she
// feels. The next question is known long before: it is fetched while she answers this one. The
// verdict word that opens Buddy's feedback ("Richtig.") is one of a handful of fixed sentences: it
// is fetched once and played as often as it is needed.
//
// Kept honest and small: at most a few entries, each for a short while; one-time audio that is
// thrown away unplayed is counted (`speech_ahead_wasted`, lib/perf.ts), so what fetching ahead
// costs is measured, not guessed. The server keeps audio for 24 h anyway (modules/voice/speech.ts),
// so a question read later costs no second synthesis. Pure (no React Native), unit-tested.

export type AheadAudio = { base64: string; mime: 'audio/mpeg' | 'audio/wav'; speed: number };

type Entry = {
  audio: Promise<AheadAudio | null>;
  /** Resolved with something playable — only that can be wasted. */
  got: boolean;
  at: number;
  /** A fixed sentence (the verdict word): played as often as needed, never "used up". */
  reusable: boolean;
};

/** One-time audio: the next question or two. */
const ONCE_MAX = 3;
const ONCE_TTL_MS = 10 * 60_000;
/** Fixed sentences: a verdict word per verdict and language. */
const REUSABLE_MAX = 8;
const REUSABLE_TTL_MS = 60 * 60_000;

export class AheadCache {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly onWasted: () => void,
    private readonly now: () => number = Date.now,
  ) {}

  /** Starts fetching `key` unless it is already there. */
  prepare(key: string, fetch: () => Promise<AheadAudio | null>, reusable: boolean): void {
    this.prune();
    const known = this.entries.get(key);
    if (known && (known.reusable || !reusable)) return;
    const entry: Entry = { audio: Promise.resolve(null), got: false, at: this.now(), reusable };
    entry.audio = fetch().then(
      (a) => {
        entry.got = a !== null;
        return a;
      },
      () => null,
    );
    this.entries.set(key, entry);
    this.prune();
  }

  /**
   * The audio for `key` if it was fetched ahead (or is still on its way), else null. One-time
   * audio is handed over once; a fixed sentence stays for the next time.
   */
  take(key: string): Promise<AheadAudio | null> | null {
    this.prune();
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (!entry.reusable) this.entries.delete(key);
    return entry.audio;
  }

  /** How many entries are kept (tests). */
  get size(): number {
    return this.entries.size;
  }

  private drop(key: string, entry: Entry): void {
    this.entries.delete(key);
    if (!entry.reusable && entry.got) this.onWasted();
  }

  private prune(): void {
    const t = this.now();
    for (const [key, e] of [...this.entries]) {
      if (t - e.at > (e.reusable ? REUSABLE_TTL_MS : ONCE_TTL_MS)) this.drop(key, e);
    }
    for (const reusable of [false, true]) {
      const max = reusable ? REUSABLE_MAX : ONCE_MAX;
      const kept = [...this.entries].filter(([, e]) => e.reusable === reusable);
      // Oldest first: the question she moved past is the one no longer needed.
      for (const [key, e] of kept.slice(0, Math.max(0, kept.length - max))) this.drop(key, e);
    }
  }
}
