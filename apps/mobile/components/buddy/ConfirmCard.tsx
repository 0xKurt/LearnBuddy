// Buddy proposed to delete something; this card is where she decides (issue #151).
//
// It exists because consent is the one thing the model must not read between the lines.
// Until 30.09. the server looked at a bit in the previous decision ("did Buddy ask
// something?") and that failed both ways: a correct "ja, lösch das" was refused after a
// lookup, and an unrelated earlier question authorised the deletion even after "nein".
// Now the model can only propose; the tap is the answer (docs/UX-PRINCIPLES.md §18 — the
// library's confirm sheet, in the conversation).
//
// Deleting a sheet cannot be taken back, so the card says the name of what would go and
// never pre-selects the destructive side: "Behalten" is the calm default, and the
// dangerous button says exactly what it does.

import type { ActionSummary } from '@learnbuddy/shared-types/contracts';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { answerConfirmation } from '../../lib/api/endpoints.js';
import { useAnnounce } from '../../lib/announce.js';
import { messageFor } from '../../lib/errors.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { Card } from '../lb/Card.js';
import { toast } from '../lb/Toast.js';

type Confirm = Extract<ActionSummary, { tool: 'confirm_delete' }>;

export function ConfirmCard({ confirm }: { confirm: Confirm }) {
  const { palette } = useTheme();
  const { t } = useTranslation(['buddy', 'common']);
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null);

  const what = confirm.what === 'material' ? 'sheet' : 'question';
  const name = confirm.what === 'material' ? confirm.title : confirm.detail;
  const settled =
    confirm.status === 'confirmed'
      ? t(`buddy:confirm.${what}_deleted`)
      : confirm.status === 'declined'
        ? t(`buddy:confirm.${what}_kept`)
        : confirm.status === 'open'
          ? null
          : t('buddy:confirm.no_longer_open');
  // iOS has no live regions: what happened says itself (lib/announce.ts).
  useAnnounce(settled);

  async function answer(yes: boolean) {
    if (busy) return;
    setBusy(yes ? 'yes' : 'no');
    try {
      await answerConfirmation(confirm.pending_id, yes);
    } catch (err) {
      toast.show(messageFor(err), 'error');
    } finally {
      setBusy(null);
    }
  }

  if (settled) {
    return (
      <Card padding={SPACE.lg}>
        <Text style={[TYPE.body, { color: palette.ink2 }]}>{settled}</Text>
      </Card>
    );
  }

  return (
    <Card padding={SPACE.lg}>
      <View style={{ gap: SPACE.md }}>
        <Text accessibilityRole="header" style={TYPE.title}>
          {t(`buddy:confirm.${what}_title`)}
        </Text>
        {name ? (
          <Text numberOfLines={3} style={[TYPE.body, { color: palette.ink2 }]}>
            {name}
          </Text>
        ) : null}
        {/* Said once, plainly: this is the part that cannot be taken back. */}
        <Text style={[TYPE.small, { color: palette.ink2 }]}>{t(`buddy:confirm.${what}_body`)}</Text>
        {/* Keeping it is the calm way out and stands first; the other button says what it
            does, never just "Ja". */}
        <View style={{ gap: SPACE.sm }}>
          <Btn
            pill
            full
            busy={busy === 'no'}
            disabled={busy === 'yes'}
            onPress={() => void answer(false)}
          >
            {t('buddy:confirm.keep')}
          </Btn>
          <Btn
            variant="ghost"
            pill
            full
            center
            busy={busy === 'yes'}
            disabled={busy === 'no'}
            onPress={() => void answer(true)}
          >
            {t(`buddy:confirm.${what}_delete`)}
          </Btn>
        </View>
      </View>
    </Card>
  );
}
