// GCP Speech-to-Text connectivity probe. Exercises the API in two ways
// (listRecognizers, recognize) in two regions (global, eu) so we can
// pinpoint whether a failure is auth, IAM, region, or model.
//
// Run:  pnpm -F @learnbuddy/api probe:stt
//
// Reads env from .env.local — uses GOOGLE_APPLICATION_CREDENTIALS for ADC.

import { config as loadDotenv } from 'dotenv';

loadDotenv({ path: '.env.local' });

import { v2 } from '@google-cloud/speech';

type GrpcError = Error & {
  code?: number | string;
  details?: string;
  metadata?: unknown;
  statusDetails?: unknown;
};

function formatError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const e = err as GrpcError;
  const parts = [
    `  name:    ${e.name}`,
    `  code:    ${e.code ?? '(none)'}`,
    `  message: ${e.message}`,
  ];
  if (e.details) parts.push(`  details: ${e.details}`);
  if (e.statusDetails) parts.push(`  statusDetails: ${JSON.stringify(e.statusDetails)}`);
  return parts.join('\n');
}

async function probeList(client: v2.SpeechClient, location: string, project: string) {
  const parent = `projects/${project}/locations/${location}`;
  console.log(`\n→ listRecognizers(${parent})`);
  try {
    const [recognizers] = await client.listRecognizers({ parent, pageSize: 1 });
    console.log(`  ✓ ok — ${recognizers.length} recognizer(s) listed`);
    return true;
  } catch (err) {
    console.log('  ✗ FAILED');
    console.log(formatError(err));
    return false;
  }
}

async function probeRecognize(
  client: v2.SpeechClient,
  location: string,
  project: string,
  model: string,
) {
  const recognizer = `projects/${project}/locations/${location}/recognizers/_`;
  console.log(`\n→ recognize(${recognizer}, model=${model}) with 1s silent LINEAR16`);
  // 1 second of silence: 16000 samples × 2 bytes (16-bit) = 32000 bytes
  const silentPcm = Buffer.alloc(32000);
  const content = silentPcm.toString('base64');
  try {
    const [result] = await client.recognize({
      recognizer,
      config: {
        explicitDecodingConfig: {
          encoding: 'LINEAR16',
          sampleRateHertz: 16000,
          audioChannelCount: 1,
        },
        languageCodes: ['auto'],
        model,
      },
      content,
    });
    console.log(`  ✓ ok — results: ${JSON.stringify(result.results ?? [])}`);
    return true;
  } catch (err) {
    console.log('  ✗ FAILED');
    console.log(formatError(err));
    return false;
  }
}

async function main() {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  if (!project) {
    console.error('GOOGLE_CLOUD_PROJECT missing — set it in apps/api/.env.local');
    process.exit(2);
  }
  console.log(`Project: ${project}`);
  console.log(
    `Credentials: ${process.env.GOOGLE_APPLICATION_CREDENTIALS ?? '(ADC / GOOGLE_APPLICATION_CREDENTIALS_JSON)'}`,
  );

  // Sweep across the (region, endpoint, model) combinations most likely
  // to work, so we can pick the lowest-latency one chirp_2 actually
  // exists in. chirp_2 has limited regional rollout — only specific
  // single-region locations carry it.
  const combos: Array<{ region: string; endpoint?: string; model: string }> = [
    // chirp_2 — only specific regions
    { region: 'europe-west4', endpoint: 'europe-west4-speech.googleapis.com', model: 'chirp_2' },
    { region: 'us-central1', endpoint: 'us-central1-speech.googleapis.com', model: 'chirp_2' },
    // chirp — broader rollout, supports multilingual auto-detect
    { region: 'eu', endpoint: 'eu-speech.googleapis.com', model: 'chirp' },
    { region: 'global', model: 'chirp' },
    // latest_short — latency-optimised, multilingual-capable
    { region: 'eu', endpoint: 'eu-speech.googleapis.com', model: 'latest_short' },
    { region: 'global', model: 'latest_short' },
  ];

  for (const { region, endpoint, model } of combos) {
    console.log(
      `\n══════════ ${region} via ${endpoint ?? 'default endpoint'} | model=${model} ══════════`,
    );
    const client = new v2.SpeechClient(endpoint ? { apiEndpoint: endpoint } : {});
    await probeList(client, region, project);
    await probeRecognize(client, region, project, model);
    await client.close();
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Unhandled probe error:', err);
  process.exit(1);
});
