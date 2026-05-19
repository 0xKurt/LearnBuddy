// Session opener — Phase C2.
//
// When a learner starts a new session AND has at least one prior
// learner_episode, the first thing they see is a warm one-line opener
// that references LAST TIME without analyzing them.
//
// Three opener variants, picked deterministically from the prior
// episode's tone:
//
//   - last session ended on a high → "letztes Mal hat das mit X gut
//     geklappt, willst du da weitermachen oder was Neues?"
//   - last session ended on a low → "letztes Mal war's ein bisschen
//     viel — willst du nochmal sanft einsteigen?"
//   - neutral mixed → "schön dass du wieder da bist — letztes Mal warst
//     du bei X. Da weitermachen?"
//
// L1 invariant: the opener references THE MATERIAL ("bei Brüchen", "bei
// der Produktregel"), never the learner ("du warst gestresst"). The
// templates are STATIC — no LLM call. Speed and consistency over
// generative variety.

export type OpenerTone = 'high' | 'low' | 'neutral';

export type EpisodeForOpener = {
  one_sentence_arc: string;
  concepts_touched: string[];
  high_points: string[];
  low_points: string[];
};

export type OpenerLocale = 'de' | 'en' | 'fr' | 'es' | 'it';

export function classifyOpenerTone(ep: EpisodeForOpener): OpenerTone {
  const highs = ep.high_points.length;
  const lows = ep.low_points.length;
  if (lows > highs && lows >= 2) return 'low';
  if (highs > lows && highs >= 2) return 'high';
  return 'neutral';
}

/** Returns the opener line, or null when there's no prior episode and
 *  we should fall straight into the first item (cold-start session). */
export function buildOpener(ep: EpisodeForOpener | null, locale: OpenerLocale): string | null {
  if (!ep) return null;
  const tone = classifyOpenerTone(ep);
  const topic = pickFocusTopic(ep);
  const map = OPENERS[locale];
  const tpl = map[tone];
  return tpl({ topic });
}

function pickFocusTopic(ep: EpisodeForOpener): string {
  // Prefer the FIRST concept from concepts_touched (chronological in
  // a well-summarized episode). Fallback to a short slice of the
  // narrative arc if no concepts were recorded.
  const c = ep.concepts_touched.find((s) => s.trim().length > 0);
  if (c) return c.trim();
  const arc = ep.one_sentence_arc.trim();
  return arc.length > 30 ? `${arc.slice(0, 30).trim()}…` : arc;
}

type OpenerVariant = (ctx: { topic: string }) => string;

const OPENERS: Record<OpenerLocale, Record<OpenerTone, OpenerVariant>> = {
  de: {
    high: ({ topic }) =>
      `Letztes Mal hat das mit „${topic}" gut geklappt. Willst du da weitermachen oder was Neues?`,
    low: ({ topic }) =>
      `Letztes Mal war's bei „${topic}" ein bisschen viel auf einmal. Magst du sanft einsteigen?`,
    neutral: ({ topic }) =>
      `Schön, dass du wieder da bist. Letztes Mal warst du bei „${topic}" — da weitermachen?`,
  },
  en: {
    high: ({ topic }) =>
      `Last time "${topic}" went well. Want to keep going, or try something new?`,
    low: ({ topic }) => `Last time "${topic}" was a lot at once. Want to ease back in?`,
    neutral: ({ topic }) =>
      `Good to see you back. Last time we were on "${topic}" — keep going there?`,
  },
  fr: {
    high: ({ topic }) =>
      `La dernière fois, « ${topic} » a bien marché. On continue, ou on essaie autre chose ?`,
    low: ({ topic }) =>
      `La dernière fois, « ${topic} » faisait beaucoup d'un coup. On reprend doucement ?`,
    neutral: ({ topic }) =>
      `Content de te revoir. La dernière fois, on était sur « ${topic} » — on continue ?`,
  },
  es: {
    high: ({ topic }) =>
      `La última vez "${topic}" salió bien. ¿Seguimos ahí o probamos algo nuevo?`,
    low: ({ topic }) => `La última vez "${topic}" fue mucho de golpe. ¿Empezamos suave?`,
    neutral: ({ topic }) =>
      `Qué bien que estés de vuelta. La última vez estábamos en "${topic}" — ¿seguimos ahí?`,
  },
  it: {
    high: ({ topic }) =>
      `L'ultima volta "${topic}" è andato bene. Continuiamo o proviamo qualcos'altro?`,
    low: ({ topic }) =>
      `L'ultima volta "${topic}" era un po' troppo tutto insieme. Ripartiamo piano?`,
    neutral: ({ topic }) => `Bello rivederti. L'ultima volta eravamo su "${topic}" — continuiamo?`,
  },
};
