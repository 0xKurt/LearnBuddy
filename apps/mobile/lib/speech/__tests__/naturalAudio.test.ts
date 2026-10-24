// requires live verification in Claude Code session (Expo fetch/file boundary replaced)
import { beforeEach, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({ fetch: vi.fn(), write: vi.fn(), prepare: vi.fn() }));
vi.mock('../../api/streamingFetch.js', () => ({ streamingFetch: fake.fetch }));
vi.mock('../pcmPlayer.js', () => ({ preparePcm: fake.prepare, releasePcm: vi.fn() }));
vi.mock('../naturalPlayer.js', () => ({ releasePlayer: vi.fn() }));
vi.mock('expo-file-system', () => ({
  Paths: { cache: '/cache' },
  File: class {
    uri = 'file:///cache/voice.wav';
    create() {}
    write = fake.write;
  },
}));
import { streamAudio } from '../naturalAudio.js';
const source = { uri: 'https://example.test/speech', headers: {} };
beforeEach(() => vi.clearAllMocks());
it.each(['audio/wav', 'audio/mpeg'])(
  'reads %s once as a complete file without opening Expo’s competing body stream',
  async (mime) => {
    const bytes = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]);
    let streaming = false;
    const body = vi.fn(() => {
      streaming = true;
      return new ReadableStream();
    });
    fake.fetch.mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': mime }),
      get body() {
        return body();
      },
      arrayBuffer: async () => (streaming ? new ArrayBuffer(0) : bytes.buffer),
    });
    await streamAudio(source, new AbortController().signal);
    expect(fake.write).toHaveBeenCalledWith(bytes, undefined);
    expect(body).not.toHaveBeenCalled();
    expect(fake.prepare).not.toHaveBeenCalled();
  },
);
it('keeps PCM progressive and never reads it as a complete file', async () => {
  const body = new ReadableStream();
  const arrayBuffer = vi.fn();
  fake.fetch.mockResolvedValue({
    ok: true,
    headers: new Headers({ 'content-type': 'audio/pcm' }),
    body,
    arrayBuffer,
  });
  fake.prepare.mockReturnValue('buddy-pcm:1');
  expect(await streamAudio(source, new AbortController().signal)).toBe('buddy-pcm:1');
  expect(fake.prepare).toHaveBeenCalledWith(body, expect.any(AbortSignal), expect.any(Function));
  expect(arrayBuffer).not.toHaveBeenCalled();
});
