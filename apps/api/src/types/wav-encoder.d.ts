declare module 'wav-encoder' {
  export function encode(
    audio: { sampleRate: number; channelData: Float32Array[] },
    options?: { bitDepth?: number },
  ): Promise<ArrayBuffer>;
}
