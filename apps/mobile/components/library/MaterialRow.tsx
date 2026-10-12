// A material's grouped row: navigation and its primary action remain separate targets (#548).
import type { MaterialView } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../../lib/time.js';
import { Btn } from '../lb/Btn.js';
import { Row } from '../lb/ListGroup.js';
import { materialPrimaryOf, materialStatusOf } from './materialPresentation.js';

export function MaterialRow({
  material,
  busy,
  disabled,
  onOpen,
  onStart,
}: {
  material: MaterialView;
  busy: boolean;
  disabled: boolean;
  onOpen: () => void;
  onStart: (mode: 'practice' | 'speak') => void;
}) {
  const { t, i18n } = useTranslation('library');
  const title = material.title ?? t('untitled');
  const status = materialStatusOf(material);
  const { action } = materialPrimaryOf(material);
  const detail =
    material.status === 'ready'
      ? t('questions', { count: material.item_count })
      : status
        ? t(`status.${status.key}`)
        : '';
  return (
    <Row
      icon="book"
      title={title}
      sub={[formatDate(material.created_at, i18n.language), detail].filter(Boolean).join(' · ')}
      onPress={onOpen}
      disabled={disabled}
      accessibilityLabel={t('open_label', { title })}
      trailing={
        material.status === 'ready' ? (
          <Btn
            variant="quiet"
            size="sm"
            pill
            busy={busy}
            disabled={disabled}
            accessibilityLabel={t(`${action}_label`, { title })}
            onPress={() => onStart(action === 'speak' ? 'speak' : 'practice')}
          >
            {t(action)}
          </Btn>
        ) : undefined
      }
    />
  );
}
