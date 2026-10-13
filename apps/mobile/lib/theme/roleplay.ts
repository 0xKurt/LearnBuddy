// Roleplay and rehearsal in the thread and on the conversation screen (design
// components/practice/Modes.jsx:11–62, ui_kits/app/Extra.jsx:178–207).
export const ROLEPLAY = {
  /** The sign in the strip above the chat while a scene runs. */
  stripGlyph: 18,
  /** Who plays whom: a canvas box, 10 above and below, 2 between its lines (Modes.jsx:13). */
  role: { padV: 10, gap: 2 },
  /** The result card: its ticks, and the lavender box for next time (Modes.jsx:58–60). */
  result: { tick: 18, tickTop: 2, rows: 8, boxPadV: 12, boxPadH: 14 },
} as const;
