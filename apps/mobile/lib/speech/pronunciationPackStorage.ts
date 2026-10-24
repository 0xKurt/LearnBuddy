// requires live verification on a real iPhone / Android phone
import { Directory, File, Paths, type FileHandle } from 'expo-file-system';
import { Unzip, UnzipInflate } from 'fflate';
import type { PackStorage, PronunciationPack } from './pronunciationPacks.js';
import { nativeVosk } from './voskNative.js';
import { modelEntry, verifyPackBytes } from './packArchive.js';

const CHUNK = 64 * 1024;
const MAX_UNPACKED = 250 * 1024 * 1024;
const root = () => new Directory(Paths.document, 'pronunciation-packs');
const destination = (pack: PronunciationPack) => new Directory(root(), pack.sha256);
const yieldFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function* chunks(file: File): AsyncGenerator<Uint8Array> {
  const handle = file.open();
  try {
    for (let offset = 0; offset < file.size; offset += CHUNK) {
      const bytes = handle.readBytes(Math.min(CHUNK, file.size - offset));
      if (!bytes.length) throw new Error('model_read_failed');
      yield bytes;
      await yieldFrame();
    }
  } finally {
    handle.close();
  }
}

export const pronunciationPackStorage: PackStorage = {
  async ready(pack) {
    const dir = destination(pack);
    const marker = new File(dir, 'ready.json');
    if (!marker.exists || (await marker.text()) !== pack.sha256) return null;
    if (
      !new File(dir, pack.name, 'am', 'final.mdl').exists ||
      !new File(dir, pack.name, 'conf', 'model.conf').exists
    )
      return null;
    return new Directory(dir, pack.name).uri.replace(/^file:\/\//, '');
  },
  async install(pack, phase) {
    root().create({ intermediates: true, idempotent: true });
    const stage = new Directory(root(), `${pack.sha256}.partial`);
    if (stage.exists) stage.delete();
    stage.create();
    const zip = new File(stage, 'model.zip');
    const open = new Set<FileHandle>();
    try {
      phase({ state: 'downloading' });
      await File.downloadFileAsync(`https://alphacephei.com/vosk/models/${pack.name}.zip`, zip);
      phase({ state: 'verifying' });
      if (zip.size !== pack.bytes) throw new Error('model_size_mismatch');
      await verifyPackBytes(pack, chunks(zip));
      phase({ state: 'installing' });
      let total = 0,
        files = 0;
      const seen = new Set<string>();
      const unzip = new Unzip((entry) => {
        const parts = modelEntry(entry.name, pack.name);
        if (++files > 1000 || seen.has(entry.name)) throw new Error('invalid_model_archive');
        seen.add(entry.name);
        if (entry.name.endsWith('/')) {
          new Directory(stage, pack.name, ...parts).create({
            intermediates: true,
            idempotent: true,
          });
          return;
        }
        const name = parts.pop();
        if (!name) throw new Error('invalid_model_file');
        const dir = new Directory(stage, pack.name, ...parts);
        dir.create({ intermediates: true, idempotent: true });
        const file = new File(dir, name);
        file.create();
        const handle = file.open();
        open.add(handle);
        entry.ondata = (error, data, final) => {
          if (error) throw error;
          total += data.length;
          if (total > MAX_UNPACKED) throw new Error('model_unpacked_limit');
          handle.writeBytes(data);
          if (final) {
            handle.close();
            open.delete(handle);
          }
        };
        entry.start();
      });
      unzip.register(UnzipInflate);
      for await (const data of chunks(zip)) unzip.push(data, false);
      unzip.push(new Uint8Array(), true);
      if (
        open.size ||
        !new File(stage, pack.name, 'am', 'final.mdl').exists ||
        !new File(stage, pack.name, 'conf', 'model.conf').exists
      )
        throw new Error('model_incomplete');
      zip.delete();
      new File(stage, 'ready.json').write(pack.sha256);
      const dest = destination(pack);
      await nativeVosk()?.releaseCheckModel();
      if (dest.exists) dest.delete();
      stage.move(dest);
      return new Directory(dest, pack.name).uri.replace(/^file:\/\//, '');
    } finally {
      for (const handle of open) handle.close();
      // Directory.move updates its URI; never delete the successfully installed destination.
      const partial = new Directory(root(), `${pack.sha256}.partial`);
      if (partial.exists) partial.delete();
    }
  },
  async remove(pack) {
    await nativeVosk()?.releaseCheckModel();
    for (const dir of [destination(pack), new Directory(root(), `${pack.sha256}.partial`)])
      if (dir.exists) dir.delete();
  },
};
