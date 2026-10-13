// One thing Buddy keeps: the statement, until when it counts (temporary
// ones), where it came from (the learner's own words), and the two ways to
// correct it. Editing happens in place; the screen does the saving.

import type { MemoryView } from '@learnbuddy/shared-types/contracts';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { UI } from '../../lib/theme/components.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { SPACE } from '../../lib/theme/space.js';
import { formatLastDay } from '../../lib/time.js';
import { Btn } from '../lb/Btn.js';
import { Row, ListGroup } from '../lb/ListGroup.js';
import { Sheet } from '../lb/Sheet.js';
import { SHEET_SWAP_MS } from '../buddy/StartSheets.js';
import { LbTextInput, type LbTextInputRef } from '../lb/LbTextInput.js';

/** UpdateMemoryRequest allows 1–300 characters (trimmed). */
const STATEMENT_MAX = 300;

type Props = {
  memory: MemoryView;
  groupStart?: boolean;
  groupEnd?: boolean;
  temporary: boolean;
  editing: boolean;
  draft: string;
  /** This entry is being saved. */
  saving: boolean;
  /** Some entry is being saved: no second change meanwhile. */
  locked: boolean;
  onDraft: (text: string) => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onRemove: () => void;
  onInputFocus: (input: LbTextInputRef | null) => void;
};

export function MemoryItem({
  memory,
  groupStart = true,
  groupEnd = true,
  temporary,
  editing,
  draft,
  saving,
  locked,
  onDraft,
  onEdit,
  onCancel,
  onSave,
  onRemove,
  onInputFocus,
}: Props) {
  const { palette } = useTheme();
  const { t, i18n } = useTranslation('memory');
  const input = useRef<LbTextInputRef>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = useRef({ id: memory.id, locked, onEdit, onRemove });
  current.current = { id: memory.id, locked, onEdit, onRemove };
  useEffect(() => {
    setMenuOpen(false);
    return () => {
      if (pending.current !== null) clearTimeout(pending.current);
      pending.current = null;
    };
  }, [memory.id]);

  const next = draft.trim();
  const canSave =
    !saving && next.length > 0 && next.length <= STATEMENT_MAX && next !== memory.statement;
  const source =
    memory.source === 'learner_stated'
      ? memory.quote
        ? t('source.learner_stated', { quote: memory.quote })
        : t('source.learner_stated_plain')
      : t(`source.${memory.source}`);

  const until =
    temporary && memory.valid_until
      ? t('until', { date: formatLastDay(memory.valid_until, i18n.language) })
      : '';
  const choose = (action: 'edit' | 'remove') => {
    if (current.current.locked || pending.current !== null) return;
    const id = memory.id;
    setMenuOpen(false);
    const timer = setTimeout(() => {
      if (pending.current !== timer) return;
      pending.current = null;
      if (current.current.id !== id || current.current.locked) return;
      if (action === 'edit') current.current.onEdit();
      else current.current.onRemove();
    }, SHEET_SWAP_MS);
    pending.current = timer;
  };
  return (
    <>
      <View
        style={{
          backgroundColor: palette.paper,
          borderTopLeftRadius: groupStart ? RADIUS.lg : 0,
          borderTopRightRadius: groupStart ? RADIUS.lg : 0,
          borderBottomLeftRadius: groupEnd ? RADIUS.lg : 0,
          borderBottomRightRadius: groupEnd ? RADIUS.lg : 0,
          borderBottomWidth: groupEnd ? 0 : UI.border,
          borderBottomColor: palette.hairline,
          overflow: 'hidden',
        }}
      >
        {editing ? (
          <View style={{ padding: SPACE.lg, gap: SPACE.sm }}>
            <LbTextInput
              ref={input}
              value={draft}
              onChangeText={onDraft}
              onFocus={() => onInputFocus(input.current)}
              autoFocus
              multiline
              maxLength={STATEMENT_MAX}
              editable={!saving}
              accessibilityLabel={t('edit_input')}
            />
            <Text style={[TYPE.meta, { color: palette.ink2 }]}>{source}</Text>
            <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
              <Btn size="sm" onPress={onSave} disabled={!canSave}>
                {t('save')}
              </Btn>
              <Btn size="sm" variant="ghost" onPress={onCancel} disabled={saving}>
                {t('cancel')}
              </Btn>
            </View>
          </View>
        ) : (
          <Row
            indicator="more"
            title={memory.statement}
            sub={[until, source].filter(Boolean).join(' ')}
            onPress={() => {
              if (pending.current === null) setMenuOpen(true);
            }}
            disabled={locked}
          />
        )}
      </View>
      <Sheet
        visible={menuOpen}
        // The sheet is about this one thing: it carries its words (ui_kits/app/More.jsx:39–44).
        title={memory.statement}
        closeLabel={t('cancel')}
        onClose={() => setMenuOpen(false)}
      >
        <ListGroup>
          <Row
            icon="pencil"
            chevron={false}
            title={t('edit')}
            accessibilityLabel={t('edit_a11y', { statement: memory.statement })}
            onPress={() => choose('edit')}
            disabled={locked}
          />
          <Row
            icon="trash"
            iconTone="accent"
            destructive
            chevron={false}
            title={t('remove')}
            accessibilityLabel={t('remove_a11y', { statement: memory.statement })}
            onPress={() => choose('remove')}
            disabled={locked}
          />
        </ListGroup>
      </Sheet>
    </>
  );
}
