// "Aufs Handy": the contact opt-in, a pause and this device as a page of the settings (#589).
import { useTranslation } from 'react-i18next';

import { Screen } from '../../components/lb/Screen.js';
import { ContactPage } from '../../components/settings/ContactPage.js';
import { SETTINGS_BACK, SettingsBody } from '../../components/settings/SettingsPage.js';
import { useContactPage } from '../../components/settings/useContactPage.js';

export default function ContactSettingsScreen() {
  const { t } = useTranslation('settings');
  const head = { title: t('contact.phone'), subtitle: t('title') };
  const page = useContactPage(head);
  if (!page.ready) return page.view;
  return (
    <Screen title={head.title} subtitle={head.subtitle} leading={SETTINGS_BACK}>
      <SettingsBody>
        <ContactPage {...page.props} />
      </SettingsBody>
    </Screen>
  );
}
