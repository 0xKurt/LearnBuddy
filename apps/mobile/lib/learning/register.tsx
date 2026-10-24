// The learning domain gives the app's core what it adds (issue #107) — from this one place,
// called once at app start (app/_layout.tsx). The core names where something goes and works
// without it; it never imports the domain. Every place filled here is checked by
// components/learn/__tests__/register.test.tsx: none missing, none filled twice.

import { lazy, Suspense } from 'react';
import { MAX_PDF_MB, pollAfterMs, type AnswerRequest } from '@learnbuddy/shared-types/contracts';

import { ProfileLibrarySubjects } from '../../components/library/ProfileLibrarySubjects.js';
import { DrillOfferCard } from '../../components/learn/DrillOfferCard.js';
import { ListenButton } from '../../components/practice/ListenButton.js';
import { OfferCard } from '../../components/learn/OfferCard.js';
import { ReadyCard } from '../../components/learn/ReadyCard.js';
import { learningNotices } from '../../components/learn/HomeNotices.js';
import { addLearningReceipts } from '../../components/learn/receipts.js';
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
  messageListen,
  messageExtras,
  readAlong,
  greetingAction,
  homeScope,
  introMark,
  profileSubjects,
  startMenu,
  workingOn,
} from '../../components/buddy/extensions.js';
import { homeNoticeSlot } from '../../components/buddy/HomeNotices.js';
import { homeBar } from '../../components/buddy/HomeTop.js';
import { HomeBar } from '../../components/learn/HomeBar.js';
import { PhotoCheckCard } from '../../components/capture/PhotoCheckCard.js';
import { inlineNotation, type InlineTextProps } from '../../components/lb/InlineText.js';
import { MathText } from '../../components/math/MathText.js';
import { useSayMath } from '../../components/math/useSpokenMath.js';
import { newId } from '../api/client.js';
import { createMaterial, getLibrary, submitMaterial } from '../api/learningEndpoints.js';
import { followHome } from '../api/libraryCache.js';
import { postAnswer } from '../api/learningEndpoints.js';
import { answerSender } from '../api/outboxSync.js';
import { unsettled } from '../api/deviceCache.js';
import { pollRule } from '../api/homePoll.js';
import { homeFollowers, keys, menuPreloads, queryClient } from '../api/queries.js';
import { homeTop } from '../homeLayout.js';
import { LearningHome } from './homeScope.js';
import { practiceGreeting } from './greeting.js';
import { greetingNews } from '../buddy/useSessionStart.js';
import { greetingResult } from '../../components/learn/ResultNotice.js';
import { ConfirmCard } from '../../components/learn/ConfirmCard.js';
import { roleplayScene } from '../../components/learn/talkScene.js';
import { talkScene } from '../../components/voice/talkScene.js';
import { FocusLine } from '../../components/learn/FocusLine.js';
import { PracticedToday } from '../../components/learn/PracticedToday.js';
import { notation } from '../buddy/notation.js';
import { MaterialUpload, type UploadDeps } from '../capture/materialUpload.js';
import { pageHandler, type PageHandler } from '../capture/pages.js';
import { mathSpans } from '../math/parse.js';
import { ANALYSIS_WIDTH } from '../photo/quality.js';
import { sayNotation } from '../speech/say.js';
import { learningTop } from './homeLayout.js';
import { unsettledHome } from './keptHome.js';

/** The real outside world of a send: the two API calls, the native PUT, fresh request ids. */
// What a photo she attaches needs loads with her first photo, not with the start (#716): the
// upload over the file system and the quality check's JPEG decoder (lib/__tests__/startBundle).
const SEND: UploadDeps = {
  createMaterial,
  submitMaterial,
  putPhoto: async (localUri, uploadUrl, contentType) =>
    (await import('../capture/put.js')).putPhoto(localUri, uploadUrl, contentType),
  newId,
};
const checkPhoto: PageHandler['check']['run'] = async (smallJpegBase64, originalMinSide) =>
  (await import('../photo/check.js')).checkPhoto(smallJpegBase64, originalMinSide);

/**
 * A run of model text — Buddy's reply, a caption, a result row — is running text: its fractions
 * sit in the line, as in the question's sentence (#288). Stacked at full size, a ¼ in a reply
 * stood two lines tall and pulled its line apart from the ones around it (#642).
 */
function RunningMath(props: InlineTextProps) {
  return <MathText {...props} inlineFractions />;
}

const ChatFigureCard = lazy(() => import('../../components/learn/ChatFigureCard.js'));

export function registerLearning(): void {
  addActionCard(
    'show_figure',
    (picture) => (
      <Suspense fallback={null}>
        <ChatFigureCard picture={picture} />
      </Suspense>
    ),
    () => false,
  );
  messageListen.fill(ListenButton);
  // ── The chat: Buddy's offers to start something, always shown, one tap starts it …
  addActionCard(
    'offer_learning',
    (offer, on) => (
      <OfferCard actionId={on.actionId} offer={offer} spoken={on.spoken} quiet={on.quiet} />
    ),
    // Startable until the server refused it or she finished what it started.
    (offer) => offer.startable !== false && offer.finished_session_id === null,
  );
  // … practice he prepared that waits for her, when his words point to it (issue #630) …
  addActionCard(
    'show_ready',
    (ready, on) => <ReadyCard ready={ready} quiet={on.quiet} />,
    // Practice shown again that was started or replaced since draws no card (#630).
    (ready) => ready.ready,
  );
  // … a Kopfrechnen round (issue #243): the same card, code writes the tasks …
  addActionCard(
    'offer_drill',
    (offer, on) => <DrillOfferCard actionId={on.actionId} offer={offer} quiet={on.quiet} />,
    (offer) => offer.finished_session_id === null,
  );
  // … the role card: the scene, her tasks and the way out (issue #244) …
  addActionCard(
    'start_roleplay',
    (roleplay, on) => <RoleplayCard roleplay={roleplay} quiet={on.quiet} />,
    (roleplay) => roleplay.status === 'active',
  );
  // … and a rehearsal talk or reading aloud, recorded on the card itself (issue #264).
  addActionCard('offer_rehearsal', (offer, on) => (
    <RehearseCard actionId={on.actionId} offer={offer} quiet={on.quiet} />
  ));
  // … the deletion Buddy proposes: nothing goes until she answers it here (issue #151) …
  addActionCard('confirm_delete', (confirm) => <ConfirmCard confirm={confirm} />);
  // What Buddy did with her practice, her sheets and her talks: one line each.
  addLearningReceipts();
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
  messageExtras.add('announces', (m, quiet, wrap) =>
    m.announces ? <ReadyCard ready={m.announces} quiet={quiet} announced wrap={wrap} /> : null,
  );
  readAlong.fill(ReadAlongBubble);
  profileSubjects.fill(ProfileLibrarySubjects);
  // A running roleplay takes the line on top of the thread: its way out stays in reach (#244).
  // A running roleplay takes the line on top of the thread (its way out stays in reach, #244),
  // else what she is working on (#160).
  workingOn.fill((h) =>
    h.roleplay ? (
      <RoleplayStrip roleplay={h.roleplay} />
    ) : h.focus ? (
      <FocusLine focus={h.focus} />
    ) : null,
  );
  // "Heute geübt ✓" beside the first visit's greeting.
  introMark.fill((h) => (h.practiced_today ? <PracticedToday /> : null));

  // A running roleplay is the conversation screen's scene: its name, language and end (#244).
  talkScene.fill(roleplayScene);

  // ── Text: $…$ math, drawn (MathText), kept whole by Markdown and said in words.
  notation.fill(mathSpans);
  inlineNotation.fill(RunningMath);
  sayNotation.fill(useSayMath);

  // ── The home: its bar on top, what it tells in the conversation (a sheet Buddy could not
  // read, the finished practice, "Buddy is working"), a sheet being read, the ways to start.
  homeTop.fill(learningTop);
  homeBar.fill(HomeBar);
  // Her sheets' pages and the practice to go on with, for the whole home from its first frame.
  homeScope.fill(LearningHome);
  // The greeting names the practice she just finished, with the way into it (issue #195).
  greetingNews.fill((h, since) => practiceGreeting(h.now, since));
  greetingAction.fill(greetingResult);
  homeNoticeSlot.fill(learningNotices);
  startMenu.fill({ items: startItems, Sheets: LearnStartSheets });
  // The library list that still shows a sheet being read follows the home (live finding 3).
  homeFollowers.add('library', (home) => followHome(queryClient, home));
  // "Dein Material" opens with her sheets: loaded while the ⋯ menu stands open (#711).
  menuPreloads.add('library', () => {
    void queryClient.prefetchQuery({ queryKey: keys.library, queryFn: getLibrary });
  });

  // ── The home: its pace from an older API (the server's own rule), and what is not kept of it
  // on the phone — nothing that claims "now" (lib/api/deviceCache.ts, CLAUDE.md rule 5).
  pollRule.fill(pollAfterMs);
  unsettled.fill(unsettledHome);

  // ── Her answers kept on the device go out again through the practice's own request: what
  // was kept is what `answerItem` kept, an AnswerRequest (lib/api/outbox.ts `KeptAnswer`).
  answerSender.fill((sessionId, body) => postAnswer(sessionId, body as AnswerRequest));

  // ── Pages she attaches: sent as a sheet to read, photos checked for blur, light and tilt.
  pageHandler.fill({
    start: (files, link, requestId) => new MaterialUpload(SEND, files, link, requestId),
    maxPdfMb: MAX_PDF_MB,
    // Her sheet, stored as her message (issue #632).
    sentIn: (m) => m.sheet?.material_id ?? null,
    check: { width: ANALYSIS_WIDTH, run: checkPhoto, Review: PhotoCheckCard },
  });
}
