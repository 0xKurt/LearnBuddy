// The parents' page of the settings: PIN, profile correction, e-mail and password
// (components/settings/ParentsPage.tsx). It shows what the parents' gate approved and is closed
// without it; it closes when the parents leave it — onwards from here, or back to the settings
// (components/settings/AdultSection.tsx) — or the app goes to the background: the phone may be
// back in the child's hand (docs/privacy.md §PIN gate).
import { Redirect, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Screen } from '../../components/lb/Screen.js';
import { useParentsArea } from '../../components/settings/parentsArea.js';
import { ParentsPage } from '../../components/settings/ParentsPage.js';
import {
  SETTINGS_BACK,
  SettingsBody,
  SettingsPending,
} from '../../components/settings/SettingsPage.js';
import { useMe } from '../../lib/api/queries.js';
import { useRouteFocused } from '../../lib/useRouteFocused.js';

/** The page itself, and the PIN screen a step in it opens over it. */
const STAYS_OPEN = ['/settings/parents', '/pin'];

export default function ParentsSettingsScreen() {
  const { t } = useTranslation('settings');
  const me = useMe();
  const view = useParentsArea((area) => area.view);
  const pathname = usePathname();
  const active = useRouteFocused();
  useEffect(() => {
    if (!STAYS_OPEN.includes(pathname)) useParentsArea.getState().close();
  }, [pathname]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') useParentsArea.getState().close();
    });
    return () => sub.remove();
  }, []);

  const minor = me.data?.learner?.is_minor ?? true;
  // The group's own name: short enough for the head on a 360 pt phone.
  const title = t(minor ? 'adult.title_minor' : 'adult.title_self');
  const subtitle = t('title');
  // Closed: nothing of it is drawn. In front (a link straight here) it leads to the settings;
  // underneath another screen it waits there for the way back.
  if (view === null) return active ? <Redirect href="/settings" /> : null;
  if (!me.data) return <SettingsPending title={title} subtitle={subtitle} queries={[me]} />;
  const { account, learner } = me.data;
  if (!account || !learner) return <Redirect href="/" />;
  return (
    <Screen title={title} subtitle={subtitle} leading={SETTINGS_BACK}>
      <SettingsBody list>
        <ParentsPage account={account} learner={learner} view={view} />
      </SettingsBody>
    </Screen>
  );
}
