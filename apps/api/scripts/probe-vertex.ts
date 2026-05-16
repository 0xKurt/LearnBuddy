// Vertex AI connectivity probe. Runs the simplest possible generateContent
// call against the configured project/region/model and prints token usage.
//
// Run:  pnpm -F @learnbuddy/api probe:vertex
//
// Reads env from process.env. Honors the standard Google Application
// Default Credentials chain — GOOGLE_APPLICATION_CREDENTIALS pointing at
// the service-account JSON downloaded from the GCP console.

import { config as loadDotenv } from 'dotenv';

loadDotenv({ path: '.env.local' });

import { VertexLlmGateway } from '../src/lib/llm/vertex.js';
import { Env } from '../src/lib/env.js';

async function main() {
  // The probe doesn't need Supabase — feed dummy values so loadEnv's full
  // schema validates, and use only the Vertex-relevant fields.
  const env = Env.parse({
    ...process.env,
    SUPABASE_URL: process.env.SUPABASE_URL ?? 'http://localhost:54321',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? 'probe-anon-key-0000000',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'probe-service-key-0000000',
  });
  if (!env.GOOGLE_CLOUD_PROJECT) {
    console.error('GOOGLE_CLOUD_PROJECT missing from env — set it in apps/api/.env.local');
    process.exit(2);
  }

  console.log(`Probing Vertex AI:
  project  = ${env.GOOGLE_CLOUD_PROJECT}
  location = ${env.GOOGLE_VERTEX_LOCATION}
  model    = ${env.VERTEX_MODEL_ID}
  creds    = ${env.GOOGLE_APPLICATION_CREDENTIALS ?? '(ADC from GOOGLE_APPLICATION_CREDENTIALS_JSON or ambient gcloud)'}
`);

  const gateway = new VertexLlmGateway(env);

  // 1x1 white JPEG so the vision pipeline has a real (uninformative) input.
  const WHITE_1X1_JPEG_BASE64 =
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKpgB//Z';

  console.log('→ calling visionExtractAndGenerate with one 1×1 JPEG, target_count=2 …');
  const t0 = Date.now();
  try {
    const result = await gateway.visionExtractAndGenerate({
      images: [{ mimeType: 'image/jpeg', data: WHITE_1X1_JPEG_BASE64 }],
      locale: 'de',
      gradeLevel: 7,
      subject: 'Mathematik',
      subjectKind: 'math',
      targetCount: 2,
    });
    const ms = Date.now() - t0;
    console.log(`\n← Vertex returned in ${ms}ms`);
    console.log(`  detected_language: ${result.detected_language ?? '(null)'}`);
    console.log(`  items.length:      ${result.items.length}`);
    console.log(`  diagrams.length:   ${result.diagrams.length}`);
    console.log(`  error:             ${result.error ?? 'null'}`);
    console.log(`  usage:             ${JSON.stringify(result.usage)}`);
    if (result.items[0]) {
      console.log(`  first item.question: ${JSON.stringify(result.items[0].question)}`);
    }
    console.log('\nOK — Vertex auth + JSON output works.');
  } catch (err) {
    console.error('\n✗ Probe FAILED:', err instanceof Error ? err.message : err);
    if (err instanceof Error && err.stack) {
      console.error(err.stack.split('\n').slice(0, 5).join('\n'));
    }
    console.error(`
Common causes:
  PERMISSION_DENIED      → service account missing "Vertex AI User" role
  Could not load default credentials → GOOGLE_APPLICATION_CREDENTIALS not set
  404 / NOT_FOUND        → wrong region or model id
  RESOURCE_EXHAUSTED     → quota; request increase in Console → Quotas
`);
    process.exit(1);
  }
}

main();
