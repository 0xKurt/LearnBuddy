// "Aufs Handy" — whether Buddy may write to the phone, a pause, and this device
// (docs/architecture.md §Delivery, docs/privacy.md §Contact outside the app). Rows on paper as
// everywhere in the settings (components/core/List.jsx); what each tap does, and when the
// parents' PIN comes first, is `useContact`.

import { Linking, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { SPACE } from '../../lib/theme/space.js';
import { formatLastDay } from '../../lib/time.js';
import { ListGroup, Row } from '../lb/ListGroup.js';
import { Hint } from './SettingsPage.js';
import { useContact, type ContactProps } from './useContact.js';

export function ContactPage({ settings, isMinor, pinSet, push }: ContactProps) {
  const { t, i18n } = useTranslation(['settings', 'common']);
  const contact = useContact({ settings, isMinor, pinSet, push });
  const { saving, pausedUntil, canLoosen } = contact;
  const on = settings.contact_enabled;
  // The answer, said once (#95): never the question again.
  const answer =
    contact.state === 'off'
      ? t('settings:contact.answer_off')
      : contact.state === 'paused'
        ? t('settings:contact.answer_paused', {
            date: formatLastDay(pausedUntil!, i18n.language, 'sentenceEnd'),
          })
        : t('settings:contact.state_on', { quiet: settings.quiet_start });

  return (
    <>
      <Hint>{answer}</Hint>
      <ListGroup>
        {on ? (
          <Row
            title={t('settings:contact.stop')}
            chevron={false}
            disabled={saving}
            onPress={() => void contact.stop()}
          />
        ) : (
          <Row
            title={canLoosen ? t('settings:contact.allow') : t('settings:contact.allow_adult')}
            sub={t('settings:contact.explain_off')}
            disabled={saving}
            onPress={() => void contact.allow()}
          />
        )}
      </ListGroup>
      {on && push === 'disabled' ? (
        // Allowed, but the server sends no push at all: say so where the choice is made.
        <Hint>{t('settings:contact.push_off_server')}</Hint>
      ) : null}
      {on ? (
        <View style={{ gap: SPACE.sm }}>
          <ListGroup label={t('settings:contact.pause_question')}>
            {pausedUntil ? (
              <Row
                title={t('settings:contact.pause_end')}
                chevron={false}
                disabled={saving}
                onPress={() => void contact.endPause()}
              />
            ) : (
              [
                <Row
                  key="tomorrow"
                  title={t('settings:contact.pause_tomorrow')}
                  chevron={false}
                  disabled={saving}
                  onPress={() => void contact.pauseTomorrow()}
                />,
                <Row
                  key="sunday"
                  title={t('settings:contact.pause_sunday')}
                  chevron={false}
                  disabled={saving}
                  onPress={() => void contact.pauseSunday()}
                />,
              ]
            )}
          </ListGroup>
          <Hint>{t('settings:contact.pause_hint')}</Hint>
        </View>
      ) : null}

      {on && settings.only_important ? (
        <ListGroup>
          <Row
            title={t('settings:contact.only_important_end')}
            sub={t('settings:contact.only_important')}
            chevron={false}
            disabled={saving}
            onPress={() => void contact.allImportant()}
          />
        </ListGroup>
      ) : null}

      {contact.deviceMissing ? (
        <ListGroup>
          <Row
            title={t('settings:contact.device_register')}
            sub={t(
              contact.elsewhere
                ? 'settings:contact.device_elsewhere'
                : push === 'no_token'
                  ? 'settings:contact.device_no_token'
                  : 'settings:contact.device_invalid',
            )}
            chevron={false}
            disabled={saving}
            onPress={() => void contact.registerDevice()}
          />
          {contact.blocked ? (
            <Row
              title={t('common:voice.open_settings')}
              sub={t('settings:contact.device_not_possible')}
              onPress={() => void Linking.openSettings()}
            />
          ) : null}
        </ListGroup>
      ) : null}
      {isMinor && !canLoosen ? (
        // Without a PIN yet she reads that one comes first — not only in the toast after a tap.
        <Hint>
          {pinSet
            ? t('settings:contact.minor_hint')
            : `${t('settings:contact.minor_hint')} ${t('settings:contact.no_pin_hint')}`}
        </Hint>
      ) : null}
    </>
  );
}
