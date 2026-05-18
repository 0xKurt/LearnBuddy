// Root error boundary. Doc 05 §error-handling.
//
// React class components are the only mechanism for catching render errors
// in the tree; functional components can't (yet). We render a tone-correct
// fallback in German default (per CLAUDE.md tone rule) and ship the error to
// Sentry. The user gets a "Reload"-style action that resets the boundary so
// they don't have to kill the app.

import { Component, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { captureError } from '../../lib/sentry.js';
import { i18n } from '../../lib/i18n/index.js';
import { LB } from '../../lib/theme/colors.js';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: { componentStack?: string | null }): void {
    captureError(error, { componentStack: info.componentStack ?? undefined });
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <View style={{ flex: 1, backgroundColor: LB.paper, padding: 24, justifyContent: 'center' }}>
        <Text style={{ fontSize: 22, fontWeight: '700', color: LB.ink, marginBottom: 12 }}>
          {i18n.t('errors:boundary_title')}
        </Text>
        <Text style={{ fontSize: 14, color: LB.ink2, marginBottom: 32 }}>
          {i18n.t('errors:boundary_body')}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={i18n.t('errors:boundary_retry')}
          onPress={() => this.setState({ error: null })}
          style={{
            backgroundColor: LB.primary,
            paddingVertical: 14,
            borderRadius: 12,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>
            {i18n.t('errors:boundary_retry')}
          </Text>
        </Pressable>
      </View>
    );
  }
}
