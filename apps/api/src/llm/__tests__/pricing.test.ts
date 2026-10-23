// The price table belongs to its gateway, and a recorded cost is a ceiling, never an undercount
// (issue #648, KI-Audit F §1 A2/A5–A7). Figures: the Vertex price page, read 2026-10-14.

import type { GenerateContentResponse } from '@google/genai';
import { MediaModality } from '@google/genai';
import { describe, expect, it } from 'vitest';

import { costMicros, type PriceTable, VERTEX_EU_PRICES } from '../pricing.js';
import { usageOf } from '../vertex.js';

const tokens = (
  inputTokens: number,
  audioInputTokens = 0,
  outputTokens = 0,
  thoughtTokens = 0,
) => ({
  inputTokens,
  audioInputTokens,
  outputTokens,
  thoughtTokens,
});

describe('the Vertex EU price table', () => {
  it('bills audio input on 3.1 Flash-Lite at $0.55/1M, twice its text price', () => {
    expect(
      costMicros(VERTEX_EU_PRICES, 'gemini-3.1-flash-lite', tokens(1_000_000, 1_000_000)),
    ).toBe(550_000);
    // 700 audio + 300 text tokens in, 50 out.
    expect(costMicros(VERTEX_EU_PRICES, 'gemini-3.1-flash-lite', tokens(1000, 700, 50))).toBe(
      Math.ceil(300 * 0.275 + 700 * 0.55 + 50 * 1.65),
    );
  });

  it('bills audio like text where the model has no audio price of its own (3.6 Flash)', () => {
    expect(costMicros(VERTEX_EU_PRICES, 'gemini-3.6-flash', tokens(1000, 1000))).toBe(
      costMicros(VERTEX_EU_PRICES, 'gemini-3.6-flash', tokens(1000)),
    );
  });

  it('bills thinking as output', () => {
    expect(costMicros(VERTEX_EU_PRICES, 'gemini-3.6-flash', tokens(0, 0, 100, 900))).toBe(
      Math.ceil(1000 * 4.125),
    );
  });

  it('keeps the net introductory price of 3.6/3.7/3.8 Flash in eu', () => {
    for (const m of ['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.8-flash']) {
      expect(VERTEX_EU_PRICES.models[m]).toEqual({
        inputPerM: 0.825,
        cachedInputPerM: 0.0825,
        outputPerM: 4.125,
      });
    }
  });

  it('carries no model the eu endpoint does not offer (2.5 is gone on 2026-10-20)', () => {
    expect(Object.keys(VERTEX_EU_PRICES.models).filter((m) => m.startsWith('gemini-2.5'))).toEqual(
      [],
    );
  });

  it('prices an unknown model at the table’s most expensive figure on every axis', () => {
    const table: PriceTable = {
      source: 'test',
      readOn: '2026-10-14',
      models: {
        a: { inputPerM: 1, outputPerM: 2, audioInputPerM: 5 },
        b: { inputPerM: 3, outputPerM: 1 },
      },
    };
    expect(costMicros(table, 'unknown', tokens(10, 4, 10))).toBe(6 * 3 + 4 * 5 + 10 * 2);
  });

  it('never counts more audio than input', () => {
    expect(costMicros(VERTEX_EU_PRICES, 'gemini-3.1-flash-lite', tokens(100, 500))).toBe(
      Math.ceil(100 * 0.55),
    );
  });
});

describe('usage from Vertex reads the audio part of the prompt', () => {
  it('prices the audio tokens the provider reported per modality', () => {
    const response = {
      usageMetadata: {
        promptTokenCount: 1000,
        candidatesTokenCount: 50,
        promptTokensDetails: [
          { modality: MediaModality.TEXT, tokenCount: 300 },
          { modality: MediaModality.AUDIO, tokenCount: 700 },
        ],
      },
    } as GenerateContentResponse;
    const usage = usageOf('gemini-3.1-flash-lite', response, 10);
    expect(usage.costMicros).toBe(Math.ceil(300 * 0.275 + 700 * 0.55 + 50 * 1.65));
  });
});
