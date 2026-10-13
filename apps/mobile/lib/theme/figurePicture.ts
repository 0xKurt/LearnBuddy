// A labelled picture that is a real image (#599; design `components/figures/Drawn.jsx › Schematic`,
// `Abbildungen.dc.html`, apps/mobile/assets/figures/TEILE.md §Festlegungen). The images keep their
// own colours and are made for a light ground, so they always lie on a light paper card — in the
// dark looks too — and what is drawn over them (leader lines, the numbers' rings) is the light
// look's ink in every look: these are no palette colours, they belong to the paper.
//
// Lengths are in the image's frame, 300 wide (`SCHEMATIC_IMAGE_WIDTH`, shared-math): they are drawn
// times the picture's scale, as the design's overlay scales with its image. Line weights are not.

export const FIGURE_PICTURE = {
  /** The paper card under every image, and its corners. */
  paper: '#ffffff',
  radius: 14,
  /** Leader lines, their dots and the rings of the numbers. */
  ink: '#1f1b2e',
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
  },
  /** The part she chose on a picture to tap (design `Answers.jsx › FigureTap`): a ring, tinted. */
  pick: { radius: 14, stroke: 3, fillOpacity: 0.18 },
} as const;
