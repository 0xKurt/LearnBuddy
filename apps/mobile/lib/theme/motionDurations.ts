// Pure duration specification shared by runtime and pure presentation algorithms.
export const DURATION = {
  quick: 140,
  practicePendingArrival: 120,
  practiceTurnArrival: 60,
  verdictNudgeStep: 70,
  stimulusImageArrival: 90,
  zoomPhotoArrival: 120,
  reexplainArrival: 350,
  reexplainReply: 200,
  base: 220,
  gentle: 420,
  voicePulse: 1200,
  recordingPulse: 700,
  wordRevealLag: 700,
} as const;
