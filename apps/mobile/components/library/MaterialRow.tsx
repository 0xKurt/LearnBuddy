// A sheet's row in a list card (ui_kits/app/Library.jsx:8–16,31–33; More.jsx:70–71): its name,
// one quiet line about it, and at its end the 32 pt pill that starts it — or the chevron while
// there is nothing to start. Opening the row and starting are separate targets (#548).
import type { MaterialView } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';

import type { SubjectTone } from '../../lib/theme/palettes.js';
import { formatDate } from '../../lib/time.js';
import { Row } from '../lb/ListGroup.js';
import { materialPrimaryOf, materialStatusOf } from './materialPresentation.js';

export function MaterialRow({
  material,
  tone,
  busy,
  disabled,
  onOpen,
  onStart,
  accessibilityLabel,
}: {
  material: MaterialView;
  /**
   * Inside its subject: the subject's tone as a tile with the sheet sign, and the day it came.
   * Without it (the newest sheets across subjects) the row is its name and what it holds.
   */
  tone?: SubjectTone;
  busy: boolean;
  disabled: boolean;
  onOpen: () => void;
  onStart: (mode: 'practice' | 'speak') => void;
  accessibilityLabel?: string;
}) {
  const { t, i18n } = useTranslation('library');
  const title = material.title ?? t('untitled');
  const status = materialStatusOf(material);
  const { action } = materialPrimaryOf(material);
  const ready = material.status === 'ready';
  const detail = ready
    ? t('questions', { count: material.item_count })
    : status
      ? t(`status.${status.key}`)
      : '';
  const day = tone ? formatDate(material.created_at, i18n.language) : '';
  return (
    <Row
      icon={tone ? 'file' : undefined}
      tile={tone ? { letter: title.slice(0, 1), tone } : undefined}
      title={title}
      sub={[day, detail].filter(Boolean).join(' · ')}
      onPress={onOpen}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel ?? t('open_label', { title })}
      action={
        ready
          ? {
              label: t(action),
              accessibilityLabel: t(`${action}_label`, { title }),
              busy,
              disabled,
              onPress: () => onStart(action === 'speak' ? 'speak' : 'practice'),
            }
          : undefined
      }
    />
  );
}
