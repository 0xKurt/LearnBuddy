// "Über LearnBuddy" in the settings: which links exist. Pure (Node-testable).
// Values come from ENV (EXPO_PUBLIC_*); anything not configured, or not a
// usable web address / e-mail address, is left out instead of shown as a
// placeholder — no invented company data.

export type AboutLink = {
  kind: 'privacy' | 'imprint' | 'support';
  /** What Linking.openURL opens. */
  href: string;
  /** Shown next to the button (the support address), if any. */
  detail: string | null;
};

type Config = {
  privacyUrl: string;
  imprintUrl: string;
  supportEmail: string;
  /**
   * What goes into the support mail's body before she writes a word (audit 30.09., #133
   * position 14). Without it the first reply is always "which version, which phone?" — and
   * a parent writing for help should not have to go looking. Nothing personal: the app's
   * build, the OS and the device model, the same three lines any bug report needs.
   */
  diagnostics?: { app: string; os: string; device: string } | null;
};

const WEB = /^https?:\/\/\S+$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function aboutLinks({
  privacyUrl,
  imprintUrl,
  supportEmail,
  diagnostics = null,
}: Config): AboutLink[] {
  const out: AboutLink[] = [];
  const privacy = privacyUrl.trim();
  const imprint = imprintUrl.trim();
  const support = supportEmail.trim();
  if (WEB.test(privacy)) out.push({ kind: 'privacy', href: privacy, detail: null });
  if (WEB.test(imprint)) out.push({ kind: 'imprint', href: imprint, detail: null });
  if (EMAIL.test(support)) {
    // `mailto:` query, not the address: an address with a "?" in it would otherwise eat
    // the body. The subject stays empty so her own words are the subject line. A line the
    // build could not answer (no model name on the web) is left out rather than written
    // as a dash — a block of placeholders tells the reader nothing.
    const lines = diagnostics
      ? [
          diagnostics.app.trim() && `LearnBuddy ${diagnostics.app.trim()}`,
          diagnostics.os.trim(),
          diagnostics.device.trim(),
        ].filter((line) => line.length > 0)
      : [];
    const body =
      lines.length > 0 ? `?body=${encodeURIComponent(`\n\n---\n${lines.join('\n')}`)}` : '';
    out.push({ kind: 'support', href: `mailto:${encodeURI(support)}${body}`, detail: support });
  }
  return out;
}
