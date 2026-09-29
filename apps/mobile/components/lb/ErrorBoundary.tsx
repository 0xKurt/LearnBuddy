// Last line of defence for render errors: a calm message and a way back.

import { Component, type ReactNode } from 'react';
import { Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { i18n } from '../../lib/i18n/index.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from './Btn.js';

type State = { failed: boolean };

// The screen the boundary shows. Only a class can catch a render error, and a class cannot
// call useTheme() — so the message is its own component and takes the palette from the hook
// (issue #29, layer 3).
function FailedScreen({ onRetry }: { onRetry: () => void }) {
  const { palette } = useTheme();
  return (
    // SafeAreaView: under edge-to-edge a long body must not run under the bars.
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: palette.bg,
        padding: 24,
        justifyContent: 'center',
        gap: 16,
      }}
    >
      <Text accessibilityRole="header" style={TYPE.display}>
        {i18n.t('errors:boundary_title')}
      </Text>
      <Text style={TYPE.body}>{i18n.t('errors:boundary_body')}</Text>
      <Btn onPress={onRetry}>{i18n.t('errors:boundary_retry')}</Btn>
    </SafeAreaView>
  );
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return <FailedScreen onRetry={() => this.setState({ failed: false })} />;
  }
}
