import { useEffect, useState } from 'react';
import { pronunciationPacks } from './pronunciation.js';
import { usePronunciationLab } from './pronunciationLab.js';
import type { PackState } from './pronunciationPacks.js';

/** First use starts the verified download; practice and word rehearsal share its state. */
export function useLocalPronunciation(language: string | undefined) {
  const [pack, setPack] = useState<PackState>({ state: 'unavailable' });
  const labOpen = usePronunciationLab((s) => s.open);
  useEffect(() => {
    let active = true;
    const report = (state: PackState) => {
      if (active) setPack(state);
    };
    report({ state: 'unavailable' });
    if (language)
      void pronunciationPacks.state(language).then(async (state) => {
        if (!active) return;
        report(state);
        if (state.state !== 'ready' && state.state !== 'unavailable')
          report(await pronunciationPacks.install(language, report));
      });
    return () => {
      active = false;
    };
  }, [language, labOpen]);
  return { local: pack.state === 'ready', pack };
}
