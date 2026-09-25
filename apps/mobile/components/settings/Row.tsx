// One setting inside a card: a plain question, the current answer as a
// sentence (the state is never shown by colour alone), an optional hint and
// its one control. All text is 16 pt (TYPE.body).
//
// `locked` ignores touches on the control while a change is being saved:
// every change carries the version it was based on, so two at once would
// collide. (Segmented has no disabled state of its own.)

import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';

type Props = {
  question: string;
  answer?: string;
  /** Read after the question by screen readers when the answer is not written out. */
  current?: string;
  hint?: string;
  locked?: boolean;
  children?: ReactNode;
};

export function Row({ question, answer, current, hint, locked = false, children }: Props) {
  return (
    <View style={{ gap: 6 }}>
      <Text
        accessibilityRole="header"
        accessibilityLabel={current ? `${question} ${current}` : undefined}
        style={[TYPE.body, { fontWeight: '600' }]}
      >
        {question}
      </Text>
      {answer ? <Text style={TYPE.body}>{answer}</Text> : null}
      {hint ? <Text style={[TYPE.body, { color: LB.ink2 }]}>{hint}</Text> : null}
      {children ? (
        <View
          style={{
            gap: 10,
            marginTop: 6,
            opacity: locked ? 0.6 : 1,
            pointerEvents: locked ? 'none' : 'auto',
          }}
        >
          {children}
        </View>
      ) : null}
    </View>
  );
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: LB.hairline }} />;
}
