/* global http, json, output */
// requires live verification in Claude Code session (local dev auth, never a hosted account)
const base = 'http://127.0.0.1:8794';
output.email = `explorer-${Date.now()}@example.test`;
output.password = 'local-smoke-944-only';
const signed = http.post(`${base}/auth/v1/signup`, {
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: output.email, password: output.password }),
});
if (signed.status !== 200) throw new Error(`Local signup: ${signed.status}`);
const token = json(signed.body).access_token;
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
const account = http.post(`${base}/v1/account`, {
  headers,
  body: JSON.stringify({ locale: 'de', consent_version: '2026-09-27', accept_privacy: true }),
});
if (account.status !== 201) throw new Error(`Local account: ${account.status}`);
const learner = http.post(`${base}/v1/learner`, {
  headers,
  body: JSON.stringify({
    relation: 'self',
    display_name: 'Smoke',
    birth_date: '1995-06-01',
    locale: 'de',
    curriculum_region: 'ni',
    minor_consent: false,
    contact: 'no',
  }),
});
if (learner.status !== 201) throw new Error(`Local learner: ${learner.status}`);
