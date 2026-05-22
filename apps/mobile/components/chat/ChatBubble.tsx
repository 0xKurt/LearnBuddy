// Chat bubble component for the agent-native tutoring interface.
// Supports streaming text, tool call visualization, and different bubble styles.

import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet, Animated, Pressable } from 'react-native';

export type BubbleRole = 'learner' | 'agent' | 'system' | 'tool';

export type ChatBubbleProps = {
  role: BubbleRole;
  content: string;
  isStreaming?: boolean;
  /** When true, the agent text pulses opacity 0.55 → 1.0 → 0.55 in a
   *  soft loop to signal "the tutor is reading this aloud right now."
   *  The chat screen sets it only on the latest agent bubble while
   *  audio playback is active. Visually pairs with the conv-button
   *  bar animation in the composer for a synchronised cue. */
  speaking?: boolean;
  verdict?: string | null;
  toolCall?: { name: string; args: Record<string, unknown> } | null;
  toolResult?: { name: string; result: unknown; error?: string } | null;
  onToolCallTap?: (name: string) => void;
};

export function ChatBubble({
  role,
  content,
  isStreaming = false,
  speaking = false,
  verdict,
  toolCall,
  toolResult,
  onToolCallTap,
}: ChatBubbleProps) {
  const { t } = useTranslation('home');
  const isLearner = role === 'learner';
  const isSystem = role === 'system';

  // Streaming cursor animation
  const cursorOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (isStreaming) {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(cursorOpacity, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(cursorOpacity, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ]),
      );
      anim.start();
      return () => anim.stop();
    }
  }, [isStreaming]);

  // Tutor-speaking text breath. 1.4s round-trip = ~one breath; reads as
  // alive without being distracting. Returns to 1.0 when speaking stops.
  const speakingOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (speaking) {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(speakingOpacity, {
            toValue: 0.55,
            duration: 700,
            useNativeDriver: true,
          }),
          Animated.timing(speakingOpacity, {
            toValue: 1,
            duration: 700,
            useNativeDriver: true,
          }),
        ]),
      );
      anim.start();
      return () => {
        anim.stop();
        speakingOpacity.setValue(1);
      };
    }
    speakingOpacity.setValue(1);
  }, [speaking, speakingOpacity]);

  const verdictLabel = (v: string): string => {
    switch (v) {
      case 'correct':
        return t('chat.verdict.correct');
      case 'incorrect':
        return t('chat.verdict.incorrect');
      case 'partially_correct':
        return t('chat.verdict.partially_correct');
      case 'skipped':
        return t('chat.verdict.skipped');
      default:
        return '';
    }
  };

  if (isSystem) {
    return (
      <View style={styles.systemBubble}>
        <Text style={styles.systemText}>{content}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, isLearner ? styles.learnerContainer : styles.agentContainer]}>
      {/* Tool Call Banner */}
      {toolCall && (
        <Pressable style={styles.toolCallBanner} onPress={() => onToolCallTap?.(toolCall.name)}>
          <Text style={styles.toolCallText}>{formatToolName(toolCall.name)}</Text>
        </Pressable>
      )}

      {/* Tool Result */}
      {toolResult && (
        <View style={styles.toolResultBanner}>
          <Text style={styles.toolResultText}>
            {toolResult.error ? `Error: ${toolResult.error}` : '✓'}
          </Text>
        </View>
      )}

      {/* Main Bubble */}
      <Animated.View
        style={[
          styles.bubble,
          isLearner ? styles.learnerBubble : styles.agentBubble,
          speaking && { opacity: speakingOpacity },
        ]}
      >
        <Text style={isLearner ? styles.learnerText : styles.agentText}>
          {renderForeignMarkers(content, styles.foreignText)}
        </Text>

        {/* Streaming cursor */}
        {isStreaming && <Animated.View style={[styles.cursor, { opacity: cursorOpacity }]} />}
      </Animated.View>

      {/* Verdict badge */}
      {verdict && (
        <View
          style={[
            styles.verdictBadge,
            verdict === 'correct' && styles.correctBadge,
            verdict === 'incorrect' && styles.incorrectBadge,
            verdict === 'partially_correct' && styles.partialBadge,
            verdict === 'skipped' && styles.skippedBadge,
          ]}
        >
          <Text style={styles.verdictText}>{verdictLabel(verdict)}</Text>
        </View>
      )}
    </View>
  );
}

// ── Agent Thinking Indicator ────────────────────────────────────────────────

export function AgentThinking() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createPulse = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
      );

    const a1 = createPulse(dot1, 0);
    const a2 = createPulse(dot2, 200);
    const a3 = createPulse(dot3, 400);

    a1.start();
    a2.start();
    a3.start();

    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, []);

  return (
    <View style={styles.thinkingContainer}>
      <View style={styles.thinkingBubble}>
        <Animated.View
          style={[
            styles.thinkingDot,
            {
              opacity: dot1,
              transform: [
                { scale: dot1.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
              ],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.thinkingDot,
            {
              opacity: dot2,
              transform: [
                { scale: dot2.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
              ],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.thinkingDot,
            {
              opacity: dot3,
              transform: [
                { scale: dot3.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
              ],
            },
          ]}
        />
      </View>
    </View>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Split a tutor reply on French-guillemet markers («…») and render the
 *  inner text in italic so foreign-language words read as visually
 *  distinct. The same markers drive language-aware TTS on the server.
 *
 *  We accept guillemets in both orderings: «text» (French style, our
 *  contract) AND »text« (German style — the model sometimes flips them
 *  because of native typography). Both ways the inner text is the
 *  foreign token; the strict regex looks for one then the matching
 *  closing in either direction. */
function renderForeignMarkers(text: string, italicStyle: object): React.ReactNode {
  const regex = /«([^«»]+)»|»([^«»]+)«/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  for (const match of text.matchAll(regex)) {
    const idx = match.index ?? 0;
    if (idx > lastIndex) parts.push(text.slice(lastIndex, idx));
    const inner = match[1] ?? match[2] ?? '';
    parts.push(
      <Text key={`fm-${key++}`} style={italicStyle}>
        {inner}
      </Text>,
    );
    lastIndex = idx + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? parts : text;
}

function formatToolName(name: string): string {
  const labels: Record<string, string> = {
    grade_answer: 'Bewertet deine Antwort...',
    provide_hint: 'Überlegt einen Tipp...',
    reveal_answer: 'Bereitet die Antwort vor...',
    acknowledge_give_up: 'Überlegt...',
    explain_concept: 'Erklärt das Konzept...',
    suggest_break: 'Schlägt eine Pause vor...',
    present_next_question: 'Nächste Frage...',
    handle_confusion: 'Klär die Frage...',
  };
  return labels[name] ?? name;
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    maxWidth: '85%',
  },
  learnerContainer: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  agentContainer: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '100%',
  },
  learnerBubble: {
    backgroundColor: '#6C5CE7',
    borderBottomRightRadius: 4,
  },
  agentBubble: {
    backgroundColor: '#F0F0F5',
    borderBottomLeftRadius: 4,
  },
  learnerText: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 22,
  },
  agentText: {
    color: '#1A1A2E',
    fontSize: 16,
    lineHeight: 22,
  },
  foreignText: {
    fontStyle: 'italic',
    fontWeight: '500',
  },
  systemBubble: {
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 12,
  },
  systemText: {
    color: '#666',
    fontSize: 13,
    textAlign: 'center',
  },
  cursor: {
    width: 2,
    height: 18,
    backgroundColor: '#1A1A2E',
    marginLeft: 2,
    alignSelf: 'flex-end',
  },
  toolCallBanner: {
    backgroundColor: '#E8E0F7',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 4,
  },
  toolCallText: {
    color: '#6C5CE7',
    fontSize: 12,
    fontWeight: '500',
  },
  toolResultBanner: {
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 4,
  },
  toolResultText: {
    color: '#2E7D32',
    fontSize: 12,
  },
  verdictBadge: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  correctBadge: {
    backgroundColor: '#E8F5E9',
  },
  incorrectBadge: {
    backgroundColor: '#FFF3E0',
  },
  partialBadge: {
    backgroundColor: '#FFF8E1',
  },
  skippedBadge: {
    backgroundColor: '#F5F5F5',
  },
  verdictText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
  thinkingContainer: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  thinkingBubble: {
    flexDirection: 'row',
    backgroundColor: '#F0F0F5',
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 4,
  },
  thinkingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#6C5CE7',
  },
});
