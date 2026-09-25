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

type Config = { privacyUrl: string; imprintUrl: string; supportEmail: string };

const WEB = /^https?:\/\/\S+$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function aboutLinks({ privacyUrl, imprintUrl, supportEmail }: Config): AboutLink[] {
  const out: AboutLink[] = [];
  const privacy = privacyUrl.trim();
  const imprint = imprintUrl.trim();
  const support = supportEmail.trim();
  if (WEB.test(privacy)) out.push({ kind: 'privacy', href: privacy, detail: null });
  if (WEB.test(imprint)) out.push({ kind: 'imprint', href: imprint, detail: null });
  if (EMAIL.test(support)) {
    out.push({ kind: 'support', href: `mailto:${encodeURI(support)}`, detail: support });
  }
  return out;
}
