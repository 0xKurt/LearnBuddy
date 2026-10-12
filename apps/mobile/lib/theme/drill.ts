// Answer slot geometry; typing and queue timing remain domain behavior.
import { UI } from './components.js';

export const DRILL = {
  answerWidth: 96,
  answerHeight: 72,
  answerBorder: UI.selectedBorder,
  feedbackHeight: 36,
} as const;
