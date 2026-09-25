// "Über LearnBuddy": the app version (from the build's app config) and the
// links configured for this build (lib/about.ts, EXPO_PUBLIC_* in lib/env.ts).
// A link that is not configured has no row — never a placeholder address.

import Constants from 'expo-constants';
import { Linking, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { aboutLinks, type AboutLink } from '../../lib/about.js';
import { ENV } from '../../lib/env.js';
import { Btn } from '../lb/Btn.js';
import { Card } from '../lb/Card.js';
import { toast } from '../lb/Toast.js';
import { Group } from './Group.js';
import { Divider, Row } from './Row.js';

const LINKS = aboutLinks({
  privacyUrl: ENV.PRIVACY_URL,
  imprintUrl: ENV.IMPRINT_URL,
  supportEmail: ENV.SUPPORT_EMAIL,
});

export function AboutSection() {
  const { t } = useTranslation('settings');
  const version = Constants.expoConfig?.version ?? null;
  // Nothing configured and no version: no empty card.
  if (!version && LINKS.length === 0) return null;

  async function openLink(link: AboutLink) {
    try {
      await Linking.openURL(link.href);
    } catch {
      toast.show(
        link.kind === 'support' && link.detail
          ? t('about.open_mail_failed', { email: link.detail })
          : t('about.open_failed'),
        'error',
      );
    }
  }

  const label: Record<AboutLink['kind'], string> = {
    privacy: t('about.privacy'),
    imprint: t('about.imprint'),
    support: t('about.support_cta'),
  };

  return (
    <Group title={t('about.title')} icon="book">
      <Card padding={18}>
        <View style={{ gap: 16 }}>
          {version ? (
            <Row question={t('about.version_question')} answer={t('about.version', { version })} />
          ) : null}
          {LINKS.map((link, i) => (
            <View key={link.kind} style={{ gap: 16 }}>
              {version || i > 0 ? <Divider /> : null}
              {link.kind === 'support' ? (
                <Row
                  question={t('about.support_question')}
                  hint={t('about.support_hint', { email: link.detail ?? '' })}
                >
                  <Btn pill variant="outline" onPress={() => void openLink(link)}>
                    {label.support}
                  </Btn>
                </Row>
              ) : (
                <Btn pill variant="outline" onPress={() => void openLink(link)}>
                  {label[link.kind]}
                </Btn>
              )}
            </View>
          ))}
        </View>
      </Card>
    </Group>
  );
}
