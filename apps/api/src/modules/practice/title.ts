// What a run is called (#642). A material's title is also the name of the run made from it
// (`service.ts`), and the name of every run stands on ONE line in the practice header, between
// the close button, Buddy and the two controls (design components/buddy/Header.jsx). On a 360 pt
// phone that line holds about 132 pt of the 17 pt bold title: some 16 letters. "Arbeitsblatt
// Brüche - Klasse 6" stood there as "Arbeitsblatt Brüche - Kl…" (device check 14.10.).

/** The most letters a title may have and still stand whole in the header of a 360 pt phone. */
export const TITLE_CHARS = 16;

/** How the model names a material or a run: principles and bans, no sample titles. */
export const TITLE_RULES = `title: what it is about, at most ${TITLE_CHARS} characters — it stands on one line in the app's header on a small phone. Name the topic itself; never the kind of paper (worksheet, homework, test, exercise sheet), a class, a grade, a page number or a date.`;
