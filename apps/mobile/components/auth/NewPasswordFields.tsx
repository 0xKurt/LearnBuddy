// A new password, typed twice (reset link and "Passwort ändern" for parents).
// The rule is the sign-up rule (lib/auth/recovery.ts); the repeat field only
// complains once something has been typed into it.

import { useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { passwordProblem } from '../../lib/auth/recovery.js';
import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';
import { LbTextInput } from '../lb/LbTextInput.js';

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
        autoComplete="new-password"
        textContentType="newPassword"
        showToggle
        shown={shown}
        onToggle={() => setShown((s) => !s)}
        toggleAccessibilityLabel={toggleLabel}
      />
      <LbTextInput
        value={repeat}
        onChangeText={onChangeRepeat}
        placeholder={t('new_password.repeat')}
        accessibilityLabel={t('new_password.repeat')}
        secureTextEntry={!shown}
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="done"
        onSubmitEditing={onSubmit}
        error={mismatch}
      />
      {mismatch ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[TYPE.small, { color: LB.danger, paddingHorizontal: 4 }]}
        >
          {t('new_password.mismatch')}
        </Text>
      ) : (
        <Text style={[TYPE.small, { paddingHorizontal: 4 }]}>{t('welcome.password_hint')}</Text>
      )}
    </View>
  );
}
