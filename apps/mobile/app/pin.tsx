// The adult's PIN (modal). Opens a short admin session in memory for the one
// step it names (lib/adminFlow.ts purpose), so the parents see what they approve.

import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Btn } from '../components/lb/Btn.js';
import { PinPad } from '../components/lb/PinPad.js';
import { Screen } from '../components/lb/Screen.js';
import { clearAdminToken } from '../lib/admin.js';
import { finishAdmin, pendingAdminDetail, pendingAdminPurpose } from '../lib/adminFlow.js';
import { useAnnounce } from '../lib/announce.js';
import { ApiError } from '../lib/api/client.js';
import { openAdminSession } from '../lib/api/endpoints.js';
import { messageFor } from '../lib/errors.js';
import { afterFirstKey, type PinError } from '../lib/pinError.js';
import { formatTime } from '../lib/time.js';
import { useTheme } from '../lib/theme/ThemeProvider.js';
import { TYPE } from '../lib/theme/type.js';
import { PIN_PAGE } from '../lib/theme/pin.js';
import { bottomRoom, GUTTER_APP, SPACE } from '../lib/theme/space.js';

export default function Pin() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation('auth');
  const [problem, setProblem] = useState<PinError | null>(null);
  const error = problem?.text ?? null;
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const done = useRef(false);
  const inFlight = useRef(false);
  // Fixed when the screen opens: what the parents are asked to approve.
  const [purpose] = useState(pendingAdminPurpose);
  const [detail] = useState(pendingAdminDetail);

  // Leaving the screen any other way counts as "cancelled".
  useEffect(
    () => () => {
      if (!done.current) finishAdmin(false);
    },
    [],
  );

  async function submit(pin: string) {
    if (inFlight.current || done.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await openAdminSession(pin);
      done.current = true;
      // Nobody waiting (e.g. a pad left over from a double tap): keep no token.
      if (!finishAdmin(true)) clearAdminToken();
      router.back();
    } catch (err) {
      const stays = (text: string) => setProblem({ text, passes: false });
      if (err instanceof ApiError && err.reason === 'wrong_pin')
        setProblem({ text: t('pin.wrong'), passes: true });
      else if (err instanceof ApiError && err.code === 'pin_locked') {
        const until = err.details?.until;
        stays(
          typeof until === 'string'
            ? t('pin.locked_until', { time: formatTime(until, i18n.language) })
            : t('pin.locked'),
        );
      } else if (err instanceof ApiError && err.reason === 'pin_not_set') stays(t('pin.not_set'));
      else stays(messageFor(err));
      setAttempt((a) => a + 1);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  // Spoken once per attempt on both platforms, ALSO when the text repeats
  // (audit M-80): the keyed announce carries it alone — the on-screen text is
  // deliberately no live region (identical text never re-fires one; review 28.09.).
  useAnnounce(error, { key: attempt, liveRegion: false });

  return (
    <Screen
      title={t('pin.title')}
      // Design ui_kits/app/More.jsx `ParentPin`: Buddy waits for the PIN and speaks up when it was wrong.
      state={error ? 'speak' : 'wait'}
      leading={{ icon: 'close', onPress: () => router.back() }}
      // No ⋯ here: this modal is the parents' one step, and the menu's places would lead out of it
      // with the approval still pending (lib/adminFlow.ts).
      menu={null}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: GUTTER_APP,
          paddingTop: PIN_PAGE.top,
          // Edge-to-edge: the last button must clear the Android navigation bar.
          paddingBottom: bottomRoom(insets.bottom, PIN_PAGE.bottom),
        }}
      >
        {/* The lead under the head, then free room, then the pad at the bottom — where the
            thumb is (design ui_kits/app/More.jsx:104–108). */}
        <Text
          style={[
            TYPE.body,
            {
              color: palette.ink2,
              paddingHorizontal: PIN_PAGE.leadInset,
              maxWidth: PIN_PAGE.textWidth,
            },
          ]}
        >
          {detail ?? (purpose ? t(`pin.purpose.${purpose}`) : t('pin.body'))}
        </Text>
        <View style={{ flexGrow: 1, minHeight: SPACE.xl }} />
        <View style={{ alignItems: 'center', gap: SPACE.lg }}>
          <PinPad
            onComplete={(pin) => void submit(pin)}
            // Her next PIN begins: "stimmt nicht" goes with the red dots (#599); a lockout or a
            // missing PIN is still true and stays (lib/pinError.ts).
            onStart={() => setProblem(afterFirstKey)}
            resetKey={attempt}
            disabled={busy}
            // The dots turn to the danger colour (components/core/PinPad.jsx); the words stand
            // right under the pad and are announced above — never colour alone.
            error={error !== null}
          />
          {/* What went wrong, under the pad (design ui_kits/app/More.jsx:107). The line keeps its
              room while there is nothing to say, so the pad never moves when it appears. */}
          <Text
            testID="pin-error"
            style={[
              TYPE.metaSemibold,
              {
                color: palette.danger,
                textAlign: 'center',
                minHeight: TYPE.metaSemibold.lineHeight,
                maxWidth: PIN_PAGE.textWidth,
              },
            ]}
          >
            {error ?? ''}
          </Text>
          <View style={{ alignItems: 'center' }}>
            {/* Opening the parents' area: a forgotten PIN is set anew with the account's
                password there (components/settings/PinCard.tsx). */}
            {purpose === 'parents' ? (
              <Btn
                variant="ghost"
                pill
                center
                onPress={() => {
                  done.current = true;
                  finishAdmin(false, true);
                  router.back();
                }}
              >
                {t('pin.forgot')}
              </Btn>
            ) : null}
            {/* A modal closes with an obvious button in it (CLAUDE.md rule 14); the head's ✕ is
                the design's way out. Both stay until the owner decides between them (#599). */}
            <Btn variant="ghost" pill center onPress={() => router.back()}>
              {t('pin.cancel')}
            </Btn>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
