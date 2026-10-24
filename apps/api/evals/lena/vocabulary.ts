// requires live verification in Claude Code session
import type { SessionView } from '@learnbuddy/shared-types/contracts';
import type { Spec } from './spec.js';
export const VOCABULARY_JOURNEY: Spec = {
  id: 'vokabeln-thema',
  title: 'Vokabeln zur Wohnung wählen lassen und antippen',
  from: '#940',
  async run(j) {
    const reply = await j.say(
      'denk dir 20 englische basisvokabeln zur wohnung aus mit deutscher übersetzung, beide richtungen',
    );
    const offer = reply.message?.actions.find(
      (a) => a.summary.tool === 'offer_learning' && a.summary.kind === 'vocab',
    );
    if (!j.check(!!offer, 'Buddy bietet Vokabeln an, keinen Lückentext')) return;
    const opened = await j.l.api.post<SessionView>('/practice/topic', {
      client_request_id: offer!.id,
      kind: 'vocab',
      text: 'Wohnung',
    });
    j.check(opened.status === 201, 'Antippen öffnet die vorbereiteten Wörter');
    j.check(opened.body.items?.length === 40, '20 Paare ergeben 40 Karten');
    j.check(
      opened.body.items?.every((i) => i.item.kind === 'vocab' && i.item.origin === 'buddy'),
      'Wörter sind als von Buddy gekennzeichnet',
    );
  },
};
