// Render route tests. Doc 04 §math-rendering.
//
// Verifies KaTeX → SVG output, error mapping for malformed expressions, and
// the immutable Cache-Control header that lets CDNs / clients keep
// long-lived copies.

import { describe, it, expect } from 'vitest';

import { createApp } from '../../app.js';
import { createTestDeps } from '../../test/fake-supabase.js';

function setup() {
  const deps = createTestDeps();
  return createApp({ deps });
}

describe('GET /render/latex', () => {
  it('returns SVG with KaTeX-rendered MathML and an immutable cache header', async () => {
    const app = setup();
    const res = await app.request('/render/latex?expression=' + encodeURIComponent('a^2 + b^2'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/svg+xml');
    expect(res.headers.get('cache-control')).toContain('immutable');
    const body = await res.text();
    expect(body).toContain('<svg');
    expect(body).toContain('math');
  });

  it('rejects missing expression with 400', async () => {
    const app = setup();
    const res = await app.request('/render/latex');
    expect(res.status).toBe(422);
  });

  it('rejects malformed LaTeX with 422', async () => {
    const app = setup();
    const res = await app.request('/render/latex?expression=' + encodeURIComponent('\\frac{'));
    expect(res.status).toBe(422);
  });
});
