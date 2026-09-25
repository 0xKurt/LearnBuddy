// The parents' PIN (docs/privacy.md §PIN gate; PUT /account/pin). Setting or
// changing it needs proof that an adult is here: the current PIN, or a
// password sign-in within the last 5 minutes. When the API asks for that
// (reason pin_required / reauth_required) a password field appears; saving
// then signs in again with the account's e-mail (renewing the sign-in time)
// and sends the PIN once more. The password never leaves this form except to
// Supabase Auth.

import { type ReactNode, useRef, useState } from 'react';
import { Text, View, type TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ApiError } from '../../lib/api/client.js';
import { setPin } from '../../lib/api/endpoints.js';
import { keys, queryClient } from '../../lib/api/queries.js';
import { signIn } from '../../lib/auth/supabase.js';
import { messageFor } from '../../lib/errors.js';
import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { Card } from '../lb/Card.js';
import { LbTextInput } from '../lb/LbTextInput.js';
import { toast } from '../lb/Toast.js';
import { Row } from './Row.js';

type Reason = 'pin_required' | 'reauth_required';

const onlyDigits = (text: string, max: number) => text.replace(/\D/g, '').slice(0, max);

/** A visible label above an input (the input carries the same label for screen readers). */
function Labeled({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={[TYPE.body, { fontWeight: '600' }]}
      >
        {label}
      </Text>
      {hint ? <Text style={[TYPE.body, { color: LB.ink2 }]}>{hint}</Text> : null}
      {children}
    </View>
  );
}

type Props = {
  pinSet: boolean;
  /** The account's e-mail from the stored session ('' when unknown). */
  email: string;
  onInputFocus: (input: TextInput | null) => void;
};

export function PinCard({ pinSet, email, onInputFocus }: Props) {
  const { t } = useTranslation(['settings', 'common']);
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
  const currentRef = useRef<TextInput>(null);
  const pinRef = useRef<TextInput>(null);
  const repeatRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

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

  const inputStyle = { fontSize: 16 };

  return (
    <Card padding={18} radius={20}>
      <Row
        question={t('settings:adult.pin.title')}
        answer={pinSet ? t('settings:adult.pin.is_set') : t('settings:adult.pin.not_set')}
        hint={t('settings:adult.pin.body')}
      >
        {!open ? (
          <Btn variant="outline" onPress={() => setOpen(true)}>
            {pinSet ? t('settings:adult.pin.change') : t('settings:adult.pin.create')}
          </Btn>
        ) : (
          <View style={{ gap: 14 }}>
            {pinSet ? (
              <Labeled
                label={t('settings:adult.pin.current')}
                hint={t('settings:adult.pin.current_hint')}
              >
                <LbTextInput
                  ref={currentRef}
                  value={current}
                  onChangeText={(v) => setCurrent(onlyDigits(v, 8))}
                  onFocus={() => onInputFocus(currentRef.current)}
                  keyboardType="number-pad"
                  maxLength={8}
                  secureTextEntry
                  autoComplete="off"
                  placeholder="••••"
                  accessibilityLabel={t('settings:adult.pin.current')}
                  editable={!busy}
                  style={inputStyle}
                />
              </Labeled>
            ) : null}
            <Labeled label={t('settings:adult.pin.new')}>
              <LbTextInput
                ref={pinRef}
                value={pin}
                onChangeText={(v) => setPinText(onlyDigits(v, 4))}
                onFocus={() => onInputFocus(pinRef.current)}
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry
                autoComplete="off"
                placeholder="••••"
                accessibilityLabel={t('settings:adult.pin.new')}
                editable={!busy}
                style={inputStyle}
              />
            </Labeled>
            <Labeled label={t('settings:adult.pin.repeat')}>
              <LbTextInput
                ref={repeatRef}
                value={repeat}
                onChangeText={(v) => setRepeat(onlyDigits(v, 4))}
                onFocus={() => onInputFocus(repeatRef.current)}
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry
                autoComplete="off"
                placeholder="••••"
                accessibilityLabel={t('settings:adult.pin.repeat')}
                editable={!busy}
                error={repeat.length === 4 && pin !== repeat}
                style={inputStyle}
              />
            </Labeled>
            {repeat.length === 4 && pin !== repeat ? (
              <Text accessibilityLiveRegion="polite" style={[TYPE.body, { color: LB.danger }]}>
                {t('settings:adult.pin.mismatch')}
              </Text>
            ) : null}

            {reason ? (
              <View style={{ gap: 8 }}>
                <Text accessibilityLiveRegion="polite" style={TYPE.body}>
                  {t(`settings:adult.pin.reason_${reason}`)}
                </Text>
                {email ? (
                  <Labeled
                    label={t('settings:adult.pin.password')}
                    hint={t('settings:adult.pin.account', { email })}
                  >
                    <LbTextInput
                      ref={passwordRef}
                      value={password}
                      onChangeText={setPassword}
                      onFocus={() => onInputFocus(passwordRef.current)}
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
                      accessibilityLabel={t('settings:adult.pin.password')}
                      editable={!busy}
                      style={inputStyle}
                    />
                  </Labeled>
                ) : (
                  <Text style={[TYPE.body, { color: LB.ink2 }]}>
                    {t('settings:adult.pin.no_email')}
                  </Text>
                )}
              </View>
            ) : null}

            {error ? (
              <Text accessibilityLiveRegion="polite" style={[TYPE.body, { color: LB.danger }]}>
                {error}
              </Text>
            ) : null}

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Btn onPress={() => void save()} disabled={!canSave}>
                {t('settings:adult.pin.save')}
              </Btn>
              <Btn variant="ghost" onPress={close} disabled={busy}>
                {t('common:actions.cancel')}
              </Btn>
            </View>
          </View>
        )}
      </Row>
    </Card>
  );
}
