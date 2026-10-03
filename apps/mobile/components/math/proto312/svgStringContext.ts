// PROTOTYPE (issue #312, Phase 1) — not for merge.
//
// A VexFlow RenderContext that writes an SVG string instead of DOM nodes, so VexFlow can engrave
// under React Native (no DOM, no canvas) and the result is drawn by react-native-svg's `SvgXml`.
// VexFlow 4 draws every glyph as a path from its bundled font outlines, so no music font has to
// be installed on the device and the web and native pictures are the same.
//
// Colours: every fill and stroke becomes `currentColor` (SvgXml's `color` prop sets it from the
// theme); VexFlow's grey staff lines become the `lines` colour. Nothing else is themed here.

import { RenderContext, type FontInfo, type TextMeasure } from 'vexflow/bravura';

const r2 = (n: number): string => String(Math.round(n * 100) / 100);

/** VexFlow's default grey for staff lines (Stave), which we draw in the figure's axis colour. */
const VEXFLOW_LINE_GREY = '#999999';

export class SvgStringContext extends RenderContext {
  private parts: string[] = [];
  private d = '';
  private fill_ = 'currentColor';
  private stroke_ = 'currentColor';
  private lineWidth = 1;
  private dash: number[] | null = null;
  private stack: Array<{ fill: string; stroke: string; lineWidth: number }> = [];
  private font_ = '10pt Arial';
  /** The drawn extent, so the picture can be trimmed to what is on it. */
  minX = Infinity;
  minY = Infinity;
  maxX = -Infinity;
  maxY = -Infinity;

  constructor(private readonly linesColor: string) {
    super();
  }

  private color(style: string): string {
    return style.toLowerCase() === VEXFLOW_LINE_GREY ? this.linesColor : 'currentColor';
  }

  private see(x: number, y: number): void {
    if (x < this.minX) this.minX = x;
    if (y < this.minY) this.minY = y;
    if (x > this.maxX) this.maxX = x;
    if (y > this.maxY) this.maxY = y;
  }

  clear(): void {
    this.parts = [];
  }
  setFillStyle(style: string): this {
    this.fill_ = this.color(style);
    return this;
  }
  setBackgroundFillStyle(): this {
    return this;
  }
  setStrokeStyle(style: string): this {
    this.stroke_ = this.color(style);
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
      `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" fill="${this.fill_}"/>`,
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
    this.parts.push(`<path d="${this.d}" fill="${this.fill_}"/>`);
    return this;
  }
  stroke(): this {
    const dash = this.dash ? ` stroke-dasharray="${this.dash.join(' ')}"` : '';
    this.parts.push(
      `<path d="${this.d}" fill="none" stroke="${this.stroke_}" stroke-width="${r2(this.lineWidth)}"${dash}/>`,
    );
    return this;
  }
  closePath(): this {
    this.d += 'Z';
    return this;
  }
  fillText(text: string, x: number, y: number): this {
    this.see(x, y);
    const safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    this.parts.push(`<text x="${r2(x)}" y="${r2(y)}" fill="${this.fill_}">${safe}</text>`);
    return this;
  }
  save(): this {
    this.stack.push({ fill: this.fill_, stroke: this.stroke_, lineWidth: this.lineWidth });
    return this;
  }
  restore(): this {
    const top = this.stack.pop();
    if (top) {
      this.fill_ = top.fill;
      this.stroke_ = top.stroke;
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
  /** Only annotations measure text; the staff of a task has none (time signatures are glyphs). */
  measureText(text: string): TextMeasure {
    return { x: 0, y: 0, width: text.length * 6, height: 10 };
  }
  set fillStyle(style: string) {
    this.setFillStyle(style);
  }
  get fillStyle(): string {
    return this.fill_;
  }
  set strokeStyle(style: string) {
    this.setStrokeStyle(style);
  }
  get strokeStyle(): string {
    return this.stroke_;
  }
  setFont(f?: string | FontInfo): this {
    if (typeof f === 'string') this.font_ = f;
    return this;
  }
  getFont(): string {
    return this.font_;
  }

  /** The picture, cropped to what was drawn plus `pad`. */
  toSvg(pad: number): { xml: string; width: number; height: number } {
    const x0 = this.minX - pad;
    const y0 = this.minY - pad;
    const w = this.maxX - this.minX + 2 * pad;
    const h = this.maxY - this.minY + 2 * pad;
    return {
      xml: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r2(x0)} ${r2(y0)} ${r2(w)} ${r2(h)}">${this.parts.join('')}</svg>`,
      width: w,
      height: h,
    };
  }
}
