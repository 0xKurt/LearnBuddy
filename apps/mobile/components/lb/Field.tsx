// Form-only interface to the one TextInput implementation (#548).
import type { ForwardRefExoticComponent, RefAttributes } from 'react';
import { LbTextInput, type LbTextInputProps, type LbTextInputRef } from './LbTextInput.js';
export type FieldProps = Omit<
  LbTextInputProps,
  'variant' | 'start' | 'chips' | 'end' | 'under' | 'rows' | 'maxRows' | 'mono'
>;
export const Field: ForwardRefExoticComponent<FieldProps & RefAttributes<LbTextInputRef>> =
  LbTextInput;
