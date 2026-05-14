// Result — calm summary, no pressure. Matches handoff ScreenResult.
// Doc 05 §result.
import { router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn, Card, Chip } from '../../components/lb/index.js';
import { LB, TONE_BG } from '../../lib/theme/colors.js';

type Stat = {
  label: string;
  value: string | number;
  tone: 'mint' | 'sky' | 'butter' | 'blush';
  caption?: string;
};

const STATS: Stat[] = [
  { label: 'geübt', value: 18, tone: 'mint' },
  { label: 'jetzt sicher', value: 11, tone: 'sky' },
  { label: 'noch unsicher', value: 4, tone: 'butter' },
  { label: 'Streak', value: 7, tone: 'blush', caption: 'Tage in Folge' },
];

export default function ResultScreen() {
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 }}>
        <Text
          style={{
            fontSize: 11,
            color: LB.ink3,
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          Heute · 15:42
        </Text>
        <Text
          style={{
            fontSize: 26,
            fontWeight: '600',
            color: LB.ink,
            marginVertical: 4,
            letterSpacing: -0.5,
          }}
        >
          Heute geübt — fein gemacht.
        </Text>
        <Text style={{ fontSize: 13, color: LB.ink2 }}>15 Minuten · 18 Aufgaben</Text>

        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            marginTop: 18,
            rowGap: 10,
          }}
        >
          {STATS.map((s) => (
            <StatCard key={s.label} stat={s} />
          ))}
        </View>

        <Card padding={14} style={{ marginTop: 10 }}>
          <Text
            style={{
              fontSize: 11,
              color: LB.ink3,
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            Stoff diese Woche
          </Text>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            <Chip tone="success">Lineare Gleichungen</Chip>
            <Chip tone="success">Funktionen</Chip>
            <Chip tone="warning">Quadratische Funktionen</Chip>
          </View>
        </Card>

        <View style={{ gap: 8, marginTop: 18 }}>
          <Btn size="lg" full onPress={() => router.replace('/(learner)/home')}>
            Nochmal mit den schwierigen
          </Btn>
          <Btn size="md" full variant="ghost" onPress={() => router.replace('/(learner)/home')}>
            Zur Übersicht
          </Btn>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ stat }: { stat: Stat }) {
  return (
    <View
      style={{
        width: '48%',
        backgroundColor: TONE_BG[stat.tone],
        borderRadius: 14,
        padding: 14,
      }}
    >
      <Text style={{ fontSize: 11, color: LB.ink2, fontWeight: '500' }}>{stat.label}</Text>
      <Text style={{ fontSize: 32, fontWeight: '600', color: LB.ink, marginTop: 2 }}>{stat.value}</Text>
      {stat.caption && (
        <Text style={{ fontSize: 11, color: LB.ink2, marginTop: -2 }}>{stat.caption}</Text>
      )}
    </View>
  );
}
