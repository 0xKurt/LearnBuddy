// Buddy proposed to delete something; this card is where she decides (issue #151).
//
// It exists because consent is the one thing the model must not read between the lines.
// Until 30.09. the server looked at a bit in the previous decision ("did Buddy ask
// something?") and that failed both ways: a correct "ja, lösch das" was refused after a
// lookup, and an unrelated earlier question authorised the deletion even after "nein".
// Now the model can only propose; the tap is the answer (docs/UX-PRINCIPLES.md §18 — the
// library's confirm sheet, in the conversation).
//
// Deleting a sheet cannot be taken back, so the card says the name of what would go, and the
// dangerous button says exactly what it does. It is the thread's one card (`ChatCard`) in the
// design's confirm shape (components/buddy/Cards.jsx `ConfirmCard`, destructive): the blush
// tile, the danger ink on a paper pill — never a red fill, never the violet button — and
// "Behalten" as the ghost beside it.

import type { ActionSummary } from '@learnbuddy/shared-types/contracts';
import { useState } from 'react';
import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { answerConfirmation } from '../../lib/api/endpoints.js';
import { useAnnounce } from '../../lib/announce.js';
import { messageFor } from '../../lib/errors.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn, MAX_FONT_SCALE } from '../lb/Btn.js';
import { toast } from '../lb/Toast.js';
import { CardChoices, CardDone, ChatCard } from '../buddy/ChatCard.js';

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

  const title = t(`buddy:confirm.${what}_title`);
  // What was decided stays in the card it was asked in (Cards.jsx:42–43).
  if (settled) {
    return (
      <ChatCard tone="warn" icon="trash" title={title} detail={name || null} detailLines={3}>
        <CardDone>{settled}</CardDone>
      </ChatCard>
    );
  }

  const destroy = t(`buddy:confirm.${what}_delete`);
  return (
    <ChatCard
      tone="warn"
      icon="trash"
      title={title}
      heading
      // The name of what would go, at most three lines of it.
      detail={name || null}
      detailLines={3}
    >
      {/* Said once, plainly: this is the part that cannot be taken back. */}
      <Text style={TYPE.meta}>{t(`buddy:confirm.${what}_body`)}</Text>
      <CardChoices>
        {/* The dangerous button says exactly what it does, never just "Ja" — in the danger ink
            on paper, never a red fill (Cards.jsx:34, :46); keeping it is the quiet way out. */}
        <Btn
          variant="secondary"
          size="sm"
          busy={busy === 'yes'}
          disabled={busy === 'no'}
          onPress={() => void answer(true)}
          label={
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={MAX_FONT_SCALE}
              style={[TYPE.action, { color: palette.danger }]}
            >
              {destroy}
            </Text>
          }
        >
          {destroy}
        </Btn>
        <Btn
          variant="ghost"
          size="sm"
          busy={busy === 'no'}
          disabled={busy === 'yes'}
          onPress={() => void answer(false)}
        >
          {t('buddy:confirm.keep')}
        </Btn>
      </CardChoices>
    </ChatCard>
  );
}
