// One thing Buddy keeps: the statement, until when it counts (temporary
// ones), where it came from (the learner's own words), and the two ways to
// correct it. Editing happens in place; the screen does the saving.

import type { MemoryView } from '@learnbuddy/shared-types/contracts';
import { useRef } from 'react';
import { Text, View, type TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';

import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';
import { formatLastDay } from '../../lib/time.js';
import { Btn } from '../lb/Btn.js';
import { Card } from '../lb/Card.js';
import { LbTextInput } from '../lb/LbTextInput.js';

/** UpdateMemoryRequest allows 1–300 characters (trimmed). */
export const STATEMENT_MAX = 300;

type Props = {
  memory: MemoryView;
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
  onInputFocus: (input: TextInput | null) => void;
};

export function MemoryItem({
  memory,
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
  const { t, i18n } = useTranslation('memory');
  const input = useRef<TextInput>(null);

  const next = draft.trim();
  const canSave =
    !saving && next.length > 0 && next.length <= STATEMENT_MAX && next !== memory.statement;
  const source =
    memory.source === 'learner_stated'
      ? memory.quote
        ? t('source.learner_stated', { quote: memory.quote })
        : t('source.learner_stated_plain')
      : t(`source.${memory.source}`);

  return (
    <Card tone={temporary ? 'butter' : 'lavender'} padding={18} radius={20}>
      <View style={{ gap: 8 }}>
        {editing ? (
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
            style={{
              height: undefined,
              minHeight: 52,
              paddingTop: 14,
              paddingBottom: 14,
              fontSize: 16,
              lineHeight: 22,
              textAlignVertical: 'top',
              backgroundColor: LB.paper,
            }}
          />
        ) : (
          <Text style={[TYPE.body, { fontWeight: '600' }]}>{memory.statement}</Text>
        )}
        {temporary && memory.valid_until ? (
          <Text style={TYPE.body}>
            {t('until', { date: formatLastDay(memory.valid_until, i18n.language) })}
          </Text>
        ) : null}
        <Text style={[TYPE.body, { color: LB.ink2 }]}>{source}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
          {editing ? (
            <>
              <Btn size="sm" onPress={onSave} disabled={!canSave}>
                {t('save')}
              </Btn>
              <Btn size="sm" variant="ghost" onPress={onCancel} disabled={saving}>
                {t('cancel')}
              </Btn>
            </>
          ) : (
            <>
              <Btn
                size="sm"
                variant="outline"
                onPress={onEdit}
                disabled={locked}
                accessibilityLabel={t('edit_a11y', { statement: memory.statement })}
              >
                {t('edit')}
              </Btn>
              <Btn
                size="sm"
                variant="ghost"
                onPress={onRemove}
                disabled={locked}
                accessibilityLabel={t('remove_a11y', { statement: memory.statement })}
              >
                {t('remove')}
              </Btn>
            </>
          )}
        </View>
      </View>
    </Card>
  );
}
