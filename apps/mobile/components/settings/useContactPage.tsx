// What the two contact pages ("Aufs Handy", "Lernzeiten") need before they can draw: her
// settings, who she is, and this device's registration from the home. Until it is there the
// page is its head with the bones or the failure; without a profile the start screen routes on.

import { Redirect } from 'expo-router';
import type { ReactElement } from 'react';

import { useHome, useMe, useSettings } from '../../lib/api/queries.js';
import { SettingsPending } from './SettingsPage.js';
import type { ContactProps } from './useContact.js';

type Page = { ready: false; view: ReactElement } | { ready: true; props: ContactProps };

export function useContactPage(
  head: { title: string; subtitle: string },
  /** A page about messages that are allowed: without contact it leads back to the settings. */
  { onlyWhileAllowed = false }: { onlyWhileAllowed?: boolean } = {},
): Page {
  const settings = useSettings();
  const me = useMe();
  const home = useHome();
  if (!settings.data || !me.data)
    return { ready: false, view: <SettingsPending {...head} queries={[settings, me]} /> };
  const { account, learner } = me.data;
  if (!account || !learner) return { ready: false, view: <Redirect href="/" /> };
  if (onlyWhileAllowed && !settings.data.contact_enabled)
    return { ready: false, view: <Redirect href="/settings" /> };
  return {
    ready: true,
    props: {
      settings: settings.data,
      isMinor: learner.is_minor,
      pinSet: account.pin_set,
      push: home.data?.system.push ?? null,
    },
  };
}
