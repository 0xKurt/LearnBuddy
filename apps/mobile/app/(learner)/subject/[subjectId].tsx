// Subject — tabs Ordner | Material, floating Üben/Neu actions.
// Matches handoff ScreenSubject. Doc 05 §subject.
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn, Card, Chip, CircleBtn, Icon, SubjectGlyph } from '../../../components/lb/index.js';
import { LB } from '../../../lib/theme/colors.js';

type Tab = 'ordner' | 'material';

type FolderRow = { id: string; name: string; meta: string; testIn?: number };
type MaterialRow = { id: string; title: string; meta: string };

const DEMO_FOLDERS: FolderRow[] = [
  { id: 'klassenarbeit', name: 'Klassenarbeit 14.06.', meta: '8 Materialien · Funktionen, Gleichungen', testIn: 3 },
  { id: 'kap5', name: 'Kapitel 5 · Funktionen', meta: '4 Materialien' },
  { id: 'kap4', name: 'Kapitel 4 · Brüche', meta: '2 Materialien' },
];

const DEMO_MATERIALS: MaterialRow[] = [
  { id: 'm1', title: 'Übungsblatt 12', meta: 'gestern · 6 Fragen' },
  { id: 'm2', title: 'Buch S. 78–79', meta: '2 Tage · 9 Fragen' },
  { id: 'm3', title: 'Mitschrift', meta: '4 Tage · 4 Fragen' },
];

export default function SubjectScreen() {
  const { subjectId } = useLocalSearchParams<{ subjectId: string }>();
  const [tab, setTab] = useState<Tab>('ordner');

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingVertical: 12,
        }}
      >
        <CircleBtn icon="back" onPress={() => router.back()} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <SubjectGlyph glyph="📐" size={24} />
          <Text style={{ fontSize: 14, fontWeight: '600', color: LB.ink }}>{subjectId}</Text>
        </View>
        <CircleBtn icon="more" />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}>
        <Text style={{ fontSize: 24, fontWeight: '600', color: LB.ink, letterSpacing: -0.5 }}>
          Mathematik
        </Text>
        <Text style={{ fontSize: 12, color: LB.ink2, marginTop: 2 }}>
          14 Materialien · zuletzt gestern 17:42
        </Text>

        <View
          style={{
            flexDirection: 'row',
            gap: 4,
            padding: 4,
            backgroundColor: '#fff',
            borderColor: LB.hairline,
            borderWidth: 1,
            borderRadius: 12,
            marginVertical: 14,
            alignSelf: 'flex-start',
          }}
        >
          <TabBtn label="Ordner" count={DEMO_FOLDERS.length} active={tab === 'ordner'} onPress={() => setTab('ordner')} />
          <TabBtn label="Material" count={DEMO_MATERIALS.length} active={tab === 'material'} onPress={() => setTab('material')} />
        </View>

        {tab === 'ordner' ? (
          <View style={{ gap: 8 }}>
            {DEMO_FOLDERS.map((f) => (
              <FolderCard key={f.id} folder={f} />
            ))}
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {DEMO_MATERIALS.map((m) => (
              <MaterialCard key={m.id} material={m} />
            ))}
          </View>
        )}
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          left: 20,
          right: 20,
          bottom: 12,
          flexDirection: 'row',
          gap: 8,
        }}
      >
        <View style={{ flex: 1 }}>
          <Btn size="lg" full variant="outline" onPress={() => router.push('/(learner)/capture')}>
            Neu
          </Btn>
        </View>
        <View style={{ flex: 2 }}>
          <Btn size="lg" full onPress={() => router.push('/(learner)/session/demo')}>
            Üben starten
          </Btn>
        </View>
      </View>
    </SafeAreaView>
  );
}

function TabBtn({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: active ? LB.primary : 'transparent',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : LB.ink2 }}>{label}</Text>
      <Text
        style={{
          fontSize: 12,
          fontWeight: '500',
          color: active ? '#fff' : LB.ink2,
          opacity: 0.7,
        }}
      >
        {count}
      </Text>
    </Pressable>
  );
}

function FolderCard({ folder }: { folder: FolderRow }) {
  return (
    <Card padding={14}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 10, flex: 1 }}>
          <Icon name="folder" size={20} color={folder.testIn != null ? LB.primary : LB.ink3} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: LB.ink }}>{folder.name}</Text>
            <Text style={{ fontSize: 11, color: LB.ink2, marginTop: 1 }}>{folder.meta}</Text>
          </View>
        </View>
        {folder.testIn != null && <Chip tone="warning">{`Test in ${folder.testIn} Tagen`}</Chip>}
      </View>
    </Card>
  );
}

function MaterialCard({ material }: { material: MaterialRow }) {
  return (
    <Card padding={12}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View
          style={{
            width: 46,
            height: 56,
            borderRadius: 8,
            backgroundColor: LB.bg,
            borderColor: LB.hairline,
            borderWidth: 1,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="folder" size={18} color={LB.ink3} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: LB.ink }}>{material.title}</Text>
          <Text style={{ fontSize: 11, color: LB.ink2 }}>{material.meta}</Text>
        </View>
        <Icon name="chevron" size={16} color={LB.ink3} />
      </View>
    </Card>
  );
}
