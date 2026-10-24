// Browser MP3 byte stream → MediaSource. Append exactly in transport order, with backpressure.
export async function appendAudio(
  media: MediaSource,
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): Promise<void> {
  const wait = (target: EventTarget, event: string) =>
    new Promise<void>((resolve, reject) => {
      const clean = () => {
        target.removeEventListener(event, done);
        target.removeEventListener('error', error);
        signal.removeEventListener('abort', error);
      };
      const done = () => {
        clean();
        resolve();
      };
      const error = () => {
        clean();
        reject(new Error('audio stream stopped'));
      };
      target.addEventListener(event, done, { once: true });
      target.addEventListener('error', error, { once: true });
      signal.addEventListener('abort', error, { once: true });
      if (signal.aborted) error();
    });
  if (media.readyState !== 'open') await wait(media, 'sourceopen');
  const buffer = media.addSourceBuffer('audio/mpeg');
  const reader = body.getReader();
  try {
    for (;;) {
      if (signal.aborted) throw new Error('stopped');
      const { done, value } = await reader.read();
      if (done) break;
      const appended = wait(buffer, 'updateend');
      buffer.appendBuffer(new Uint8Array(value).buffer);
      await appended;
    }
    if (media.readyState === 'open') media.endOfStream();
  } finally {
    reader.releaseLock();
  }
}
