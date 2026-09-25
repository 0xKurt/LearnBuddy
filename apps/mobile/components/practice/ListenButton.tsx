// "Anhören": a small button that reads a word or sentence aloud in its
// language (lib/speech/listen.ts). Tapping it again while it plays stops it.
// The speaker icon and the label both say what it does; the state is announced.

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { speak, stop, type ListenEnd } from '../../lib/speech/listen.js';
import { LB } from '../../lib/theme/colors.js';
import { Icon } from '../lb/Icon.js';
import { toast } from '../lb/Toast.js';

type Props = {
  text: string;
  /** The text's language (ISO 639-1, e.g. "fr"). */
  lang: string;
  /** Read at the slower "langsam" speed. */
  slow?: boolean;
  disabled?: boolean;
};

export function ListenButton({ text, lang, slow = false, disabled = false }: Props) {
  const { t } = useTranslation('practice');
  const [playing, setPlaying] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Stop reading when this button goes away mid-sentence (next question, leaving).
  const playingRef = useRef(false);
  playingRef.current = playing;
  useEffect(
    () => () => {
      if (playingRef.current) stop();
    },
    [],
  );

  function onEnd(why: ListenEnd): void {
    if (!mounted.current) return;
    setPlaying(false);
    if (why === 'error') toast.show(t('speak.no_voice'), 'info');
  }

  function press(): void {
    if (playing) {
      stop();
      return;
    }
    setPlaying(true);
    void speak(text, lang, { slow, onEnd });
  }

  const label = playing
    ? t('speak.listen_stop')
    : slow
      ? t('speak.listen_slow')
      : t('speak.listen');
  const off = disabled || text.trim().length === 0;

  return (
    <Pressable
      onPress={press}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={playing ? undefined : t('speak.listen_hint')}
      accessibilityState={{ disabled: off, busy: playing }}
      hitSlop={4}
      style={{ alignSelf: 'flex-start', borderRadius: 12, opacity: off ? 0.6 : 1 }}
    >
      {({ pressed }) => (
        <View
          style={{
            minHeight: 44,
            paddingHorizontal: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: playing ? LB.primary : LB.hairline,
            backgroundColor: playing ? LB.primaryLt : '#fff',
            opacity: pressed ? 0.78 : 1,
          }}
        >
          <Icon name="speak" size={20} color={playing ? LB.primaryDk : LB.ink} />
          <Text
            style={{
              fontSize: 15,
              lineHeight: 20,
              fontWeight: '600',
              color: playing ? LB.primaryDk : LB.ink,
            }}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
