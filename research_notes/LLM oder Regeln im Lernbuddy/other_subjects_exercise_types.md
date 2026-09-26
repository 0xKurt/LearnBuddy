# Deterministic exercise types and checking methods beyond maths and vocabulary (German, English, French, history, physics, grade 5–8)

Method note (read first): research was done on 2026-09-26. The network proxy **blocked direct fetches** of imsglobal.org, h5p.org, help.h5p.com, docs.moodle.org, dev.languagetool.org, kaikki.org, anton.app, huggingface.co and taotesting.com. Findings for those sites come from **search-engine snippets**, not full-page reads, and should be spot-checked before anyone relies on exact wording. github.com was reachable, so the LanguageTool, Wiktextract and OpenLexicon facts come from full pages. Anything under "Inferences" is my reasoning, not a sourced fact.

## Standard interaction types (QTI 3.0, H5P, Moodle, Anton) and how each is scored

### Takeaway

There is a stable, shared set of interaction types: single/multiple choice, order, match/associate, gap-match (drag into gap), inline choice (dropdown in text), text entry, hottext (mark words), hotspot, slider and extended text. All except extended text are scored by rule. You either compare to one correct response ("match_correct") or look the response up in a mapping of accepted answers with partial credit ("map_response"). Moodle's Cloze syntax is a compact, proven way to encode several accepted alternatives, partial credit, case sensitivity and numeric tolerance per gap.

### Cited Findings

**QTI (1EdTech)**

- QTI interaction types named in the specs include associateInteraction, choiceInteraction, drawingInteraction, extendedTextInteraction, gapMatchInteraction, graphicInteraction, hottextInteraction, matchInteraction, orderInteraction, sliderInteraction and uploadInteraction. Graphic variants include hotspotInteraction and graphicGapMatchInteraction. Source is search snippets that mix QTI 2.x and 3.0 documents — [QTI v2.2 Implementation Guide](https://www.imsglobal.org/question/qtiv2p2/imsqti_v2p2_impl.html), [QTI v3 Best Practices and Implementation Guide](https://www.imsglobal.org/spec/qti/v3p0/impl)
- orderInteraction: the response is declared with _ordered_ cardinality, and the correct value is an ordered list of values — [QTI v2.2 Impl. Guide (snippet)](https://www.imsglobal.org/question/qtiv2p2/imsqti_v2p2_impl.html)
- hottextInteraction: a passage with selectable hot words or phrases. It differs from choiceInteraction because the choices are shown in the context of the surrounding text. hotspotInteraction does the same on an image — [QTI v2.2 Impl. Guide (snippet)](https://www.imsglobal.org/question/qtiv2p2/imsqti_v2p2_impl.html)
- graphicGapMatchInteraction: the choices are images, and the gaps sit inside a larger background image — [oat-sa/qti-sdk](https://github.com/oat-sa/qti-sdk/blob/master/src/qtism/data/content/interactions/GraphicGapMatchInteraction.php)
- The most common response-processing templates are **match_correct**, which gives SCORE 1 if the response equals the correct response and 0 otherwise, and **map_response**, which gives 0 if there is no answer and otherwise sums the values in the responseDeclaration's mapping — [QTI 3 Beginner's Guide / Impl. Guide (snippets)](https://www.imsglobal.org/spec/qti/v3p0/guide)
- Practical rule from an implementer: one accepted answer → cardinality="single" + match_correct. More than one accepted answer → cardinality="single" + qti-mapping + map_response — [learningequality/studio issue #6187](https://github.com/learningequality/studio/issues/6187)
- Open-source QTI tooling exists, e.g. the PHP qti-sdk from OAT (TAO) — [oat-sa/qti-sdk](https://github.com/oat-sa/qti-sdk/blob/master/src/qtism/data/content/interactions/GraphicGapMatchInteraction.php)

**H5P**

- H5P offers these content types (among others): Mark the Words, Drag the Words, Sort the Paragraphs, Summary and Dialog Cards — [Fanshawe OER guide](https://ecampusontario.pressbooks.pub/oerdevelopmentguide/chapter/h5p-content-types-examples/), [UBC H5P examples](https://h5p.open.ubc.ca/h5p-examples/)
- Drag the Words: text-based tasks where users drag words into blanks in sentences — [H5P Drag the Words](https://h5p.org/drag-the-words)
- Sort the Paragraphs: learners put paragraphs into the correct order — [H5P Sort the Paragraphs](https://h5p.org/content-types/sort-the-paragraphs)
- Dialog Cards: cards with a word or expression on one side and the matching one on the other (a flashcard-style self-check) — [H5P Tutorial (snippet)](https://h5p.org/documentation/content-author-guide/tutorials-for-authors/drag-the-words)
- Mark the Words, Sort the Paragraphs and Drag the Words record a score when the learner presses submit. H5P keeps a per-content-type scoring overview, but I could not read it (blocked) — [H5P Scoring overview per content type](https://help.h5p.com/hc/en-us/articles/7505608748061-Scoring-overview-per-content-type)

**Moodle Cloze (Embedded Answers / multianswer)**

- Each gap is written as `{weight:TYPE:answers}`. TYPE is MULTICHOICE, SHORTANSWER or NUMERICAL. The correct answer is prefixed with `=`, alternatives are separated by `~`, feedback follows `#`, and `%P%` gives partial credit of P percent — [MoodleDocs Cloze](<https://docs.moodle.org/20/en/Embedded_Answers_(Cloze)_question_type>), [UoW L&T Hub](https://ltc.uow.edu.au/hub/article/cloze-moodle-quiz)
- SHORTANSWER / SA / MW ignore case. SHORTANSWER*C / SAC / MWC must match case — [MoodleDocs Cloze](https://docs.moodle.org/20/en/Embedded_Answers*(Cloze)\_question_type)
- NUMERICAL with tolerance: `{2:NUMERICAL:=5:0.5}`. `=23.8:0.1` accepts 23.7–23.9 — [UoN Moodle help](https://nottshelp.atlassian.net/wiki/spaces/moodlestaff/pages/830753), [MoodleDocs Cloze](<https://docs.moodle.org/20/en/Embedded_Answers_(Cloze)_question_type>)
- Example: `{1:MULTICHOICE:=circulatory~respiratory~digestive}` — [UoW L&T Hub](https://ltc.uow.edu.au/hub/article/cloze-moodle-quiz)

**Anton (German school app)**

- Anton advertises "über 200 Übungstypen" (over 200 exercise types) and 100,000–200,000 tasks. It covers Deutsch (grade 1–10), Physik (grade 5–8), Geschichte, Englisch and other subjects, with instant feedback. The claims differ between listings — [App Store listing](https://apps.apple.com/de/app/anton-lernen-schule/id1180554775), [lernmarktplatz.de](https://lernmarktplatz.de/products/anton-die-kostenlose-schul-app), [anton.app Deutsch 6](https://anton.app/de/lernen/deutsch-6-klasse/)

### Inferences

- A small set of deterministic kinds would cover the whole QTI/H5P core: `choice` (single/multi), `order`, `match` (pairs), `gap` (either drag/select from a word bank or typed), `mark` (hottext: tap words in a sentence), `numeric` (value + tolerance + unit) and `flashcard/self-assess`. Scoring then needs only exact match on normalized strings, a map of accepted alternatives with partial credit, and a numeric tolerance.
- Moodle's Cloze model is a good template for the zod contract of a typed gap: `accepted: [{text, credit, feedback}]`, `caseSensitive`, and for numerics `value, tolerance`. The LLM writes these once when it reads the worksheet, and code checks them at practice time.
- Order tasks need a partial-credit rule. QTI's default match_correct is all-or-nothing. A friendlier option for kids is to credit correct adjacent pairs, or the longest correct subsequence. This is my design suggestion, not something a spec prescribes.

### Gaps

- I could not read the QTI 3.0 spec text itself (blocked). I did not verify QTI 3.0-specific details for inlineChoice, textEntry, slider or graphicOrder, such as areaMapping for hotspots or string-match options for textEntry.
- I could not read H5P per-type scoring (e.g. whether Timeline or Flashcards score at all, or how Summary scores). H5P licensing (the core is MIT, as I understand it) was not verified.
- Anton's actual task types per subject are unverified: anton.app was blocked, and no source lists the types. Anything more specific than the counts above would be a guess.

## History: timelines, ordering, matching, cause and effect, source questions — rules versus judgement

### Takeaway

German history teaching sorts tasks by "Operatoren" in three requirement levels. Level I (nennen, beschreiben — name, describe) maps well onto deterministic items: ordering and timelines, event↔date or person↔event matching, cause→effect matching, gap-fill, and marking statements in a source text. Level II (erklären, einordnen, vergleichen — explain, place in context, compare) is partly checkable when framed as a choice. Level III (beurteilen, Stellung nehmen — judge, take a position) needs judgement: rubric or tutor.

### Cited Findings

- Level I (reproduction) uses operators such as beschreiben, nennen, skizzieren, zusammenfassen. Level II (reorganisation/transfer) includes untersuchen, vergleichen, analysieren, begründen, erläutern, einordnen: placing a source in its historical context. Level III (reflection) includes beurteilen, bewerten, diskutieren, erörtern, Stellung nehmen: critically judging what a source says — [geschichte-abitur.de](https://www.geschichte-abitur.de/geschichtsunterricht/anforderungsbereiche-und-operatoren-in-geschichte), [Bavarian Operatorenliste Gymnasium](https://www.historisches-forum.bayern.de/fileadmin/user_upload/historisches_forum/Texte/LehrplanPlus/Operatorenliste_Geschichte_Gymnasium.pdf), [TU Dresden](https://tu-dresden.de/gsw/phil/ige/ddg/ressourcen/dateien/schulpraktische-studien/Anforderungsbereiche_Operatoren_GE_2022.pdf?lang=en)
- H5P ships "Timeline" and "Sort the Paragraphs" types that can model chronology — [Fanshawe OER guide](https://ecampusontario.pressbooks.pub/oerdevelopmentguide/chapter/h5p-content-types-examples/), [H5P Sort the Paragraphs](https://h5p.org/content-types/sort-the-paragraphs)
- QTI's orderInteraction (ordered cardinality) and match/associate interactions formally cover sequence and pairing tasks — [QTI v2.2 Impl. Guide](https://www.imsglobal.org/question/qtiv2p2/imsqti_v2p2_impl.html)

### Inferences

- **Checkable by rules:**
  - Put 3–6 events in order. Score by pairs or by the longest correct subsequence.
  - Match event↔year, term↔definition, person↔role (tap-to-pair).
  - "Which is a cause / which is a consequence" as choice or two-bucket sorting.
  - True/false statements about a source.
  - Hottext: "tap the sentence in the source that shows X".
  - Gap-fill with a word bank.
  - Year entry. Exact match is usually right. For "Jahrhundert" (century) questions, accept "1. Jh. v. Chr." variants through the LLM-prepared alternatives list, not through code heuristics.
- **Needs judgement:** "Erkläre, warum …" (explain why), "Beurteile …" (judge), and any source analysis beyond locating facts. The best fit is a rubric the LLM prepares when it reads the worksheet, followed by a light model check, or tutoring on request.
- Rule 3 of CLAUDE.md forbids keyword lists as fake understanding. So "prepare keywords, match in code" for why-questions is risky. Use it only as a hint, with the decision coming from a structured model judgement.

### Gaps

- I found no published taxonomy that maps history operators to digital auto-scorable item types. The mapping above is my own reasoning.

## German, French and English grammar: engines, datasets and LanguageTool

### Takeaway

Grammar drills (Wortarten, Fälle, Zeitformen, conjugation, articles, plural) are best built as closed items (choice, gap with accepted forms, mark-the-words), with the correct forms fixed at preparation time. Open datasets can supply or verify those forms: Wiktextract/kaikki (MIT code, CC BY-SA/GFDL data), Lexique for French (CC BY-SA 4.0) and DEMorphy for German (MIT). LanguageTool (LGPL 2.1+) can be self-hosted for spelling and grammar hints on free text. The public API is rate-limited and forbids automated use.

### Cited Findings

**Datasets and analysers**

- Wiktextract is MIT-licensed, "free for both commercial and non-commercial use". It extracts inflected forms with tags (tense, person, case and so on), inflection tables, IPA, senses and translations, and supports several Wiktionary editions including en, de and fr — [tatuylonen/wiktextract](https://github.com/tatuylonen/wiktextract)
- kaikki.org publishes wiktextract JSONL per language, including German and a German-edition extraction. The data is under the Wiktionary licences CC BY-SA and GFDL — [kaikki.org German](https://kaikki.org/dictionary/German/index.html), [kaikki.org dewiktionary](https://kaikki.org/dewiktionary/index.html), [raw data](https://kaikki.org/dictionary/rawdata.html)
- Lexique (French) has about 135,000 words / 130,000 entries including inflected forms (conjugated verbs, feminine and plural forms), with grammatical category, gender, number, lemma and frequency — [Wikipédia: Lexique](<https://fr.wikipedia.org/wiki/Lexique_(base_de_donn%C3%A9es)>), [Lexique 3 manual](http://openlexicon.fr/datasets-info/Lexique382/Manuel_Lexique3.html)
- OpenLexicon (the home of Lexique) is under CC BY-SA 4.0 unless a directory says otherwise. The associated publications must be cited in derivative works — [chrplr/openlexicon](https://github.com/chrplr/openlexicon)
- DEMorphy, a German morphological analyser, is MIT-licensed and suitable for commercial use — [DuyguA/DEMorphy](https://github.com/DuyguA/DEMorphy), [arXiv 1803.00902](https://arxiv.org/abs/1803.00902)
- mlconjug3 is MIT. It conjugates French, English, Spanish, Italian, Portuguese and Romanian and predicts unknown verbs with ML — [mlconjug3](https://github.com/SekouDiaoNlp/mlconjug3)
- verbecc's French templates derive from Verbiste, which is GPL-2.0, so it is a licence risk for commercial use. PyPI lists the licence as "Other" — [libraries.io verbecc](https://libraries.io/pypi/verbecc), [verbecc GitHub](https://github.com/bretttolbert/verbecc)
- There is a Wiktionary-derived German verbs database (CSV) — [viorelsfetea/german-verbs-database](https://github.com/viorelsfetea/german-verbs-database)
- A spaCy discussion reports that the French morphologizer mislabels future, conditional and imperative forms — [spaCy discussion #13717](https://github.com/explosion/spaCy/discussions/13717)

**LanguageTool**

- The LanguageTool core is LGPL 2.1 or later. It supports English, Spanish, French, German, Portuguese, Polish, Dutch and more than 20 others. Building needs Java 17 and Maven, and community Docker images exist — [languagetool-org/languagetool](https://github.com/languagetool-org/languagetool)
- Public API limits: 20 requests per IP per minute (peak), 75 KB of text per IP per minute, 20 KB per request, and suggestions for at most 30 misspelled words. Automated use must go to your own server or an Enterprise account. Only POST requests are accepted. A visible backlink to languagetool.org is expected — [public-http-api.md](https://github.com/languagetool-org/languagetool-org.github.io/blob/master/public-http-api.md)
- Self-hosting needs about 1 GB RAM baseline, and 2 GB minimum when n-grams are enabled. The English n-gram data is about 15 GB of disk. These figures come from secondary, blog-level sources — [slopereviews guide](https://slopereviews.com/blog/self-host-languagetool-migration-guide-2026), [Proxmox discussion](https://github.com/community-scripts/ProxmoxVE/discussions/9680)

### Inferences

- **Checking a known target form** (conjugation gap, article, plural, case ending) needs no NLP at run time. Store the accepted strings when the exercise is prepared, and use datasets to _verify_ what the LLM proposes. Example: the LLM writes "ils finissent", and a kaikki/Lexique lookup confirms it at preparation time. This fits hard rule 1: the model proposes, code checks.
- **Wortarten or case identification** works best as hottext or choice ("tap all nouns", "which case is 'dem Hund'?"), with answers fixed at preparation. DEMorphy or spaCy could cross-check, but they are ambiguous in context. spaCy's German per-feature Case/Tense accuracy was not found (see Gaps), so don't let a tagger decide correctness alone.
- **LanguageTool for dictation or short answers:** it tells you "this is a misspelling / grammar issue" and gives suggestions. It does not tell you "this matches the target sentence". For dictation, compare with the known target text: normalise, then show a word-level diff (deterministic). That already localises errors without LanguageTool. LanguageTool adds value for _free_ writing, e.g. a sentence the child composes, as gentle hints. Self-hosting is needed (the public API forbids automated use, and privacy for minors). LGPL allows unmodified server use commercially. As I understand LGPL, obligations mainly apply when you distribute modified copies.
- Comma rules (Kommasetzung) suit "tap where a comma belongs": gaps between words become tappable slots, and the correct slot set is fixed at preparation. Scoring is precision/recall on the slots.
- Licence caution: CC BY-SA data used as a _lookup at preparation time_ is probably fine, but redistributing the dataset or derived tables inside the app may trigger ShareAlike and attribution duties. This needs a legal check.

### Gaps

- I did not obtain spaCy de_core_news accuracy for morphology (Hugging Face blocked). Stanza was not researched.
- GermaNet (restricted licence, as I understand it) and Morphy were not verified.
- I found no measured LanguageTool latency figures. The "instant" claim for short texts is unverified.
- I did not verify whether LanguageTool's German rules implement the latest Rechtschreibrat rules or school-level spelling conventions.

## Short free-text answers: classic ASAG and LLM with a rubric

### Takeaway

The classic approach (ETS c-rater) scored short answers against expert-written _concepts_ per question, recognising paraphrases through normalisation. It reached about 84% agreement with human raters. The current practice is an LLM with a rubric prepared in advance. It shows strong correlation but only moderate exact agreement, and it tends to grade more harshly. For LearnBuddy: "prepare the rubric once (big model), judge with a small model" fits Level I–II questions with 1–3 expected concepts.

### Cited Findings

- ASAG is the task of assessing short natural-language answers to objective questions computationally. Burrows, Gurevych & Stein (2015) reviewed 35 systems in 5 eras and concluded that an "era of evaluation" was emerging — [ERIC EJ1049513](https://eric.ed.gov/?id=EJ1049513), [PDF](https://downloads.webis.de/publications/papers/burrows_2015.pdf)
- c-rater scores against a model of the correct answer written by content experts for each question. An item can list several concepts a complete answer must contain, and full or partial credit is given. Paraphrases are recognised by normalising syntactic variation, pronoun reference, morphology, synonyms and spelling errors — [Leacock & Chodorow 2003](https://link.springer.com/article/10.1023/A:1025779619903), [ETS](https://www.ets.org/research/policy_research_reports/publications/article/2003/cpxm.html)
- c-rater agreed with human graders about 84% of the time in NAEP and an Indiana statewide assessment — [Leacock & Chodorow 2003 (snippet)](https://www.semanticscholar.org/paper/C-rater:-Automated-Scoring-of-Short-Answer-Leacock-Chodorow/7db946cc188802903ae54360d0914cbe7f655b41)
- GPT-4o grading short-answer quizzes: correlation up to 0.98 with human graders, but exact score agreement in only 55% of quiz cases — [arXiv 2511.10819](https://arxiv.org/html/2511.10819v1)
- Medical-education study, 2,288 answers in 3 languages: GPT-4 gave significantly lower grades than humans but had few false positives. It had moderate agreement overall and high precision on answers it rated fully correct — [PubMed 39334087](https://pubmed.ncbi.nlm.nih.gov/39334087/)
- Question-specific rubrics improve LLM grading (shown for code evaluation) — [arXiv 2503.23989](https://arxiv.org/html/2503.23989v1). "Does GPT-4 with prompt engineering beat traditional models?" (LAK 2025) addresses the same question for ASAG — [ACM DL](https://dl.acm.org/doi/10.1145/3706468.3706481)

### Inferences

- **Good candidates for "rubric once, small model judges":**
  - Questions with a small closed set of expected concepts, e.g. "Why did the Romans build roads?" → {moving troops fast, trade/goods, controlling/administering provinces}, where "2 of 3" means full credit.
  - Definitions ("Was ist ein Aquädukt?").
  - "Name two reasons/effects" questions.
  - Physics "explain in one sentence" answers with one key idea.
    The rubric holds concepts, acceptable paraphrase examples, typical misconceptions and credit rules, all written by the big model while it reads the worksheet. The small model returns zod-validated `{conceptsMet: [...], misconception?: id}`, and code computes the score. That respects rule 1 and rule 3.
- **Poor candidates:** Level III judgement ("Beurteile…"), open-ended opinion, creative writing. Treat these as tutoring conversations, not scored items.
- Given the harsh-grading tendency and the 55% exact agreement, show a child's free-text result as "fast richtig — hier fehlt noch …" (almost right, still missing …), with the matched concepts, not as a hard score. Let the child override ("Ich meinte das so") — undo over confirmation.
- A cheap deterministic pre-check before the model: if the normalised answer equals a prepared accepted answer, accept instantly. Use the model only otherwise.

### Gaps

- I found no study of LLM grading on German school-age answers, and no benchmark of _small_ models (e.g. Haiku-class) with prepared rubrics against human raters. This needs our own eval set.

## Physics grade 6–8: units, numeric tolerance, conversion libraries

### Takeaway

Numeric answers are fully deterministic. Parse the number, accept a tolerance (absolute or relative, as in Moodle NUMERICAL), and parse and convert units with a library. mathjs (Apache-2.0) handles unit parsing and arithmetic. convert-units (MIT) handles simple conversions. UnitMath is a dedicated alternative.

### Cited Findings

- mathjs: `math.unit(5, 'cm').to('m')` → 0.05 m, under the Apache 2.0 licence — [mathjs Unit docs](https://mathjs.org/docs/reference/classes/unit.html), [josdejong/mathjs](https://github.com/josdejong/mathjs)
- convert-units on npm is MIT — [npm convert-units](https://www.npmjs.com/package/convert-units), [Snyk](https://snyk.io/advisor/npm-package/convert-units)
- UnitMath is a JavaScript library for unit conversion and arithmetic — [ericman314/UnitMath](https://github.com/ericman314/UnitMath)
- Moodle NUMERICAL uses a value plus an absolute tolerance (`=23.8:0.1`) — [MoodleDocs Cloze](<https://docs.moodle.org/20/en/Embedded_Answers_(Cloze)_question_type>)

### Inferences

- The checker would work in this order:
  1. Normalise the German decimal comma ("2,5" → 2.5).
  2. Split into number and unit.
  3. Parse the unit with mathjs and convert to the expected unit. Reject units of a different dimension with the hint "Einheit passt nicht" (unit doesn't fit).
  4. Compare with a relative tolerance, e.g. 1%, or an absolute one set at preparation.
  5. Give separate feedback for "value right, unit missing" (partial credit plus hint).
- Significant figures are rarely assessed at grade 6. I suggest not grading them, and only nudging when an answer shows implausible precision. This is a design opinion.
- For a phone, offer a unit picker (tap) next to a numeric keypad instead of free-typed units. That avoids parse ambiguity (ml vs mL, "sek").

### Gaps

- I did not verify how mathjs handles German unit spellings or locale decimal commas (I assume it doesn't, so pre-normalisation is needed).
- I did not verify convert-units' current maintenance status (v3 has been in beta for a long time).

## Self-assessment and flashcard modes (retrieval practice evidence)

### Takeaway

Practice testing and distributed practice are the two "high utility" techniques (Dunlosky et al. 2013). Retrieval practice beats restudy, with g ≈ 0.61, and the effect is larger with feedback. But children are persistently overconfident in judging their own learning. So pure "I knew it / I didn't" flashcards should be mixed with checked items, and self-ratings should not be the only signal for scheduling.

### Cited Findings

- Dunlosky et al. (2013) rated 10 techniques. Practice testing and distributed practice got "high utility" because they help learners of many ages and abilities, across many criterion tasks, including in educational contexts — [PubMed 26173288](https://pubmed.ncbi.nlm.nih.gov/26173288/), [APS summary](https://www.psychologicalscience.org/publications/journals/pspi/learning-techniques.html)
- Adesope et al. (2017) meta-analysis: practice tests versus all comparison conditions, mean g = 0.61. The effect was larger with a single practice test (g = 0.70) than with several (g = 0.51) — [SAGE](https://journals.sagepub.com/doi/abs/10.3102/0034654316689306), [ERIC EJ1141817](https://eric.ed.gov/?id=EJ1141817)
- Rowland (2014): testing with feedback gave a larger effect (0.73) than testing without feedback (0.39). With no corrective feedback and retrieval success ≤ 50%, there was no testing effect — [PubMed 25150680](https://pubmed.ncbi.nlm.nih.gov/25150680/)
- The testing effect may shrink or disappear as learning material gets more complex — [Van Gog & Sweller 2015, Educ Psychol Rev](https://link.springer.com/article/10.1007/s10648-015-9310-x)
- Children stay overconfident in judgements of learning even after several trials, unlike adults, who adjust their confidence — [Finn & Metcalfe 2014](https://www.columbia.edu/cu/psychology/metcalfe/PDFs/FinnMetcalfe2014.pdf), [Metacognition & Learning 2015](https://link.springer.com/article/10.1007/s11409-014-9133-z)
- Children aged 7–10 improve in retrospective monitoring but not in prospective monitoring. Control stays suboptimal because their monitoring is overoptimistic — [Bayard et al. 2021, Child Development](https://pmc.ncbi.nlm.nih.gov/articles/PMC8248442/)

### Inferences

- Flashcard/self-assessment mode (Dialog Cards style: flip, then "wusste ich / noch nicht" — I knew it / not yet) is a valid, instant, free mode for facts (dates, terms) and needs no checking. Because 12-year-olds overrate themselves, schedule these cards more conservatively, and regularly interleave a _checked_ version of the same fact (choice or typed) to calibrate.
- Always give corrective feedback right after an attempt: the Rowland feedback effect. Keep retrieval success reasonably high by starting easy (choice or recognition) and moving to recall. Low success without feedback yields no benefit.

### Gaps

- I found no study specific to self-graded flashcards in 11–13-year-olds on phones.

## Which types suit a phone and a 12-year-old (tap, drag, speak) versus which to avoid

### Takeaway

Tap-based types (choice, true/false, tap-to-pair matching, tap-to-order, tap-words-in-text, word-bank gaps, flashcard flip) suit a phone best and are fully deterministic. Every drag interaction must also have a tap alternative (WCAG 2.2 SC 2.5.7, Level AA). Long typing, precise hotspots on small images and multi-column matrices are better avoided or kept short.

### Cited Findings

- WCAG 2.2 SC 2.5.7 Dragging Movements (Level AA): every function that uses dragging must also work with a single pointer without dragging, unless dragging is essential — [W3C Understanding 2.5.7](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)
- The single-pointer alternative must not itself be a path-based gesture such as a swipe (SC 2.5.1). Touch users may have no keyboard for arrow-key alternatives — [W3C Understanding 2.5.7](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html), [Appt](https://appt.org/en/guidelines/wcag/success-criterion-2-5-7)
- H5P and QTI both keep "drag into gap" (Drag the Words / gapMatch) and "select in text" (Mark the Words / hottext) as separate types, which confirms both patterns exist as standard — [H5P Drag the Words](https://h5p.org/drag-the-words), [QTI v2.2 Impl. Guide](https://www.imsglobal.org/question/qtiv2p2/imsqti_v2p2_impl.html)

### Inferences

- **Well suited:**
  - Single/multi choice and true/false.
  - Tap-to-pair matching (tap left, then right).
  - Tap-to-order: tap items in sequence to number them. Drag reordering is optional, since tap must work.
  - Word-bank gaps: tap a chip to fill the next gap. This replaces Drag the Words.
  - Inline dropdown for articles or verb forms.
  - Hottext marking (Wortarten, comma slots).
  - Short typed answers of 1–3 words (conjugations, years, numbers with a numeric keypad).
  - Flashcard flip with self-rating.
  - Timelines as tap-to-order with years revealed afterwards.
- **Use with care:**
  - Typed sentences. The on-screen keyboard is slow, and autocorrect can "fix" spelling in dictation, so turn autocorrect off for those inputs.
  - Free-text "why" answers: allow voice → text, then judge with the rubric.
  - Hotspots on small images: make areas big, or use labelled choices instead.
- **Speech:** voice input is attractive for 12-year-olds and for "explain" answers. The transcript then goes to the rubric judge, not to exact matching. Avoid speech for spelling or dictation checks, because speech-to-text produces correctly spelled words and hides the child's own spelling.
- **Avoid:** large match matrices, long extended-text essays scored automatically, timed drag games, and anything that shows counts of missed or due items (CLAUDE.md rule 6).

### Gaps

- I found no empirical study comparing drag versus tap accuracy or preference for 12-year-olds on phones. The recommendations above rest on WCAG plus reasoning.
