// One bounded, audio-in/text-out session per recording. No transcription, stored conversation,
// provider fallback or reconnect. One forced function returns the structured verdict. The existing pronunciation contract still judges JSON.
import type OpenAI from 'openai';
import { realtimeResponse } from './realtime.js';
import type { RealtimeConversationItemUserMessage } from 'openai/resources/realtime/realtime';
import { LlmError, TRUNCATED, type LlmRequest, type LlmResult } from '../llm/gateway.js';
import { audioUsage } from './audio-usage.js';
import { realtimePcm } from './audio-codec.js';

export async function realtimePronunciation(
  client: OpenAI,
  model: string,
  req: LlmRequest,
  signal: AbortSignal,
): Promise<LlmResult> {
  const started = performance.now();
  const input: RealtimeConversationItemUserMessage[] = [];
  for (const message of req.contents) {
    if (message.role !== 'user')
      throw new LlmError('refused', 'Audio judgement expects a user recording');
    const content: RealtimeConversationItemUserMessage['content'] = [];
    for (const part of message.parts) {
      if ('text' in part) content.push({ type: 'input_text', text: part.text });
      else if ('inlineData' in part && part.inlineData.mimeType.startsWith('audio/'))
        content.push({ type: 'input_audio', audio: await realtimePcm(part.inlineData, signal) });
      else throw new LlmError('refused', 'Audio judgement cannot accept other media');
    }
    input.push({ type: 'message', role: 'user', content });
  }
  let text = '';
  const response = await realtimeResponse(
    client,
    model,
    signal,
    {
      type: 'realtime',
      output_modalities: ['text'],
      tracing: null,
      audio: { input: { format: { type: 'audio/pcm', rate: 24000 }, turn_detection: null } },
    },
    {
      output_modalities: ['text'],
      input,
      instructions: req.system,
      tools: [
        {
          type: 'function',
          name: 'pronunciation',
          description: 'Return the audio judgement.',
          parameters: req.schema,
        },
      ],
      tool_choice: { type: 'function', name: 'pronunciation' },
      max_output_tokens: Math.min(req.maxOutputTokens, 4096),
    },
    (event) => {
      if (event.type === 'response.function_call_arguments.delta') {
        text += event.delta;
        req.onPartial?.(text);
      }
    },
  );
  const usage = audioUsage(
    model,
    response.usage,
    Math.round(performance.now() - started),
    Math.ceil(JSON.stringify(input).length / 4),
  );
  if (response.status_details?.reason === 'content_filter')
    throw new LlmError('blocked', 'Audio provider withheld the answer', usage);
  if (response.status_details?.reason === 'max_output_tokens')
    throw new LlmError('invalid_output', 'Audio judgement truncated', usage, TRUNCATED);
  if (response.status !== 'completed')
    throw new LlmError('unavailable', 'Audio judgement did not complete', usage);
  const final =
    response.output
      ?.flatMap((item) =>
        item.type === 'function_call' && item.name === 'pronunciation' ? [item.arguments] : [],
      )
      .join('') ?? '';
  try {
    return { json: JSON.parse(final), usage, attempts: 1 };
  } catch {
    throw new LlmError('invalid_output', 'Audio judgement was not JSON', usage);
  }
}
