// "Lernzeiten" (ui_kits/app/Flows.jsx `Times`): on which days and at what time of day Buddy may
// write to the phone, and when not. Everything here is a field of PATCH /buddy/settings —
// `avoid_weekdays`, the preferred window, the quiet hours (docs/architecture.md §Delivery);
// nothing is kept on the device. Fewer days and a longer quiet time always go; a day back and
// anything else that allows more needs the parents' PIN for a minor, which the server decides
// (CLAUDE.md rule 6) and `useContact` asks for.

import { useTranslation } from 'react-i18next';

import { ListGroup, Row } from '../lb/ListGroup.js';
import { afterModalCloses } from './adultGate.js';
import { ChoiceRow } from './ChoiceRow.js';
import { DayChoice } from '../lb/DayChoice.js';
import { Hint } from './SettingsPage.js';
import { Toggle } from '../lb/Toggle.js';
import { useContact, type ContactChange, type ContactProps } from './useContact.js';

const QUIET_START = ['19:00', '20:00', '21:00'] as const;
const QUIET_END = ['06:30', '07:00', '08:00'] as const;
const WINDOWS = [
  { key: 'early', start: '14:00', end: '17:00' },
  { key: 'middle', start: '15:00', end: '18:30' },
  { key: 'late', start: '16:00', end: '19:30' },
] as const;
/** ISO weekdays: Saturday and Sunday. */
const WEEKEND = [6, 7] as const;

function pick<T extends string>(options: readonly T[], value: string): T | null {
  return options.find((o) => o === value) ?? null;
}

type Props = ContactProps & {
  /** False while the page is not in front (the PIN screen is): an open sheet goes with it. */
  active: boolean;
};

export function TimesPage({ settings, isMinor, pinSet, push, active }: Props) {
  const { t, i18n } = useTranslation('settings');
  const contact = useContact({ settings, isMinor, pinSet, push });
  const { saving } = contact;
  const avoided = settings.avoid_weekdays;
  const days = [1, 2, 3, 4, 5, 6, 7].filter((d) => !avoided.includes(d));
  const weekendQuiet = WEEKEND.every((d) => avoided.includes(d));
  const preferred =
    WINDOWS.find((w) => w.start === settings.preferred_start && w.end === settings.preferred_end) ??
    null;
  const clock = (time: string) => t('clock', { time });

  /** A pick in a sheet: the sheet has to be gone before the parents' PIN screen can open. */
  async function picked(change: ContactChange) {
    if (isMinor) await afterModalCloses();
    await contact.save(change);
  }

  function toggleDay(day: number) {
    const on = !avoided.includes(day);
    // A day off is less contact and always goes; a day back allows more.
    void contact.save(
      { avoid_weekdays: on ? [...avoided, day] : avoided.filter((d) => d !== day) },
      { loosens: !on },
    );
  }

  function quietWeekend(quiet: boolean) {
    void contact.save(
      {
        avoid_weekdays: quiet
          ? [...new Set([...avoided, ...WEEKEND])]
          : avoided.filter((d) => d !== 6 && d !== 7),
      },
      { loosens: !quiet },
    );
  }

  return (
    <>
      <Hint>
        {t('contact.summary', {
          start: settings.preferred_start,
          end: settings.preferred_end,
          quiet: settings.quiet_start,
        })}{' '}
        {t('contact.tell_buddy')}
      </Hint>
      <ListGroup label={t('contact.days')}>
        <Row title={t('contact.days_question')}>
          <DayChoice
            value={days}
            onToggle={toggleDay}
            label={t('contact.days_question')}
            locale={i18n.language}
            disabled={saving}
          />
        </Row>
        <ChoiceRow
          title={t('contact.window_question')}
          value={t('contact.window_option', {
            start: settings.preferred_start,
            end: settings.preferred_end,
          })}
          body={t('contact.window_hint')}
          options={WINDOWS.map((w) => ({
            value: w.key,
            label: t('contact.window_option', { start: w.start, end: w.end }),
          }))}
          selected={preferred?.key ?? null}
          disabled={saving}
          active={active}
          onChange={(key) => {
            const w = WINDOWS.find((x) => x.key === key);
            if (w) void picked({ preferred_start: w.start, preferred_end: w.end });
          }}
        />
      </ListGroup>
      <ListGroup label={t('contact.quiet_question')}>
        <ChoiceRow
          title={t('contact.quiet_start')}
          value={clock(settings.quiet_start)}
          options={QUIET_START.map((v) => ({ value: v, label: clock(v) }))}
          selected={pick(QUIET_START, settings.quiet_start)}
          disabled={saving}
          active={active}
          onChange={(quiet_start) => void picked({ quiet_start })}
        />
        <ChoiceRow
          title={t('contact.quiet_end')}
          value={clock(settings.quiet_end)}
          options={QUIET_END.map((v) => ({ value: v, label: clock(v) }))}
          selected={pick(QUIET_END, settings.quiet_end)}
          disabled={saving}
          active={active}
          onChange={(quiet_end) => void picked({ quiet_end })}
        />
        <Row
          title={t('contact.weekend')}
          sub={t('contact.weekend_hint')}
          trailing={
            <Toggle
              on={weekendQuiet}
              onChange={quietWeekend}
              label={t('contact.weekend')}
              disabled={saving}
            />
          }
        />
      </ListGroup>
    </>
  );
}
