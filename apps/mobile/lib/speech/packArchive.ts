import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { PronunciationPack } from './pronunciationPacks.js';

/** Incremental verification bounds memory and rejects truncation before extraction starts. */
export async function verifyPackBytes(
  pack: PronunciationPack,
  chunks: AsyncIterable<Uint8Array>,
): Promise<void> {
  const digest = sha256.create();
  let size = 0;
  for await (const bytes of chunks) {
    size += bytes.length;
    if (size > pack.bytes) throw new Error('model_size_mismatch');
    digest.update(bytes);
  }
  if (size !== pack.bytes) throw new Error('model_size_mismatch');
  if (bytesToHex(digest.digest()) !== pack.sha256) throw new Error('model_checksum_mismatch');
}

/** Archive paths are untrusted, even after the pinned checksum matched. */
export function modelEntry(name: string, model: string): string[] {
  const parts = name.replace(/\/$/, '').split('/');
  if (
    parts.shift() !== model ||
    parts.some((p) => !p || p === '.' || p === '..' || p.includes('\\') || p.includes(':'))
  )
    throw new Error('invalid_model_entry');
  return parts;
}
