import { describe, expect, it } from 'vitest';
import { modelEntry, verifyPackBytes } from '../packArchive.js';

const pack = {
  name: 'model',
  bytes: 3,
  sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
};
async function* chunks(text: string) {
  for (const char of text) yield new TextEncoder().encode(char);
}
describe('verified language archives', () => {
  it('accepts only the exact hash and length, independently of chunk boundaries', async () => {
    await expect(verifyPackBytes(pack, chunks('abc'))).resolves.toBeUndefined();
    await expect(verifyPackBytes(pack, chunks('abd'))).rejects.toThrow('checksum');
    await expect(verifyPackBytes(pack, chunks('ab'))).rejects.toThrow('size');
    await expect(verifyPackBytes(pack, chunks('abcd'))).rejects.toThrow('size');
  });
  it('cannot extract outside the one expected model directory', () => {
    expect(modelEntry('model/am/final.mdl', 'model')).toEqual(['am', 'final.mdl']);
    for (const path of [
      '/model/am',
      'other/am',
      'model/../outside',
      'model/./am',
      'model//am',
      'model/a\\b',
      'model/C:foo',
    ]) {
      expect(() => modelEntry(path, 'model'), path).toThrow();
    }
  });
});
