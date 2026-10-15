// The learning domain gives the app's core what it adds (issue #107) — from this one place,
// called once at app start (app/_layout.tsx). The core names where something goes and works
// without it; it never imports the domain. Every place filled here is checked by
// components/learn/__tests__/register.test.tsx: none missing, none filled twice.

import { ProfileLibrarySubjects } from '../../components/library/ProfileLibrarySubjects.js';
import { DrillOfferCard } from '../../components/learn/DrillOfferCard.js';
import { OfferCard } from '../../components/learn/OfferCard.js';
import { ReadyCard } from '../../components/learn/ReadyCard.js';
import { ResultNotice } from '../../components/learn/ResultNotice.js';
import { SentSheet } from '../../components/learn/SentSheet.js';
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
  messageExtras,
  readAlong,
  profileSubjects,
  readingSteps,
  resultNotice,
  startMenu,
  workingOn,
} from '../../components/buddy/extensions.js';
import { PhotoCheckCard } from '../../components/capture/PhotoCheckCard.js';
import { inlineNotation, type InlineTextProps } from '../../components/lb/InlineText.js';
import { MathText } from '../../components/math/MathText.js';
import { useSayMath } from '../../components/math/useSpokenMath.js';
import { newId } from '../api/client.js';
import { createMaterial, getLibrary, submitMaterial } from '../api/endpoints.js';
import { followHome } from '../api/libraryCache.js';
import { homeFollowers, keys, menuPreloads, queryClient } from '../api/queries.js';
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

/**
 * A run of model text — Buddy's reply, a caption, a result row — is running text: its fractions
 * sit in the line, as in the question's sentence (#288). Stacked at full size, a ¼ in a reply
 * stood two lines tall and pulled its line apart from the ones around it (#642).
 */
function RunningMath(props: InlineTextProps) {
  return <MathText {...props} inlineFractions />;
}

export function registerLearning(): void {
  // ── The chat: Buddy's offers to start something, always shown, one tap starts it …
  addActionCard('offer_learning', (offer, on) => (
    <OfferCard actionId={on.actionId} offer={offer} spoken={on.spoken} quiet={on.quiet} />
  ));
  // … practice he prepared that waits for her, when his words point to it (issue #630) …
  addActionCard('show_ready', (ready, on) => <ReadyCard ready={ready} quiet={on.quiet} />);
  // … a Kopfrechnen round (issue #243): the same card, code writes the tasks …
  addActionCard('offer_drill', (offer, on) => (
    <DrillOfferCard actionId={on.actionId} offer={offer} quiet={on.quiet} />
  ));
  // … the role card: the scene, her tasks and the way out (issue #244) …
  addActionCard('start_roleplay', (roleplay, on) => (
    <RoleplayCard roleplay={roleplay} quiet={on.quiet} />
  ));
  // … and a rehearsal talk or reading aloud, recorded on the card itself (issue #264).
  addActionCard('offer_rehearsal', (offer, on) => (
    <RehearseCard actionId={on.actionId} offer={offer} quiet={on.quiet} />
  ));
  // In place of a bubble: the feedback after a roleplay (issue #384), then what a rehearsal
  // measured (issue #264) — the "So lief's" list the Probetest ends with.
  messageCards.add('roleplay_feedback', (m) =>
    m.roleplay_feedback ? <RoleplayResult feedback={m.roleplay_feedback} /> : null,
  );
  messageCards.add('rehearsal', (m) =>
    m.rehearsal ? <RehearsalResult rehearsal={m.rehearsal} /> : null,
  );
  // … and her sheet sent through the chat: her pages and where they stand (issue #632).
  messageCards.add('sheet', (m) => (m.sheet ? <SentSheet sheet={m.sheet} /> : null));
  // Under Buddy's background message: the start of the practice it announces (issue #632).
  messageExtras.add('announces', (m, quiet) =>
    m.announces ? <ReadyCard ready={m.announces} quiet={quiet} /> : null,
  );
  readAlong.fill(ReadAlongBubble);
  profileSubjects.fill(ProfileLibrarySubjects);
  // A running roleplay takes the line on top of the thread: its way out stays in reach (#244).
  workingOn.fill((h) => (h.roleplay ? <RoleplayStrip roleplay={h.roleplay} /> : null));

  // ── Text: $…$ math, drawn (MathText), kept whole by Markdown and said in words.
  notation.fill(mathSpans);
  inlineNotation.fill(RunningMath);
  sayNotation.fill(useSayMath);

  // ── The home: the finished practice, a sheet being read, the ways to start.
  resultNotice.fill(ResultNotice);
  readingSteps.fill(readingView);
  startMenu.fill({ items: startItems, Sheets: LearnStartSheets });
  // The library list that still shows a sheet being read follows the home (live finding 3).
  homeFollowers.add('library', (home) => followHome(queryClient, home));
  // "Dein Material" opens with her sheets: loaded while the ⋯ menu stands open (#711).
  menuPreloads.add('library', () => {
    void queryClient.prefetchQuery({ queryKey: keys.library, queryFn: getLibrary });
  });

  // ── Pages she attaches: sent as a sheet to read, photos checked for blur, light and tilt.
  pageHandler.fill({
    start: (files, link, requestId) => new MaterialUpload(SEND, files, link, requestId),
    check: { width: ANALYSIS_WIDTH, run: checkPhoto, Review: PhotoCheckCard },
  });
}
