// **bold** in texts the model writes (it likes Markdown emphasis): shown bold,
// never as raw asterisks, and not read out by screen readers.

export type EmphasisRun = { text: string; bold: boolean };

export function splitEmphasis(text: string): EmphasisRun[] {
  const runs: EmphasisRun[] = [];
  const re = /\*\*([^*\n]+?)\*\*/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) runs.push({ text: text.slice(last, m.index), bold: false });
    runs.push({ text: m[1] ?? '', bold: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last), bold: false });
  return runs;
}

export function withoutEmphasis(text: string): string {
  return splitEmphasis(text)
    .map((r) => r.text)
    .join('');
}
