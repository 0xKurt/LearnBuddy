// requires live verification in Claude Code session
// Real app/player/AudioContext; only the external speech byte stream is scripted.
import { expect, test } from '@playwright/test';
import { bothSchemes } from './fit';
import { onboardTalker, sayOneThing } from './talk';

test('PCM is rendered before EOF, and interruption stops the stream and queued sound', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const proof = { requested: 0, rendered: 0, eof: false, aborted: false, stopped: 0 };
    Object.assign(window, { pcmProof: proof });
    const OriginalSource = AudioBufferSourceNode;
    window.AudioBufferSourceNode = class extends OriginalSource {
      constructor(context: BaseAudioContext, options?: AudioBufferSourceOptions) {
        super(context, options);
        const analyser = context.createAnalyser();
        const mute = context.createGain();
        mute.gain.value = 0;
        this.connect(analyser);
        analyser.connect(mute);
        mute.connect(context.destination);
        const samples = new Float32Array(analyser.fftSize);
        const timer = setInterval(() => {
          analyser.getFloatTimeDomainData(samples);
          if (!proof.rendered && samples.some((x) => Math.abs(x) > 0.01))
            proof.rendered = performance.now();
        }, 5);
        this.addEventListener('ended', () => {
          clearInterval(timer);
          proof.stopped++;
        });
      }
    };
    const original = window.fetch;
    window.fetch = async (url, init) => {
      if (!String(url).endsWith('/v1/voice/speech')) return original(url, init);
      proof.requested = performance.now();
      const tone = new Uint8Array(24000 * 2);
      const view = new DataView(tone.buffer);
      for (let i = 0; i < 24000; i++)
        view.setInt16(i * 2, Math.round(4000 * Math.sin((i / 24000) * Math.PI * 880)), true);
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(tone);
          let sent = 1;
          const timer = setInterval(() => {
            if (init?.signal?.aborted) {
              clearInterval(timer);
              return;
            }
            controller.enqueue(tone);
            if (++sent === 30) {
              clearInterval(timer);
              proof.eof = true;
              controller.close();
            }
          }, 500);
          init?.signal?.addEventListener(
            'abort',
            () => {
              clearInterval(timer);
              proof.aborted = true;
              controller.error(new Error('stopped'));
            },
            { once: true },
          );
        },
      });
      return new Response(body, { headers: { 'content-type': 'audio/pcm' } });
    };
  });
  await onboardTalker(page, 'pcm');
  await sayOneThing(page, true);
  await expect(page.getByText('Buddy spricht …')).toBeVisible();
  const proof = () =>
    page.evaluate(
      () =>
        (
          window as unknown as {
            pcmProof: {
              requested: number;
              rendered: number;
              eof: boolean;
              aborted: boolean;
              stopped: number;
            };
          }
        ).pcmProof,
    );
  await expect.poll(async () => (await proof()).rendered).toBeGreaterThan(0);
  const first = await proof();
  expect(first.eof).toBe(false);
  expect(first.rendered - first.requested).toBeLessThan(600);
  await bothSchemes(page, '926-pcm-speaking');
  await page.getByRole('button', { name: 'Unterbrechen und sprechen' }).first().click();
  await expect.poll(async () => (await proof()).aborted).toBe(true);
  await expect(page.getByText('Buddy spricht …')).toHaveCount(0);
  await page.getByRole('button', { name: 'Beenden' }).last().click();
});
