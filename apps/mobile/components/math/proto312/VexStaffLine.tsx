// PROTOTYPE (issue #312, Phase 1) — not for merge.
//
// The read-only staff (`StaffFigure`) engraved by VexFlow 4 instead of our own glyphs. Our data
// model stays the source of truth (contracts/staff.ts, checked by code on the server); this file
// only translates it into VexFlow notes and lets VexFlow decide where the ink goes.
//
// What it does NOT cover yet (and the reason the write surface `StaffAnswer` stays ours in
// this prototype): tap targets, a cursor, a selected note. Those need our own geometry
// (`stepAtY`), which VexFlow would have to share via `getYForLine` — see scratchpad/libs-312.md.

import type { NoteValue, StaffElement, StaffFigure } from '@learnbuddy/shared-types/contracts';
import { useMemo } from 'react';
import { SvgXml } from 'react-native-svg';
import { Accidental, BarlineType, Dot, Formatter, Stave, StaveNote } from 'vexflow/bravura';

import { useTheme } from '../../../lib/theme/ThemeProvider.js';
import { SvgStringContext } from './svgStringContext.js';

const DURATION: Record<NoteValue, string> = {
  whole: 'w',
  half: 'h',
  quarter: 'q',
  eighth: '8',
  sixteenth: '16',
};

/** Width VexFlow needs at least per element and per bar, in its own units (staff space = 10). */
const PER_ELEMENT = 30;
const BAR_MIN = 60;
/** The staff space we aim for on screen (14 px), and the largest (20 px, READ_GAP_MAX). */
const AIM_SCALE = 1.4;
const MAX_SCALE = 2;

function toNote(el: StaffElement, clef: StaffFigure['clef']): StaveNote {
  if (el.el === 'rest') {
    const note = new StaveNote({
      keys: [clef === 'bass' ? 'd/3' : 'b/4'],
      duration: `${DURATION[el.value]}r`,
      clef,
    });
    if (el.dotted) Dot.buildAndAttach([note], { all: true });
    return note;
  }
  const name = el.pitch.name;
  const note = new StaveNote({
    keys: [`${name.toLowerCase()}/${el.pitch.octave}`],
    duration: DURATION[el.value],
    clef,
    auto_stem: true,
  });
  if (name.endsWith('#')) note.addModifier(new Accidental('#'), 0);
  if (el.dotted) Dot.buildAndAttach([note], { all: true });
  return note;
}

/**
 * Engraves the line into `room` screen pixels: at the aimed staff space when it fits (the bars
 * share the width by how much they hold), smaller when the line is long.
 */
export function engraveStaff(
  fig: StaffFigure,
  linesColor: string,
  room: number,
): { xml: string; width: number; height: number } {
  const ctx = new SvgStringContext(linesColor);
  // How wide the clef and time signature are: VexFlow measures its own modifiers.
  const probe = new Stave(0, 0, 200).addClef(fig.clef);
  if (fig.time) probe.addTimeSignature(fig.time);
  const head = probe.getNoteStartX() + 8;
  const wanted = fig.bars.map((bar) => Math.max(BAR_MIN, bar.length * PER_ELEMENT + 20));
  const needed = head + wanted.reduce((a, b) => a + b, 0);
  const available = Math.max(needed, room / AIM_SCALE);
  const stretch = (available - head) / (needed - head);
  const widths = wanted.map((w) => w * stretch);
  let x = 0;
  fig.bars.forEach((bar, k) => {
    const w = (k === 0 ? head : 0) + (widths[k] ?? BAR_MIN);
    const stave = new Stave(x, 0, w);
    if (k === 0) {
      stave.addClef(fig.clef);
      if (fig.time) stave.addTimeSignature(fig.time);
    }
    if (k === fig.bars.length - 1) stave.setEndBarType(BarlineType.END);
    stave.setContext(ctx).draw();
    Formatter.FormatAndDraw(
      ctx,
      stave,
      bar.map((el) => toNote(el, fig.clef)),
    );
    x += w;
  });
  return ctx.toSvg(4);
}

export function VexStaffLine({ fig, width }: { fig: StaffFigure; width: number }) {
  const { figure: ink } = useTheme();
  const room = Math.min(width, 520);
  const picture = useMemo(() => engraveStaff(fig, ink.axis, room), [fig, ink.axis, room]);
  const scale = Math.min(MAX_SCALE, room / picture.width);
  return (
    <SvgXml
      xml={picture.xml}
      color={ink.stroke}
      width={picture.width * scale}
      height={picture.height * scale}
    />
  );
}
