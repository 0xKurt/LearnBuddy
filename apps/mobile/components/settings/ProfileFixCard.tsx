// Correcting the profile in the parents' area (GDPR Art. 16, PATCH /learner):
// the name and the birth date. The birth date decides who counts as a minor,
// so for a minor's profile the parents' PIN comes first and the server checks
// it too; the PIN counts for this one sheet (closing it drops the token).

import type { LearnerView, MeResponse } from '@learnbuddy/shared-types/contracts';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { clearAdminToken } from '../../lib/admin.js';
import { useAnnounce } from '../../lib/announce.js';
import { updateLearner } from '../../lib/api/endpoints.js';
import { keys, queryClient } from '../../lib/api/queries.js';
import { birthDateOf, formatBirthDate, partsOf } from '../../lib/birthDate.js';
import { messageFor } from '../../lib/errors.js';
import { SETTINGS } from '../../lib/theme/settings.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { BirthDateFields, type DateParts } from '../auth/BirthDateFields.js';
import { Btn } from '../lb/Btn.js';
import { LbTextInput } from '../lb/LbTextInput.js';
import { Row } from '../lb/ListGroup.js';
import { Sheet, SHEET_TEXT } from '../lb/Sheet.js';
import { toast } from '../lb/Toast.js';
import { AdultCancelled, asAdultIfNeeded, useAdultOpener } from './adultGate.js';

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
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(learner.display_name);
  const [date, setDate] = useState<DateParts>({ day: '', month: '', year: '' });
  const [failure, setFailure] = useState<string | null>(null);
  const minor = learner.is_minor;
  const { opening, open: openAsAdult } = useAdultOpener(minor, pinSet, 'profile');
  const birthDate = birthDateOf(date.day, date.month, date.year);
  const dateComplete = date.day.length > 0 && date.month.length > 0 && date.year.length === 4;
  // iOS has no live regions: problems in this sheet say themselves (lib/announce.ts).
  useAnnounce(failure);
  useAnnounce(dateComplete && !birthDate ? t('auth:profile.birth_date_invalid') : null);
  const changed =
    name.trim() !== learner.display_name ||
    (birthDate !== null && birthDate !== learner.birth_date);
  const valid = name.trim().length > 0 && birthDate !== null;

  const start = () =>
    openAsAdult(() => {
      setName(learner.display_name);
      setDate(partsOf(learner.birth_date));
      setFailure(null);
      setOpen(true);
    });

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
      <Row
        title={t('settings:adult.profile.title')}
        sub={t('settings:adult.profile.current', {
          name: learner.display_name,
          date: formatBirthDate(learner.birth_date, i18n.language),
        })}
        disabled={!enabled || opening}
        onPress={() => void start()}
      />

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
        <Text style={[TYPE.body, SHEET_TEXT, { color: palette.ink2 }]}>
          {t('settings:adult.profile.body')}
        </Text>
        {/* The field's own label (components/core/Field.jsx: 700 13/18), not one drawn here. */}
        <LbTextInput
          label={t('settings:adult.profile.name')}
          value={name}
          onChangeText={setName}
          maxLength={40}
          autoCorrect={false}
          spellCheck={false}
          autoCapitalize="words"
          autoComplete="given-name"
          textContentType="givenName"
          editable={!busy}
        />
        <View style={{ gap: SETTINGS.fieldGap }}>
          <Text style={[TYPE.label, SHEET_TEXT, { color: palette.ink2 }]}>
            {t('auth:profile.birth_date')}
          </Text>
          <BirthDateFields value={date} onChange={setDate} editable={!busy} />
          {dateComplete && !birthDate ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[TYPE.body, SHEET_TEXT, { color: palette.danger }]}
            >
              {t('auth:profile.birth_date_invalid')}
            </Text>
          ) : null}
        </View>
        {failure ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[TYPE.body, SHEET_TEXT, { color: palette.danger }]}
          >
            {failure}
          </Text>
        ) : null}
      </Sheet>
    </>
  );
}
