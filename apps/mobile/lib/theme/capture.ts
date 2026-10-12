import { TYPE } from './type.js';
import { SPACE, TOUCH } from './space.js';

const thumbnail = { width: 104, height: 140 };
const closeFace = 28;
// A full close target and its keyboard focus outline stay inside the browsed viewport.
const listInset = (TOUCH - closeFace) / 2 + SPACE.xs;

function pageNumberType() {
  return { ...TYPE.label, fontSize: 12, lineHeight: CAPTURE.pageNumber.size };
}

function addLabelType() {
  const label = TYPE.label;
  return { ...label, lineHeight: label.fontSize };
}

// Portrait page previews and their existing 44 pt remove targets.
export const CAPTURE = {
  thumbnail,
  page: {
    cameraMinHeight: 260,
    cameraDisc: 64,
    cameraGlyph: 28,
    privacyMaxWidth: 240,
    sourceSize: 52,
  },
  list: {
    inset: listInset,
    bottomInset: SPACE.xs,
    maxHeight: thumbnail.height + listInset + SPACE.xs,
  },
  pageNumber: { size: 22, inset: 6 },
  get pageNumberType() {
    return pageNumberType();
  },
  reviewGap: SPACE.sm + SPACE.xs / 2,
  closeFace,
  closeInset: SPACE.xs,
  previewGap: SPACE.sm + SPACE.xs / 2,
  addGap: SPACE.xs + SPACE.xs / 2,
  get addLabelType() {
    return addLabelType();
  },
  warningBorder: 2,
  closeGlyph: 14,
  addGlyph: 22,
  shadowInset: 2,
  flagInset: 1,
  border: 1.5,
  closeOpacity: 0.85,
} as const;
