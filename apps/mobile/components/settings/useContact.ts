// Contact outside the app, as the settings pages change it
// (docs/architecture.md §Delivery, docs/privacy.md §Contact outside the app).
//
// Every change is PATCH /buddy/settings with only the changed fields and the
// version it is based on; what is shown afterwards is the API's answer, never
// a guess. For a minor, loosening needs the parents: switching on, ending a
// pause and allowing a day again ask for the PIN first; anything else the
// API rejects with admin_required is retried once after the PIN. A stale
// version reloads the settings and says so. Switching off or pausing cancels
// messages that were already planned (done by the API in the same step).
// "Seltener schreiben" (a notification button, gaps #16) is shown with the way back;
// going back allows more, so for a minor it asks the parents.

import type {
  BuddySettingsView,
  SystemStatus,
  UpdateBuddySettingsRequest,
} from '@learnbuddy/shared-types/contracts';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAnnounce } from '../../lib/announce.js';
import { ApiError } from '../../lib/api/client.js';
import { updateSettings } from '../../lib/api/endpoints.js';
import { keys, queryClient } from '../../lib/api/queries.js';
import { contactState } from '../../lib/contact/state.js';
import { messageFor } from '../../lib/errors.js';
import { pushPermissionBlocked, registerDeviceForPush, registeredHere } from '../../lib/push.js';
import { formatLastDay } from '../../lib/time.js';
import { toast } from '../lb/Toast.js';
import { asAdultIfNeeded, confirmAdult, toastAdultFailure, useAdminUnlocked } from './adultGate.js';

export type ContactChange = Omit<UpdateBuddySettingsRequest, 'version'>;

/** Local midnight `days` days after today on this device, as an instant (an exclusive end). */
function midnightIn(days: number, now: Date = new Date()): string {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + days).toISOString();
}

/** "Bis morgen": through the end of tomorrow = the start of the day after. */
function endOfTomorrow(): string {
  return midnightIn(2);
}

/** "Bis Sonntag": through the end of Sunday = the start of next Monday (on a Sunday: tomorrow). */
function endOfSunday(now: Date = new Date()): string {
  return midnightIn((8 - now.getDay()) % 7 || 7, now);
}

export type ContactProps = {
  settings: BuddySettingsView;
  isMinor: boolean;
  pinSet: boolean;
  /** Device registration from the home's system status; null while it loads. */
  push: SystemStatus['push'] | null;
};

export function useContact({ settings, isMinor, pinSet, push }: ContactProps) {
  const { t, i18n } = useTranslation('settings');
  const [saving, setSaving] = useState(false);
  // The notification permission is permanently denied: show the settings way out.
  const [blocked, setBlocked] = useState(false);
  // iOS has no live regions: the dead-end explanation says itself (review 28.09.).
  useAnnounce(blocked ? t('contact.device_not_possible') : null);
  const inFlight = useRef(false);

  const lang = i18n.language;
  const pausedUntil =
    settings.paused_until !== null && new Date(settings.paused_until).getTime() > Date.now()
      ? settings.paused_until
      : null;
  // For a minor the API only allows loosening with the parents' admin token, which
  // lasts for one step: afterwards the button asks the parents again.
  const unlocked = useAdminUnlocked();
  const canLoosen = settings.can_loosen && (!isMinor || unlocked);

  async function patch(
    change: ContactChange,
    opts: { loosens?: boolean } = {},
  ): Promise<BuddySettingsView | null> {
    if (inFlight.current) return null;
    inFlight.current = true;
    setSaving(true);
    try {
      if (opts.loosens && !canLoosen) await confirmAdult(pinSet, 'contact');
      const next = await asAdultIfNeeded(
        () => {
          const version =
            queryClient.getQueryData<BuddySettingsView>(keys.settings)?.version ?? settings.version;
          return updateSettings({ ...change, version });
        },
        { pinSet, purpose: 'contact' },
      );
      queryClient.setQueryData(keys.settings, next);
      // The home shows whether contact is on (system status, the opt-in card).
      void queryClient.invalidateQueries({ queryKey: keys.home });
      return next;
    } catch (err) {
      toastAdultFailure(err, t('pin_first'));
      if (err instanceof ApiError && err.code === 'stale') {
        await queryClient.invalidateQueries({ queryKey: keys.settings });
      }
      return null;
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  async function allow() {
    const next = await patch({ contact_enabled: true }, { loosens: true });
    if (!next?.contact_enabled) return;
    // Ask for the notification permission only now, when it has a purpose.
    const registered = await registerDeviceForPush().catch(() => false);
    if (registered) void queryClient.invalidateQueries({ queryKey: keys.home });
    toast.show(t(registered ? 'contact.allowed' : 'contact.allowed_no_device'));
  }

  async function stop() {
    if (await patch({ contact_enabled: false })) toast.show(t('contact.stopped'));
  }

  async function pauseUntil(until: string) {
    const next = await patch({ paused_until: until });
    if (next?.paused_until) {
      toast.show(t('contact.paused_toast', { date: formatLastDay(next.paused_until, lang) }));
    }
  }

  async function endPause() {
    if (await patch({ paused_until: null }, { loosens: true }))
      toast.show(t('contact.pause_ended_toast'));
  }

  async function allImportant() {
    if (await patch({ only_important: false }, { loosens: true }))
      toast.show(t('contact.only_important_ended'));
  }

  async function save(change: ContactChange, opts: { loosens?: boolean } = {}) {
    if (await patch(change, opts)) toast.show(t('saved'));
  }

  async function registerDevice() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    try {
      if (await registerDeviceForPush()) {
        setBlocked(false);
        toast.show(t('contact.device_registered'));
        await queryClient.invalidateQueries({ queryKey: keys.home });
      } else if (await pushPermissionBlocked()) {
        // The OS dialog will not come back: only the system settings help now —
        // re-tapping the same button forever was a dead end (audit).
        setBlocked(true);
      } else {
        toast.show(t('contact.device_not_possible'));
      }
    } catch (err) {
      toast.show(messageFor(err), 'error');
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  // One reading for every screen (issue #205): the hand-over used to hardwire "off" here.
  const state = contactState({ enabled: settings.contact_enabled, pausedUntil });
  // One line says the state — permission and quiet time, or how long the pause runs.
  const stateLine =
    state === 'off'
      ? t('contact.state_off')
      : state === 'paused'
        ? t('contact.pause_until', { date: formatLastDay(pausedUntil!, lang) })
        : t('contact.state_on', { quiet: settings.quiet_start });
  // Another device (a parent's phone, an old one) may hold the messages: say so per device (M-65).
  const [here, setHere] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void registeredHere()
      .then((v) => live && setHere(v))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [push, saving]);
  const elsewhere = push === 'active' && here === false;
  const deviceMissing =
    settings.contact_enabled && (push === 'no_token' || push === 'invalid' || elsewhere);

  return {
    saving,
    blocked,
    state,
    stateLine,
    pausedUntil,
    canLoosen,
    elsewhere,
    deviceMissing,
    allow,
    stop,
    pauseTomorrow: () => pauseUntil(endOfTomorrow()),
    pauseSunday: () => pauseUntil(endOfSunday()),
    endPause,
    allImportant,
    save,
    registerDevice,
  };
}
