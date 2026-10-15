// A list page's own room (ui_kits/app/Library.jsx and More.jsx `Body`: padding 18px 16px 26px):
// above its first group and below its last one. The sides are the app's gutter (`GUTTER_APP`).
export const LIBRARY = {
  pageTop: 18,
  pageBottom: 26,
  /**
   * The recent sheets drawn with the page's first frame: more than fit a 390×844 screen under the
   * capture button and the subjects (#714); the rest follow in the next frame.
   */
  firstRows: 8,
} as const;
