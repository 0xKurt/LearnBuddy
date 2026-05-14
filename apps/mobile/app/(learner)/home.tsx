// Home — warm greeting, subject grid. Doc 05 §home + handoff ScreenHomeKid.
// No pending counter. No "must do" copy.
import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, Chip, EmptyState, Icon, SubjectGlyph } from '../../components/lb/index.js';
import { LB, TONE_BG, type SubjectTone } from '../../lib/theme/colors.js';

type DemoSubject = {
  id: string;
  name: string;
  glyph: string;
  tone: SubjectTone;
  upcoming_test_in_days?: number;
};

// Static demo data so the screen renders. Real data lands when the
// learners/subjects endpoint is wired in Step 13+.
const DEMO_SUBJECTS: DemoSubject[] = [
  { id: 'mathe', name: 'Mathematik', glyph: '📐', tone: 'lavender', upcoming_test_in_days: 3 },
  { id: 'bio', name: 'Biologie', glyph: '🌱', tone: 'mint' },
  { id: 'deutsch', name: 'Deutsch', glyph: '📖', tone: 'peach' },
  { id: 'englisch', name: 'Englisch', glyph: '🗣️', tone: 'sky' },
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 11) return 'Guten Morgen';
  if (h < 18) return 'Hallo';
  return 'Schönen Abend';
}

export default function HomeScreen() {
  const subjects = DEMO_SUBJECTS;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 24 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 8,
            marginBottom: 18,
          }}
        >
          <Pressable
            onPress={() => router.push('/(admin)/unlock')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
          >
            <Avatar name="Lena" tone="lavender" size={42} />
            <View>
              <Text style={{ fontSize: 12, color: LB.ink3, fontWeight: '500' }}>{greeting()}</Text>
              <Text style={{ fontSize: 16, fontWeight: '600', color: LB.ink, letterSpacing: -0.3 }}>
                Lena
              </Text>
            </View>
          </Pressable>
        </View>

        {subjects.length === 0 ? (
          <EmptyState
            glyph="🌱"
            title="Noch keine Fächer."
            body="Leg ein Fach an oder fotografier dein erstes Material — wir kümmern uns um den Rest."
          />
        ) : (
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              rowGap: 12,
            }}
          >
            {subjects.map((s) => (
              <SubjectTile key={s.id} subject={s} />
            ))}
            <AddSubjectTile />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SubjectTile({ subject }: { subject: DemoSubject }) {
  return (
    <Pressable
      onPress={() => router.push(`/(learner)/subject/${subject.id}`)}
      style={{
        width: '48%',
        backgroundColor: TONE_BG[subject.tone],
        borderRadius: 18,
        padding: 16,
        minHeight: 130,
        justifyContent: 'space-between',
      }}
    >
      <SubjectGlyph glyph={subject.glyph} />
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: LB.ink, letterSpacing: -0.2 }}>
          {subject.name}
        </Text>
        {subject.upcoming_test_in_days != null && (
          <Chip tone="warning">{`Test in ${subject.upcoming_test_in_days} Tagen`}</Chip>
        )}
      </View>
    </Pressable>
  );
}

function AddSubjectTile() {
  return (
    <Pressable
      onPress={() => {}}
      style={{
        width: '48%',
        borderRadius: 18,
        padding: 16,
        minHeight: 130,
        borderColor: LB.hairline,
        borderWidth: 1,
        borderStyle: 'dashed',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}
    >
      <Icon name="plus" size={24} color={LB.ink3} />
      <Text style={{ fontSize: 13, color: LB.ink3, fontWeight: '500' }}>Fach hinzufügen</Text>
    </Pressable>
  );
}
