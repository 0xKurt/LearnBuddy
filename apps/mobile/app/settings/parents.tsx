// The parents' area as a page of the settings: PIN, profile correction, e-mail and password,
// export, deletion and sign-out (components/settings/ParentsPage.tsx). It shows what the
// parents' gate approved and is closed without it — a link straight here leads to the settings.
// When it closes again is `useOpenParentsArea` (docs/privacy.md §PIN gate).
import { Redirect, usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Screen } from '../../components/lb/Screen.js';
import { parentsOwner, useOpenParentsArea } from '../../components/settings/parentsArea.js';
import { ParentsPage } from '../../components/settings/ParentsPage.js';
import {
  SETTINGS_BACK,
  SettingsBody,
  SettingsPending,
} from '../../components/settings/SettingsPage.js';
import { useMe } from '../../lib/api/queries.js';
import { useRouteFocused } from '../../lib/useRouteFocused.js';

export default function ParentsSettingsScreen() {
  const { t } = useTranslation('settings');
  const me = useMe();
  const pathname = usePathname();
  const active = useRouteFocused();
  const account = me.data?.account ?? null;
  const learner = me.data?.learner ?? null;
  const view = useOpenParentsArea(
    account && learner ? parentsOwner(account.id, learner.id) : null,
    pathname,
  );

  // The group's own name: short enough for the head on a 360 pt phone.
  const title = t((learner?.is_minor ?? true) ? 'adult.title_minor' : 'adult.title_self');
  const subtitle = t('title');
  if (!me.data) return <SettingsPending title={title} subtitle={subtitle} queries={[me]} />;
  if (!account || !learner) return <Redirect href="/" />;
  // Closed: nothing of it is drawn. In front (a link straight here) it leads to the settings;
  // underneath another screen it waits there for the way back.
  if (view === null) return active ? <Redirect href="/settings" /> : null;
  return (
    <Screen title={title} subtitle={subtitle} leading={SETTINGS_BACK}>
      <SettingsBody list>
        <ParentsPage
          account={account}
          learner={learner}
          view={view}
          active={active}
          pinActive={pathname === '/pin'}
        />
      </SettingsBody>
    </Screen>
  );
}
