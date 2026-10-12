// The library query is mounted only through the open Profile editor's registered slot.
import { useLibrary } from '../../lib/api/libraryQueries.js';
import { ProfileSubjects } from '../settings/ProfileSubjects.js';
import { SubjectCard } from './SubjectCard.js';
import { byActivity, hasSomething } from './subjects.js';

export function ProfileLibrarySubjects({ onOpenSubject }: { onOpenSubject: (id: string) => void }) {
  const library = useLibrary();
  const subjects = library.data?.subjects.filter(hasSomething).sort(byActivity) ?? [];
  return (
    <ProfileSubjects
      loading={!library.data}
      error={library.error}
      onRetry={() => void library.refetch()}
      cards={subjects.map((subject) => (
        <SubjectCard
          key={subject.id}
          name={subject.name}
          subject={subject}
          onPress={() => onOpenSubject(subject.id)}
        />
      ))}
    />
  );
}
