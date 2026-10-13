// One sheet inside its subject and what can be done with it (ui_kits/app/More.jsx:70–71,82–87):
// the row opens a sheet that carries the sheet's name and its actions — never a button in the row
// beyond the one that starts it. Existing Library rules stay authoritative.
import {
  FINAL_FAILURES,
  PHOTOS_GONE_AT_ONCE,
  type MaterialView,
} from '@learnbuddy/shared-types/contracts';
import { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { TYPE } from '../../lib/theme/type.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import type { SubjectTone } from '../../lib/theme/palettes.js';
import { SHEET_SWAP_MS } from '../buddy/StartSheets.js';
import { ListGroup, Row } from '../lb/ListGroup.js';
import { Sheet, SHEET_TEXT } from '../lb/Sheet.js';
import { MaterialRow } from './MaterialRow.js';
import { materialPrimaryOf } from './materialPresentation.js';

type Props = {
  material: MaterialView;
  /** Its subject's tone, for the tile before its name. */
  tone: SubjectTone;
  busy: boolean;
  disabled: boolean;
  onPractice: () => void;
  onSpeak: () => void;
  onOpen: () => void;
  onRetry: () => void;
  onDelete: () => void;
};
export function MaterialCard({
  material: m,
  tone,
  busy,
  disabled,
  onPractice,
  onSpeak,
  onOpen,
  onRetry,
  onDelete,
}: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation('library');
  const [menuOpen, setMenuOpen] = useState(false);
  const title = m.title ?? t('untitled');
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = useRef({
    id: m.id,
    disabled,
    busy,
    onPractice,
    onSpeak,
    onOpen,
    onRetry,
    onDelete,
  });
  current.current = { id: m.id, disabled, busy, onPractice, onSpeak, onOpen, onRetry, onDelete };
  useEffect(() => {
    setMenuOpen(false);
    return () => {
      if (pending.current !== null) clearTimeout(pending.current);
      pending.current = null;
    };
  }, [m.id]);
  // The photos are gone (7 days after reading): reading again is not possible, only a new photo.
  // Where they go at once by design, the reason says more than their absence does.
  const note =
    m.status === 'failed' &&
    m.photos_deleted &&
    !(m.failure_reason && PHOTOS_GONE_AT_ONCE.has(m.failure_reason))
      ? t('photos_deleted')
      : m.status === 'failed'
        ? t(`failure.${m.failure_reason ?? 'model_error'}`)
        : m.status === 'awaiting_upload'
          ? t('incomplete_hint')
          : null;
  // Tasks on the sheet that got no exercises, because their form is not one Buddy can
  // practise (issue #198). A quiet line next to the note: unsaid, the sheet would look
  // whole while the exercise she photographed never happened.
  const missed =
    m.not_practicable.length > 0
      ? t('not_practicable', {
          count: m.not_practicable.length,
          tasks: m.not_practicable.map((n) => n.task).join(' · '),
        })
      : null;
  // Sentences on this sheet to read aloud (issue #223 point 2). They are never part of an
  // ordinary practice — the microphone has no place in the middle of typing — so the sheet
  // offers them separately, and only when it has them.
  const { speakable, spokenOnly } = materialPrimaryOf(m);
  // Reading it again would give the same answer: the API refuses it (FINAL_FAILURES).
  const retryable =
    m.status === 'failed' &&
    !(m.failure_reason && FINAL_FAILURES.has(m.failure_reason)) &&
    !m.photos_deleted;

  const available = () =>
    pending.current === null && !current.current.disabled && !current.current.busy;
  const choose = (action: 'onOpen' | 'onSpeak' | 'onRetry' | 'onDelete') => {
    if (!available()) return;
    const id = m.id;
    setMenuOpen(false);
    pending.current = setTimeout(() => {
      pending.current = null;
      const now = current.current;
      if (now.id === id && !now.disabled && !now.busy) now[action]();
    }, SHEET_SWAP_MS);
  };
  return (
    <>
      <MaterialRow
        material={m}
        tone={tone}
        // The row opens what can be done with the sheet, so it is named by the sheet alone.
        accessibilityLabel={title}
        busy={busy}
        disabled={disabled}
        onOpen={() => {
          if (available()) setMenuOpen(true);
        }}
        onStart={(mode) => {
          if (available()) current.current[mode === 'speak' ? 'onSpeak' : 'onPractice']();
        }}
      />
      <Sheet
        visible={menuOpen}
        title={title}
        closeLabel={t('common:actions.close')}
        onClose={() => setMenuOpen(false)}
      >
        {note ? <Text style={[TYPE.body, SHEET_TEXT, { color: palette.ink2 }]}>{note}</Text> : null}
        {missed ? (
          <Text style={[TYPE.body, SHEET_TEXT, { color: palette.ink2 }]}>{missed}</Text>
        ) : null}
        <ListGroup>
          {m.status === 'ready' ? (
            <Row
              icon="sparkle"
              title={t('open')}
              onPress={() => choose('onOpen')}
              disabled={disabled}
            />
          ) : null}
          {m.status === 'ready' && speakable && !spokenOnly ? (
            <Row
              icon="mic"
              chevron={false}
              title={t('speak')}
              accessibilityLabel={t('speak_label', { title })}
              onPress={() => choose('onSpeak')}
              disabled={disabled}
            />
          ) : null}
          {retryable ? (
            <Row
              icon="arrow"
              chevron={false}
              title={t('retry')}
              accessibilityLabel={t('retry_label', { title })}
              onPress={() => choose('onRetry')}
              disabled={disabled}
            />
          ) : null}
          <Row
            icon="trash"
            iconTone="accent"
            destructive
            chevron={false}
            title={t('delete')}
            accessibilityLabel={t('delete_label', { title })}
            onPress={() => choose('onDelete')}
            disabled={disabled}
          />
        </ListGroup>
      </Sheet>
    </>
  );
}
