import { describe, expect, it } from 'vitest';

import { clearIncoming, handIn, takeIncoming } from '../incoming.js';
import { fileKind, sortIncoming, type IncomingFile } from '../files.js';

const f = (uri: string, mimeType: string | null, size: number | null = 1000): IncomingFile => ({
  uri,
  name: null,
  mimeType,
  size,
});

describe('files handed in', () => {
  it('wait for the capture screen, then go straight to it while it is open', () => {
    expect(handIn([f('a.pdf', 'application/pdf')])).toBe(false);
    const got: string[] = [];
    const stop = takeIncoming((files) => got.push(...files.map((x) => x.uri)));
    expect(got).toEqual(['a.pdf']);
    expect(handIn([f('b.jpg', 'image/jpeg')])).toBe(true);
    expect(got).toEqual(['a.pdf', 'b.jpg']);
    stop();
    expect(handIn([f('c.jpg', 'image/jpeg')])).toBe(false);
    clearIncoming();
    const later: string[] = [];
    takeIncoming((files) => later.push(...files.map((x) => x.uri)))();
    expect(later).toEqual([]);
  });

  it('knows PDFs and images by type, else by name; other files are not taken', () => {
    expect(fileKind(f('x', 'application/pdf'))).toBe('pdf');
    expect(fileKind(f('file:///s/Blatt.PDF', null))).toBe('pdf');
    expect(fileKind(f('file:///s/Blatt.pdf', 'application/octet-stream'))).toBe('pdf');
    expect(fileKind(f('data:application/pdf;base64,JVBE', null))).toBe('pdf');
    expect(fileKind(f('x', 'image/heic'))).toBe('image');
    expect(fileKind(f('file:///s/foto.jpeg?x=1', null))).toBe('image');
    expect(fileKind(f('file:///s/brief.docx', null))).toBeNull();
    expect(fileKind(f('file:///s/a.pdf', 'text/plain'))).toBeNull();
  });

  it('leaves out PDFs over the size limit together and counts what was left out', () => {
    const big = 10 * 1024 * 1024;
    const r = sortIncoming([
      f('a.pdf', 'application/pdf', big),
      f('b.docx', null),
      f('c.jpg', 'image/jpeg'),
      f('d.pdf', 'application/pdf', big),
    ]);
    expect(r.take.map((x) => [x.uri, x.kind])).toEqual([
      ['a.pdf', 'pdf'],
      ['c.jpg', 'image'],
    ]);
    expect(r).toMatchObject({ unsupported: 1, tooLarge: 1 });
  });
});
