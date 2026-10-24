// Syntax, not language understanding: chat is prose and figures are structured acts (#934).
export function replyFormatErrors(reply: string): string[] {
  const fence = /`{3,}|~{3,}/.test(reply);
  const box = /[\u2500-\u257f]/u.test(reply);
  const drawingLines = reply
    .split('\n')
    .filter((line) => /^\s*[|/\\+_]/.test(line) && !/^\s*(?:\\[a-zA-Z]|\|[^|]+\|\s*$)/.test(line));
  const joinedStrokes = drawingLines.some((line) =>
    /^\s*[|/\\+_](?:[ \t]*[|/\\+_]){2,}/.test(line),
  );
  if (!fence && !box && drawingLines.length < 2 && !joinedStrokes) return [];
  return [
    'reply: use prose, never code fences or text drawings; show pictures through an available action',
  ];
}

/** Withhold incomplete delimiters too: streamed prefixes must not leak a code fence. */
export function visibleReplyPrefix(reply: string, done = false): string {
  if (replyFormatErrors(reply).length) return '';
  if (done) return reply;
  // A later line can identify the preceding ones as a drawing. Keep the whole block
  // private until complete; the ordinary first prose line still streams immediately.
  const first = reply.split('\n', 1)[0] ?? '';
  if (
    /^\s*[|/\\+_`~]/.test(first) ||
    /^\s*[\p{L}\p{N}]\s*$/u.test(first) ||
    /^\s*[\p{L}\p{N}]\s+[^\p{L}\p{N}\s]/u.test(first)
  )
    return '';
  return first.replace(/[`~]+$/, '');
}
