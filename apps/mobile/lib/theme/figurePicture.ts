// A labelled picture that is a real image (#599; design `components/figures/Drawn.jsx › Schematic`,
// `Abbildungen.dc.html`, apps/mobile/assets/figures/TEILE.md §Festlegungen): its measures. Its
// colours are the palette's (`figurePaper`, `figureInk`, `figureAccent`, `onFigureAccent` in
// palettes.ts, read through `useTheme()`): a light paper card in every look, the dark ones too.
//
// Lengths are in the image's frame, 300 wide (`SCHEMATIC_IMAGE_WIDTH`, shared-math): they are drawn
// times the picture's scale, as the design's overlay scales with its image. Line weights are not.

export const FIGURE_PICTURE = {
  /** The corners of the paper card under every image. */
  radius: 14,
  leader: {
    width: 1,
    /** The dot a leader line ends in, on the part. */
    dot: 2.4,
    /** A number standing closer to its part than this gets no line: it stands on it. */
    least: 14,
  },
  badge: {
    radius: 10,
    stroke: 1.5,
    fontSize: 11,
    fontWeight: '700',
    /** The number's baseline below the ring's middle. */
    baseline: 4,
    /**
     * The least radius in pt, not scaled (#599): a tall picture drawn narrow had its digits at
     * 8.7 px on 360. At 10 the number is the design's 11 pt (`badgeRadii`).
     */
    least: 10,
  },
  /** The part she chose on a picture to tap (design `Answers.jsx › FigureTap`): a ring, tinted. */
  pick: { radius: 14, stroke: 3, fillOpacity: 0.18 },
} as const;
