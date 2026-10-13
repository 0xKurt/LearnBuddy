# ADR 0009 — Labelled pictures are real images; numbers and tap areas are data

- Status: accepted (owner, 2026-10-12, rule 3 of issue #599; design package of 2026-10-13)
- Date: 2026-10-13
- Reverses: the decision of #224 recorded in `docs/architecture.md` §Labelled pictures until now —
  "drawn by us, nothing licensed"
- Builds on: [ADR 0004](0004-proactive-buddy.md) (the model interprets, code enforces)

## Context

The picture library (#252, #462) held 35 pictures school asks to label, each drawn by us as vector
outlines in the app's pastels. The owner's rule for the redesign correction (#599, rule 3):

> Abbildungen use the real images from assets/figures/\*\* (Servier Medical Art, Wikimedia Commons,
> etc.). NO self-drawn vector replacements for skeleton, heart, cell, eye, compass, moon, earth and
> the rest. Numbers and leader lines go on top with react-native-svg, and the anchors are stored as
> data. Every licence from both sources.json files (assets/figures/ and assets/figures/parts/) must
> appear on the Lizenzen screen.

The design package of 13 October delivers 33 images for 34 pictures (`flower_section` shows
`flower.png`), 24 single elements of the four row pictures, one anchor file per picture, two
`sources.json` files and `TEILE.md` (what each image shows, what it does not, what is open).

## Decision

1. **Every picture is its image.** The app shows `assets/figures/<id>.png` unchanged — no
   recolouring — on a light paper card (white, radius 14) in every look, the dark ones too. The
   vector drawings of these 34 pictures are deleted.
2. **One exception, named in code with its reason:** `circuit`. The package has no image for it
   (no free image shows real components, only diagrams of symbols); it keeps our drawing until one
   exists (`SCHEMATIC_DRAWN` in `packages/shared-math/src/schematics.ts`).
3. **Anchors are data, one source for app and server:**
   `packages/shared-math/src/schematicAnchors.data.ts` — per part the point on the motif, where its
   number stands and its tap area, in the image's frame 300 wide. The app draws numbers and leader
   lines from it; the server decides from it what a tap may ask for.
4. **A part its image does not show is no part of the library** (TEILE.md, "Fällt weg"): plant −
   root; bicycle − rack, bell, headlight, spoke reflector, rear light; organs − kidneys; insect
   head − ocelli; leaf − vascular bundle; distillation − stand, burner. The model's part list is
   generated from the library, so new questions cannot use them; a draft that does is dropped.
5. **Which part a tap means, and what a tap may ask for.** The package gives each part one point
   and one 44 × 44 area; it has no outlines. So:
   - A tap means the part whose area holds the finger. **No two tap areas of one picture
     overlap** in the smallest room (a guard test over the data): the package's 44 × 44 squares
     around each point did, and "nearest anchor on overlap" then cut through visible structures —
     the stomach's lower left went to the pancreas, the ovary's bulb to the ovule, the coarse-focus
     knob's lower right to the fine focus. Each area was redrawn by looking at the picture: onto
     its own structure, at least 44 pt each way on the narrowest phone (56 units in a tall
     picture), clear of every other. Where two finger-wide areas cannot both sit on their own
     structure, one part is named only. The overlap rule of HANDOFF §8 is therefore not needed and
     not implemented. **Outside every area a tap means nothing** — no nearest-anchor guess: the finger
     may lie on another structure, and a guess would be graded as her answer (CLAUDE.md rule 1).
     Her place is then empty again (no ring; the line under the figure says how to answer).
   - **A part is asked by tap only if one area covers its structure.** Each of the 240 parts was
     looked at on its image: a part whose structure is clearly larger than its area, is drawn more
     than once (both lungs, both arms, every myelin segment, upper and lower teeth) or continues
     elsewhere (the colon, the aorta) is **named only** — `tap: null` in the anchor data: it has no
     area, no question asks to tap it, no finger picks it. 165 parts are named only, 75 can be
     tapped (tables below). Naming a part by its number is not affected.
   - Two parts with areas must stand at least **24 pt** apart in the smallest room (360 × 740),
     the spacing of WCAG 2.2 (2.5.8) and the rule the maps already use. Each part that can be asked
     thus owns a disc of at least 12 pt radius around its anchor. Today no part with an area fails
     this; the rule guards later edits. **Owner decision:** 24 pt (`TAP_TARGET.image`), or back to
     the 44 pt of #252. Pairs under 30 pt need a test with a real finger (table below).
   - **Tap coverage is low because each part has one point and one finger-wide area.**
     Per-structure tap areas — several rectangles per part (both lungs, each lab device in its
     cell) — would bring tap questions back for many parts; that is new anchor data from the
     design package and the owner's decision.
6. **Stored questions are not rewritten.** A row that no longer holds — it names a removed part, or
   asks to tap a part that has no tap area now — is never chosen for a set
   (`selectPracticeItems`), dropped from a set Buddy prepared before (`startFromStep`), and shown
   without its picture wherever it still appears: an older session, a past turn, the sheet's list
   of questions. One exception, on purpose: a homework task stays in its sheet's help session — it
   is her sheet's task — without the picture. Nothing is renumbered.
7. **Every licence is shown.** `lib/figureLicences.ts` reads both `sources.json` files; the
   Lizenzen page lists every entry with its attribution sentence, what was changed, and links to
   its licence and source. A test fails for an image without an entry and for an entry without its
   image.

## The licences as they stand in `sources.json`

This is a record of what the files say, not legal advice. 77 entries: 53 for the 33 images (a
grid image has one entry per element), 24 for the single elements.

| Licence as stated | Entries |
| ----------------- | ------- |
| CC BY 4.0         | 31      |
| Public domain     | 20      |
| CC0               | 15      |
| CC BY-SA 3.0      | 7       |
| CC BY 3.0         | 2       |
| CC BY 2.5         | 1       |
| CC BY-SA 4.0      | 1       |

- The eight share-alike entries cover nine image files: `eye.png` and `eye_front.png` (one
  entry), `heart.png`, `insect_head.png`, `leaf.png`, `neuron.png`, `skeleton.png`, `teeth.png`
  (CC BY-SA 3.0) and `volcano.png` (CC BY-SA 4.0). The CC BY-SA licences ask that an adapted
  version is passed on under the same or a compatible licence and that changes are indicated.
  Every entry of both files says "bearbeitet: ja: …" (cut, scaled to 900 px, background made
  transparent, labels removed where the original had them); the page shows that line and each
  attribution sentence ends in "– bearbeitet."
- All 20 public-domain entries have no licence URL; the page shows "gemeinfrei" and the source.
- Two `datei` values name more than one file or carry a remark (`"eye.png, eye_front.png"`,
  `"flower.png, (auch für flower_section)"`); the files are kept as delivered and read by file
  name.
- The earlier research on #599 (comment "Abbildungen: fit of the 35 supplied images …") found
  attribution details that differed from the Commons pages in the first package. The second
  package's files were not checked against their sources again.

## Anchors moved after looking at them

Every anchor of all 34 pictures was drawn over its image (anchor, leader, number, tap area) and
looked at, more than once. 81 anchors stood beside the structure they name — on white, on an
edge, on a neighbouring part — and were moved onto it; their tap areas moved with them. The tap
areas of the parts that can be tapped were then redrawn onto their structures (rows "tap area"). Three numbers of the microscope were
moved so that none covers the fine-focus knob, and three of the flower's so that `flower` and
`flower_section`, which show one image, share one set of numbers. Coordinates in the frame 300
wide.

| Picture        | Part                               | What     | Old → new                               | Why                                                                                                                                              |
| -------------- | ---------------------------------- | -------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| plant_cell     | cytoplasm (Zellplasma)             | anchor   | [113, 163] → [84, 93]                   | stood on the notch of wall and membrane; now in the plasma                                                                                       |
| plant_cell     | mitochondrion (Mitochondrium)      | anchor   | [135, 147] → [98, 123]                  | stood on the Golgi body, then on plasma beside the oval; the labelled original (Commons, Plant_cell_structure-en.svg) names the pale-green ovals |
| flower         | stalk (Blütenstiel)                | badge    | [12, 223] → [12, 233]                   | as in flower_section: both show one image                                                                                                        |
| flower         | sepal (Kelchblatt)                 | anchor   | [93, 180] → [92, 160]                   | stood on white beside the green lobe                                                                                                             |
| flower         | sepal (Kelchblatt)                 | badge    | [12, 197] → [12, 207]                   | as in flower_section: both show one image                                                                                                        |
| flower         | receptacle (Blütenboden)           | badge    | [12, 171] → [12, 181]                   | as in flower_section: both show one image                                                                                                        |
| flower         | ovary (Fruchtknoten)               | anchor   | [121, 107] → [125, 125]                 | stood on the petal left of the bulb; now on the bulb                                                                                             |
| flower         | style (Griffel)                    | anchor   | [149, 67] → [151, 62]                   | stood on the petal beside the pistil                                                                                                             |
| flower         | stigma (Narbe)                     | anchor   | [153, 43] → [157, 38]                   | stood on the petal beside the pistil                                                                                                             |
| flower         | receptacle (Blütenboden)           | tap area | [103, 149, 44, 44] → [103, 163, 44, 44] | onto its own structure, clear of every other area, a finger wide in the smallest room                                                            |
| flower         | ovary (Fruchtknoten)               | tap area | [103, 103, 44, 44] → [116, 89, 48, 74]  | onto its own structure, clear of every other area, a finger wide in the smallest room                                                            |
| flower         | style (Griffel)                    | tap area | [129, 40, 44, 44] → [130, 47, 44, 42]   | onto its own structure, clear of every other area, a finger wide in the smallest room                                                            |
| flower         | stigma (Narbe)                     | tap area | [135, 16, 44, 44] → [135, 3, 44, 44]    | onto its own structure, clear of every other area, a finger wide in the smallest room                                                            |
| plant          | stem (Sprossachse)                 | anchor   | [150, 250] → [110, 250]                 | stood on white, 40 units right of the stem                                                                                                       |
| eye            | retina (Netzhaut)                  | anchor   | [258, 230] → [259, 200]                 | stood on the white sclera, outside the choroid                                                                                                   |
| eye            | optic_nerve (Sehnerv)              | tap area | [48, 278, 44, 44] → [47, 277, 46, 46]   | onto its own structure, clear of every other area, a finger wide in the smallest room                                                            |
| tooth          | jawbone (Kieferknochen)            | anchor   | [75, 300] → [55, 280]                   | stood on a blood vessel in the gap beside the root                                                                                               |
| tooth          | gum (Zahnfleisch)                  | anchor   | [42, 160] → [60, 135]                   | stood on white below the gum                                                                                                                     |
| tooth          | pulp (Zahnmark)                    | anchor   | [150, 230] → [150, 120]                 | stood on the bone between the roots                                                                                                              |
| insect         | head (Kopf)                        | anchor   | [150, 62] → [150, 45]                   | stood on the front of the thorax                                                                                                                 |
| insect         | eye (Facettenauge)                 | anchor   | [134, 60] → [129, 41]                   | stood on the neck, not on an eye                                                                                                                 |
| insect         | antenna (Fühler)                   | anchor   | [125, 30] → [125, 17]                   | stood on white below the antenna                                                                                                                 |
| bicycle        | frame (Rahmen)                     | anchor   | [160, 75] → [155, 50]                   | stood in the empty triangle between the tubes                                                                                                    |
| bicycle        | pedal (Pedal)                      | anchor   | [148, 145] → [162, 134]                 | stood on white below the crank                                                                                                                   |
| microscope     | diaphragm (Blende)                 | badge    | [288, 255] → [288, 234]                 | room for the badge below                                                                                                                         |
| microscope     | coarse_focus (Grobtrieb)           | badge    | [288, 281] → [288, 257]                 | its badge covered the fine-focus knob                                                                                                            |
| microscope     | fine_focus (Feintrieb)             | anchor   | [290, 270] → [288, 283]                 | stood on the edge above the small knob                                                                                                           |
| microscope     | fine_focus (Feintrieb)             | badge    | [288, 307] → [288, 310]                 | clear of the knob                                                                                                                                |
| microscope     | light (Lichtquelle)                | tap area | [128, 283, 44, 44] → [122, 278, 56, 56] | onto its own structure, clear of every other area, a finger wide in the smallest room                                                            |
| microscope     | diaphragm (Blende)                 | tap area | [128, 233, 44, 44] → [122, 222, 56, 56] | onto its own structure, clear of every other area, a finger wide in the smallest room                                                            |
| microscope     | coarse_focus (Grobtrieb)           | tap area | [240, 240, 44, 44] → [214, 243, 56, 56] | onto its own structure, clear of every other area, a finger wide in the smallest room                                                            |
| lab            | burner (Bunsenbrenner)             | anchor   | [218, 185] → [226, 165]                 | stood beside the burner's tube                                                                                                                   |
| lab            | tripod (Dreifuß)                   | anchor   | [252, 160] → [257, 160]                 | stood on white between the legs                                                                                                                  |
| heart          | myocardium (Herzmuskel)            | anchor   | [255, 300] → [268, 270]                 | stood on a papillary muscle inside the chamber                                                                                                   |
| heart          | septum (Herzscheidewand)           | anchor   | [165, 290] → [181, 260]                 | stood on a muscle strand inside the right chamber                                                                                                |
| heart          | vena_cava (Hohlvene)               | anchor   | [30, 40] → [48, 45]                     | stood on transparent ground left of the vessel                                                                                                   |
| heart          | valve (Segelklappe)                | anchor   | [128, 250] → [100, 242]                 | stood in the right chamber below the pulmonary valve, on no cusp                                                                                 |
| heart          | right_atrium (rechter Vorhof)      | tap area | [48, 198, 44, 44] → [45, 195, 50, 50]   | onto its own structure, clear of every other area, a finger wide in the smallest room                                                            |
| heart          | left_atrium (linker Vorhof)        | tap area | [188, 128, 44, 44] → [185, 125, 50, 50] | onto its own structure, clear of every other area, a finger wide in the smallest room                                                            |
| ear            | ossicles (Gehörknöchelchen)        | anchor   | [190, 112] → [165, 108]                 | stood on the background between the ossicles and the canals                                                                                      |
| ear            | eardrum (Trommelfell)              | tap area | [143, 118, 44, 44] → [143, 120, 44, 44] | onto its own structure, clear of every other area, a finger wide in the smallest room                                                            |
| ear            | ossicles (Gehörknöchelchen)        | tap area | [143, 86, 44, 44] → [132, 76, 44, 44]   | onto its own structure, clear of every other area, a finger wide in the smallest room                                                            |
| ear            | canals (Bogengänge)                | tap area | [188, 63, 44, 44] → [188, 59, 44, 44]   | onto its own structure, clear of every other area, a finger wide in the smallest room                                                            |
| ear            | cochlea (Schnecke)                 | tap area | [203, 103, 44, 44] → [205, 105, 44, 44] | onto its own structure, clear of every other area, a finger wide in the smallest room                                                            |
| ear            | nerve (Hörnerv)                    | tap area | [248, 93, 44, 44] → [250, 93, 44, 44]   | onto its own structure, clear of every other area, a finger wide in the smallest room                                                            |
| skeleton       | spine (Wirbelsäule)                | anchor   | [150, 175] → [150, 145]                 | stood inside the pelvis; now on the lumbar vertebrae                                                                                             |
| skeleton       | pelvis (Becken)                    | anchor   | [120, 200] → [127, 172]                 | stood on the hip joint's cartilage                                                                                                               |
| skeleton       | collarbone (Schlüsselbein)         | anchor   | [120, 78] → [120, 72]                   | stood below the bone                                                                                                                             |
| skeleton       | humerus (Oberarmknochen)           | anchor   | [95, 130] → [98, 115]                   | stood on the bone's edge                                                                                                                         |
| skeleton       | radius (Speiche)                   | anchor   | [80, 190] → [86, 190]                   | stood on white beside the forearm                                                                                                                |
| skeleton       | ulna (Elle)                        | anchor   | [92, 198] → [93, 197]                   | stood on the bone's edge                                                                                                                         |
| skeleton       | hand (Handknochen)                 | anchor   | [70, 250] → [80, 225]                   | stood beside a fingertip                                                                                                                         |
| skeleton       | femur (Oberschenkelknochen)        | anchor   | [135, 270] → [128, 255]                 | stood on the bone's edge                                                                                                                         |
| skeleton       | fibula (Wadenbein)                 | anchor   | [120, 345] → [128, 340]                 | stood on white beside the leg                                                                                                                    |
| skeleton       | skull (Schädel)                    | tap area | [128, 0, 44, 44] → [122, 0, 56, 56]     | onto its own structure, clear of every other area, a finger wide in the smallest room                                                            |
| organs         | large_intestine (Dickdarm)         | anchor   | [118, 185] → [123, 180]                 | stood on the organ's very edge                                                                                                                   |
| organs         | bladder (Harnblase)                | anchor   | [150, 225] → [150, 209]                 | stood on skin below the bladder                                                                                                                  |
| organs         | liver (Leber)                      | tap area | [98, 118, 44, 44] → [92, 112, 56, 56]   | onto its own structure, clear of every other area, a finger wide in the smallest room                                                            |
| organs         | brain (Gehirn)                     | tap area | [128, 3, 44, 44] → [122, 0, 56, 56]     | onto its own structure, clear of every other area, a finger wide in the smallest room                                                            |
| flower_section | sepal (Kelchblatt)                 | anchor   | [93, 180] → [92, 160]                   | stood on white beside the green lobe                                                                                                             |
| flower_section | ovary (Fruchtknoten)               | anchor   | [121, 107] → [125, 125]                 | stood on the petal left of the bulb; now on the bulb                                                                                             |
| flower_section | style (Griffel)                    | anchor   | [149, 67] → [151, 62]                   | stood on the petal beside the pistil                                                                                                             |
| flower_section | stigma (Narbe)                     | anchor   | [153, 43] → [157, 38]                   | stood on the petal beside the pistil                                                                                                             |
| flower_section | ovule (Samenanlage)                | anchor   | [136, 120] → [141, 140]                 | stood in the dark chamber, not on an ovule                                                                                                       |
| flower_section | receptacle (Blütenboden)           | tap area | [103, 149, 44, 44] → [103, 163, 44, 44] | onto its own structure, clear of every other area, a finger wide in the smallest room                                                            |
| flower_section | ovary (Fruchtknoten)               | tap area | [103, 103, 44, 44] → [116, 89, 48, 74]  | onto its own structure, clear of every other area, a finger wide in the smallest room                                                            |
| flower_section | style (Griffel)                    | tap area | [129, 40, 44, 44] → [130, 47, 44, 42]   | onto its own structure, clear of every other area, a finger wide in the smallest room                                                            |
| flower_section | stigma (Narbe)                     | tap area | [135, 16, 44, 44] → [135, 3, 44, 44]    | onto its own structure, clear of every other area, a finger wide in the smallest room                                                            |
| eye_front      | sclera (Lederhaut)                 | anchor   | [30, 100] → [40, 61]                    | stood inside the eye, under the choroid band                                                                                                     |
| eye_front      | ciliary (Ziliarmuskel)             | anchor   | [65, 95] → [50, 72]                     | stood on the same fibres as the zonule; now on the ciliary body                                                                                  |
| eye_front      | pupil (Pupille)                    | anchor   | [148, 47] → [135, 54]                   | stood on the iris band; now in the opening between the iris's edges                                                                              |
| insect_head    | antenna (Fühler)                   | anchor   | [60, 90] → [45, 100]                    | stood on the eye beside the antenna                                                                                                              |
| teeth          | gum (Zahnfleisch)                  | anchor   | [151, 104] → [85, 250]                  | stood on the palate                                                                                                                              |
| joint          | cavity (Gelenkspalt)               | anchor   | [225, 180] → [212, 128]                 | stood on cartilage, not in the gap                                                                                                               |
| joint          | cartilage (Gelenkknorpel)          | anchor   | [175, 140] → [170, 112]                 | stood on the bone of the head                                                                                                                    |
| breathing      | nasal_cavity (Nasenhöhle)          | anchor   | [148, 25] → [110, 40]                   | stood on bone above the cavity                                                                                                                   |
| breathing      | mouth (Mundhöhle)                  | anchor   | [148, 60] → [120, 85]                   | stood in the throat                                                                                                                              |
| breathing      | pharynx (Rachen)                   | anchor   | [176, 75] → [155, 74]                   | stood on the spine behind the throat                                                                                                             |
| breathing      | larynx (Kehlkopf)                  | anchor   | [168, 115] → [137, 130]                 | stood on white beside the larynx                                                                                                                 |
| breathing      | trachea (Luftröhre)                | anchor   | [165, 170] → [148, 185]                 | stood on the tip of a lung                                                                                                                       |
| breathing      | bronchi (Bronchien)                | anchor   | [160, 240] → [166, 224]                 | stood on white between the lungs                                                                                                                 |
| breathing      | nasal_cavity (Nasenhöhle)          | tap area | [88, 18, 44, 44] → [72, 6, 84, 56]      | onto its own structure, clear of every other area, a finger wide in the smallest room                                                            |
| breathing      | mouth (Mundhöhle)                  | tap area | [98, 63, 44, 44] → [92, 62, 56, 56]     | onto its own structure, clear of every other area, a finger wide in the smallest room                                                            |
| breathing      | trachea (Luftröhre)                | tap area | [126, 163, 44, 44] → [124, 157, 56, 56] | onto its own structure, clear of every other area, a finger wide in the smallest room                                                            |
| digestion      | liver (Leber)                      | anchor   | [130, 250] → [110, 225]                 | stood on the gallbladder                                                                                                                         |
| digestion      | gallbladder (Gallenblase)          | anchor   | [120, 265] → [118, 246]                 | stood on the duodenum                                                                                                                            |
| digestion      | esophagus (Speiseröhre)            | anchor   | [160, 180] → [150, 180]                 | stood on white beside the tube                                                                                                                   |
| digestion      | pancreas (Bauchspeicheldrüse)      | anchor   | [205, 272] → [175, 262]                 | stood on the large intestine                                                                                                                     |
| digestion      | stomach (Magen)                    | anchor   | [215, 245] → [190, 235]                 | stood on white beside the stomach                                                                                                                |
| digestion      | stomach (Magen)                    | tap area | [168, 213, 44, 44] → [158, 198, 56, 56] | onto its own structure, clear of every other area, a finger wide in the smallest room                                                            |
| digestion      | appendix (Blinddarm)               | tap area | [86, 346, 44, 44] → [78, 335, 56, 56]   | onto its own structure, clear of every other area, a finger wide in the smallest room                                                            |
| digestion      | rectum (Enddarm)                   | tap area | [128, 376, 44, 44] → [134, 364, 56, 56] | onto its own structure, clear of every other area, a finger wide in the smallest room                                                            |
| leaf           | upper_epidermis (obere Epidermis)  | anchor   | [196, 90] → [152, 130]                  | stood on the top surface, like the cuticle                                                                                                       |
| leaf           | palisade (Palisadengewebe)         | anchor   | [150, 140] → [148, 170]                 | stood on the boundary to the epidermis                                                                                                           |
| leaf           | lower_epidermis (untere Epidermis) | anchor   | [200, 280] → [204, 268]                 | stood on white below the leaf                                                                                                                    |
| leaf           | stoma (Spaltöffnung)               | anchor   | [105, 272] → [125, 258]                 | stood on a white patch beside the leaf                                                                                                           |
| neuron         | dendrites (Dendriten)              | anchor   | [70, 160] → [120, 155]                  | stood on white between two dendrites                                                                                                             |
| neuron         | cell_body (Zellkörper)             | anchor   | [118, 165] → [168, 163]                 | stood on white beside the cell                                                                                                                   |
| neuron         | nucleus (Zellkern)                 | anchor   | [148, 118] → [160, 125]                 | stood on the organelle beside the nucleus                                                                                                        |
| neuron         | axon (Axon)                        | anchor   | [150, 310] → [155, 275]                 | stood on the myelin, not on the axon                                                                                                             |
| neuron         | myelin (Myelinscheide)             | anchor   | [150, 250] → [155, 233]                 | stood on the edge of a gap between two segments                                                                                                  |
| neuron         | terminals (Endknöpfchen)           | anchor   | [180, 400] → [169, 405]                 | stood on white between the endings                                                                                                               |
| neuron         | nucleus (Zellkern)                 | tap area | [138, 103, 44, 44] → [132, 97, 56, 56]  | onto its own structure, clear of every other area, a finger wide in the smallest room                                                            |
| mushroom       | gills (Lamellen)                   | anchor   | [110, 84] → [60, 95]                    | stood on the cap's upper side                                                                                                                    |
| mushroom       | ring (Ring)                        | tap area | [128, 143, 44, 44] → [122, 137, 56, 56] | onto its own structure, clear of every other area, a finger wide in the smallest room                                                            |
| seedling       | main_root (Hauptwurzel)            | anchor   | [128, 200] → [80, 200]                  | stood in the soil                                                                                                                                |
| seedling       | lateral_roots (Seitenwurzeln)      | anchor   | [70, 175] → [64, 172]                   | stood in the soil beside the root                                                                                                                |
| seedling       | cotyledon (Keimblatt)              | anchor   | [90, 60] → [80, 68]                     | stood on white above the leaf                                                                                                                    |
| distillation   | boiling_chips (Siedesteinchen)     | anchor   | [62, 345] → [45, 343]                   | stood on the flask's wall                                                                                                                        |
| distillation   | condenser (Liebigkühler)           | anchor   | [150, 250] → [150, 218]                 | stood on white below the condenser                                                                                                               |
| distillation   | water_in (Kühlwasserzulauf)        | anchor   | [228, 225] → [218, 225]                 | stood on white beside the inlet                                                                                                                  |
| distillation   | water_in (Kühlwasserzulauf)        | tap area | [196, 203, 44, 44] → [194, 186, 56, 56] | onto its own structure, clear of every other area, a finger wide in the smallest room                                                            |
| distillation   | water_out (Kühlwasserablauf)       | tap area | [101, 142, 44, 44] → [94, 140, 56, 56]  | onto its own structure, clear of every other area, a finger wide in the smallest room                                                            |
| volcano        | magma_chamber (Magmakammer)        | anchor   | [150, 210] → [120, 185]                 | stood in the blank cut below the magma                                                                                                           |
| volcano        | layers (Asche- und Lavaschichten)  | anchor   | [215, 185] → [145, 140]                 | stood on the bedrock, not on the cone's layers                                                                                                   |
| volcano        | vent (Schlot)                      | anchor   | [150, 150] → [120, 135]                 | stood on the layers beside the vent                                                                                                              |
| volcano        | side_vent (Nebenschlot)            | anchor   | [40, 180] → [65, 178]                   | stood on the block's edge                                                                                                                        |
| volcano        | crater (Krater)                    | anchor   | [150, 70] → [122, 90]                   | stood in the ash beside the lava fountain                                                                                                        |
| volcano        | lava (Lava)                        | anchor   | [192, 119] → [185, 148]                 | stood on white above the slope                                                                                                                   |
| thermometer    | bulb (Vorratsgefäß)                | tap area | [118, 376, 44, 44] → [112, 364, 56, 56] | onto its own structure, clear of every other area, a finger wide in the smallest room                                                            |

The plant cell's cytoplasm stands in the light-blue plasma now (it stood on the membrane, then on
the notch of wall and membrane). The flower's ovary stands on the bulb, style and stigma on the
green pistil (all three stood on the petal beside it).

The plant cell's mitochondrion was checked against the labelled original on Commons
(`Plant_cell_structure-en.svg`, the same drawing with its labels): "Mitochondrion (mitochondria)"
points at the pale-green ovals, the red folded organelle the package's anchor stood on is the
"Golgi body". The anchor was moved to the lower pale-green oval.

Looked at once more for "on the wrong but opaque structure", every anchor of: flower, plant, eye,
insect, bicycle, ear, signs, anlaut, insect_head, joint, distillation, earth, compass,
moon_phases (and all others while the tap areas were decided). Nothing further was moved in
these. Marginal and left: the earth's crust (the image has no band for it; the anchor stands on
the outer rim), the eye's sclera (on the thin white outer layer at the right edge), the ear's
middle ear (in the cavity right beside the eardrum). The eye front's pupil is an opening between
the iris's edges, not a structure: its anchor stands in the opening, and it is named only.

In the row pictures the data joins each number in its cell's corner to the middle of the cell, so a
line crosses the sign or the instrument (as the design's `Schematic` draws it).

## Named only: the parts without a tap area

Decided by looking at each part on its image, in the smallest room. 165 of 240.

| Picture        | Part                               | Why it is not tapped                                                               |
| -------------- | ---------------------------------- | ---------------------------------------------------------------------------------- |
| plant_cell     | cytoplasm (Zellplasma)             | fills the whole cell                                                               |
| plant_cell     | membrane (Zellmembran)             | a line all round the cell                                                          |
| plant_cell     | wall (Zellwand)                    | a band all round the cell                                                          |
| plant_cell     | vacuole (Vakuole)                  | larger than its area                                                               |
| plant_cell     | nucleus (Zellkern)                 | larger than its area                                                               |
| plant_cell     | mitochondrion (Mitochondrium)      | drawn more than once                                                               |
| animal_cell    | cytoplasm (Zellplasma)             | fills the whole cell                                                               |
| animal_cell    | membrane (Zellmembran)             | a band all round the cell                                                          |
| animal_cell    | nucleus (Zellkern)                 | larger than its area; the nucleolus lies inside it                                 |
| animal_cell    | nucleolus (Kernkörperchen)         | inside the nucleus, 23 pt from its anchor                                          |
| animal_cell    | mitochondrion (Mitochondrium)      | drawn more than once                                                               |
| flower         | stalk (Blütenstiel)                | continues below its area                                                           |
| flower         | sepal (Kelchblatt)                 | drawn more than once                                                               |
| flower         | petal (Kronblatt)                  | drawn more than once, each larger than the area                                    |
| flower         | stamen (Staubblatt)                | drawn more than once                                                               |
| plant          | stem (Sprossachse)                 | runs the picture's whole height                                                    |
| plant          | leaf (Blatt)                       | drawn more than once                                                               |
| plant          | blossom (Blüte)                    | drawn more than once                                                               |
| eye            | vitreous (Glaskörper)              | fills the eye                                                                      |
| eye            | retina (Netzhaut)                  | a layer all round the eye                                                          |
| eye            | sclera (Lederhaut)                 | a layer all round the eye                                                          |
| eye            | cornea (Hornhaut)                  | larger than its area; 13 pt from the pupil's anchor                                |
| eye            | lens (Linse)                       | larger than its area                                                               |
| eye            | iris (Regenbogenhaut)              | drawn on both sides                                                                |
| eye            | pupil (Pupille)                    | 13 pt from the cornea's anchor                                                     |
| tooth          | jawbone (Kieferknochen)            | on both sides, larger than the area                                                |
| tooth          | gum (Zahnfleisch)                  | on both sides                                                                      |
| tooth          | dentin (Zahnbein)                  | larger than its area                                                               |
| tooth          | enamel (Zahnschmelz)               | larger than its area                                                               |
| tooth          | pulp (Zahnmark)                    | continues into both roots                                                          |
| insect         | leg (Bein)                         | drawn six times                                                                    |
| insect         | wing (Flügel)                      | drawn twice, larger than the area                                                  |
| insect         | abdomen (Hinterleib)               | larger than its area                                                               |
| insect         | head (Kopf)                        | 23 pt from the eye's anchor                                                        |
| insect         | eye (Facettenauge)                 | drawn twice                                                                        |
| insect         | antenna (Fühler)                   | drawn twice                                                                        |
| bicycle        | rear_wheel (Hinterrad)             | larger than its area                                                               |
| bicycle        | front_wheel (Vorderrad)            | larger than its area                                                               |
| bicycle        | chain (Kette)                      | runs round both sprockets                                                          |
| bicycle        | frame (Rahmen)                     | several tubes                                                                      |
| bicycle        | pedal (Pedal)                      | both pedals are visible                                                            |
| bicycle        | brake (Bremse)                     | front and rear brake are visible                                                   |
| microscope     | arm (Stativ)                       | larger than its area                                                               |
| microscope     | foot (Fuß)                         | larger than its area                                                               |
| microscope     | stage (Objekttisch)                | wider than its area                                                                |
| microscope     | tube (Tubus)                       | larger than its area                                                               |
| microscope     | revolver (Objektivrevolver)        | 20 pt from the objective's anchor                                                  |
| microscope     | objective (Objektiv)               | drawn more than once; 20 pt from the revolver's anchor                             |
| microscope     | eyepiece (Okular)                  | drawn twice                                                                        |
| microscope     | fine_focus (Feintrieb)             | sits in front of the coarse-focus knob                                             |
| lab            | test_tube (Reagenzglas)            | taller than its area                                                               |
| lab            | beaker (Becherglas)                | larger than its area                                                               |
| lab            | erlenmeyer (Erlenmeyerkolben)      | larger than its area                                                               |
| lab            | round_flask (Rundkolben)           | larger than its area                                                               |
| lab            | cylinder (Messzylinder)            | taller than its area                                                               |
| lab            | funnel (Trichter)                  | larger than its area                                                               |
| lab            | burner (Bunsenbrenner)             | stands inside the tripod; taller than its area                                     |
| lab            | tripod (Dreifuß)                   | larger than its area; the burner stands inside it                                  |
| heart          | myocardium (Herzmuskel)            | the wall all round the heart                                                       |
| heart          | septum (Herzscheidewand)           | a band longer than its area                                                        |
| heart          | vena_cava (Hohlvene)               | upper and lower vena cava are drawn                                                |
| heart          | pulmonary_vein (Lungenvene)        | drawn on both sides                                                                |
| heart          | aorta (Aorta)                      | continues below the heart                                                          |
| heart          | pulmonary_artery (Lungenarterie)   | branches to both sides                                                             |
| heart          | right_ventricle (rechte Kammer)    | larger than its area                                                               |
| heart          | left_ventricle (linke Kammer)      | larger than its area                                                               |
| heart          | valve (Segelklappe)                | several valves are drawn                                                           |
| ear            | middle_ear (Paukenhöhle)           | an irregular cavity around the ossicles                                            |
| ear            | pinna (Ohrmuschel)                 | larger than its area                                                               |
| ear            | canal (Gehörgang)                  | longer than its area                                                               |
| skeleton       | spine (Wirbelsäule)                | runs from the skull to the pelvis                                                  |
| skeleton       | pelvis (Becken)                    | larger than its area                                                               |
| skeleton       | ribcage (Brustkorb)                | larger than its area                                                               |
| skeleton       | sternum (Brustbein)                | inside the ribcage, 21 pt from its anchor                                          |
| skeleton       | collarbone (Schlüsselbein)         | drawn twice                                                                        |
| skeleton       | humerus (Oberarmknochen)           | drawn twice                                                                        |
| skeleton       | radius (Speiche)                   | drawn twice; 8 pt from the ulna's anchor                                           |
| skeleton       | ulna (Elle)                        | drawn twice; 8 pt from the radius's anchor                                         |
| skeleton       | hand (Handknochen)                 | drawn twice                                                                        |
| skeleton       | femur (Oberschenkelknochen)        | drawn twice                                                                        |
| skeleton       | kneecap (Kniescheibe)              | drawn twice                                                                        |
| skeleton       | tibia (Schienbein)                 | drawn twice; 7 pt from the fibula's anchor                                         |
| skeleton       | fibula (Wadenbein)                 | drawn twice; 7 pt from the tibia's anchor                                          |
| skeleton       | foot (Fußknochen)                  | drawn twice                                                                        |
| organs         | large_intestine (Dickdarm)         | runs round the small intestine                                                     |
| organs         | small_intestine (Dünndarm)         | 15 pt from the large intestine's anchor                                            |
| organs         | bladder (Harnblase)                | 17 pt from the small intestine's anchor                                            |
| organs         | stomach (Magen)                    | 20 pt from the heart's anchor                                                      |
| organs         | lungs (Lunge)                      | drawn twice                                                                        |
| organs         | trachea (Luftröhre)                | a finger-wide area on it would take in the tops of both lungs                      |
| organs         | heart (Herz)                       | mostly hidden between the lungs; 20 pt from the stomach's anchor                   |
| flower_section | stalk (Blütenstiel)                | continues below its area                                                           |
| flower_section | sepal (Kelchblatt)                 | drawn more than once                                                               |
| flower_section | petal (Kronblatt)                  | drawn more than once, each larger than the area                                    |
| flower_section | stamen (Staubblatt)                | drawn more than once                                                               |
| flower_section | ovule (Samenanlage)                | lies inside the ovary                                                              |
| eye_front      | vitreous (Glaskörper)              | larger than its area                                                               |
| eye_front      | sclera (Lederhaut)                 | 16 pt from the ciliary muscle's anchor                                             |
| eye_front      | cornea (Hornhaut)                  | larger than its area                                                               |
| eye_front      | ciliary (Ziliarmuskel)             | drawn on both sides                                                                |
| eye_front      | zonule (Linsenbänder)              | drawn on both sides                                                                |
| eye_front      | lens (Linse)                       | larger than its area                                                               |
| eye_front      | iris (Regenbogenhaut)              | drawn on both sides                                                                |
| eye_front      | pupil (Pupille)                    | an opening between the iris's edges, no structure of its own                       |
| insect_head    | head (Kopf)                        | the whole picture                                                                  |
| insect_head    | eye (Facettenauge)                 | drawn twice                                                                        |
| insect_head    | antenna (Fühler)                   | drawn twice                                                                        |
| insect_head    | mandible (Oberkiefer)              | drawn twice                                                                        |
| teeth          | gum (Zahnfleisch)                  | in both jaws, larger than the area                                                 |
| teeth          | incisor (Schneidezahn)             | eight are drawn, in both jaws                                                      |
| teeth          | canine (Eckzahn)                   | four are drawn, in both jaws                                                       |
| teeth          | premolar (Vormahlzahn)             | eight are drawn, in both jaws                                                      |
| teeth          | molar (Mahlzahn)                   | twelve are drawn, in both jaws                                                     |
| joint          | cavity (Gelenkspalt)               | a gap all round the head                                                           |
| joint          | bone (Knochen)                     | several bones are drawn                                                            |
| joint          | socket (Gelenkpfanne)              | 24 pt from the gap's anchor; larger than its area                                  |
| joint          | joint_head (Gelenkkopf)            | larger than its area                                                               |
| joint          | cartilage (Gelenkknorpel)          | a layer on head and socket                                                         |
| joint          | capsule (Gelenkkapsel)             | drawn on both sides                                                                |
| breathing      | pharynx (Rachen)                   | longer than its area                                                               |
| breathing      | larynx (Kehlkopf)                  | a finger-wide area on it would take in the top of the trachea                      |
| breathing      | lungs (Lunge)                      | drawn twice                                                                        |
| breathing      | bronchi (Bronchien)                | drawn twice                                                                        |
| breathing      | diaphragm (Zwerchfell)             | wider than its area                                                                |
| digestion      | liver (Leber)                      | 18 pt from the gallbladder's anchor; larger than its area                          |
| digestion      | gallbladder (Gallenblase)          | 18 pt from the liver's anchor                                                      |
| digestion      | esophagus (Speiseröhre)            | longer than its area                                                               |
| digestion      | pancreas (Bauchspeicheldrüse)      | lies against the stomach: two finger-wide areas cannot both sit on their own organ |
| digestion      | small_intestine (Dünndarm)         | larger than its area                                                               |
| digestion      | large_intestine (Dickdarm)         | runs round the small intestine                                                     |
| leaf           | cuticle (Kutikula)                 | the whole upper surface                                                            |
| leaf           | upper_epidermis (obere Epidermis)  | a layer across the picture                                                         |
| leaf           | palisade (Palisadengewebe)         | many cells are drawn                                                               |
| leaf           | spongy (Schwammgewebe)             | many cells are drawn                                                               |
| leaf           | lower_epidermis (untere Epidermis) | a layer across the picture                                                         |
| neuron         | dendrites (Dendriten)              | many are drawn                                                                     |
| neuron         | cell_body (Zellkörper)             | the nucleus lies inside it                                                         |
| neuron         | axon (Axon)                        | runs through every myelin segment                                                  |
| neuron         | myelin (Myelinscheide)             | every segment is one                                                               |
| neuron         | terminals (Endknöpfchen)           | several are drawn                                                                  |
| mushroom       | mycelium (Myzel)                   | wider than its area                                                                |
| mushroom       | stem (Stiel)                       | longer than its area                                                               |
| mushroom       | gills (Lamellen)                   | a band under the whole cap                                                         |
| mushroom       | cap (Hut)                          | larger than its area                                                               |
| seedling       | main_root (Hauptwurzel)            | longer than its area                                                               |
| seedling       | lateral_roots (Seitenwurzeln)      | many are drawn                                                                     |
| seedling       | stem (Sprossachse)                 | longer than its area                                                               |
| seedling       | cotyledon (Keimblatt)              | drawn twice                                                                        |
| seedling       | leaf (Blatt)                       | drawn twice                                                                        |
| distillation   | receiver (Vorlage)                 | 18 pt from the distillate's anchor                                                 |
| distillation   | distillate (Destillat)             | 18 pt from the receiver's anchor                                                   |
| distillation   | round_flask (Rundkolben)           | 17 pt from the boiling chips' anchor                                               |
| distillation   | boiling_chips (Siedesteinchen)     | inside the flask, 17 pt from its anchor                                            |
| distillation   | thermometer (Thermometer)          | longer than its area                                                               |
| distillation   | condenser (Liebigkühler)           | longer than its area                                                               |
| earth          | crust (Erdkruste)                  | a thin rim all round                                                               |
| earth          | mantle (Erdmantel)                 | a ring larger than its area                                                        |
| earth          | outer_core (äußerer Kern)          | a ring larger than its area                                                        |
| volcano        | layers (Asche- und Lavaschichten)  | on both sides of the vent                                                          |
| volcano        | vent (Schlot)                      | longer than its area                                                               |
| volcano        | lava (Lava)                        | several flows are drawn                                                            |
| volcano        | ash_cloud (Aschewolke)             | larger than its area                                                               |
| thermometer    | scale (Skala)                      | runs the tube's whole length                                                       |
| thermometer    | capillary (Steigröhrchen)          | longer than its area                                                               |
| thermometer    | liquid (Thermometerflüssigkeit)    | longer than its area                                                               |

## What can be tapped, and how close the anchors stand

The smallest distance between two anchors with tap areas, in pt on a 360 × 740 phone. 75 of 240.
No two of their areas overlap.

| Picture        | Tappable | Parts                                                                                   | Smallest spacing |
| -------------- | -------- | --------------------------------------------------------------------------------------- | ---------------- |
| plant_cell     | 1 of 7   | Chloroplast                                                                             | –                |
| animal_cell    | 0 of 5   | –                                                                                       | –                |
| flower         | 4 of 8   | Blütenboden, Fruchtknoten, Griffel, Narbe                                               | 26 pt            |
| plant          | 0 of 3   | –                                                                                       | –                |
| eye            | 1 of 8   | Sehnerv                                                                                 | –                |
| tooth          | 0 of 5   | –                                                                                       | –                |
| insect         | 1 of 7   | Brust                                                                                   | –                |
| bicycle        | 2 of 8   | Sattel, Lenker                                                                          | 144 pt           |
| microscope     | 3 of 11  | Lichtquelle, Blende, Grobtrieb                                                          | 40 pt            |
| lab            | 0 of 8   | –                                                                                       | –                |
| heart          | 2 of 11  | rechter Vorhof, linker Vorhof                                                           | 140 pt           |
| ear            | 6 of 9   | Ohrtrompete, Trommelfell, Gehörknöchelchen, Bogengänge, Schnecke, Hörnerv               | 34 pt            |
| skeleton       | 1 of 15  | Schädel                                                                                 | –                |
| organs         | 2 of 9   | Leber, Gehirn                                                                           | 93 pt            |
| signs          | 6 of 6   | Stoppschild, Vorfahrt gewähren, Vorfahrtstraße, Fußgängerüberweg, Radweg, Einbahnstraße | 106 pt           |
| instruments    | 6 of 6   | Gitarre, Blockflöte, Trommel, Trompete, Triangel, Xylofon                               | 106 pt           |
| anlaut         | 8 of 8   | Apfel, Ball, Haus, Sonne, Mond, Fisch, Eis, Uhr                                         | 80 pt            |
| flower_section | 4 of 9   | Blütenboden, Fruchtknoten, Griffel, Narbe                                               | 26 pt            |
| eye_front      | 0 of 8   | –                                                                                       | –                |
| insect_head    | 0 of 4   | –                                                                                       | –                |
| teeth          | 0 of 5   | –                                                                                       | –                |
| joint          | 0 of 6   | –                                                                                       | –                |
| breathing      | 3 of 8   | Nasenhöhle, Mundhöhle, Luftröhre                                                        | 36 pt            |
| digestion      | 3 of 9   | Magen, Blinddarm, Enddarm                                                               | 43 pt            |
| leaf           | 1 of 6   | Spaltöffnung                                                                            | –                |
| neuron         | 1 of 6   | Zellkern                                                                                | –                |
| mushroom       | 1 of 5   | Ring                                                                                    | –                |
| seedling       | 0 of 5   | –                                                                                       | –                |
| distillation   | 2 of 8   | Kühlwasserzulauf, Kühlwasserablauf                                                      | 91 pt            |
| earth          | 1 of 4   | innerer Kern                                                                            | –                |
| volcano        | 3 of 7   | Magmakammer, Nebenschlot, Krater                                                        | 59 pt            |
| compass        | 8 of 8   | Nordosten, Südosten, Südwesten, Nordwesten, Norden, Osten, Süden, Westen                | 93 pt            |
| thermometer    | 1 of 4   | Vorratsgefäß                                                                            | –                |
| moon_phases    | 4 of 4   | Neumond, zunehmender Halbmond, Vollmond, abnehmender Halbmond                           | 160 pt           |

## Titles made true

The rebuild made two titles false; they follow their image now (five languages each).

| Picture        | Old                                                                                                                                     | New                                                                                                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| teeth          | Gebiss (Unterkiefer) · teeth (lower jaw) · dents (mâchoire inférieure) · dientes (mandíbula) · denti (mandibola)                        | Gebiss (Ober- und Unterkiefer) · teeth (upper and lower jaw) · dents (mâchoires supérieure et inférieure) · dientes (maxilar y mandíbula) · denti (arcata superiore e inferiore) |
| flower_section | Blüte im Längsschnitt (groß) · flower in section (large) · fleur en coupe (grande) · flor en corte (grande) · fiore in sezione (grande) | Blüte im Längsschnitt (mit Samenanlage) · flower in section (with ovule) · fleur en coupe (avec ovule) · flor en corte (con óvulo) · fiore in sezione (con ovulo)                |

Checked and left, because they are true of the image: flower "Blüte (Längsschnitt)", eye
"Auge (Querschnitt)", eye_front "Auge (vorderer Teil)", insect_head "Insektenkopf", bicycle
"Fahrrad", lab "Laborgeräte", leaf "Blattquerschnitt" (a block of the leaf in section), tooth, ear,
volcano "(Schnitt)", distillation, earth, compass "Himmelsrichtungen", thermometer, moon phases
and the rest. Not verifiable from the image: seedling "Keimling (Bohne)" — it shows a seedling,
not which plant.

## Images to fix — for the owner, most urgent first

Nothing was retouched. Every PNG is RGBA with a transparent ground and a longest side of 900 px
(single elements 600 px) unless noted.

1. `animal_cell.png` — about 13 thin grey leader lines of the original are baked in, beside ours.
2. `heart.png` — about 6 dotted leader lines remain (TEILE.md names this).
3. `teeth.png` — shows both jaws; every kind of tooth is there eight to twelve times, so none can
   be tapped. One jaw would do.
4. `mushroom.png` — a baked leader line with an arrowhead on the cap, and an opaque white rectangle
   that clips the cap's rim on the right.
5. `lab.png` — baked "150 m" / "300 m" and scale numbers; the round flask is cut off at the right
   and bottom; two black line stubs left of the tripod.
6. `leaf.png` — bracket strokes along the left edge (under number 4); a rectangular patch cut out
   beside the stoma.
7. `seedling.png` — the soil is an opaque block to the image's edges; the leaves are cut off at the
   top; the ground line stops short on the right.
8. `organs.png` — the motif fills only the upper middle; cropped to the torso, more parts could be
   tapped (two of nine can today).
9. `thermometer.png` — two grey line stubs right of the tube.
10. `eye_front.png` — a crop of `eye.png`, opaque at its lower edge.

Also seen, no defect of the file: `distillation.png` has its water arrows in the image (used as
the outlet's and inlet's anchors); `bicycle.png` is a mountain bike without lights, bell or rack;
`instruments.png` shows a conga for "Trommel"; `parts/signs-crossing.png`, `-one_way.png`,
`-stop.png` are opaque to their edges by their shape, `parts/instruments-triangle.png` along its
lower edge.

## For the final walkthrough

Nothing of this was looked at in the running app.

- Numbers that lie on the motif: microscope 1, 5, 10, 11; volcano 4; leaf 4; seedling 1, 2;
  animal cell 2.
- Row pictures: each leader line crosses its sign or instrument.
- Skeleton: the dots of radius / ulna and of tibia / fibula stand about 5 pt apart.
- The ring on a tapped part and the numbers on tall pictures drawn small (frame height 420).
- Tall pictures against the fit rule at 360 × 740.
- A tap beside every area: the ring goes, the line says "Tippe auf das Teil in der Abbildung." —
  a miss gives no feedback beyond that line.
- Pictures with a single part to tap (plant cell, eye, insect, skeleton, leaf, neuron, mushroom,
  earth, thermometer).
- The ring and the asked number in `figureAccent` on the dark looks.
- expo-image while the picture loads; the white card in the dark looks; the zoom viewer.
- The Lizenzen page with 77 rows and its links; a screen reader on a picture.

## Open (from TEILE.md "Offen", and what this change adds)

- **Circuit:** no image. Take it out of the library, or commission a photo or illustration.
- **Bicycle:** the free image has none of the road-safety parts; the picture no longer serves
  "verkehrssicheres Fahrrad".
- **Servier files** are still the Wikimedia versions (CC BY-SA 3.0, the animal cell CC BY 3.0);
  the originals from smart.servier.com (CC BY 4.0) could replace them under the same file names —
  the anchors then need looking at again.
- **Heart:** the leader-line remnants need a hand in an image editor.
- **Stored questions:** whether any database holds rows that name a removed part was not looked at
  (no hosted database was queried). A later clean-up would: select items whose `figure` is a
  schematic and for which `stalePicture` holds (a numbered or keyed part that is no part any more,
  or a tap on a part without a tap area), and archive them (`archived_at`) rather than
  delete them — their attempts and FSRS states hang on them; open `session_items` of such rows in
  active sessions could be closed as skipped. Until then they cost nothing but a row.
- **Tap spacing** (decision 5): 24 pt, or back to 44 pt; and whether tap areas should be drawn
  as large as their structures, which would bring tap questions back for many of the 160 parts.

## Consequences

- The start bundle does not grow: images are assets (8.7 MB in the app, 33 files; the 24 single
  elements are in the repository for the licences and a later use, no code loads them), and the
  asset list and the anchors load with the first picture.
- `packages/shared-math` loses the drawings (about 2 000 lines) and keeps the circuit's.
- The lens, the pupil, the stigma and the stamen "drawn large" (#462) are no special case any
  more: `eye_front` is a crop of the eye's image, `flower_section` the flower's image.
