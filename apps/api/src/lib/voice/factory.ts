// Voice gateway factory — mirror of lib/llm/factory.ts.
//
// 'vertex' → real GCP Speech-to-Text v2 + Text-to-Speech.
// 'fake'   → deterministic stub for tests (echoes input, returns
//             tiny silent audio).
//
// Selection rules (same as LLM factory):
//   * env.VOICE_BACKEND overrides everything.
//   * NODE_ENV='test' → fake.
//   * GOOGLE_CLOUD_PROJECT present → vertex.
//   * Otherwise: throw at boot. Silent fake voice in prod is a real
//     bug (parent demos the app and hears "transcript echo" instead
//     of real STT — looks broken).

import type { Env } from '../env.js';
import type { STTGateway, TTSGateway } from './gateway.js';
import { FakeSTTGateway, FakeTTSGateway } from './fake.js';
import { VertexSpeechGateway } from './vertex-speech.js';
import { VertexTTSGateway } from './vertex-tts.js';

function pickBackend(env: Env): 'vertex' | 'fake' {
  if (env.VOICE_BACKEND) return env.VOICE_BACKEND;
  if (env.NODE_ENV === 'test') return 'fake';
  if (env.GOOGLE_CLOUD_PROJECT) return 'vertex';
  throw new Error(
    'Voice factory: no STT/TTS backend resolvable. Set GOOGLE_CLOUD_PROJECT or ' +
      'VOICE_BACKEND=fake explicitly.',
  );
}

export function createSTTGateway(env: Env): STTGateway {
  return pickBackend(env) === 'vertex' ? new VertexSpeechGateway(env) : new FakeSTTGateway();
}

export function createTTSGateway(env: Env): TTSGateway {
  return pickBackend(env) === 'vertex' ? new VertexTTSGateway(env) : new FakeTTSGateway();
}
