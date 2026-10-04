// A new password, typed twice (reset link and "Passwort ändern" for parents).
// The rule is the sign-up rule (lib/auth/recovery.ts); the repeat field only
// complains once something has been typed into it.

import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { passwordProblem } from '../../lib/auth/recovery.js';
import { LbTextInput, type LbTextInputRef } from '../lb/LbTextInput.js';
import { TYPE } from '../../lib/theme/type.js';

type Props = {
  password: string;
  repeat: string;
  onChangePassword: (value: string) => void;
  onChangeRepeat: (value: string) => void;
  onSubmit?: () => void;
};

export function NewPasswordFields({
  password,
  repeat,
  onChangePassword,
  onChangeRepeat,
  onSubmit,
}: Props) {
  const { t } = useTranslation('auth');
  const [shown, setShown] = useState(false);
  const repeatRef = useRef<LbTextInputRef>(null);
  const mismatch = repeat.length > 0 && passwordProblem(password, repeat) === 'mismatch';
  const toggleLabel = shown ? t('welcome.hide_password') : t('welcome.show_password');

  return (
    <View style={{ gap: 10 }}>
      <LbTextInput
        value={password}
        onChangeText={onChangePassword}
        placeholder={t('new_password.password')}
        accessibilityLabel={t('new_password.password')}
        secureTextEntry={!shown}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => repeatRef.current?.focus()}
        showToggle
        shown={shown}
        onToggle={() => setShown((s) => !s)}
        toggleAccessibilityLabel={toggleLabel}
      />
      <LbTextInput
        ref={repeatRef}
        value={repeat}
        onChangeText={onChangeRepeat}
        placeholder={t('new_password.repeat')}
        accessibilityLabel={t('new_password.repeat')}
        secureTextEntry={!shown}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="done"
        onSubmitEditing={onSubmit}
        error={mismatch}
        errorMessage={mismatch ? t('new_password.mismatch') : undefined}
      />
      {mismatch ? null : (
        <Text style={[TYPE.small, { paddingHorizontal: 4 }]}>{t('welcome.password_hint')}</Text>
      )}
    </View>
  );
}
