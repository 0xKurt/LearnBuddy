// Models write LaTeX inside JSON strings. A single backslash there is a JSON
// escape: "\times" arrives as TAB + "imes", "\frac" as FORM FEED + "rac",
// "\beta" as BACKSPACE + "eta" (seen live: "7 <TAB>imes 4"). These control
// characters never belong in our texts, so they are turned back into the
// command they came from. Newline and carriage return are real line breaks
// in prose, so they are repaired only inside $…$ math.

const ALWAYS: Record<string, string> = { '\t': 't', '\f': 'f', '\b': 'b' };
const IN_MATH: Record<string, string> = { ...ALWAYS, '\n': 'n', '\r': 'r' };

function repair(s: string, map: Record<string, string>): string {
  return s.replace(/[\t\f\b\n\r](?=[a-zA-Z])/g, (c) => (map[c] ? `\\${map[c]}` : c));
}

/** One string: control characters from lost LaTeX backslashes become the backslash again. */
export function repairLatexEscapes(s: string): string {
  if (!/[\t\f\b\n\r]/.test(s)) return s;
  // Inside $…$ also \n and \r ("\neq", "\right"); outside only what never is prose.
  return s
    .split(/(\$[^$]*\$)/)
    .map((part) => repair(part, part.startsWith('$') && part.endsWith('$') ? IN_MATH : ALWAYS))
    .join('');
}

/** Every string in a parsed JSON value. */
export function repairJsonStrings(value: unknown): unknown {
  if (typeof value === 'string') return repairLatexEscapes(value);
  if (Array.isArray(value)) return value.map(repairJsonStrings);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, repairJsonStrings(v)]));
  }
  return value;
}
