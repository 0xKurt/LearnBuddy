// A new password, typed twice (reset link and "Passwort ändern" for parents).
// The rule is the sign-up rule (lib/auth/recovery.ts); the repeat field only
// complains once something has been typed into it.

import { useRef, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { passwordProblem } from '../../lib/auth/recovery.js';
import type { LbTextInputRef } from '../lb/LbTextInput.js';
import { Field } from '../lb/Field.js';
import { RHYTHM } from '../../lib/theme/space.js';

type Props = {
  password: string;
  repeat: string;
  onChangePassword: (value: string) => void;
  onChangeRepeat: (value: string) => void;
  onSubmit?: () => void;
  editable?: boolean;
};

export function NewPasswordFields({
  password,
  repeat,
  onChangePassword,
  onChangeRepeat,
  onSubmit,
  editable = true,
}: Props) {
  const { t } = useTranslation('auth');
  const [shown, setShown] = useState(false);
  const repeatRef = useRef<LbTextInputRef>(null);
  const mismatch = repeat.length > 0 && passwordProblem(password, repeat) === 'mismatch';
  const toggleLabel = shown ? t('welcome.hide_password') : t('welcome.show_password');

  return (
    <View style={{ gap: RHYTHM.parts }}>
      <Field
        value={password}
        onChangeText={onChangePassword}
        label={t('new_password.password')}
        hint={t('welcome.password_hint')}
        editable={editable}
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
      <Field
        ref={repeatRef}
        value={repeat}
        onChangeText={onChangeRepeat}
        label={t('new_password.repeat')}
        editable={editable}
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
    </View>
  );
}
