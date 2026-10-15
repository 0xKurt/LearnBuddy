// Where her sheet stands, as its message says (issue #632): only what the row and a live run say.

import { describe, expect, it } from 'vitest';

import { sheetStage } from '../threadSheets.js';

const row = {
  status: 'queued' as const,
  read_stage: null,
  archived: false,
  reading: true,
  building: false,
};

describe('sheetStage', () => {
  it('follows the reading while a run is alive', () => {
    expect(sheetStage(row)).toBe('waiting');
    expect(sheetStage({ ...row, status: 'processing', read_stage: 'opening' })).toBe('waiting');
    expect(sheetStage({ ...row, status: 'processing', read_stage: 'reading' })).toBe('reading');
  });

  it('says nothing about a reading no run carries', () => {
    expect(sheetStage({ ...row, reading: false })).toBeNull();
    expect(sheetStage({ ...row, status: 'awaiting_upload' })).toBeNull();
  });

  it('is building only while the check its reading woke is on it', () => {
    expect(sheetStage({ ...row, status: 'ready', reading: false, building: true })).toBe(
      'building',
    );
    expect(sheetStage({ ...row, status: 'ready', reading: false })).toBe('ready');
  });

  it('keeps a failure a failure, also once set aside, and a deleted sheet deleted', () => {
    expect(sheetStage({ ...row, status: 'failed', archived: true })).toBe('failed');
    expect(sheetStage({ ...row, status: 'ready', archived: true })).toBe('deleted');
  });
});
