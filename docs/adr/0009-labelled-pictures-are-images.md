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
5. **What a tap may ask for:** a part of an image whose anchor stands at least 24 pt from the next
   one in the smallest room (360 × 740). The tap areas of the data are 44 × 44 and may overlap,
   the nearer anchor wins; so the spacing of the anchors is what a finger can tell apart. 24 pt is
   the spacing of WCAG 2.2 (2.5.8) and the rule the maps already use ("its countries are as small
   as they are"); the 44 pt rule of #252 rested on "we draw the pictures, so we draw them big
   enough", which no longer holds. Kept at 44 pt it would leave 102 of 240 parts untappable (all
   nine organs, five of six parts of the nerve cell); at 24 pt it is 37. Her tap is marked before
   she checks it, and she can tap again. This number is one constant (`TAP_TARGET.image`) and the
   owner's to change.
6. **Stored questions are not rewritten.** A row that names a removed part is never chosen for a
   set and is shown without its picture where an older session still holds it. Nothing is
   renumbered.
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
looked at. 63 anchors stood beside the structure they name — on white, on a neighbouring part — and
were moved onto it; their 44 × 44 tap areas moved with them. Three numbers of the microscope were
moved so that none covers the fine-focus knob, and three of the flower's so that `flower` and
`flower_section`, which show one image, share one set of numbers. Coordinates in the frame 300
wide.

| Picture        | Part                               | What   | Old → new               | Why                                                              |
| -------------- | ---------------------------------- | ------ | ----------------------- | ---------------------------------------------------------------- |
| flower         | stalk (Blütenstiel)                | badge  | [12, 223] → [12, 233]   | as in flower_section: both show one image                        |
| flower         | sepal (Kelchblatt)                 | anchor | [93, 180] → [92, 160]   | stood on white beside the green lobe                             |
| flower         | sepal (Kelchblatt)                 | badge  | [12, 197] → [12, 207]   | as in flower_section: both show one image                        |
| flower         | receptacle (Blütenboden)           | badge  | [12, 171] → [12, 181]   | as in flower_section: both show one image                        |
| plant          | stem (Sprossachse)                 | anchor | [150, 250] → [110, 250] | stood on white, 40 units right of the stem                       |
| eye            | retina (Netzhaut)                  | anchor | [258, 230] → [259, 200] | stood on the white sclera, outside the choroid                   |
| tooth          | jawbone (Kieferknochen)            | anchor | [75, 300] → [55, 280]   | stood on a blood vessel in the gap beside the root               |
| tooth          | gum (Zahnfleisch)                  | anchor | [42, 160] → [60, 135]   | stood on white below the gum                                     |
| tooth          | pulp (Zahnmark)                    | anchor | [150, 230] → [150, 120] | stood on the bone between the roots                              |
| insect         | head (Kopf)                        | anchor | [150, 62] → [150, 45]   | stood on the front of the thorax                                 |
| insect         | eye (Facettenauge)                 | anchor | [134, 60] → [129, 41]   | stood on the neck, not on an eye                                 |
| insect         | antenna (Fühler)                   | anchor | [125, 30] → [125, 17]   | stood on white below the antenna                                 |
| bicycle        | frame (Rahmen)                     | anchor | [160, 75] → [155, 50]   | stood in the empty triangle between the tubes                    |
| bicycle        | pedal (Pedal)                      | anchor | [148, 145] → [162, 134] | stood on white below the crank                                   |
| microscope     | diaphragm (Blende)                 | badge  | [288, 255] → [288, 234] | room for the badge below                                         |
| microscope     | coarse_focus (Grobtrieb)           | badge  | [288, 281] → [288, 257] | its badge covered the fine-focus knob                            |
| microscope     | fine_focus (Feintrieb)             | anchor | [290, 270] → [288, 283] | stood on the edge above the small knob                           |
| microscope     | fine_focus (Feintrieb)             | badge  | [288, 307] → [288, 310] | clear of the knob                                                |
| lab            | tripod (Dreifuß)                   | anchor | [252, 160] → [257, 160] | stood on white between the legs                                  |
| heart          | myocardium (Herzmuskel)            | anchor | [255, 300] → [268, 270] | stood on a papillary muscle inside the chamber                   |
| heart          | septum (Herzscheidewand)           | anchor | [165, 290] → [181, 260] | stood on a muscle strand inside the right chamber                |
| heart          | valve (Segelklappe)                | anchor | [128, 250] → [100, 242] | stood in the right chamber below the pulmonary valve, on no cusp |
| ear            | ossicles (Gehörknöchelchen)        | anchor | [190, 112] → [165, 108] | stood on the background between the ossicles and the canals      |
| skeleton       | pelvis (Becken)                    | anchor | [120, 200] → [127, 172] | stood on the hip joint's cartilage                               |
| skeleton       | collarbone (Schlüsselbein)         | anchor | [120, 78] → [120, 72]   | stood below the bone                                             |
| skeleton       | radius (Speiche)                   | anchor | [80, 190] → [86, 190]   | stood on white beside the forearm                                |
| skeleton       | fibula (Wadenbein)                 | anchor | [120, 345] → [128, 340] | stood on white beside the leg                                    |
| organs         | large_intestine (Dickdarm)         | anchor | [118, 185] → [123, 180] | stood on the organ's very edge                                   |
| organs         | bladder (Harnblase)                | anchor | [150, 225] → [150, 209] | stood on skin below the bladder                                  |
| flower_section | sepal (Kelchblatt)                 | anchor | [93, 180] → [92, 160]   | stood on white beside the green lobe                             |
| flower_section | ovule (Samenanlage)                | anchor | [136, 120] → [141, 140] | stood in the dark chamber, not on an ovule                       |
| eye_front      | sclera (Lederhaut)                 | anchor | [30, 100] → [40, 61]    | stood inside the eye, under the choroid band                     |
| eye_front      | ciliary (Ziliarmuskel)             | anchor | [65, 95] → [50, 72]     | stood on the same fibres as the zonule; now on the ciliary body  |
| insect_head    | antenna (Fühler)                   | anchor | [60, 90] → [45, 100]    | stood on the eye beside the antenna                              |
| teeth          | gum (Zahnfleisch)                  | anchor | [151, 104] → [85, 250]  | stood on the palate                                              |
| joint          | cavity (Gelenkspalt)               | anchor | [225, 180] → [212, 128] | stood on cartilage, not in the gap                               |
| joint          | cartilage (Gelenkknorpel)          | anchor | [175, 140] → [170, 112] | stood on the bone of the head                                    |
| breathing      | nasal_cavity (Nasenhöhle)          | anchor | [148, 25] → [110, 40]   | stood on bone above the cavity                                   |
| breathing      | mouth (Mundhöhle)                  | anchor | [148, 60] → [120, 85]   | stood in the throat                                              |
| breathing      | pharynx (Rachen)                   | anchor | [176, 75] → [155, 74]   | stood on the spine behind the throat                             |
| breathing      | larynx (Kehlkopf)                  | anchor | [168, 115] → [137, 130] | stood on white beside the larynx                                 |
| breathing      | trachea (Luftröhre)                | anchor | [165, 170] → [148, 185] | stood on the tip of a lung                                       |
| breathing      | bronchi (Bronchien)                | anchor | [160, 240] → [166, 224] | stood on white between the lungs                                 |
| digestion      | liver (Leber)                      | anchor | [130, 250] → [110, 225] | stood on the gallbladder                                         |
| digestion      | gallbladder (Gallenblase)          | anchor | [120, 265] → [118, 246] | stood on the duodenum                                            |
| digestion      | esophagus (Speiseröhre)            | anchor | [160, 180] → [150, 180] | stood on white beside the tube                                   |
| digestion      | pancreas (Bauchspeicheldrüse)      | anchor | [205, 272] → [175, 262] | stood on the large intestine                                     |
| digestion      | stomach (Magen)                    | anchor | [215, 245] → [190, 235] | stood on white beside the stomach                                |
| leaf           | upper_epidermis (obere Epidermis)  | anchor | [196, 90] → [152, 130]  | stood on the top surface, like the cuticle                       |
| leaf           | palisade (Palisadengewebe)         | anchor | [150, 140] → [148, 170] | stood on the boundary to the epidermis                           |
| leaf           | lower_epidermis (untere Epidermis) | anchor | [200, 280] → [204, 268] | stood on white below the leaf                                    |
| leaf           | stoma (Spaltöffnung)               | anchor | [105, 272] → [125, 258] | stood on a white patch beside the leaf                           |
| neuron         | dendrites (Dendriten)              | anchor | [70, 160] → [120, 155]  | stood on white between two dendrites                             |
| neuron         | cell_body (Zellkörper)             | anchor | [118, 165] → [168, 163] | stood on white beside the cell                                   |
| neuron         | nucleus (Zellkern)                 | anchor | [148, 118] → [160, 125] | stood on the organelle beside the nucleus                        |
| neuron         | axon (Axon)                        | anchor | [150, 310] → [155, 275] | stood on the myelin, not on the axon                             |
| neuron         | myelin (Myelinscheide)             | anchor | [150, 250] → [155, 233] | stood on the edge of a gap between two segments                  |
| neuron         | terminals (Endknöpfchen)           | anchor | [180, 400] → [169, 405] | stood on white between the endings                               |
| mushroom       | gills (Lamellen)                   | anchor | [110, 84] → [60, 95]    | stood on the cap's upper side                                    |
| seedling       | main_root (Hauptwurzel)            | anchor | [128, 200] → [80, 200]  | stood in the soil                                                |
| seedling       | lateral_roots (Seitenwurzeln)      | anchor | [70, 175] → [64, 172]   | stood in the soil beside the root                                |
| distillation   | boiling_chips (Siedesteinchen)     | anchor | [62, 345] → [45, 343]   | stood on the flask's wall                                        |
| distillation   | condenser (Liebigkühler)           | anchor | [150, 250] → [150, 218] | stood on white below the condenser                               |
| distillation   | water_in (Kühlwasserzulauf)        | anchor | [228, 225] → [218, 225] | stood on white beside the inlet                                  |
| volcano        | layers (Asche- und Lavaschichten)  | anchor | [215, 185] → [145, 140] | stood on the bedrock, not on the cone's layers                   |
| volcano        | vent (Schlot)                      | anchor | [150, 150] → [120, 135] | stood on the layers beside the vent                              |
| volcano        | side_vent (Nebenschlot)            | anchor | [40, 180] → [65, 178]   | stood on the block's edge                                        |
| volcano        | crater (Krater)                    | anchor | [150, 70] → [122, 90]   | stood in the ash beside the lava fountain                        |
| volcano        | lava (Lava)                        | anchor | [192, 119] → [185, 148] | stood on white above the slope                                   |

Not changed although uncertain: the plant cell's mitochondrion (the anchor stands on the red,
folded organelle; whether the original names that one or the pale-green ovals was not checked
against the labelled source). Not changed and worth an eye in the walkthrough: in the row pictures
the data joins each number in its cell's corner to the middle of the cell, so a line crosses the
sign or the instrument (as the design's `Schematic` draws it).

## Defects of the images (reported, not retouched)

Every PNG is RGBA with a transparent ground and a longest side of 900 px (single elements 600 px),
except where noted:

- `heart.png`: at least six dotted leader lines of the original are still in the image (TEILE.md
  names this).
- `leaf.png`: green bracket strokes along the left edge; a rectangular patch cut out at the bottom
  left beside the stoma.
- `mushroom.png`: a leader line with an arrowhead and an opaque white rectangle on the right of the
  cap; a hard horizontal edge in the bulb.
- `animal_cell.png`: about thirteen thin grey leader lines of the original are in the image.
- `lab.png`: scale numbers and cut-off unit texts ("150 m", "300 m") in the beaker and the flask;
  the round flask is cut off at the right and bottom; two black line stubs left of the tripod; the
  burner stands under the tripod in one image, so their two anchors lie close together.
- `thermometer.png`: two grey line stubs right of the tube.
- `distillation.png`: the water arrows are part of the image (used as the outlet's anchor).
- `seedling.png`: not transparent below the ground line — the soil is an opaque block to the
  image's edges; the leaves are cut off at the top; the ground line stops short on the right.
- `eye_front.png`: a crop of `eye.png`, opaque to its lower edge (the eye goes on).
- `organs.png`: the organs fill the upper middle of the image; arms and legs take most of it, so
  the parts stand close together (five of nine cannot be tapped).
- `teeth.png` shows both jaws (the picture's title says lower jaw); `bicycle.png` is a mountain
  bike without lights, bell or rack; `instruments.png` shows a conga for "Trommel".
- `parts/signs-crossing.png`, `parts/signs-one_way.png`, `parts/signs-stop.png`: opaque to their
  edges by their shape (rectangular signs), no defect; `parts/instruments-triangle.png` is opaque
  along its lower edge.

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
  or a tap on a part too close to its neighbour), and archive them (`archived_at`) rather than
  delete them — their attempts and FSRS states hang on them; open `session_items` of such rows in
  active sessions could be closed as skipped. Until then they cost nothing but a row.
- **Tap spacing** (decision 5): 24 pt, or back to 44 pt.

## Consequences

- The start bundle does not grow: images are assets (8.7 MB in the app, 33 files; the 24 single
  elements are in the repository for the licences and a later use, no code loads them), and the
  asset list and the anchors load with the first picture.
- `packages/shared-math` loses the drawings (about 2 000 lines) and keeps the circuit's.
- The lens, the pupil, the stigma and the stamen "drawn large" (#462) are no special case any
  more: `eye_front` is a crop of the eye's image, `flower_section` the flower's image.
