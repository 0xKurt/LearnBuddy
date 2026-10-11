// One presentation surface: text, optional keys, then tools and one stable primary slot.
// Drafts, speech, attachments and submissions are owned by the existing containers.
import { forwardRef, type ReactNode } from 'react';
import { View } from 'react-native';

import { COMPOSER } from '../../lib/theme/composer.js';
import { SPACE, TOUCH } from '../../lib/theme/space.js';
import { LbTextInput, type LbTextInputProps, type LbTextInputRef } from './LbTextInput.js';

export type ComposerProps = Omit<LbTextInputProps, 'variant' | 'multiline' | 'end' | 'under'> & {
  primary?: ReactNode;
  microphone?: ReactNode;
  keys?: ReactNode;
  before?: ReactNode;
};

export const Composer = forwardRef<LbTextInputRef, ComposerProps>(function Composer(
  { primary = null, microphone = null, keys = null, before = null, ...field },
  ref,
) {
  return (
    <>
      {before}
      <LbTextInput
        {...field}
        ref={ref}
        variant="bar"
        multiline
        stackTools
        under={keys}
        end={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xs }}>
            {microphone}
            <View
              testID="composer-primary"
              style={{
                flexShrink: 0,
                minWidth: COMPOSER.slot,
                minHeight: TOUCH,
                justifyContent: 'center',
              }}
            >
              {primary}
            </View>
          </View>
        }
      />
    </>
  );
});
