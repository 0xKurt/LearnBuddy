// Last line of defence for render errors: a calm message and a way back, as the design's
// "error" state (components/core/States.jsx `StateScreen`: Buddy at rest, one bold line, one
// sentence, one action). It stands above the router, so it has no head to draw; and should
// drawing Buddy be what failed, the same words stand without him.

import { Component, type ReactNode } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { i18n } from '../../lib/i18n/index.js';
import { reportCrash } from '../../lib/observability/sentry.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { Btn } from './Btn.js';
import { EmptyState } from './EmptyState.js';

type State = { failed: boolean };

/** Draws `plain` instead of its children once they have failed: the fallback's own fallback. */
class Shield extends Component<{ children: ReactNode; plain: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.plain : this.props.children;
  }
}

// The screen the boundary shows. Only a class can catch a render error, and a class cannot
// call useTheme() — so the message is its own component and takes the palette from the hook
// (issue #29, layer 3).
function FailedScreen({ onRetry }: { onRetry: () => void }) {
  const { palette } = useTheme();
  const said = (orb: boolean) => (
    <EmptyState
      orb={orb}
      title={i18n.t('errors:boundary_title')}
      body={i18n.t('errors:boundary_body')}
      action={
        <Btn center onPress={onRetry}>
          {i18n.t('errors:boundary_retry')}
        </Btn>
      }
    />
  );
  return (
    // SafeAreaView: under edge-to-edge a long body must not run under the bars.
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg, justifyContent: 'center' }}>
      <Shield plain={said(false)}>{said(true)}</Shield>
    </SafeAreaView>
  );
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  /**
   * The render error that got us here is the one nobody sees otherwise: the learner gets a
   * calm screen and a way back, so without a report it leaves no trace. Silent unless
   * crash reports are configured (lib/observability/sentry.ts, issue #36).
   */
  override componentDidCatch(error: Error): void {
    reportCrash(error, 'render');
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return <FailedScreen onRetry={() => this.setState({ failed: false })} />;
  }
}
