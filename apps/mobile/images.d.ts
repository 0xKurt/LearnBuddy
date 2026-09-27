// Images bundled by Metro (e.g. the splash orb): a source for <Image>.
declare module '*.png' {
  import type { ImageSourcePropType } from 'react-native';
  const source: ImageSourcePropType;
  export default source;
}
