// ExplainModal — "Erklär mir das" bottom-sheet on every item.
// Doc 04 §POST /explain + USER-FLOWS-DEEP §1.6.
//
// Two tabs swap the `style` argument on the explain call:
//   - "Was bedeutet die Frage?" → style='simpler' (re-state the prompt in
//     plainer language, no concept teaching).
//   - "Erklär das Konzept" → style='step-by-step' (concept walk-through).
//
// We keep `analogy` in the wrapper signature for future expansion but the
// modal only surfaces the two tabs the deep-flow spec calls for. Each tap
// triggers a fresh request; loading and error states stay local so the
// parent doesn't have to babysit them.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { explainTopic } from '../../lib/api/sessions.js';
import { LB } from '../../lib/theme/colors.js';
import { Btn } from './Btn.js';

type ExplainStyle = 'simpler' | 'step-by-step';

type TabDef = {
  key: ExplainStyle;
  labelKey: string;
};

const TABS: readonly TabDef[] = [
  { key: 'simpler', labelKey: 'tabs.question' },
  { key: 'step-by-step', labelKey: 'tabs.concept' },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  learnerId: string;
  /** Item being explained. We pass `item.question` as the `topic` and the
   *  item id so the server can attribute credits to the right item. */
  itemId: string;
  topic: string;
  /** Extra context for the LLM — e.g. the kid's last hint or the source
   *  excerpt. Sent as the `context` field per Doc 04 §explain. */
  context?: string;
};

export function ExplainModal({ visible, onClose, learnerId, itemId, topic, context }: Props) {
  const { t } = useTranslation('session');
  const [activeTab, setActiveTab] = useState<ExplainStyle>('simpler');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);

  const requestExplanation = async (style: ExplainStyle) => {
    setActiveTab(style);
    setLoading(true);
    setError(null);
    setText(null);
    try {
      const res = await explainTopic(learnerId, topic, style, context, itemId);
      setText(res.text);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setText(null);
    setError(null);
    setLoading(false);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable
        onPress={handleClose}
        accessibilityRole="button"
        accessibilityLabel={t('explain.close')}
        style={{
          flex: 1,
          backgroundColor: 'rgba(20,15,30,0.35)',
          justifyContent: 'flex-end',
        }}
      >
        <Pressable
          // Inner pressable swallows taps so they don't bubble to the backdrop.
          onPress={() => undefined}
          style={{
            backgroundColor: LB.paper,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingTop: 14,
            paddingHorizontal: 20,
            paddingBottom: 24,
            maxHeight: '80%',
          }}
        >
          {/* Handle */}
          <View
            style={{
              alignSelf: 'center',
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: LB.ink4,
              marginBottom: 14,
            }}
          />

          <Text
            style={{
              fontSize: 20,
              fontWeight: '600',
              color: LB.ink,
              letterSpacing: -0.4,
              marginBottom: 6,
            }}
          >
            {t('explain.title')}
          </Text>
          <Text style={{ fontSize: 13, color: LB.ink2, marginBottom: 16, lineHeight: 18 }}>
            {t('explain.subtitle')}
          </Text>

          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
            {TABS.map((tab) => {
              const isActive =
                activeTab === tab.key && (loading || text !== null || error !== null);
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => requestExplanation(tab.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    borderRadius: 16,
                    backgroundColor: isActive ? LB.primaryLt : '#fff',
                    borderColor: isActive ? LB.primaryDk : LB.hairline,
                    borderWidth: 1,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '600',
                      color: isActive ? LB.primaryDk : LB.ink,
                      textAlign: 'center',
                      letterSpacing: -0.1,
                    }}
                  >
                    {t(`explain.${tab.labelKey}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={{ minHeight: 120, marginBottom: 16 }}>
            {loading && (
              <View style={{ alignItems: 'center', paddingVertical: 28 }}>
                <ActivityIndicator color={LB.ink2} />
                <Text style={{ fontSize: 12, color: LB.ink2, marginTop: 10 }}>
                  {t('explain.loading')}
                </Text>
              </View>
            )}
            {error && !loading && (
              <View
                style={{
                  padding: 14,
                  borderRadius: 12,
                  backgroundColor: 'rgba(177,73,60,0.08)',
                  borderColor: 'rgba(177,73,60,0.20)',
                  borderWidth: 1,
                }}
              >
                <Text style={{ fontSize: 13, color: LB.danger, lineHeight: 19 }}>
                  {t('explain.error')}
                </Text>
              </View>
            )}
            {text && !loading && !error && (
              <ScrollView style={{ maxHeight: 360 }}>
                <Text style={{ fontSize: 15, color: LB.ink, lineHeight: 22 }}>{text}</Text>
              </ScrollView>
            )}
            {!text && !loading && !error && (
              <View style={{ paddingVertical: 18 }}>
                <Text style={{ fontSize: 13, color: LB.ink2, lineHeight: 19 }}>
                  {t('explain.hint')}
                </Text>
              </View>
            )}
          </View>

          <Btn full size="lg" variant="outline" onPress={handleClose}>
            {t('explain.close')}
          </Btn>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
