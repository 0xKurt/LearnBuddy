import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { PackState } from '../../lib/speech/pronunciationPacks.js';
import { TYPE } from '../../lib/theme/type.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';

/** The same disclosure and honest download phase before either recorder starts. */
export function PronunciationStatus({ local, pack }: { local: boolean; pack: PackState }) {
  useTheme();
  const { t } = useTranslation('practice');
  const pending = pack.state !== 'ready' && pack.state !== 'unavailable';
  return (
    <Text accessibilityLiveRegion="polite" style={TYPE.meta}>
      {pending ? `${t(`speak.pack_${pack.state}`)} · ` : ''}
      {t(local ? 'speak.check_local' : 'speak.check_server')}
    </Text>
  );
}
