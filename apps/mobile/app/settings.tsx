// Settings. Sources: docs/architecture.md §API (GET/PATCH /buddy/settings — contact and
// Buddy's voice, ADR 0008 §Amendment,
// PATCH /learner, PUT /account/pin, GET /account/export, POST/DELETE
// /account/deletion), §Delivery (contact rules) and docs/privacy.md (PIN
// gate, export, deletion). Written for learners of about 12–18: one screen of
// groups of rows (ui_kits/app/Settings.jsx) — a row says what is set and leads
// to its page (app/settings/*); nothing unfolds in place (issue #589). The
// parents' group is set apart; for a minor, more contact and account data go
// through the parents' PIN (lib/adminFlow.ts). Everything shown is what the API
// returned.

import type {
  BuddySettingsView,
  LearnerView,
  MeResponse,
  SystemStatus,
} from '@learnbuddy/shared-types/contracts';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ListGroup, Row } from '../components/lb/ListGroup.js';
import { Screen } from '../components/lb/Screen.js';
import { AdultSection } from '../components/settings/AdultSection.js';
import { LookSection } from '../components/settings/LookSection.js';
import { ProfileGroup } from '../components/settings/ProfileGroup.js';
import { ProfileSection } from '../components/settings/ProfileSection.js';
import { PendingBody, SettingsBody } from '../components/settings/SettingsPage.js';
import { useContact } from '../components/settings/useContact.js';
import { useHome, useMe, useSettings } from '../lib/api/queries.js';
import { useShown } from '../lib/perfShown.js';
import { useRouteFocused } from '../lib/useRouteFocused.js';

export default function SettingsScreen() {
  const { t } = useTranslation('settings');
  const settings = useSettings();
  useShown('settings', true);
  useShown('settings_data', settings.data !== undefined);
  const me = useMe();
  const home = useHome();
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    try {
      await Promise.all([settings.refetch(), me.refetch(), home.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }

  const title = t('title');
  const account = me.data?.account;
  const learner = me.data?.learner;
  // Without an account or profile there is nothing to set here; the start screen routes on.
  if (me.data && (!account || !learner)) return <Redirect href="/" />;
  const loaded =
    settings.data && account && learner ? { settings: settings.data, account, learner } : null;

  // One head while the groups arrive (#637): Buddy thinks over the bones, then rests. The head
  // is not drawn a second time when the content comes.
  return (
    <Screen back title={title} state={loaded ? 'idle' : 'think'}>
      {loaded ? (
        // A list she browses on purpose (like her material): it may grow past the screen
        // (tests/web/fit.ts, CLAUDE.md §16).
        <SettingsBody list refresh={{ refreshing, onRefresh: () => void refresh() }}>
          <Groups
            settings={loaded.settings}
            account={loaded.account}
            learner={loaded.learner}
            push={home.data?.system.push ?? null}
          />
        </SettingsBody>
      ) : (
        <PendingBody start="profile" queries={[settings, me]} />
      )}
    </Screen>
  );
}

type GroupsProps = {
  settings: BuddySettingsView;
  account: NonNullable<MeResponse['account']>;
  learner: LearnerView;
  push: SystemStatus['push'] | null;
};

function Groups({ settings, account, learner, push }: GroupsProps) {
  const { t } = useTranslation('settings');
  const active = useRouteFocused();
  const contact = useContact({
    settings,
    isMinor: learner.is_minor,
    pinSet: account.pin_set,
    push,
  });
  return (
    <>
      <ProfileSection learner={learner} />
      <LookSection />
      <ProfileGroup learner={learner} settings={settings} active={active} />
      <ListGroup label={t('contact.question')}>
        <Row
          title={t('contact.phone')}
          sub={contact.stateLine}
          onPress={() => router.push('/settings/contact')}
        />
        {settings.contact_enabled ? (
          <Row
            title={t('contact.times')}
            value={t('contact.window_option', {
              start: settings.preferred_start,
              end: settings.preferred_end,
            })}
            onPress={() => router.push('/settings/times')}
          />
        ) : null}
      </ListGroup>
      <AdultSection
        account={account}
        learner={learner}
        allowContact={
          settings.contact_enabled
            ? undefined
            : { busy: contact.saving, onPress: () => void contact.allow() }
        }
      />
      <ListGroup>
        <Row title={t('about.title')} onPress={() => router.push('/settings/about')} />
        <Row title={t('about.licences')} onPress={() => router.push('/settings/licences')} />
      </ListGroup>
    </>
  );
}
