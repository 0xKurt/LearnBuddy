import { READ_WITHOUT_EXERCISES, type MaterialView } from '@learnbuddy/shared-types/contracts';
export type MaterialStatus = {
  key: 'reading' | 'unreadable' | 'not_read' | 'incomplete' | 'no_exercises';
  tone: 'gray' | 'primary' | 'warning';
};

export function materialStatusOf(m: MaterialView): MaterialStatus | null {
  switch (m.status) {
    case 'ready':
      return null;
    case 'queued':
    case 'processing':
      return { key: 'reading', tone: 'primary' };
    case 'awaiting_upload':
      return { key: 'incomplete', tone: 'gray' };
    case 'failed':
      // "nicht lesbar" only when that is what the reading found — and a sheet whose tasks
      // are exercise forms Buddy cannot practise WAS read (issue #198), as was a corrected test
      // with nothing marked (#259): it has no exercises, and that is no warning about her photo.
      if (m.failure_reason && READ_WITHOUT_EXERCISES.has(m.failure_reason))
        return { key: 'no_exercises', tone: 'gray' };
      return {
        key: m.failure_reason === 'unreadable' ? 'unreadable' : 'not_read',
        tone: 'warning',
      };
  }
}

export function materialPrimaryOf(m: MaterialView) {
  const speakable = m.purpose !== 'homework' && m.speak_count > 0;
  const spokenOnly = speakable && m.speak_count >= m.item_count;
  const action =
    m.purpose !== 'homework'
      ? spokenOnly
        ? 'speak'
        : 'practice'
      : m.session_status === 'finished'
        ? 'homework_view'
        : 'homework_continue';
  return { action, speakable, spokenOnly } as const;
}
