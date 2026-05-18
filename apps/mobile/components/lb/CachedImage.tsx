import { Image, type ImageProps } from 'expo-image';

import { usePref } from '../../lib/prefs.js';

type Props = ImageProps;

export function CachedImage({ style, ...rest }: Props) {
  const [dataSaver] = usePref('data_saver');
  return <Image cachePolicy={dataSaver ? 'disk' : 'memory-disk'} style={style} {...rest} />;
}
