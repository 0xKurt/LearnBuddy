// Unit tests for lib/svg/sanitize.ts — pure logic, runs under Node.

import { describe, expect, it } from 'vitest';

import { sanitizeSvg } from '../sanitize.js';

describe('sanitizeSvg', () => {
  it('passes a whitelisted SVG through largely unchanged', () => {
    const input =
      '<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="5" cy="5" r="4" fill="#abc" stroke="#000" stroke-width="1" />' +
      '</svg>';
    const out = sanitizeSvg(input);
    expect(out.ok).toBe(true);
    expect(out.svg).toContain('<svg');
    expect(out.svg).toContain('<circle');
    expect(out.svg).toContain('fill="#abc"');
  });

  it('strips <script> tags entirely', () => {
    const input =
      '<svg viewBox="0 0 10 10"><script>alert(1)</script><rect x="0" y="0" width="10" height="10" /></svg>';
    const out = sanitizeSvg(input);
    expect(out.ok).toBe(false);
  });

  it('rejects onclick / event-handler attributes', () => {
    const input = '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" onclick="x()" /></svg>';
    const out = sanitizeSvg(input);
    expect(out.ok).toBe(false);
  });

  it('rejects javascript: URLs', () => {
    const input = '<svg viewBox="0 0 10 10"><path d="M0 0" fill="javascript:alert(1)" /></svg>';
    const out = sanitizeSvg(input);
    expect(out.ok).toBe(false);
  });

  it('drops disallowed tags but keeps the rest', () => {
    const input =
      '<svg viewBox="0 0 10 10"><foreignObject><div>hi</div></foreignObject><circle cx="5" cy="5" r="4" /></svg>';
    const out = sanitizeSvg(input);
    expect(out.ok).toBe(true);
    expect(out.svg).not.toContain('foreignObject');
    expect(out.svg).not.toContain('<div');
    expect(out.svg).toContain('<circle');
  });

  it('drops disallowed attributes silently', () => {
    const input =
      '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" onerror="x()" data-bad="oops" fill="red" /></svg>';
    const out = sanitizeSvg(input);
    expect(out.ok).toBe(false);
  });

  it('returns ok=false on empty input', () => {
    expect(sanitizeSvg('').ok).toBe(false);
    expect(sanitizeSvg('   ').ok).toBe(false);
  });

  it('returns ok=false on non-SVG markup', () => {
    expect(sanitizeSvg('<html><body>nope</body></html>').ok).toBe(false);
  });

  it('allows linearGradient / stop in defs', () => {
    const input =
      '<svg viewBox="0 0 10 10"><defs><linearGradient id="g1">' +
      '<stop offset="0" stop-color="#fff" /><stop offset="1" stop-color="#000" />' +
      '</linearGradient></defs><rect x="0" y="0" width="10" height="10" fill="url(#g1)" /></svg>';
    const out = sanitizeSvg(input);
    expect(out.ok).toBe(true);
    expect(out.svg).toContain('linearGradient');
    expect(out.svg).toContain('url(#g1)');
  });

  it('strips XML/DOCTYPE preambles', () => {
    const input =
      '<?xml version="1.0"?><!DOCTYPE svg><svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" /></svg>';
    const out = sanitizeSvg(input);
    expect(out.ok).toBe(true);
    expect(out.svg.startsWith('<svg')).toBe(true);
  });
});
