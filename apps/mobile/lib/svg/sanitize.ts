// SVG sanitization — pure-logic facade behind components/lb/SvgStimulus.
// Doc 06 §post-processing-svg-safety: the LLM may emit diagram markup, but
// we strip anything not on the presentational whitelist before handing the
// string to react-native-svg. Lives in lib/ so it can be unit-tested under
// Node (vitest is RN-free in this workspace).

const ALLOWED_TAGS = new Set([
  'svg',
  'g',
  'path',
  'rect',
  'circle',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'defs',
  'linearGradient',
  'stop',
  'ellipse',
]);

const ALLOWED_ATTRS = new Set([
  'd',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'width',
  'height',
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'font-size',
  'font-family',
  'text-anchor',
  'transform',
  'viewBox',
  'points',
  'opacity',
  'stop-color',
  'stop-opacity',
  'offset',
  'id',
  // Namespace attribute is required for the SvgXml parser to accept the
  // markup; not user-controllable to anything dangerous.
  'xmlns',
]);

export type SanitizeOutcome = {
  ok: boolean;
  svg: string;
};

/**
 * Strip every tag/attribute not in the whitelist and return either the
 * sanitized SVG or `{ ok: false }` if nothing survived. Single-pass regex
 * rewrite — generator output is a known subset of SVG, and anything that
 * fails the whitelist is dropped silently.
 */
export function sanitizeSvg(input: string): SanitizeOutcome {
  if (!input || typeof input !== 'string') return { ok: false, svg: '' };

  // Defense-in-depth rejects.
  if (/<script\b/i.test(input)) return { ok: false, svg: '' };
  if (/\bon[a-z]+\s*=/i.test(input)) return { ok: false, svg: '' };
  if (/javascript:/i.test(input)) return { ok: false, svg: '' };

  let work = input;
  if (/<!--|<!DOCTYPE|<\?xml/i.test(work)) {
    work = work
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<\?xml[\s\S]*?\?>/gi, '')
      .replace(/<!DOCTYPE[^>]*>/gi, '');
  }

  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9_-]*)\b([^>]*)>/g;
  let sawAllowed = false;
  let sawSvgRoot = false;

  const out = work.replace(tagRe, (match, rawTagName: string, rawAttrs: string) => {
    if (!ALLOWED_TAGS.has(rawTagName)) return '';
    if (rawTagName === 'svg') sawSvgRoot = true;
    sawAllowed = true;
    if (match.startsWith('</')) return `</${rawTagName}>`;
    const selfClosing = rawAttrs.trim().endsWith('/');
    const cleanedAttrs = rewriteAttrs(rawAttrs);
    return selfClosing ? `<${rawTagName}${cleanedAttrs} />` : `<${rawTagName}${cleanedAttrs}>`;
  });

  if (!sawAllowed || !sawSvgRoot) return { ok: false, svg: '' };
  const trimmed = out.trim();
  if (!/^<svg\b/i.test(trimmed)) return { ok: false, svg: '' };

  return { ok: true, svg: trimmed };
}

function rewriteAttrs(raw: string): string {
  if (!raw.trim()) return '';
  // `attr="value"` | `attr='value'` | bare `attr`.
  const attrRe =
    /([a-zA-Z_:][a-zA-Z0-9._:-]*)\s*=\s*("[^"]*"|'[^']*')|([a-zA-Z_:][a-zA-Z0-9._:-]*)/g;
  const kept: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(raw)) !== null) {
    const name = (m[1] ?? m[3] ?? '').toLowerCase();
    if (!name || !ALLOWED_ATTRS.has(name)) continue;
    if (m[2]) {
      const valueRaw = m[2].slice(1, -1);
      if (/javascript:/i.test(valueRaw)) continue;
      const t = valueRaw.trim();
      if (/^url\s*\(/i.test(t) && !/^url\(#/i.test(t)) continue;
      kept.push(`${name}="${escapeAttr(valueRaw)}"`);
    } else {
      kept.push(name);
    }
  }
  return kept.length ? ' ' + kept.join(' ') : '';
}

function escapeAttr(v: string): string {
  return v.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
