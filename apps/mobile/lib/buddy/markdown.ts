// The little Markdown Buddy's replies use, as blocks to draw: paragraphs (with
// their line breaks), bulleted and numbered lists. Inline emphasis (**bold**,
// *italic*) and the notation a domain draws ($…$ math) stay in the text: the inline renderer
// draws them (components/lb/InlineText.tsx). Where that notation stands comes from the domain
// (lib/buddy/notation.ts); without one, every character is plain text. Nothing else is
// interpreted — no links, no images, no HTML: "<b>" stays the four characters it is. Pure
// logic without React Native imports (unit tests).

import { withoutEmphasis } from './emphasis.js';
import { notationSpans } from './notation.js';

export type MdBlock =
  | { type: 'para'; text: string }
  | { type: 'list'; ordered: boolean; items: { marker: string; text: string }[] };

const BULLET = /^\s{0,3}[-*•–]\s+(.*)$/s;
const NUMBERED = /^\s{0,3}(\d{1,3})[.)]\s+(.*)$/s;
const HEADING = /^\s{0,3}#{1,6}\s+(.*)$/s;

/** The reply as blocks. A reply without Markdown is one paragraph, exactly as written. */
export function markdownBlocks(text: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  let para: string[] = [];
  let list: Extract<MdBlock, { type: 'list' }> | null = null;
  const flushPara = () => {
    if (para.length > 0) blocks.push({ type: 'para', text: para.join('\n') });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push(list);
    list = null;
  };
  for (const line of logicalLines(text)) {
    if (line.trim() === '') {
      flushPara();
      flushList();
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      const ordered = numbered !== null;
      flushPara();
      if (list && list.ordered !== ordered) flushList();
      if (!list) list = { type: 'list', ordered, items: [] };
      list.items.push(
        numbered
          ? { marker: `${numbered[1]}.`, text: (numbered[2] ?? '').trim() }
          : { marker: '•', text: (bullet?.[1] ?? '').trim() },
      );
      continue;
    }
    const heading = HEADING.exec(line);
    // A line right under a list item that is indented belongs to that item.
    const current = list as Extract<MdBlock, { type: 'list' }> | null;
    const lastItem = current?.items[current.items.length - 1];
    if (lastItem && /^\s{2,}\S/.test(line)) {
      lastItem.text = `${lastItem.text}\n${line.trim()}`;
      continue;
    }
    flushList();
    // A heading is a bold line of its own (Buddy's bubble has one headline style: the text).
    para.push(heading ? `**${(heading[1] ?? '').replace(/\*\*/g, '').trim()}**` : line);
  }
  flushPara();
  flushList();
  return blocks.length > 0 ? blocks : [{ type: 'para', text }];
}

/**
 * The lines of the text; a line break inside a piece of notation ($…$ math) does not end a
 * line (the formula stays one piece).
 */
function logicalLines(text: string): string[] {
  const spans = notationSpans(text);
  const lines: string[] = [];
  let cur = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (ch === '\n' && !spans.some((s) => i > s.start && i < s.end)) {
      lines.push(cur);
      cur = '';
    } else cur += ch;
  }
  lines.push(cur);
  return lines;
}

/**
 * The reply for a copy: the markers gone, the list items on their lines with "•" or their
 * number. `spoken` (a voice, a screen reader): no bullet, and every list item ends as a
 * sentence, so the voice pauses between them.
 */
export function markdownPlain(text: string, opts: { spoken?: boolean } = {}): string {
  const item = (s: string) => (opts.spoken && !/[.!?:;,…]$/.test(s.trim()) ? `${s.trim()}.` : s);
  return markdownBlocks(text)
    .map((b) =>
      b.type === 'para'
        ? withoutMarkers(b.text)
        : b.items
            .map((i) =>
              item(`${b.ordered || !opts.spoken ? `${i.marker} ` : ''}${withoutMarkers(i.text)}`),
            )
            .join('\n'),
    )
    .join('\n\n');
}

const ITALIC_MARK =
  /(?<![*\w])\*(?![\s*])([^*\n]+?)(?<![\s*])\*(?![*\w])|(?<![\w_])_(?![\s_])([^_\n]+?)(?<![\s_])_(?![\w_])/g;

/** One run of text without its emphasis markers — what is drawn where no domain draws it. */
export function withoutMarkers(text: string): string {
  // Notation keeps its own characters: only the text outside $…$ loses its markers.
  const spans = notationSpans(text);
  let out = '';
  let last = 0;
  for (const s of spans) {
    out += stripInline(text.slice(last, s.start)) + text.slice(s.start, s.end);
    last = s.end;
  }
  return out + stripInline(text.slice(last));
}

function stripInline(text: string): string {
  return withoutEmphasis(text).replace(ITALIC_MARK, (_m, a: string | undefined, b?: string) =>
    String(a ?? b ?? ''),
  );
}

/**
 * A reply cut off while it is written shows up to the last complete piece: an unfinished
 * formula is left out until it is complete, and a "**" that is not closed yet is not
 * shown as two stars.
 */
export function closedStream(text: string): string {
  const dollars = text.match(/(?<!\\)\$/g)?.length ?? 0;
  let out = dollars % 2 === 0 ? text : text.slice(0, text.lastIndexOf('$'));
  const doubles = out.match(/\*\*/g)?.length ?? 0;
  if (doubles % 2 === 1) {
    const at = out.lastIndexOf('**');
    out = out.slice(0, at) + out.slice(at + 2);
  }
  return out;
}
