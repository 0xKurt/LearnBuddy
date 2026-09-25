// Last line of defence for render errors: a calm message and a way back.

import { Component, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { i18n } from '../../lib/i18n/index.js';
import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from './Btn.js';

type State = { failed: boolean };

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <View
        style={{ flex: 1, backgroundColor: LB.bg, padding: 24, justifyContent: 'center', gap: 16 }}
      >
        <Text accessibilityRole="header" style={TYPE.display}>
          {i18n.t('errors:boundary_title')}
        </Text>
        <Text style={TYPE.body}>{i18n.t('errors:boundary_body')}</Text>
        <Btn onPress={() => this.setState({ failed: false })}>
          {i18n.t('errors:boundary_retry')}
        </Btn>
      </View>
    );
  }
}
