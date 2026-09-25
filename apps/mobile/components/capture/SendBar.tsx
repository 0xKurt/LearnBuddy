// The pinned bottom of the capture screen: what is happening right now (or
// what went wrong) and the button that sends the photos. It is the main
// action only once there is something to send.

import { ActivityIndicator, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SendProgress } from '../../lib/capture/upload.js';
import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { Card } from '../lb/Card.js';
import { Progress } from '../lb/Progress.js';

type Props = {
  progress: SendProgress | null;
  /** Why the last send failed (the photos are kept). */
  failure: string | null;
  hasPhotos: boolean;
  disabled: boolean;
  onSend: () => void;
};

/** Share of the work done: photos already sent, then submitting. */
function fractionOf(p: SendProgress): number {
  if (p.step === 'reserving') return 0;
  if (p.step === 'uploading') return (p.current - 1) / p.total;
  return 1;
}

export function SendBar({ progress, failure, hasPhotos, disabled, onSend }: Props) {
  const { t } = useTranslation('capture');
  const insets = useSafeAreaInsets();

  const progressText = (p: SendProgress): string => {
    if (p.step === 'reserving') return t('progress.reserving');
    if (p.step === 'uploading')
      return t('progress.uploading', { current: p.current, count: p.total });
    return t('progress.submitting');
  };

  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: Math.max(insets.bottom, 16),
        gap: 10,
      }}
    >
      {progress ? (
        <View accessibilityLiveRegion="polite" style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <ActivityIndicator size="small" color={LB.primary} />
            <Text style={[TYPE.body, { flex: 1 }]}>{progressText(progress)}</Text>
          </View>
          <View style={{ flexDirection: 'row' }}>
            <Progress value={fractionOf(progress)} />
          </View>
        </View>
      ) : failure ? (
        <View accessibilityLiveRegion="polite">
          <Card tone="blush" padding={14} radius={18}>
            <Text style={TYPE.body}>{failure}</Text>
          </Card>
        </View>
      ) : !hasPhotos ? (
        <Text style={[TYPE.small, { textAlign: 'center' }]}>{t('send_hint')}</Text>
      ) : null}
      <Btn
        size="lg"
        pill
        full
        variant={hasPhotos ? 'primary' : 'outline'}
        onPress={onSend}
        disabled={disabled || !hasPhotos}
      >
        {failure ? t('send_again') : t('send')}
      </Btn>
    </View>
  );
}
