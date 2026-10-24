/** Pinned official archives, hashes measured 23–24.10.2026. No models in the application bundle. */
const PRONUNCIATION_PACKS = {
  en: {
    name: 'vosk-model-small-en-us-0.15',
    bytes: 41205931,
    sha256: '30f26242c4eb449f948e42cb302dd7a686cb29a3423a8367f99ff41780942498',
  },
  de: {
    name: 'vosk-model-small-de-0.15',
    bytes: 46499967,
    sha256: 'b7e53c90b1f0a38456f4cd62b366ecd58803cd97cd42b06438e2c131713d5e43',
  },
  es: {
    name: 'vosk-model-small-es-0.42',
    bytes: 39817833,
    sha256: '09b239888f633ef2f0b4e09736e3d9936acfd810bc65d53fad45261762c6511f',
  },
  it: {
    name: 'vosk-model-small-it-0.22',
    bytes: 49665141,
    sha256: '9ec65e75861d1c6c2e457cccd932705340dcdf233f5b239f00733b4de0bf3267',
  },
  fr: {
    name: 'vosk-model-small-fr-0.22',
    bytes: 42233323,
    sha256: 'cabf6180e177eb9b3a9a9d43a437bd5e549f3a7d09525e5d69a3fed787be12ad',
  },
} as const;
export type PronunciationPack = { name: string; bytes: number; sha256: string };
function pronunciationPack(language: string): PronunciationPack | null {
  return Object.entries(PRONUNCIATION_PACKS).find(([lang]) => lang === language)?.[1] ?? null;
}
export type PackState =
  | { state: 'unavailable' }
  | { state: 'missing' }
  | { state: 'downloading' | 'verifying' | 'installing' }
  | { state: 'ready'; path: string }
  | { state: 'failed' };
export type PackStorage = {
  ready(pack: PronunciationPack): Promise<string | null>;
  install(pack: PronunciationPack, phase: (state: PackState) => void): Promise<string>;
  remove(pack: PronunciationPack): Promise<void>;
};

/** One operation per language. Failed or interrupted installation never says ready. */
export class PronunciationPacks {
  private phases = new Map<string, PackState>();
  private running = new Map<string, Promise<PackState>>();
  constructor(
    private storage: PackStorage,
    private available: () => boolean,
  ) {}
  async state(language: string): Promise<PackState> {
    const pack = pronunciationPack(language);
    if (!pack || !this.available()) return { state: 'unavailable' };
    const current = this.phases.get(language);
    if (current) return current;
    try {
      const path = await this.storage.ready(pack);
      return path ? { state: 'ready', path } : { state: 'missing' };
    } catch {
      return { state: 'failed' };
    }
  }
  install(language: string, phase: (state: PackState) => void): Promise<PackState> {
    const previous = this.running.get(language);
    if (previous) return previous;
    const pack = pronunciationPack(language);
    if (!pack || !this.available()) return Promise.resolve({ state: 'unavailable' });
    const report = (state: PackState) => {
      this.phases.set(language, state);
      phase(state);
    };
    report({ state: 'downloading' });
    const run = this.storage
      .install(pack, report)
      .then(
        (path): PackState => ({ state: 'ready', path }),
        (): PackState => ({ state: 'failed' }),
      )
      .then((state) => {
        report(state);
        if (state.state === 'ready') this.phases.delete(language);
        return state;
      })
      .finally(() => this.running.delete(language));
    this.running.set(language, run);
    return run;
  }
  async remove(language: string): Promise<PackState> {
    await this.running.get(language);
    const pack = pronunciationPack(language);
    if (!pack || !this.available()) return { state: 'unavailable' };
    try {
      await this.storage.remove(pack);
      this.phases.delete(language);
      return { state: 'missing' };
    } catch {
      return { state: 'failed' };
    }
  }
}
