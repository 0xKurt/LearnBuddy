// Ein VexFlow-`RenderContext`, der statt DOM-Knoten eine SVG-Zeichenkette schreibt (issue #312).
//
// So sticht VexFlow unter React Native ohne DOM, ohne Canvas und ohne WebView, und das Ergebnis
// zeichnet `SvgXml` aus react-native-svg — auf iOS, Android und im Web dasselbe Bild. VexFlow 4
// zeichnet jedes Zeichen als Pfad aus den mitgelieferten Bravura-Umrissen, also muss keine
// Musikschrift auf dem Gerät liegen (VexFlow 5 misst Schrift mit Canvas und ginge so nicht,
// `scratchpad/libs-312.md`).
//
// Farben kommen aus dem Thema (`useTheme`), nie als feste Werte: VexFlows graue Notenlinien werden
// die Linienfarbe, die eine Farbe, die wir selbst über `setStyle` an eine Note hängen (die gerade
// gesetzte Note der Schreibfläche), bleibt sie, und alles andere ist Tinte.

import { RenderContext, type FontInfo, type TextMeasure } from 'vexflow/bravura';

/** Die Farben einer Zeichnung — Werte aus `useTheme()`, durchgereicht. */
export type StaffInk = {
  /** Köpfe, Hälse, Schlüssel, Taktstriche. */
  ink: string;
  /** Die fünf Linien. */
  lines: string;
  /** Die ausgewählte Note und der Schreibstrich. */
  accent: string;
};

/** Zahlen kurz halten: zwei Nachkommastellen reichen bei 10 Einheiten je Linienabstand. */
export const r2 = (n: number): string => String(Math.round(n * 100) / 100);

/** VexFlows Grau für Notenlinien (`Stave`), das wir in der Linienfarbe zeichnen. */
const VEXFLOW_LINE_GREY = '#999999';

/** Text und Attributwerte in SVG: `&`, `<`, `>` und `"` sind Markup. */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export class SvgStringContext extends RenderContext {
  private parts: string[] = [];
  private d = '';
  private fillColor: string;
  private strokeColor: string;
  private lineWidth = 1;
  private dash: number[] | null = null;
  private stack: Array<{ fill: string; stroke: string; lineWidth: number }> = [];
  private fontText = '10pt Arial';
  /** Wie weit die Tinte reicht — damit eine gelesene Zeile genau so groß wird wie ihr Inhalt. */
  minX = Infinity;
  minY = Infinity;
  maxX = -Infinity;
  maxY = -Infinity;

  constructor(private readonly colors: StaffInk) {
    super();
    this.fillColor = colors.ink;
    this.strokeColor = colors.ink;
  }

  private color(style: string): string {
    const lower = style.toLowerCase();
    if (lower === VEXFLOW_LINE_GREY) return this.colors.lines;
    if (style === this.colors.accent) return this.colors.accent;
    return this.colors.ink;
  }

  /** Ein Punkt, an dem Tinte liegt. */
  see(x: number, y: number): void {
    if (x < this.minX) this.minX = x;
    if (y < this.minY) this.minY = y;
    if (x > this.maxX) this.maxX = x;
    if (y > this.maxY) this.maxY = y;
  }

  /** Eigene Zeichen (Hintergrund, Ring, Beschriftung) vor oder nach VexFlows Tinte einfügen. */
  under(svg: string): void {
    this.parts.unshift(svg);
  }
  over(svg: string): void {
    this.parts.push(svg);
  }

  clear(): void {
    this.parts = [];
  }
  setFillStyle(style: string): this {
    this.fillColor = this.color(style);
    return this;
  }
  setBackgroundFillStyle(): this {
    return this;
  }
  setStrokeStyle(style: string): this {
    this.strokeColor = this.color(style);
    return this;
  }
  setShadowColor(): this {
    return this;
  }
  setShadowBlur(): this {
    return this;
  }
  setLineWidth(width: number): this {
    this.lineWidth = width;
    return this;
  }
  setLineCap(): this {
    return this;
  }
  setLineDash(pattern: number[]): this {
    this.dash = pattern.length > 0 ? pattern : null;
    return this;
  }
  scale(): this {
    return this;
  }
  resize(): this {
    return this;
  }
  rect(x: number, y: number, w: number, h: number): this {
    this.see(x, y);
    this.see(x + w, y + h);
    this.d += `M${r2(x)} ${r2(y)}h${r2(w)}v${r2(h)}h${r2(-w)}Z`;
    return this;
  }
  fillRect(x: number, y: number, w: number, h: number): this {
    this.see(x, y);
    this.see(x + w, y + h);
    this.parts.push(
      `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" fill="${this.fillColor}"/>`,
    );
    return this;
  }
  clearRect(): this {
    return this;
  }
  beginPath(): this {
    this.d = '';
    return this;
  }
  moveTo(x: number, y: number): this {
    this.see(x, y);
    this.d += `M${r2(x)} ${r2(y)}`;
    return this;
  }
  lineTo(x: number, y: number): this {
    this.see(x, y);
    this.d += `L${r2(x)} ${r2(y)}`;
    return this;
  }
  bezierCurveTo(a: number, b: number, c: number, d: number, x: number, y: number): this {
    this.see(x, y);
    this.d += `C${r2(a)} ${r2(b)} ${r2(c)} ${r2(d)} ${r2(x)} ${r2(y)}`;
    return this;
  }
  quadraticCurveTo(a: number, b: number, x: number, y: number): this {
    this.see(x, y);
    this.d += `Q${r2(a)} ${r2(b)} ${r2(x)} ${r2(y)}`;
    return this;
  }
  arc(x: number, y: number, r: number, start: number, end: number, ccw: boolean): this {
    this.see(x - r, y - r);
    this.see(x + r, y + r);
    if (Math.abs(end - start) >= 2 * Math.PI - 1e-6) {
      this.d += `M${r2(x - r)} ${r2(y)}a${r2(r)} ${r2(r)} 0 1 0 ${r2(2 * r)} 0a${r2(r)} ${r2(r)} 0 1 0 ${r2(-2 * r)} 0`;
      return this;
    }
    const sx = x + r * Math.cos(start);
    const sy = y + r * Math.sin(start);
    const ex = x + r * Math.cos(end);
    const ey = y + r * Math.sin(end);
    let sweep = ccw ? start - end : end - start;
    if (sweep < 0) sweep += 2 * Math.PI;
    this.d += `${this.d ? 'L' : 'M'}${r2(sx)} ${r2(sy)}A${r2(r)} ${r2(r)} 0 ${sweep > Math.PI ? 1 : 0} ${ccw ? 0 : 1} ${r2(ex)} ${r2(ey)}`;
    return this;
  }
  fill(): this {
    this.parts.push(`<path d="${this.d}" fill="${this.fillColor}"/>`);
    return this;
  }
  stroke(): this {
    const dash = this.dash ? ` stroke-dasharray="${this.dash.join(' ')}"` : '';
    this.parts.push(
      `<path d="${this.d}" fill="none" stroke="${this.strokeColor}" stroke-width="${r2(this.lineWidth)}"${dash}/>`,
    );
    return this;
  }
  closePath(): this {
    this.d += 'Z';
    return this;
  }
  /** VexFlow schreibt auf unseren Zeilen keinen Text (Taktarten sind Zeichen); falls doch: Tinte. */
  fillText(text: string, x: number, y: number): this {
    this.see(x, y);
    this.parts.push(
      `<text x="${r2(x)}" y="${r2(y)}" fill="${this.fillColor}">${escapeXml(text)}</text>`,
    );
    return this;
  }
  save(): this {
    this.stack.push({ fill: this.fillColor, stroke: this.strokeColor, lineWidth: this.lineWidth });
    return this;
  }
  restore(): this {
    const top = this.stack.pop();
    if (top) {
      this.fillColor = top.fill;
      this.strokeColor = top.stroke;
      this.lineWidth = top.lineWidth;
    }
    return this;
  }
  openGroup(): undefined {
    this.parts.push('<g>');
    return undefined;
  }
  closeGroup(): void {
    this.parts.push('</g>');
  }
  add(): void {}
  /** Nur Beschriftungen messen Text, und die setzen wir selbst (`engrave.ts`). */
  measureText(text: string): TextMeasure {
    return { x: 0, y: 0, width: text.length * 6, height: 10 };
  }
  set fillStyle(style: string) {
    this.setFillStyle(style);
  }
  get fillStyle(): string {
    return this.fillColor;
  }
  set strokeStyle(style: string) {
    this.setStrokeStyle(style);
  }
  get strokeStyle(): string {
    return this.strokeColor;
  }
  setFont(f?: string | FontInfo): this {
    if (typeof f === 'string') this.fontText = f;
    return this;
  }
  getFont(): string {
    return this.fontText;
  }

  /** Alles, was gezeichnet wurde, in dieser Ansicht (Einheiten). */
  toSvg(viewBox: { x: number; y: number; width: number; height: number }): string {
    const box = [viewBox.x, viewBox.y, viewBox.width, viewBox.height].map(r2).join(' ');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}">${this.parts.join('')}</svg>`;
  }
}
