// Android AAC/ADTS is readable while MediaRecorder keeps capturing on its echo-cancelled source.
import { File } from 'expo-file-system';
import type { RecordingOptions } from 'expo-audio';

export type LiveRecording = {
  data(bytes: Uint8Array): void;
  meter(db: number, elapsedMs: number): void;
  end(deliver: boolean): void;
};

export function liveRecordingOptions(base: RecordingOptions): RecordingOptions {
  return {
    ...base,
    extension: '.aac',
    sampleRate: 16_000,
    android: { outputFormat: 'aac_adts', audioEncoder: 'aac', audioSource: 'voice_communication' },
  };
}

/** A monotonic cursor; opening briefly avoids retaining a file handle after cancellation. */
export class LiveRecordingReader {
  private offset = 0;
  reset(): void {
    this.offset = 0;
  }
  read(uri: string, give: (bytes: Uint8Array) => void): void {
    const file = new File(uri);
    const length = file.size - this.offset;
    if (length <= 0) return;
    const handle = file.open();
    try {
      handle.offset = this.offset;
      const bytes = handle.readBytes(length);
      this.offset += bytes.length;
      give(bytes);
    } finally {
      handle.close();
    }
  }
}
