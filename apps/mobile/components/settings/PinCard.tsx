// The parents' PIN (docs/privacy.md §PIN gate; PUT /account/pin). Setting or
// changing it needs proof that an adult is here: the current PIN, or a
// password sign-in within the last 5 minutes. When the API asks for that
// (reason pin_required / reauth_required) a password field appears; saving
// then signs in again with the account's e-mail (renewing the sign-in time)
// and sends the PIN once more. The password never leaves this form except to
// Supabase Auth.
//
// One row on the parents' page says whether a PIN is set; a tap opens its fields under it, on
// the page and not in a sheet — the number pad needs the room, and nothing lies over it.

import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useAnnounce } from '../../lib/announce.js';
import { ApiError } from '../../lib/api/client.js';
import { setPin } from '../../lib/api/endpoints.js';
import { keys, queryClient } from '../../lib/api/queries.js';
import { signIn } from '../../lib/auth/supabase.js';
import { messageFor } from '../../lib/errors.js';
import { SETTINGS } from '../../lib/theme/settings.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { LbTextInput, type LbTextInputRef } from '../lb/LbTextInput.js';
import { ListGroup, Row } from '../lb/ListGroup.js';
import { toast } from '../lb/Toast.js';
import { Hint } from './SettingsPage.js';

type Reason = 'pin_required' | 'reauth_required';

const onlyDigits = (text: string, max: number) => text.replace(/\D/g, '').slice(0, max);

type Props = {
  pinSet: boolean;
  /** The account's e-mail from the stored session ('' when unknown). */
  email: string;
};

export function PinCard({ pinSet, email }: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation(['settings', 'common', 'auth']);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [pin, setPinText] = useState('');
  const [repeat, setRepeat] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [reason, setReason] = useState<Reason | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const currentRef = useRef<LbTextInputRef>(null);
  const pinRef = useRef<LbTextInputRef>(null);
  const repeatRef = useRef<LbTextInputRef>(null);
  const passwordRef = useRef<LbTextInputRef>(null);

  const mismatch = repeat.length === 4 && pin !== repeat;
  const pinOk = /^\d{4}$/.test(pin) && pin === repeat;
  const currentOk = current === '' || /^\d{4,8}$/.test(current);
  const withPassword = reason !== null && email !== '' && password.length > 0;
  const proofOk =
    reason === 'reauth_required'
      ? withPassword
      : reason === 'pin_required'
        ? withPassword || current !== ''
        : true;
  const canSave = pinOk && currentOk && proofOk && !busy;

  // iOS has no live regions: the re-auth prompt and a save error say themselves
  // (lib/announce.ts suppresses the Android duplicate); the mismatch is the field's own note.
  useAnnounce(reason ? t(`settings:adult.pin.reason_${reason}`) : null);
  useAnnounce(error);

  function close() {
    setOpen(false);
    setCurrent('');
    setPinText('');
    setRepeat('');
    setPassword('');
    setShowPassword(false);
    setReason(null);
    setError(null);
  }

  async function save() {
    if (!canSave || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      // A fresh password sign-in is the other proof the API accepts.
      if (withPassword) await signIn(email, password);
      await setPin(pin, pinSet && current !== '' ? current : undefined);
      close();
      toast.show(t('settings:adult.pin.saved'));
      void queryClient.invalidateQueries({ queryKey: keys.me });
    } catch (err) {
      const r = err instanceof ApiError ? err.reason : null;
      if (r === 'pin_required' || r === 'reauth_required') {
        setReason(r);
        // Already confirmed with the password and still refused: say so.
        if (withPassword) setError(messageFor(err));
      } else {
        setError(messageFor(err));
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <ListGroup label={t('settings:adult.pin.title')}>
        <Row
          title={pinSet ? t('settings:adult.pin.change') : t('settings:adult.pin.create')}
          sub={pinSet ? t('settings:adult.pin.is_set') : t('settings:adult.pin.not_set')}
          expanded={open}
          disabled={busy}
          onPress={() => (open ? close() : setOpen(true))}
        >
          {open ? (
            // The PIN's fields, each under the field's own label (components/core/Field.jsx).
            <View style={{ gap: SETTINGS.formGap }}>
              {pinSet ? (
                <LbTextInput
                  ref={currentRef}
                  label={t('settings:adult.pin.current')}
                  hint={t('settings:adult.pin.current_hint')}
                  value={current}
                  onChangeText={(v) => setCurrent(onlyDigits(v, 8))}
                  keyboardType="number-pad"
                  maxLength={8}
                  secureTextEntry
                  autoComplete="off"
                  placeholder={t('auth:profile.pin_placeholder')}
                  editable={!busy}
                />
              ) : null}
              <LbTextInput
                ref={pinRef}
                label={t('settings:adult.pin.new')}
                value={pin}
                onChangeText={(v) => {
                  const next = onlyDigits(v, 4);
                  setPinText(next);
                  // The number pad has no return key: a filled PIN hands focus on.
                  if (next.length === 4) repeatRef.current?.focus();
                }}
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry
                autoComplete="off"
                placeholder={t('auth:profile.pin_placeholder')}
                editable={!busy}
              />
              <LbTextInput
                ref={repeatRef}
                label={t('settings:adult.pin.repeat')}
                value={repeat}
                onChangeText={(v) => setRepeat(onlyDigits(v, 4))}
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry
                autoComplete="off"
                placeholder={t('auth:profile.pin_placeholder')}
                editable={!busy}
                error={mismatch}
                errorMessage={mismatch ? t('settings:adult.pin.mismatch') : undefined}
              />

              {reason ? (
                <View style={{ gap: SPACE.sm }}>
                  <Text accessibilityLiveRegion="polite" style={TYPE.body}>
                    {t(`settings:adult.pin.reason_${reason}`)}
                  </Text>
                  {email ? (
                    <LbTextInput
                      ref={passwordRef}
                      label={t('settings:adult.pin.password')}
                      hint={t('settings:adult.pin.account', { email })}
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      showToggle
                      shown={showPassword}
                      onToggle={() => setShowPassword((s) => !s)}
                      toggleAccessibilityLabel={
                        showPassword
                          ? t('settings:adult.pin.hide_password')
                          : t('settings:adult.pin.show_password')
                      }
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="current-password"
                      textContentType="password"
                      editable={!busy}
                    />
                  ) : (
                    <Text style={[TYPE.body, { color: palette.ink2 }]}>
                      {t('settings:adult.pin.no_email')}
                    </Text>
                  )}
                </View>
              ) : null}

              {error ? (
                <Text
                  accessibilityLiveRegion="polite"
                  style={[TYPE.body, { color: palette.danger }]}
                >
                  {error}
                </Text>
              ) : null}

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
                <Btn pill onPress={() => void save()} busy={busy} disabled={!canSave}>
                  {t('settings:adult.pin.save')}
                </Btn>
                <Btn pill variant="ghost" onPress={close} disabled={busy}>
                  {t('common:actions.cancel')}
                </Btn>
              </View>
            </View>
          ) : null}
        </Row>
      </ListGroup>
      <Hint>{t('settings:adult.pin.body')}</Hint>
    </>
  );
}
