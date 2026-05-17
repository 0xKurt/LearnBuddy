// GET /render/latex — public, cacheable. Doc 04 §math-rendering.
//
// Takes ?expression=... (URL-encoded LaTeX) and an optional ?display=block.
// Returns a self-contained SVG that mobile clients can render with
// react-native-svg without shipping the full katex bundle.
//
// We render via KaTeX to MathML (no external font loading needed) and wrap
// it in an SVG `<foreignObject>` so a single response renders identically on
// every platform. Failures map to validation_failed so the client can fall
// back to text rendering.
//
// Public endpoint — no auth. Aggressively cached (1 year, immutable) because
// the LaTeX expression is the cache key.

import { Hono } from 'hono';
import katex from 'katex';

import { ApiError } from '../lib/errors.js';

export const renderRoutes = new Hono();

const MAX_EXPRESSION_LEN = 2_000;

renderRoutes.get('/latex', (c) => {
  const expression = c.req.query('expression');
  const displayMode = c.req.query('display') === 'block';
  if (!expression) {
    throw new ApiError('validation_failed', 'Missing ?expression= query param');
  }
  if (expression.length > MAX_EXPRESSION_LEN) {
    throw new ApiError('validation_failed', `expression must be ≤ ${MAX_EXPRESSION_LEN} chars`);
  }

  let html: string;
  try {
    html = katex.renderToString(expression, {
      displayMode,
      throwOnError: true,
      strict: 'ignore',
      output: 'mathml',
    });
  } catch (err) {
    throw new ApiError(
      'validation_failed',
      err instanceof Error ? `KaTeX parse error: ${err.message}` : 'KaTeX parse error',
    );
  }

  // Wrap the MathML output in an SVG foreignObject. Width/height are sized
  // generously; the client should treat the SVG as intrinsic-sized and let
  // react-native-svg compute the bounding box. 16px font matches the
  // mobile body type token.
  const svg =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 120">` +
    `<foreignObject width="100%" height="100%">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="font-size:16px;color:#1a1a1a;">${html}</div>` +
    `</foreignObject>` +
    `</svg>`;

  c.header('Cache-Control', 'public, max-age=31536000, immutable');
  c.header('Content-Type', 'image/svg+xml; charset=utf-8');
  return c.body(svg);
});
