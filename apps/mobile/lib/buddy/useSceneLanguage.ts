// The active scene owns the language of live conversation input and playback (#918).
import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';

import { sceneOf } from '../../components/voice/talkScene.js';
import { useHome } from '../api/queries.js';

export function sceneLanguage(home: BuddyHome | undefined, fallback: string): string {
  return sceneOf(home)?.language ?? fallback;
}

export function useSceneLanguage(): string {
  const { i18n } = useTranslation();
  return sceneLanguage(useHome().data, i18n.language);
}
