// Audio of one sentence (base64 from POST /voice/speech) for the browser's audio element:
// a data: URI, nothing is written anywhere.

export function audioUri(base64: string, mime: 'audio/mpeg' | 'audio/wav'): string {
  return `data:${mime};base64,${base64}`;
}

export function releaseAudio(_uri: string): void {
  // Nothing to delete.
}
