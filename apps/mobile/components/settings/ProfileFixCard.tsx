// Correcting the profile in the parents' area (GDPR Art. 16, PATCH /learner):
// the name and the birth date. The birth date decides who counts as a minor,
// so for a minor's profile the parents' PIN comes first and the server checks
// it too; the PIN counts for this one sheet (closing it drops the token).

import type { LearnerView, MeResponse } from '@learnbuddy/shared-types/contracts';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { adminToken, clearAdminToken } from '../../lib/admin.js';
import { useAnnounce } from '../../lib/announce.js';
import { updateLearner } from '../../lib/api/endpoints.js';
import { keys, queryClient } from '../../lib/api/queries.js';
import { birthDateOf, formatBirthDate, partsOf } from '../../lib/birthDate.js';
import { messageFor } from '../../lib/errors.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { Card } from '../lb/Card.js';
import { LbTextInput } from '../lb/LbTextInput.js';
import { Sheet } from '../lb/Sheet.js';
import { toast } from '../lb/Toast.js';
import { AdultCancelled, afterModalCloses, asAdultIfNeeded, confirmAdult } from './adultGate.js';
import { Row } from './Row.js';

type Props = {
  learner: LearnerView;
  pinSet: boolean;
  /** False while another account task runs (AdultSection). */
  enabled: boolean;
};

export function ProfileFixCard({ learner, pinSet, enabled }: Props) {
  const { palette } = useTheme();
  const { t, i18n } = useTranslation(['settings', 'auth', 'common']);
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(learner.display_name);
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const minor = learner.is_minor;
  const birthDate = birthDateOf(day, month, year);
  const dateComplete = day.length > 0 && month.length > 0 && year.length === 4;
  // iOS has no live regions: problems in this sheet say themselves (lib/announce.ts).
  useAnnounce(failure);
  useAnnounce(dateComplete && !birthDate ? t('auth:profile.birth_date_invalid') : null);
  const changed =
    name.trim() !== learner.display_name ||
    (birthDate !== null && birthDate !== learner.birth_date);
  const valid = name.trim().length > 0 && birthDate !== null;

  async function start() {
    if (opening) return;
    setOpening(true);
    try {
      if (minor) {
        const prompted = adminToken() === null;
        await confirmAdult(pinSet, 'profile');
        if (prompted) await afterModalCloses();
      }
      const parts = partsOf(learner.birth_date);
      setName(learner.display_name);
      setDay(parts.day);
      setMonth(parts.month);
      setYear(parts.year);
      setFailure(null);
      setOpen(true);
    } catch (err) {
      if (err instanceof AdultCancelled) {
        if (err.reason === 'no_pin') toast.show(t('settings:pin_first'));
      } else {
        toast.show(messageFor(err), 'error');
      }
    } finally {
      setOpening(false);
    }
  }

  function close() {
    setOpen(false);
    // The PIN was for this sheet only.
    clearAdminToken();
  }

  async function save() {
    if (!valid || !changed || busy || !birthDate) return;
    setBusy(true);
    setFailure(null);
    try {
      const next = await asAdultIfNeeded(
        () => {
          const version =
            queryClient.getQueryData<MeResponse>(keys.me)?.learner?.version ?? learner.version;
          return updateLearner({
            ...(name.trim() !== learner.display_name ? { display_name: name.trim() } : {}),
            ...(birthDate !== learner.birth_date ? { birth_date: birthDate } : {}),
            version,
          });
        },
        { pinSet, purpose: 'profile' },
      );
      queryClient.setQueryData<MeResponse>(keys.me, (old) =>
        old ? { ...old, learner: next } : old,
      );
      void queryClient.invalidateQueries({ queryKey: keys.me });
      toast.show(t('settings:adult.profile.saved'));
      close();
    } catch (err) {
      if (err instanceof AdultCancelled) {
        if (err.reason === 'no_pin') setFailure(t('settings:pin_first'));
        return;
      }
      setFailure(messageFor(err));
      void queryClient.invalidateQueries({ queryKey: keys.me });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card padding={18}>
        <Row
          question={t('settings:adult.profile.title')}
          answer={t('settings:adult.profile.current', {
            name: learner.display_name,
            date: formatBirthDate(learner.birth_date, i18n.language),
          })}
          hint={t('settings:adult.profile.body')}
        >
          {minor ? (
            <Text style={[TYPE.body, { color: palette.ink2 }]}>
              {t('settings:adult.needs_pin')}
            </Text>
          ) : null}
          <Btn pill variant="outline" onPress={() => void start()} disabled={!enabled || opening}>
            {t('settings:adult.profile.cta')}
          </Btn>
        </Row>
      </Card>

      <Sheet
        visible={open}
        title={t('settings:adult.profile.sheet_title')}
        closeLabel={t('common:actions.cancel')}
        onClose={close}
        footer={
          <Btn pill full busy={busy} disabled={!valid || !changed} onPress={() => void save()}>
            {busy ? t('settings:adult.access.saving') : t('settings:adult.profile.save')}
          </Btn>
        }
      >
        <View style={{ gap: 8 }}>
          <Text style={[TYPE.body, { fontWeight: '600' }]}>{t('settings:adult.profile.name')}</Text>
          <LbTextInput
            value={name}
            onChangeText={setName}
            maxLength={40}
            autoCorrect={false}
            spellCheck={false}
            autoCapitalize="words"
            autoComplete="name-given"
            textContentType="givenName"
            accessibilityLabel={t('settings:adult.profile.name')}
            editable={!busy}
          />
        </View>
        <View style={{ gap: 8 }}>
          <Text style={[TYPE.body, { fontWeight: '600' }]}>{t('auth:profile.birth_date')}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <LbTextInput
                value={day}
                onChangeText={setDay}
                placeholder={t('auth:profile.day')}
                accessibilityLabel={t('auth:profile.day')}
                keyboardType="number-pad"
                maxLength={2}
                editable={!busy}
              />
            </View>
            <View style={{ flex: 1 }}>
              <LbTextInput
                value={month}
                onChangeText={setMonth}
                placeholder={t('auth:profile.month')}
                accessibilityLabel={t('auth:profile.month')}
                keyboardType="number-pad"
                maxLength={2}
                editable={!busy}
              />
            </View>
            <View style={{ flex: 1.6 }}>
              <LbTextInput
                value={year}
                onChangeText={setYear}
                placeholder={t('auth:profile.year')}
                accessibilityLabel={t('auth:profile.year')}
                keyboardType="number-pad"
                maxLength={4}
                editable={!busy}
              />
            </View>
          </View>
          {dateComplete && !birthDate ? (
            <Text accessibilityLiveRegion="polite" style={[TYPE.body, { color: palette.danger }]}>
              {t('auth:profile.birth_date_invalid')}
            </Text>
          ) : null}
        </View>
        {failure ? (
          <Text accessibilityLiveRegion="polite" style={[TYPE.body, { color: palette.danger }]}>
            {failure}
          </Text>
        ) : null}
      </Sheet>
    </>
  );
}
