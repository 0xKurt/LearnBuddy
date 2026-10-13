// "Über LearnBuddy" as a page of the settings (ui_kits/app/More.jsx `About`, #589).
import { useTranslation } from 'react-i18next';

import { Screen } from '../../components/lb/Screen.js';
import { AboutPage } from '../../components/settings/AboutPage.js';
import { SETTINGS_BACK, SettingsBody } from '../../components/settings/SettingsPage.js';

export default function AboutSettingsScreen() {
  const { t } = useTranslation('settings');
  return (
    <Screen title={t('about.title')} leading={SETTINGS_BACK}>
      <SettingsBody>
        <AboutPage />
      </SettingsBody>
    </Screen>
  );
}
