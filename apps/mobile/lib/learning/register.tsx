// The learning domain gives the app's core what it adds (issue #107) — from this one place,
// called once at app start (app/_layout.tsx). The core names where something goes and works
// without it; it never imports the domain. Every place filled here is checked by
// components/learn/__tests__/register.test.tsx: none missing, none filled twice.

import { DrillOfferCard } from '../../components/learn/DrillOfferCard.js';
import { OfferCard } from '../../components/learn/OfferCard.js';
import { ResultNotice } from '../../components/learn/ResultNotice.js';
import { LearnStartSheets } from '../../components/learn/StartSheets.js';
import { startItems } from '../../components/learn/startItems.js';
import { ReadAlongBubble } from '../../components/buddy/ReadAlongBubble.js';
import { RehearsalResult } from '../../components/buddy/RehearsalResult.js';
import { RehearseCard } from '../../components/buddy/RehearseCard.js';
import { RoleplayCard, RoleplayStrip } from '../../components/buddy/RoleplayCard.js';
import { RoleplayResult } from '../../components/buddy/RoleplayResult.js';
import {
  addActionCard,
  messageCards,
  readAlong,
  readingSteps,
  resultNotice,
  startMenu,
  workingOn,
} from '../../components/buddy/extensions.js';
import { PhotoCheckCard } from '../../components/capture/PhotoCheckCard.js';
import { inlineNotation } from '../../components/lb/InlineText.js';
import { MathText } from '../../components/math/MathText.js';
import { useSayMath } from '../../components/math/useSpokenMath.js';
import { newId } from '../api/client.js';
import { createMaterial, submitMaterial } from '../api/endpoints.js';
import { followHome } from '../api/libraryCache.js';
import { homeFollowers, queryClient } from '../api/queries.js';
import { readingView } from '../buddy/readingStages.js';
import { notation } from '../buddy/notation.js';
import { MaterialUpload, type UploadDeps } from '../capture/materialUpload.js';
import { pageHandler } from '../capture/pages.js';
import { putPhoto } from '../capture/put.js';
import { mathSpans } from '../math/parse.js';
import { checkPhoto } from '../photo/check.js';
import { ANALYSIS_WIDTH } from '../photo/quality.js';
import { sayNotation } from '../speech/say.js';

/** The real outside world of a send: the two API calls, the native PUT, fresh request ids. */
const SEND: UploadDeps = { createMaterial, submitMaterial, putPhoto, newId };

export function registerLearning(): void {
  // ── The chat: Buddy's offers to start something, always shown, one tap starts it …
  addActionCard('offer_learning', (offer, on) => (
    <OfferCard actionId={on.actionId} offer={offer} spoken={on.spoken} />
  ));
  // … a Kopfrechnen round (issue #243): the same card, code writes the tasks …
  addActionCard('offer_drill', (offer, on) => (
    <DrillOfferCard actionId={on.actionId} offer={offer} />
  ));
  // … the role card: the scene, her tasks and the way out (issue #244) …
  addActionCard('start_roleplay', (roleplay) => <RoleplayCard roleplay={roleplay} />);
  // … and a rehearsal talk or reading aloud, recorded on the card itself (issue #264).
  addActionCard('offer_rehearsal', (offer, on) => (
    <RehearseCard actionId={on.actionId} offer={offer} />
  ));
  // In place of a bubble: the feedback after a roleplay (issue #384), then what a rehearsal
  // measured (issue #264) — the "So lief's" list the Probetest ends with.
  messageCards.add('roleplay_feedback', (m) =>
    m.roleplay_feedback ? <RoleplayResult feedback={m.roleplay_feedback} /> : null,
  );
  messageCards.add('rehearsal', (m) =>
    m.rehearsal ? <RehearsalResult rehearsal={m.rehearsal} /> : null,
  );
  readAlong.fill(ReadAlongBubble);
  // A running roleplay takes the line on top of the thread: its way out stays in reach (#244).
  workingOn.fill((h) => (h.roleplay ? <RoleplayStrip roleplay={h.roleplay} /> : null));

  // ── Text: $…$ math, drawn (MathText), kept whole by Markdown and said in words.
  notation.fill(mathSpans);
  inlineNotation.fill(MathText);
  sayNotation.fill(useSayMath);

  // ── The home: the finished practice, a sheet being read, the ways to start.
  resultNotice.fill(ResultNotice);
  readingSteps.fill(readingView);
  startMenu.fill({ items: startItems, Sheets: LearnStartSheets });
  // The library list that still shows a sheet being read follows the home (live finding 3).
  homeFollowers.add('library', (home) => followHome(queryClient, home));

  // ── Pages she attaches: sent as a sheet to read, photos checked for blur, light and tilt.
  pageHandler.fill({
    start: (files, link, requestId) => new MaterialUpload(SEND, files, link, requestId),
    check: { width: ANALYSIS_WIDTH, run: checkPhoto, Review: PhotoCheckCard },
  });
}
