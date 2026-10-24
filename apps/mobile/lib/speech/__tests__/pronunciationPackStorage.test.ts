// requires live verification in Claude Code session (native files and transfer replaced)
import { expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({ download: vi.fn(), remove: vi.fn(), verify: vi.fn() }));
vi.mock('../packTransfer.js', () => ({ downloadPack: fake.download }));
vi.mock('../voskNative.js', () => ({ nativeVosk: () => null }));
vi.mock('../packArchive.js', () => ({ verifyPackBytes: fake.verify, modelEntry: vi.fn() }));
vi.mock('expo-file-system', () => ({
  Paths: { document: 'file:///documents' },
  Directory: class {
    uri: string;
    exists = true;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
    }
    create() {}
    delete() {
      fake.remove(this.uri);
    }
  },
  File: class {
    uri: string;
    constructor(dir: { uri: string }, name: string) {
      this.uri = `${dir.uri}/${name}`;
    }
  },
}));
import { pronunciationPackStorage } from '../pronunciationPackStorage.js';
it('cleans a cancelled partial only after the transfer settles and never verifies or publishes it', async () => {
  let reject!: (error: Error) => void;
  fake.download.mockImplementation(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
  );
  const phase = vi.fn();
  const install = pronunciationPackStorage.install(
    { name: 'pack', sha256: 'hash', bytes: 10 },
    phase,
  );
  expect(fake.download).toHaveBeenCalledWith(
    'https://alphacephei.com/vosk/models/pack.zip',
    'file:///documents/pronunciation-packs/hash.partial/model.zip',
  );
  fake.remove.mockClear();
  expect(fake.remove).not.toHaveBeenCalled();
  reject(new Error('model_network_changed'));
  await expect(install).rejects.toThrow('model_network_changed');
  expect(phase.mock.calls).toEqual([[{ state: 'downloading' }]]);
  expect(fake.verify).not.toHaveBeenCalled();
  expect(fake.remove).toHaveBeenCalledOnce();
  expect(fake.remove).toHaveBeenCalledWith('file:///documents/pronunciation-packs/hash.partial');
});
