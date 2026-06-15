// Full-screen photo viewer with horizontal swipe between pages.
//
// Used in two places:
//   - Material grid → action sheet → "Photos ansehen"  (lets the user
//     identify a failed material before deciding to retry / delete)
//   - Material detail → tap on a photo in the strip
//
// Kept deliberately simple: contentFit: 'contain' so each photo fits the
// screen, horizontal ScrollView with paging for swipe-between. No
// pinch-zoom yet — adding gesture-handler/reanimated is doable but the
// current ask is "I want to see which material this is", which fit-to-
// screen at full device width already solves.

import { useEffect, useState } from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CachedImage } from '../lb/CachedImage.js';
import { Icon } from '../lb/Icon.js';

type Props = {
  visible: boolean;
  photoUrls: string[];
  initialIndex?: number;
  onClose: () => void;
};

export function PhotoViewerModal({ visible, photoUrls, initialIndex = 0, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const screenWidth = Dimensions.get('window').width;
  const [pageIndex, setPageIndex] = useState(initialIndex);

  // Reset when the modal is (re)opened on a different start index.
  useEffect(() => {
    if (visible) setPageIndex(initialIndex);
  }, [visible, initialIndex]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / screenWidth);
    if (idx !== pageIndex) setPageIndex(idx);
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.root}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: initialIndex * screenWidth, y: 0 }}
          onMomentumScrollEnd={onScroll}
        >
          {photoUrls.map((uri, i) => (
            <Pressable key={i} style={[styles.page, { width: screenWidth }]} onPress={onClose}>
              <CachedImage
                source={{ uri }}
                contentFit="contain"
                transition={150}
                style={styles.image}
              />
            </Pressable>
          ))}
        </ScrollView>

        {/* Close button — top-right, away from system status bar. */}
        <Pressable
          onPress={onClose}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Schließen"
          style={[styles.close, { top: insets.top + 8 }]}
        >
          <View style={styles.closeBg}>
            <Icon name="close" size={22} color="#fff" />
          </View>
        </Pressable>

        {/* Page counter — bottom centre, hidden when only one photo. */}
        {photoUrls.length > 1 ? (
          <View style={[styles.counter, { bottom: insets.bottom + 16 }]}>
            <Text style={styles.counterText}>
              {pageIndex + 1} / {photoUrls.length}
            </Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  page: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  close: {
    position: 'absolute',
    right: 14,
  },
  closeBg: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  counterText: {
    fontSize: 13,
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
});
