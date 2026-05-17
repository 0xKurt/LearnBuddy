// Root error boundary. Doc 05 §error-handling.
//
// React class components are the only mechanism for catching render errors
// in the tree; functional components can't (yet). We render a tone-correct
// fallback in German default (per CLAUDE.md tone rule) and ship the error to
// Sentry. The user gets a "Reload"-style action that resets the boundary so
// they don't have to kill the app.

import { Component, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { captureError } from '../../lib/sentry.js';
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
    const message = this.state.error.message || 'Unbekannter Fehler';
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: LB.paper,
          padding: 24,
          justifyContent: 'center',
        }}
      >
        <Text
          style={{
            fontSize: 22,
            fontWeight: '700',
            color: LB.ink,
            marginBottom: 12,
          }}
        >
          Da ist etwas schiefgegangen.
        </Text>
        <Text style={{ fontSize: 14, color: LB.ink2, marginBottom: 24 }}>
          Wir haben den Fehler automatisch gemeldet. Versuche es nochmal — wenn er wiederkommt, geh
          über Profil → Hilfe.
        </Text>
        <ScrollView
          style={{
            maxHeight: 120,
            backgroundColor: LB.bg,
            borderRadius: 8,
            padding: 12,
            marginBottom: 24,
          }}
        >
          <Text style={{ fontSize: 11, color: LB.ink2, fontFamily: 'Courier' }}>{message}</Text>
        </ScrollView>
        <Pressable
          accessibilityRole="button"
          onPress={() => this.setState({ error: null })}
          style={{
            backgroundColor: LB.primary,
            paddingVertical: 14,
            borderRadius: 12,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>Nochmal versuchen</Text>
        </Pressable>
      </View>
    );
  }
}
