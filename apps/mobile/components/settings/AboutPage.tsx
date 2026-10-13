// "Über LearnBuddy" (ui_kits/app/More.jsx `About`): the app version (from the build's app
// config) and the links configured for this build (lib/about.ts, EXPO_PUBLIC_* in lib/env.ts).
// A link that is not configured has no row — never a placeholder address. The licences of what
// the app ships have a page of their own (app/settings/licences.tsx, issue #493).

import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { router } from 'expo-router';
import { Linking } from 'react-native';
import { useTranslation } from 'react-i18next';

import { aboutLinks, type AboutLink } from '../../lib/about.js';
import { ENV } from '../../lib/env.js';
import { ListGroup, Row } from '../lb/ListGroup.js';
import { toast } from '../lb/Toast.js';

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

export function AboutPage() {
  const { t } = useTranslation('settings');

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

  const pages = LINKS.filter((link) => link.kind !== 'support');
  const support = LINKS.find((link) => link.kind === 'support') ?? null;

  return (
    <>
      <ListGroup>
        {VERSION ? <Row title={t('about.version_label')} value={VERSION} /> : null}
        {pages.map((link) => (
          <Row
            key={link.kind}
            title={t(link.kind === 'privacy' ? 'about.privacy' : 'about.imprint')}
            onPress={() => void openLink(link)}
          />
        ))}
        <Row title={t('about.licences')} onPress={() => router.push('/settings/licences')} />
      </ListGroup>
      {support ? (
        <ListGroup label={t('about.contact')}>
          <Row
            title={t('about.support_question')}
            sub={t('about.support_hint', { email: support.detail ?? '' })}
            onPress={() => void openLink(support)}
          />
        </ListGroup>
      ) : null}
    </>
  );
}
