// "Darf Buddy dir aufs Handy schreiben?" — contact outside the app
// (docs/architecture.md §Delivery, docs/privacy.md §Contact outside the app).
//
// Every change is PATCH /buddy/settings with only the changed fields and the
// version it is based on; what is shown afterwards is the API's answer, never
// a guess. For a minor, loosening needs the parents: switching on, ending a
// pause and allowing all days again ask for the PIN first; anything else the
// API rejects with admin_required is retried once after the PIN. A stale
// version reloads the settings and says so. Switching off or pausing cancels
// messages that were already planned (done by the API in the same step).

import type {
  BuddySettingsView,
  SystemStatus,
  UpdateBuddySettingsRequest,
} from '@learnbuddy/shared-types/contracts';
import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { adminToken } from '../../lib/admin.js';
import { ApiError } from '../../lib/api/client.js';
import { updateSettings } from '../../lib/api/endpoints.js';
import { keys, queryClient } from '../../lib/api/queries.js';
import { messageFor } from '../../lib/errors.js';
import { registerDeviceForPush } from '../../lib/push.js';
import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';
import { formatLastDay, formatWeekday } from '../../lib/time.js';
import { Btn } from '../lb/Btn.js';
import { Card } from '../lb/Card.js';
import { Segmented } from '../lb/Segmented.js';
import { toast } from '../lb/Toast.js';
import { AdultCancelled, asAdultIfNeeded, confirmAdult } from './adultGate.js';
import { Group } from './Group.js';
import { Divider, Row } from './Row.js';

type Change = Omit<UpdateBuddySettingsRequest, 'version'>;

const QUIET_START = ['19:00', '20:00', '21:00'] as const;
const QUIET_END = ['06:30', '07:00', '08:00'] as const;
const WINDOWS = [
  { key: 'early', start: '14:00', end: '17:00' },
  { key: 'middle', start: '15:00', end: '18:30' },
  { key: 'late', start: '16:00', end: '19:30' },
] as const;
const PER_WEEK = ['1', '2', '3', '4'] as const;

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

function pick<T extends string>(options: readonly T[], value: string): T | null {
  return options.find((o) => o === value) ?? null;
}

type Props = {
  settings: BuddySettingsView;
  isMinor: boolean;
  pinSet: boolean;
  /** Device registration from the home's system status; null while it loads. */
  push: SystemStatus['push'] | null;
};

export function ContactSection({ settings, isMinor, pinSet, push }: Props) {
  const { t, i18n } = useTranslation('settings');
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  const lang = i18n.language;
  const pausedUntil =
    settings.paused_until !== null && new Date(settings.paused_until).getTime() > Date.now()
      ? settings.paused_until
      : null;
  // For a minor the API only allows loosening with the parents' admin token (10 minutes).
  const canLoosen = settings.can_loosen && (!isMinor || adminToken() !== null);

  async function patch(
    change: Change,
    opts: { loosens?: boolean } = {},
  ): Promise<BuddySettingsView | null> {
    if (inFlight.current) return null;
    inFlight.current = true;
    setSaving(true);
    try {
      if (opts.loosens && !canLoosen) await confirmAdult(pinSet);
      const next = await asAdultIfNeeded(
        () => {
          const version =
            queryClient.getQueryData<BuddySettingsView>(keys.settings)?.version ?? settings.version;
          return updateSettings({ ...change, version });
        },
        { pinSet },
      );
      queryClient.setQueryData(keys.settings, next);
      // The home shows whether contact is on (system status, the opt-in card).
      void queryClient.invalidateQueries({ queryKey: keys.home });
      return next;
    } catch (err) {
      if (err instanceof AdultCancelled) {
        if (err.reason === 'no_pin') toast.show(t('pin_first'));
        return null;
      }
      toast.show(messageFor(err), 'error');
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

  async function save(change: Change, opts: { loosens?: boolean } = {}) {
    if (await patch(change, opts)) toast.show(t('saved'));
  }

  async function registerDevice() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    try {
      if (await registerDeviceForPush()) {
        toast.show(t('contact.device_registered'));
        await queryClient.invalidateQueries({ queryKey: keys.home });
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

  const answer = !settings.contact_enabled
    ? t('contact.answer_off')
    : pausedUntil
      ? t('contact.answer_paused', { date: formatLastDay(pausedUntil, lang) })
      : t('contact.answer_on');
  const preferred =
    WINDOWS.find((w) => w.start === settings.preferred_start && w.end === settings.preferred_end) ??
    null;
  // ISO weekday d is 2024-01-0d (1 January 2024 was a Monday).
  const avoidedDays = settings.avoid_weekdays
    .map((d) => formatWeekday(`2024-01-0${d}`, lang))
    .join(', ');
  const deviceMissing = settings.contact_enabled && (push === 'no_token' || push === 'invalid');
  const secondary = [TYPE.body, { color: LB.ink2 }];
  // The details are sensible defaults; she tells Buddy in the chat when she wants less.
  // Only loosening (more, later, other days) needs this place — for a minor with the PIN.
  const [showTimes, setShowTimes] = useState(false);

  return (
    <Group title={t('contact.question')}>
      <Card tone="lavender" padding={20} radius={22}>
        <View style={{ gap: 10 }}>
          <Text style={[TYPE.body, { fontWeight: '600' }]}>{answer}</Text>
          {!settings.contact_enabled ? (
            <Text style={secondary}>{t('contact.explain_off')}</Text>
          ) : null}
          {settings.contact_enabled && push === 'disabled' ? (
            // Allowed, but the server sends no push at all: say so where the choice is made.
            <Text style={secondary}>{t('contact.push_off_server')}</Text>
          ) : null}
          {isMinor && !canLoosen ? (
            <Text style={secondary}>
              {pinSet
                ? t('contact.minor_hint')
                : `${t('contact.minor_hint')} ${t('contact.no_pin_hint')}`}
            </Text>
          ) : null}
          {settings.contact_enabled ? (
            <Text style={secondary}>
              {pausedUntil
                ? t('contact.pause_until', { date: formatLastDay(pausedUntil, lang) })
                : t('contact.summary', {
                    start: settings.preferred_start,
                    end: settings.preferred_end,
                    count: settings.max_per_week,
                    quiet: settings.quiet_start,
                  })}{' '}
              {t('contact.tell_buddy')}
            </Text>
          ) : null}
          {settings.contact_enabled && pausedUntil ? (
            <Btn variant="outline" onPress={() => void endPause()} disabled={saving}>
              {t('contact.pause_end')}
            </Btn>
          ) : null}
          <View style={{ marginTop: 4, gap: 8 }}>
            {settings.contact_enabled ? (
              <>
                <Btn variant="outline" onPress={() => void stop()} disabled={saving}>
                  {t('contact.stop')}
                </Btn>
                <Btn variant="ghost" onPress={() => setShowTimes((v) => !v)}>
                  {showTimes ? t('contact.less') : t('contact.more')}
                </Btn>
              </>
            ) : (
              <Btn onPress={() => void allow()} disabled={saving}>
                {canLoosen ? t('contact.allow') : t('contact.allow_adult')}
              </Btn>
            )}
          </View>
        </View>
      </Card>

      {deviceMissing ? (
        <Card tone="butter" padding={20} radius={22}>
          <View style={{ gap: 10 }}>
            <Text style={TYPE.body}>
              {t(push === 'no_token' ? 'contact.device_no_token' : 'contact.device_invalid')}
            </Text>
            <Btn variant="outline" onPress={() => void registerDevice()} disabled={saving}>
              {t('contact.device_register')}
            </Btn>
          </View>
        </Card>
      ) : null}

      {settings.contact_enabled && showTimes ? (
        <Card padding={20} radius={22}>
          <View style={{ gap: 18 }}>
            <Row
              question={t('contact.pause_question')}
              answer={
                pausedUntil
                  ? t('contact.pause_until', { date: formatLastDay(pausedUntil, lang) })
                  : undefined
              }
              hint={t('contact.pause_hint')}
            >
              {pausedUntil ? (
                <Btn variant="outline" onPress={() => void endPause()} disabled={saving}>
                  {t('contact.pause_end')}
                </Btn>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <Btn
                    variant="outline"
                    onPress={() => void pauseUntil(endOfTomorrow())}
                    disabled={saving}
                  >
                    {t('contact.pause_tomorrow')}
                  </Btn>
                  <Btn
                    variant="outline"
                    onPress={() => void pauseUntil(endOfSunday())}
                    disabled={saving}
                  >
                    {t('contact.pause_sunday')}
                  </Btn>
                </View>
              )}
            </Row>

            <Divider />
            <Row
              question={t('contact.quiet_question')}
              answer={t('contact.quiet_answer', {
                start: settings.quiet_start,
                end: settings.quiet_end,
              })}
              locked={saving}
            >
              <Text style={TYPE.body}>{t('contact.quiet_start')}</Text>
              <Segmented
                options={QUIET_START.map((v) => ({ value: v, label: t('clock', { time: v }) }))}
                value={pick(QUIET_START, settings.quiet_start)}
                onChange={(v) => {
                  if (v !== settings.quiet_start) void save({ quiet_start: v });
                }}
              />
              <Text style={TYPE.body}>{t('contact.quiet_end')}</Text>
              <Segmented
                options={QUIET_END.map((v) => ({ value: v, label: t('clock', { time: v }) }))}
                value={pick(QUIET_END, settings.quiet_end)}
                onChange={(v) => {
                  if (v !== settings.quiet_end) void save({ quiet_end: v });
                }}
              />
            </Row>

            <Divider />
            <Row
              question={t('contact.window_question')}
              answer={t('contact.window_answer', {
                start: settings.preferred_start,
                end: settings.preferred_end,
              })}
              hint={t('contact.window_hint')}
              locked={saving}
            >
              <Segmented
                options={WINDOWS.map((w) => ({
                  value: w.key,
                  label: t('contact.window_option', { start: w.start, end: w.end }),
                }))}
                value={preferred?.key ?? null}
                onChange={(key) => {
                  const w = WINDOWS.find((x) => x.key === key);
                  if (w && w.key !== preferred?.key) {
                    void save({ preferred_start: w.start, preferred_end: w.end });
                  }
                }}
              />
            </Row>

            <Divider />
            <Row
              question={t('contact.per_week_question')}
              answer={t('contact.per_week_answer', { count: settings.max_per_week })}
              hint={t('contact.per_week_hint')}
              locked={saving}
            >
              <Segmented
                options={PER_WEEK.map((n) => ({
                  value: n,
                  label: t('contact.per_week_option', { count: Number(n) }),
                }))}
                value={pick(PER_WEEK, String(settings.max_per_week))}
                onChange={(n) => {
                  if (Number(n) !== settings.max_per_week) void save({ max_per_week: Number(n) });
                }}
              />
            </Row>

            {settings.avoid_weekdays.length > 0 ? (
              <>
                <Divider />
                <Row
                  question={t('contact.weekdays_question')}
                  answer={t('contact.weekdays_answer', { days: avoidedDays })}
                >
                  <Btn
                    variant="outline"
                    onPress={() => void save({ avoid_weekdays: [] }, { loosens: true })}
                    disabled={saving}
                  >
                    {t('contact.weekdays_allow_all')}
                  </Btn>
                </Row>
              </>
            ) : null}
          </View>
        </Card>
      ) : null}
    </Group>
  );
}
