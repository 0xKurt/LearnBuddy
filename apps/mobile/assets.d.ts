// Bundled media imported by path (Metro turns each into an asset id).
declare module '*.wav' {
  const asset: number;
  export default asset;
}
