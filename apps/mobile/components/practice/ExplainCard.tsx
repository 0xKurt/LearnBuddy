// Explain mode: Buddy's explanation before the first question, in calm,
// readable text (17 px) with its math set properly.

import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';
import { Card } from '../lb/Card.js';
import { MathText } from '../math/MathText.js';

/** The explanation itself (also used in the "read again" sheet). */
export function ExplainText({ text }: { text: string }) {
  // One paragraph per blank line keeps longer explanations easy to follow.
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return (
    <View style={{ gap: 12 }}>
      {paragraphs.map((p, i) => (
        <MathText key={i} text={p} style={{ fontSize: 17, lineHeight: 26, color: LB.ink }} />
      ))}
    </View>
  );
}

export function ExplainCard({ text }: { text: string }) {
  const { t } = useTranslation('practice');
  return (
    <Card tone="sky" padding={22} radius={24}>
      <Text accessibilityRole="header" style={[TYPE.label, { marginBottom: 10 }]}>
        {t('explain.title').toUpperCase()}
      </Text>
      <ExplainText text={text} />
    </Card>
  );
}
