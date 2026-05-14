// Session screen — formula variant. Matches handoff ScreenSessionFormula.
// Doc 05 §session. Stub answer flow until /sessions + /attempts wire up.
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn, Card, Chip, SessionTopBar } from '../../../components/lb/index.js';
import { LB } from '../../../lib/theme/colors.js';

const KEYS: string[][] = [
  ['7', '8', '9', '÷', 'x²', '('],
  ['4', '5', '6', '×', 'xⁿ', ')'],
  ['1', '2', '3', '−', '√', 'π'],
  ['0', ',', '=', '+', 'Δ', '⌫'],
];

export default function SessionScreen() {
  const params = useLocalSearchParams<{ sessionId: string }>();
  const [answer, setAnswer] = useState('x = 4');

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
      <SessionTopBar
        progress={0.28}
        index="5 / 18"
        badge="Mathe"
        onExit={() => router.back()}
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
        <Card tone="lavender" padding={20}>
          <Text
            style={{
              fontSize: 11,
              color: LB.ink2,
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: 0.6,
            }}
          >
            Aufgabe
          </Text>
          <Text style={{ fontSize: 15, color: LB.ink, marginTop: 4 }}>Löse die Gleichung.</Text>
          <Text
            style={{
              fontSize: 36,
              fontWeight: '600',
              color: LB.ink,
              textAlign: 'center',
              marginTop: 18,
              letterSpacing: -1,
            }}
          >
            2x + 7 = 15
          </Text>
        </Card>

        <View
          style={{
            marginTop: 14,
            padding: 16,
            backgroundColor: '#fff',
            borderRadius: 14,
            borderColor: LB.hairline,
            borderWidth: 1,
          }}
        >
          <Text
            style={{
              fontSize: 11,
              color: LB.ink3,
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              marginBottom: 4,
            }}
          >
            Deine Antwort
          </Text>
          <Text style={{ fontSize: 26, fontWeight: '600', color: LB.ink }}>{answer}</Text>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 12,
            }}
          >
            <Chip tone="success">erkannt</Chip>
            <Btn size="sm" onPress={() => router.push('/(learner)/result')}>
              Senden
            </Btn>
          </View>
        </View>

        <View
          style={{
            marginTop: 16,
            backgroundColor: LB.bg,
            borderRadius: 14,
            padding: 10,
            borderColor: LB.hairline,
            borderWidth: 1,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 6 }}>
            <Text
              style={{
                fontSize: 10,
                color: LB.ink3,
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: 0.6,
              }}
            >
              Mathe-Tastatur
            </Text>
            <Text style={{ fontSize: 10, color: LB.ink2, fontWeight: '600' }}>MEHR</Text>
          </View>
          {KEYS.map((row, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 4, marginTop: 4 }}>
              {row.map((k) => (
                <Pressable
                  key={k}
                  onPress={() => handleKey(k, answer, setAnswer)}
                  style={{
                    flex: 1,
                    height: 36,
                    borderRadius: 8,
                    backgroundColor: '#fff',
                    borderColor: LB.hairline,
                    borderWidth: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '500', color: LB.ink }}>{k}</Text>
                </Pressable>
              ))}
            </View>
          ))}
        </View>

        <Text style={{ fontSize: 10, color: LB.ink3, marginTop: 16 }}>session: {params.sessionId}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function handleKey(key: string, current: string, set: (s: string) => void) {
  if (key === '⌫') {
    set(current.slice(0, -1));
    return;
  }
  set(current + key);
}
