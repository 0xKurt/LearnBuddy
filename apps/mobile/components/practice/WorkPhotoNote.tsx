// What stands above her answer field while her photographed working is on its way into it (issue
// #444): the phone's check when the photo is hard to read (the sheet's own card), the reading, the
// ask to compare the copy with her book — or the line she still has to write herself — and why
// there is no copy. One line where she looks anyway; the copy itself is in the field.

import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useAnnounce } from '../../lib/announce.js';
import { copyNote, unreadText } from '../../lib/practice/workPhoto.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { PhotoCheckCard } from '../capture/PhotoCheckCard.js';
import { ErrorNote } from '../lb/ErrorNote.js';
import type { WorkPhoto } from './useWorkPhoto.js';

export function WorkPhotoNote({ photo, value }: { photo: WorkPhoto; value: string }) {
  const { t } = useTranslation('practice');
  const { palette } = useTheme();
  const { state } = photo;
  const note = copyNote(state, value);
  const line =
    state.step === 'reading'
      ? t('work.reading')
      : note === null
        ? null
        : note.key === 'work.unread'
          ? unreadText(t, note.lines)
          : t('work.read');
  useAnnounce(line);
  if (state.step === 'checking')
    return (
      <PhotoCheckCard
        index={1}
        problems={state.problems}
        disabled={false}
        onRetake={photo.take}
        onKeep={photo.keep}
      />
    );
  if (state.step === 'failed') return <ErrorNote text={state.text} />;
  if (line === null) return null;
  return (
    <Text testID="work-photo-note" style={[TYPE.small, { color: palette.ink2 }]}>
      {line}
    </Text>
  );
}
