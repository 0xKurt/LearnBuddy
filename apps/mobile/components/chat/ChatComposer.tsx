// Chat composer — input area for the agent-native tutoring interface.
// Adapts to answer_kind: text input, voice, math keyboard, multiple choice.

import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  TextInput,
  Pressable,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MathInput } from '../lb/MathInput';

export type ComposerMode = 'text' | 'voice' | 'math' | 'multiple_choice';

export type ChatComposerProps = {
  mode: ComposerMode;
  answerKind?: string;
  units?: string | null;
  mcOptions?: string[];
  placeholder?: string;
  voiceEnabled?: boolean;
  disabled?: boolean;
  onSubmit: (text: string) => void;
  onVoiceStart?: () => void;
  onVoiceStop?: () => void;
  isListening?: boolean;
  transcript?: string;
  onMathChange?: (math: string) => void;
};

export function ChatComposer({
  mode: initialMode,
  answerKind = 'short',
  units = null,
  mcOptions,
  placeholder = 'Deine Antwort...',
  voiceEnabled = true,
  disabled = false,
  onSubmit,
  onVoiceStart,
  onVoiceStop,
  isListening = false,
  transcript,
  onMathChange,
}: ChatComposerProps) {
  const [text, setText] = useState('');
  const [activeMode, setActiveMode] = useState<ComposerMode>(
    answerKind === 'multiple_choice' ? 'multiple_choice' : initialMode,
  );
  const inputRef = useRef<TextInput>(null);

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    onSubmit(trimmed);
    setText('');
  }, [text, onSubmit]);

  const handleMCOption = useCallback(
    (index: number) => {
      onSubmit(String(index));
    },
    [onSubmit],
  );

  const isFormula = answerKind === 'formula';
  const isNumeric = answerKind === 'numeric';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <View style={styles.container}>
        {/* Multiple Choice */}
        {activeMode === 'multiple_choice' && mcOptions && (
          <View style={styles.mcContainer}>
            {mcOptions.map((option, index) => (
              <Pressable
                key={index}
                style={({ pressed }) => [styles.mcOption, pressed && styles.mcOptionPressed]}
                onPress={() => handleMCOption(index)}
                disabled={disabled}
              >
                <Text style={styles.mcOptionIndex}>{String.fromCharCode(65 + index)}</Text>
                <Text style={styles.mcOptionText}>{option}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Math / Formula Input */}
        {(isFormula || isNumeric) && activeMode !== 'multiple_choice' && (
          <View style={styles.mathContainer}>
            <View>
              <MathInput
                value={text}
                onChangeText={(next: string) => {
                  setText(next);
                  onMathChange?.(next);
                }}
                placeholder={placeholder}
                displayMode={isFormula}
              />
              {units && <Text style={styles.unitChip}>{units}</Text>}
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.sendButton,
                pressed && styles.sendButtonPressed,
                disabled && styles.sendButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={disabled || text.trim().length === 0}
            >
              <Text style={styles.sendButtonText}>↑</Text>
            </Pressable>
          </View>
        )}

        {/* Text Input */}
        {!isFormula && !isNumeric && activeMode !== 'multiple_choice' && (
          <View style={styles.inputRow}>
            {/* Voice Toggle */}
            {voiceEnabled && (
              <Pressable
                style={({ pressed }) => [
                  styles.voiceButton,
                  isListening && styles.voiceButtonActive,
                  pressed && styles.voiceButtonPressed,
                ]}
                onPress={() => {
                  if (isListening) {
                    onVoiceStop?.();
                  } else {
                    onVoiceStart?.();
                  }
                }}
                disabled={disabled}
              >
                <Text style={styles.voiceIcon}>{isListening ? '◼' : '🎤'}</Text>
              </Pressable>
            )}

            <TextInput
              ref={inputRef}
              style={styles.textInput}
              value={isListening && transcript ? transcript : text}
              onChangeText={setText}
              placeholder={isListening ? 'Hört zu...' : placeholder}
              placeholderTextColor="#999"
              multiline
              maxLength={4000}
              editable={!disabled && !isListening}
              onSubmitEditing={handleSubmit}
              blurOnSubmit={false}
              returnKeyType="send"
            />

            <Pressable
              style={({ pressed }) => [
                styles.sendButton,
                pressed && styles.sendButtonPressed,
                (disabled || text.trim().length === 0) && styles.sendButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={disabled || text.trim().length === 0}
            >
              <Text style={styles.sendButtonText}>↑</Text>
            </Pressable>
          </View>
        )}

        {/* Mode Toggle */}
        <View style={styles.modeToggle}>
          {isFormula && (
            <Pressable
              style={[styles.modeButton, activeMode === 'text' && styles.modeButtonActive]}
              onPress={() => setActiveMode('text')}
            >
              <Text style={styles.modeButtonText}>Text</Text>
            </Pressable>
          )}
          {voiceEnabled && !isFormula && !isNumeric && (
            <Pressable
              style={[styles.modeButton, activeMode === 'voice' && styles.modeButtonActive]}
              onPress={() => setActiveMode('voice')}
            >
              <Text style={styles.modeButtonText}>Sprechen</Text>
            </Pressable>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
    backgroundColor: '#FFFFFF',
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#F5F5F7',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    lineHeight: 22,
    maxHeight: 120,
    color: '#1A1A2E',
  },
  voiceButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0F0F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceButtonActive: {
    backgroundColor: '#FF6B6B',
  },
  voiceButtonPressed: {
    opacity: 0.7,
  },
  voiceIcon: {
    fontSize: 18,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#6C5CE7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonPressed: {
    opacity: 0.8,
  },
  sendButtonDisabled: {
    backgroundColor: '#CCC',
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  mcContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  mcOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F7',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: '#E0E0E5',
  },
  mcOptionPressed: {
    backgroundColor: '#E8E0F7',
    borderColor: '#6C5CE7',
  },
  mcOptionIndex: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#6C5CE7',
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 28,
    overflow: 'hidden',
  },
  mcOptionText: {
    flex: 1,
    fontSize: 16,
    color: '#1A1A2E',
    lineHeight: 22,
  },
  mathContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 8,
  },
  modeToggle: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 4,
    gap: 8,
  },
  modeButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#F0F0F5',
  },
  modeButtonActive: {
    backgroundColor: '#E8E0F7',
  },
  modeButtonText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  unitChip: {
    fontSize: 13,
    color: '#666',
    backgroundColor: '#F0F0F5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
    alignSelf: 'flex-start',
    marginTop: 4,
  },
});
