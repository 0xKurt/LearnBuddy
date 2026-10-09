// "Über LearnBuddy": the app version (from the build's app config) and the
// links configured for this build (lib/about.ts, EXPO_PUBLIC_* in lib/env.ts).
// A link that is not configured has no row — never a placeholder address. The licences of what
// the app ships are always there, in a sheet of their own (LicencesSheet.tsx, issue #493).

import { useState } from 'react';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Linking, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { aboutLinks, type AboutLink } from '../../lib/about.js';
import { ENV } from '../../lib/env.js';
import { Btn } from '../lb/Btn.js';
import { Card } from '../lb/Card.js';
import { toast } from '../lb/Toast.js';
import { Group } from './Group.js';
import { LicencesSheet } from './LicencesSheet.js';
import { Divider, Row } from './Row.js';

const VERSION = Constants.expoConfig?.version ?? null;

/**
 * What the support mail carries before she writes a word (audit 30.09., #133 position 14):
 * the build, the OS and the model — the three things a first reply would otherwise have to
 * ask for, while she is already stuck.
 *
 * Nothing about the child, and nothing that names anyone: never `Device.deviceName`, which
 * is the name its owner gave the phone ("Kurts iPhone"), and nothing about her account, her
 * subjects or her work. The model is the device, not the person on it.
 */
const DIAGNOSTICS = {
  app: VERSION ?? '',
  os: [Device.osName, Device.osVersion].filter((part) => part !== null).join(' '),
  device: Device.modelName ?? '',
};

const LINKS = aboutLinks({
  privacyUrl: ENV.PRIVACY_URL,
  imprintUrl: ENV.IMPRINT_URL,
  supportEmail: ENV.SUPPORT_EMAIL,
  diagnostics: DIAGNOSTICS,
});

export function AboutSection() {
  const { t } = useTranslation('settings');
  const [licences, setLicences] = useState(false);

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
    <Group
      title={t('about.title')}
      icon="book"
      fold="about"
      summary={VERSION ? t('about.version', { version: VERSION }) : undefined}
    >
      <Card padding={18}>
        <View style={{ gap: 16 }}>
          {VERSION ? (
            <Row
              question={t('about.version_question')}
              answer={t('about.version', { version: VERSION })}
            />
          ) : null}
          {LINKS.map((link, i) => (
            <View key={link.kind} style={{ gap: 16 }}>
              {VERSION || i > 0 ? <Divider /> : null}
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
          {VERSION || LINKS.length > 0 ? <Divider /> : null}
          <Btn pill variant="outline" onPress={() => setLicences(true)}>
            {t('about.licences')}
          </Btn>
        </View>
      </Card>
      <LicencesSheet visible={licences} onClose={() => setLicences(false)} />
    </Group>
  );
}
