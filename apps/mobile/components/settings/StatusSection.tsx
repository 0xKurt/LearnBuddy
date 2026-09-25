// "Läuft alles?" — read-only, straight from the home's system status
// (GET /buddy → system): is a language model connected, can messages reach
// a phone, does background work run. Plain sentences; nothing is inferred.

import type { SystemStatus } from '@learnbuddy/shared-types/contracts';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { messageFor } from '../../lib/errors.js';
import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { Card } from '../lb/Card.js';
import { Group } from './Group.js';
import { Divider, Row } from './Row.js';

type Props = {
  system: SystemStatus | null;
  /** Why the status could not be loaded (only when there is none to show). */
  failed: Error | null;
  onRetry: () => void;
};

export function StatusSection({ system, failed, onRetry }: Props) {
  const { t } = useTranslation(['settings', 'common']);
  return (
    <Group title={t('settings:status.title')}>
      <Card padding={20} radius={22}>
        {system ? (
          <View style={{ gap: 16 }}>
            <Row
              question={t('settings:status.model_question')}
              answer={t(
                system.model ? 'settings:status.model_true' : 'settings:status.model_false',
              )}
            />
            <Divider />
            <Row
              question={t('settings:status.push_question')}
              answer={t(`settings:status.push_${system.push}`)}
            />
            <Divider />
            <Row
              question={t('settings:status.scheduler_question')}
              answer={t(`settings:status.scheduler_${system.scheduler}`)}
            />
          </View>
        ) : failed ? (
          <View style={{ gap: 12 }}>
            <Text style={TYPE.body}>{messageFor(failed)}</Text>
            <Btn variant="outline" onPress={onRetry}>
              {t('common:actions.retry')}
            </Btn>
          </View>
        ) : (
          <Text style={[TYPE.body, { color: LB.ink2 }]}>{t('common:loading')}</Text>
        )}
      </Card>
    </Group>
  );
}
