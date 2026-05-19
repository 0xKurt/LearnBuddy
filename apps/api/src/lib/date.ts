// Server-side date helpers. The wire format for calendar dates is ISO
// `YYYY-MM-DD` (shared-types `DateOnly`). Age is computed from the full date,
// not the year, so the GDPR under-16 boundary is exact on the birthday.

/** Whole completed years between `birthIso` (YYYY-MM-DD) and `now` (UTC). */
export function ageInYears(birthIso: string, now: Date): number {
  const [y, m, d] = birthIso.split('-').map((n) => Number.parseInt(n, 10));
  let age = now.getUTCFullYear() - y!;
  const month = now.getUTCMonth() + 1;
  if (month < m! || (month === m! && now.getUTCDate() < d!)) age -= 1;
  return age;
}

/** Germany sets the digital-consent age at 16 (DSGVO Art. 8 / docs/09 §3). */
export function isMinor(birthIso: string, now: Date, threshold = 16): boolean {
  return ageInYears(birthIso, now) < threshold;
}
