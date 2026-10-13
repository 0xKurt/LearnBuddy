// "Lizenzen" as a page of the settings (ui_kits/app/Flows.jsx `Licences`, #589, #493).
import { useTranslation } from 'react-i18next';

import { Screen } from '../../components/lb/Screen.js';
import { LicencesPage } from '../../components/settings/LicencesPage.js';
import { SETTINGS_BACK, SettingsBody } from '../../components/settings/SettingsPage.js';

export default function LicencesSettingsScreen() {
  const { t } = useTranslation('settings');
  return (
    <Screen title={t('about.licences')} subtitle={t('title')} leading={SETTINGS_BACK}>
      <SettingsBody list>
        <LicencesPage />
      </SettingsBody>
    </Screen>
  );
}
