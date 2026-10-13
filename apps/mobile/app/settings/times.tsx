// "Lernzeiten": days, time of day and quiet hours for Buddy's messages, as a page of the
// settings (ui_kits/app/Flows.jsx `Times`, #589). Only there while contact is allowed: without
// it there is nothing to time, and the settings offer to allow it.
import { useTranslation } from 'react-i18next';

import { Screen } from '../../components/lb/Screen.js';
import { SETTINGS_BACK, SettingsBody } from '../../components/settings/SettingsPage.js';
import { TimesPage } from '../../components/settings/TimesPage.js';
import { useContactPage } from '../../components/settings/useContactPage.js';
import { useRouteFocused } from '../../lib/useRouteFocused.js';

export default function TimesSettingsScreen() {
  const { t } = useTranslation('settings');
  const active = useRouteFocused();
  const head = { title: t('contact.times'), subtitle: t('title') };
  const page = useContactPage(head, { onlyWhileAllowed: true });
  if (!page.ready) return page.view;
  return (
    <Screen title={head.title} subtitle={head.subtitle} leading={SETTINGS_BACK}>
      <SettingsBody>
        <TimesPage {...page.props} active={active} />
      </SettingsBody>
    </Screen>
  );
}
