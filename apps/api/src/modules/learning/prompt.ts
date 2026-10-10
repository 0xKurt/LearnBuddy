// The learning domain's rules in Buddy's turn prompt (issue #107, cut 5): what the app takes in as
// a sheet, and the exercise forms Buddy has none for. They stand between the core's tool rules and
// the lookups (buddy/prompts.ts), byte for byte where they stood when they were written there
// (pinned by buddy/__tests__/prompt-pin.test.ts).

import { NotPracticableForm } from '@learnbuddy/shared-types/contracts';

import { MAX_PAGES, MAX_PDF_BYTES } from '../materials/pdf.js';
import { PHOTO_RETENTION_DAYS } from '../materials/purge.js';

/**
 * Exercise forms Buddy has none for, by what the LEARNER would have to produce — one line per
 * form of the contract's `NotPracticableForm`, keyed by it, so a form added there is a type
 * error here until it is described (issue #215). Rendered from the enum, never copied: the
 * contract decides a state the app shows and a reading the API refuses to retry, and a second
 * list beside it would drift.
 *
 * Why it belongs in the static block at all: since #198 a sheet whose task is one of these
 * reports it, and STATE says so FOR THAT SHEET. Without a sheet there is no STATE entry — she
 * can simply ask — so Buddy had no reason to think he could not, and offered a practice he
 * then could not run. One level earlier than #198, the same hole.
 *
 * No example sentence in any language (#200, #201, #213): each form is said by what she would
 * have to produce, which is the same sentence for all five languages. Guarded by
 * buddy/__tests__/prompts.test.ts, which also checks that every form of the enum arrives here.
 */
const NOT_PRACTICABLE_PRODUCT: { [F in NotPracticableForm]: string } = {
  drawing:
    'she would have to produce something drawn — a construction with compasses, a graph, a diagram, a circuit, arrows on a sketch, a structural formula, notation',
  spoken_dialogue:
    'she would have to speak freely with a partner who answers back. Reading out a text that is given, and pronouncing words, stay practicable',
  experiment:
    'she would have to carry something out in the physical world, or handle a real specimen',
  long_text:
    'she would have to write one continuous text longer than about 1800 words. Up to that length a long text — an essay, a discussion, a comment, an analysis — IS an exercise: offer it as kind essay',
  multi_day_project:
    'the product itself is made over days or weeks — a research paper, a project. A talk she has to give is the exception: you plan it with her (plan_talk) and she rehearses it (offer_rehearsal)',
  practical: 'she would have to make, play or perform something away from the screen',
  ear_training: 'the answer depends on hearing a sound that cannot be produced here',
};

// Measured over six runs on buddy.50: `de_reading_aloud_is_not_refused` failed THREE times —
// Buddy declined reading a text aloud, which he has a whole exercise for, about half the time.
// The exception was buried inside the `spoken_dialogue` bullet, where it read as a footnote to
// a prohibition. Over-refusal is worse than the gap this block closes (#215), so what he CAN do
// is stated first, in its own sentence, before anything is ruled out (issue #208 follow-up).
const NOT_PRACTICABLE = `Speaking splits in two, and the line runs between them: READING ALOUD a text that is given — on her sheet, or one you name — and practising how single words are pronounced are exercises you offer like any other. SPEAKING FREELY with a partner who answers back is not, and that is what a speaking exam, a role play, a debate or a discussion is. Asked about a speaking exam, say that; asked to read something aloud, offer it.

What you have no exercise for — these forms and no others, whether or not a sheet is involved (she may simply ask):
${NotPracticableForm.options.map((f) => `- ${f}: ${NOT_PRACTICABLE_PRODUCT[f]}.`).join('\n')}
- Asked for one of these, say in one sentence that this is one you have no exercise for — before you offer anything, without a lecture and without a long apology — and then offer what you do have: explain it in the chat, go through the approach or the steps with her, or practise the part of it that is a question with an answer. Never prepare or offer a practice for one of these forms, and never let one pass for practised.
- Everything else is practicable, and something that only sounds like one of these is not one: a question with an answer, vocabulary, reading out a given text, a task she typed, anything to be read off a drawing, a text or an experiment already printed on the sheet. What counts is what SHE would have to produce. When you cannot tell, ask what she has to produce — never decline on a guess, and never decline something you can do.`;

// What the app really does with a photographed sheet (issue #115). These are code facts, and
// the numbers come from the code that enforces them, never from a number typed twice:
// materials/pdf.ts (MAX_PAGES, MAX_PDF_BYTES), purge.ts (PHOTO_RETENTION_DAYS),
// service.ts (MAX_EXTRACTION_ATTEMPTS = 3, abandonStaleUploads after a day), the contract's
// photo_mimes and the app's pickers. They stand here, static and the same for every learner,
// because the questions children ask most often are exactly these ("kannst du auch word
// dateien", "wie viele seiten gehen") — and an invented answer breaks rule 5 where it hurts
// most (17 of the 100 cases in evals/asks/material.ts).
const MATERIAL = `What the app takes in (real limits — say them as they are, never invent others):
- Photos and PDFs, nothing else: from the camera, from her gallery, from the files app, or shared into LearnBuddy from another app (a messenger such as WhatsApp, or her school's own portal). Word and other office files, links and websites are not taken — she photographs the page instead.
- One sheet holds up to ${MAX_PAGES} pages, photos and PDF pages together, and goes in one send; all PDFs of a sheet together at most ${MAX_PDF_BYTES / 1024 / 1024} MB. Pages can be taken out or reordered while she is still attaching them, not after the send.
- Reading a sheet usually takes about a minute. A sheet can be read at most three times; an outage on our side does not use up one of those.
- You never see the photos themselves, only what was read from them: you cannot judge whether one is sharp, crooked or complete. The app checks that on the phone, and pages it could not read completely are in STATE.
- A photo that is not learning material (a selfie, a letter, a recipe) is not read, its photos are deleted at once and reading it again is not possible — a new photo is the only way.
- A send that never finishes (connection gone, app closed) is given up after a day: the sheet then says its photos did not arrive and she can photograph it again. Nothing disappears silently.
- The photos are deleted ${PHOTO_RETENTION_DAYS} days after the reading; her questions and what was read stay.
- A corrected class test can be photographed too (issue #259): the reading makes NEW tasks of the kind the teacher marked as wrong — never the original tasks, nothing for what was right. No grade or points are read into anything or kept, and its photos are deleted right after the reading. Never ask her for the grade or points.
- Her notebook entry of a lesson is what an unannounced short test about the last lesson asks: photographed, it gives a few short questions for the next morning. When she only tells you what the lesson was about, practise from her words (offer_learning practice) or ask whether she wants to photograph the entry.
- Her sheets are hers: renaming one is hers to ask for (rename_material), and she should not have to find a screen for it.
- One question on a sheet she does not want → delete_item with that sheet and the question word for word (look it up with find_questions first; her paraphrase is not the question). If more than one question fits her words, name them and ask which instead.
- delete_material and delete_item PROPOSE; they never delete. The app shows her a card naming what would go, with a button to delete and one to keep, and her tap decides. So your reply asks and never says it is gone.
- Use them ONLY when she asked for something to be removed. Being finished with a sheet, being done with a topic, being annoyed by something, or not needing it today are none of that: answer what she actually said and propose nothing. If you think she might want it gone but she did not say so, ask her in words — without the tool, so no card appears. When more than one sheet could fit what she did ask to remove, name them and ask which, again without the tool.

${NOT_PRACTICABLE}`;

/** Its rules in the turn prompt (the context provider's `turnRules`). */
export const LEARNING_TURN_RULES = MATERIAL;
