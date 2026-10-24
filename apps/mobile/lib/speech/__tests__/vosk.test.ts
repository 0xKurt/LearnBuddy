// requires live verification on a real iPhone / Android phone (native bridge/decoder replaced)
import { describe, expect, it, vi } from 'vitest';
import { checkedPronunciationPlan } from '@learnbuddy/shared-types/contracts';
import { voskChecker, voskGrammar } from '../vosk.js';
import { PronunciationPacks, type PackStorage } from '../pronunciationPacks.js';

const plan = checkedPronunciationPlan('Three trees.', 'en', [['free'], ['tries']])!;
describe('Vosk checker', () => {
  it('passes competitors and unknown to the native recognizer and grades its full evidence', async () => {
    const checkPcm = vi.fn(async () =>
      JSON.stringify({
        words: [
          { word: 'free', conf: 0.99 },
          { word: 'trees', conf: 0.98 },
        ],
        unavailable: [],
      }),
    );
    const checker = voskChecker(
      { checkPcm, releaseCheckModel: vi.fn() },
      '/model',
      async () => 'pcm',
    );
    const checked = await checker.check(plan, { mime: 'audio/m4a', audio_base64: 'audio' });
    expect(voskGrammar(plan)).toEqual(['three', 'free', 'trees', 'tries', '[unk]']);
    expect(checkPcm).toHaveBeenCalledWith('/model', 'pcm', JSON.stringify(voskGrammar(plan)));
    expect(checked.result.words[0]?.verdict).toBe('unsicher');
    expect(checked.evidence.source).toBe('vosk');
  });
  it('refuses text-only bridges, malformed confidence and cancellation without a network fallback', async () => {
    for (const raw of [
      'three trees',
      JSON.stringify({ words: [{ word: 'three', conf: 2 }], unavailable: [] }),
    ]) {
      const checker = voskChecker(
        { checkPcm: async () => raw, releaseCheckModel: vi.fn() },
        '/model',
        async () => 'pcm',
      );
      await expect(
        checker.check(plan, { mime: 'audio/wav', audio_base64: 'audio' }),
      ).rejects.toThrow();
    }
    const native = vi.fn();
    const controller = new AbortController();
    controller.abort();
    await expect(
      voskChecker(
        { checkPcm: native, releaseCheckModel: vi.fn() },
        '/model',
        async () => 'pcm',
      ).check(plan, { mime: 'audio/wav', audio_base64: 'audio' }, controller.signal),
    ).rejects.toThrow('cancelled');
    expect(native).not.toHaveBeenCalled();
  });
});

describe('language pack lifecycle', () => {
  const storage = (): PackStorage => ({
    ready: vi.fn(async () => null),
    install: vi.fn(async () => '/verified'),
    remove: vi.fn(async () => {}),
  });
  it('never downloads when the device or language is unavailable', async () => {
    const files = storage();
    const unavailable = new PronunciationPacks(files, () => false);
    expect(await unavailable.install('en', vi.fn())).toEqual({ state: 'unavailable' });
    expect(await new PronunciationPacks(files, () => true).state('ru')).toEqual({
      state: 'unavailable',
    });
    expect(files.install).not.toHaveBeenCalled();
  });
  it.each(['de', 'en', 'fr', 'es', 'it'])(
    'installs a pinned official %s pack',
    async (language) => {
      const files = storage();
      expect(await new PronunciationPacks(files, () => true).install(language, vi.fn())).toEqual({
        state: 'ready',
        path: '/verified',
      });
      expect(files.install).toHaveBeenCalledWith(
        expect.objectContaining({
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          bytes: expect.any(Number),
        }),
        expect.any(Function),
      );
    },
  );
  it('cannot claim ready after checksum or install failure; removal is real', async () => {
    const files = storage();
    files.install = async (_pack, phase) => {
      phase({ state: 'verifying' });
      throw new Error('checksum');
    };
    const packs = new PronunciationPacks(files, () => true);
    const phases = vi.fn();
    expect(await packs.install('en', phases)).toEqual({ state: 'failed' });
    expect(await packs.state('en')).toEqual({ state: 'failed' });
    expect(await packs.remove('en')).toEqual({ state: 'missing' });
    expect(files.remove).toHaveBeenCalledOnce();
    expect(phases.mock.calls.flat()).not.toContainEqual({ state: 'ready' });
  });
});
