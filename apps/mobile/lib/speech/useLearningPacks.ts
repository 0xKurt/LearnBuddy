import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
import NetInfo from '@react-native-community/netinfo';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { foreignLanguage } from './voice.js';
import { packNetworkAllowed } from './packDownload.js';

/** Preparation follows learning content, before any speaking screen needs the pack. */
export function useLearningPacks(home: BuddyHome | undefined): void {
  const { i18n } = useTranslation();
  const languages = [
    ...new Set(
      [...(home?.learning_languages ?? []), home?.roleplay?.language]
        .map((lang) => foreignLanguage(lang, i18n.language))
        .filter((lang) => lang !== undefined),
    ),
  ]
    .sort()
    .join(',');
  useEffect(() => {
    if (!languages) return;
    let active = true;
    const prepare = async () => {
      const { pronunciationPacks } = await import('./pronunciation.js');
      for (const language of languages.split(',')) {
        const state = await pronunciationPacks.state(language);
        if (!active) return;
        if (state.state === 'missing' || state.state === 'failed')
          await pronunciationPacks.install(language, () => {});
      }
    };
    void prepare();
    // A pack deferred on mobile data can start when Wi-Fi arrives, without reopening a screen.
    const unsubscribe = NetInfo.addEventListener((net) => {
      if (packNetworkAllowed(net)) void prepare();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [languages]);
}
