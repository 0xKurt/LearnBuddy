// Full-page Capture presentation. Page preparation, upload and draft ownership stay with its route.
import type { ReactNode } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { CAPTURE } from '../../lib/theme/capture.js';
import { RADIUS, circle } from '../../lib/theme/radius.js';
import { GUTTER, SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { BottomBar } from '../lb/BottomBar.js';
import { Btn } from '../lb/Btn.js';
import { Icon } from '../lb/Icon.js';
import { IconBtn } from '../lb/IconBtn.js';
import { KeyboardSafe } from '../lb/KeyboardSafe.js';
import { PressArea } from '../lb/PressArea.js';
import { Screen } from '../lb/Screen.js';

type Props = {
  title: string;
  intro: string;
  count: number;
  subtitle?: string;
  busy: boolean;
  focused: boolean;
  canSend: boolean;
  onBack: () => void;
  onCamera: () => void;
  onPhotos: () => void;
  onFiles: () => void;
  onSend: () => void;
  pages: ReactNode;
};

export function CapturePage(props: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation(['capture', 'buddy', 'common']);
  return (
    <Screen
      title={props.title}
      subtitle={
        props.subtitle ??
        (props.count ? t('capture:page.count', { count: props.count }) : undefined)
      }
      state={props.count ? 'listen' : 'wait'}
      leading={{ icon: 'back', onPress: props.onBack }}
    >
      <KeyboardSafe enabled={props.focused}>
        <ScrollView
          tabIndex={Platform.OS === 'web' ? 0 : undefined}
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1, gap: SPACE.lg, padding: GUTTER }}
        >
          {!props.count ? (
            <>
              <Text style={[TYPE.paragraph, { color: palette.ink2, paddingHorizontal: SPACE.xs }]}>
                {props.intro}
              </Text>
              <PressArea
                accessibilityRole="button"
                accessibilityLabel={t('common:a11y.camera')}
                disabled={props.busy}
                onPress={props.onCamera}
                style={{ flexGrow: 1 }}
              >
                <View
                  style={{
                    minHeight: CAPTURE.page.cameraMinHeight,
                    flexGrow: 1,
                    borderRadius: RADIUS.lg,
                    borderWidth: CAPTURE.border,
                    borderStyle: 'dashed',
                    borderColor: palette.hairlineStrong,
                    backgroundColor: palette.paper,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: SPACE.md,
                    padding: SPACE.lg,
                  }}
                >
                  <View
                    style={{
                      width: CAPTURE.page.cameraDisc,
                      height: CAPTURE.page.cameraDisc,
                      borderRadius: circle(CAPTURE.page.cameraDisc),
                      backgroundColor: palette.primaryLt,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon name="camera" size={CAPTURE.page.cameraGlyph} color={palette.primaryDk} />
                  </View>
                  <Text style={[TYPE.title, { color: palette.ink, textAlign: 'center' }]}>
                    {t('capture:page.camera_title')}
                  </Text>
                  <Text
                    style={[
                      TYPE.meta,
                      {
                        color: palette.ink2,
                        textAlign: 'center',
                        maxWidth: CAPTURE.page.privacyMaxWidth,
                      },
                    ]}
                  >
                    {t('capture:page.privacy')}
                  </Text>
                </View>
              </PressArea>
            </>
          ) : null}
          {props.pages}
        </ScrollView>
        <BottomBar>
          {props.count ? (
            <Btn
              full
              size="lg"
              variant="primary"
              icon="send"
              disabled={!props.canSend}
              busy={props.busy}
              onPress={props.onSend}
            >
              {t('capture:page.send')}
            </Btn>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
              <IconBtn
                icon="photos"
                tone="quiet"
                size={CAPTURE.page.sourceSize}
                accessibilityLabel={t('buddy:composer.attach.library')}
                disabled={props.busy}
                onPress={props.onPhotos}
              />
              <IconBtn
                icon="file"
                tone="quiet"
                size={CAPTURE.page.sourceSize}
                accessibilityLabel={t('buddy:composer.attach.files')}
                disabled={props.busy}
                onPress={props.onFiles}
              />
              <View style={{ flex: 1 }}>
                <Btn
                  full
                  size="lg"
                  variant="primary"
                  icon="camera"
                  disabled={props.busy}
                  onPress={props.onCamera}
                >
                  {t('common:a11y.camera')}
                </Btn>
              </View>
            </View>
          )}
        </BottomBar>
      </KeyboardSafe>
    </Screen>
  );
}
