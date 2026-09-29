// Domain "material": everything a child says around photographing, sending, finding,
// naming and getting rid of a sheet (issue #106). Written the way a 10- to 16-year-old
// types — lowercase, in a hurry, typos left in.
//
// Children do not photograph the way a spec imagines. They shoot crooked, in the dark,
// with a thumb in the frame, the wrong page, two pages at once, a friend's book, a photo
// of a screen. They write "hier" and send an image with no words. They send a selfie by
// accident and want it gone. They ask where yesterday's worksheet went. The cases below
// are those moments, not their tidied-up versions.
//
// The static check (findings-material.md) answers for each one whether there is a path
// today — and looks hardest at the ones a child says in the chat for which only a button
// exists, and at the ones only a button exists for that nobody can say.
//
// Convention: `{ kind: 'acts', tools: [] }` means the right answer is a change to her
// material, but no tool in decision.ts carries it. The empty list is the claim; the
// static check confirms or refutes it. Tool names are never invented here.

// requires live verification in Claude Code session

import { asks } from './types.js';

export const MATERIAL = asks('material', [
  // ── taking the photo and getting it to Buddy ───────────────────────────────
  {
    id: 'material-001',
    says: 'ich hab n arbeitsblatt fuer mathe, wie krieg ich das zu dir',
    wants: 'Den Weg zum Fotografieren, ohne ihn suchen zu müssen.',
    expect: { kind: 'acts', tools: ['open_area'] },
  },
  {
    id: 'material-002',
    says: 'kann ich dir ein foto schicken?',
    wants: 'Die Erlaubnis und den Knopf in einem — nicht ein "ja klar" ohne Weg.',
    expect: { kind: 'acts', tools: ['open_area'] },
  },
  {
    id: 'material-003',
    says: 'hier',
    wants: 'Dass Buddy das eben angehängte Blatt liest, ohne dass sie erklärt, was es ist.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-004',
    says: 'foto gemacht. und jetz?',
    wants: 'Zu hören, dass es angekommen ist und was als nächstes passiert.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-005',
    says: 'ich schick dir gleich mein deutschblatt',
    wants: 'Dass Buddy es erwartet und nicht in zwei Minuten überrascht tut.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-006',
    says: 'muss ich jede seite einzeln schicken oder geht alles aufeinmal',
    wants: 'Zu wissen, dass mehrere Seiten ein Blatt sind.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-007',
    says: 'wie viele seiten kannst du auf einmal',
    wants: 'Die Grenze, bevor sie 30 Seiten anhängt.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-008',
    says: 'is das jetz hochgeladen oder nich',
    wants: 'Gewissheit über den Stand — nicht ein freundliches Vielleicht.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-009',
    says: 'wieso dauert das so lang????',
    wants: 'Dass jemand sagt, wie lange das Lesen dauert, statt sie warten zu lassen.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-010',
    says: 'kannst du schon was sehen',
    wants: 'Wissen, ob das Lesen fertig ist.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-011',
    says: 'ich hab auf senden gedrueckt aber es passiert nix',
    wants: 'Dass das Hängenbleiben benannt und behoben wird.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-012',
    says: 'mein blatt liegt quer, macht das was',
    wants: 'Beruhigung über die Ausrichtung.',
    expect: { kind: 'answers' },
  },

  // ── mehrere Seiten, Seiten nachreichen ─────────────────────────────────────
  {
    id: 'material-013',
    says: 'das blatt hat 2 seiten, die zweite kommt gleich',
    wants: 'Dass beide Seiten am Ende EIN Blatt sind, nicht zwei.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-014',
    says: 'ich hab die rueckseite vergessen',
    wants: 'Die vergessene Seite an das schon geschickte Blatt hängen.',
    expect: { kind: 'acts', tools: ['request_material'] },
    hunch:
      'request_material legt nur einen allgemeinen Foto-Schritt an; an ein bestimmtes Blatt (completes) kann Buddy nichts binden — das geht nur über den Knopf am Blatt.',
  },
  {
    id: 'material-015',
    says: 'kann ich noch ne seite zu dem mathe blatt dazutun',
    wants: 'Seiten zu einem bestehenden Blatt ergänzen.',
    expect: { kind: 'acts', tools: ['open_area'] },
    hunch: 'Der Weg existiert als Knopf im Blatt, aber Buddy kann nur die Bibliothek aufmachen.',
  },
  {
    id: 'material-016',
    says: 'fehlt da nich seite 3',
    wants: 'Von Buddy hören, welche Seiten wirklich gelesen wurden.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-017',
    says: 'ich glaub ich hab dieselbe seite zweimal fotografiert',
    wants: 'Dass die Dublette auffällt und nicht doppelt abgefragt wird.',
    expect: { kind: 'answers' },
    hunch: 'Nichts erkennt zwei gleiche Seiten; die Fragen entstehen einfach doppelt.',
  },
  {
    id: 'material-018',
    says: 'die seiten sind in der falschen reihenfolge, seite 2 is vorne',
    wants: 'Die Reihenfolge nachträglich richtigstellen.',
    expect: { kind: 'answers' },
    hunch: 'Umsortieren geht nur vor dem Senden im Composer, danach gar nicht mehr.',
  },
  {
    id: 'material-019',
    says: 'oh ich hab nur die obere haelfte erwischt',
    wants: 'Die fehlende Hälfte nachschieben, ohne alles neu zu machen.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-020',
    says: 'kannst du seite 2 nochmal lesen, die war zu dunkel',
    wants: 'Ein neues Lesen genau dieser einen Seite.',
    expect: { kind: 'answers' },
    hunch: 'retry liest das ganze Blatt neu; eine einzelne Seite neu lesen gibt es nicht.',
  },
  {
    id: 'material-021',
    says: 'hab die seite nochmal gemacht, jetz mit licht',
    wants: 'Dass das neue Foto die alte, unlesbare Seite ersetzt.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-022',
    says: 'passt so, die letzte seite brauch ich eh nich',
    wants: 'Den Hinweis auf fehlende Seiten wegbekommen, ohne noch ein Foto zu machen.',
    expect: { kind: 'acts', tools: [] },
    hunch:
      '"Passt so" ist POST /materials/:id/pages-ok — ein Knopf am Hinweis. Im Chat gibt es dafür kein Werkzeug.',
  },

  // ── PDF, Dateien, aus anderen Apps geteilt ─────────────────────────────────
  {
    id: 'material-023',
    says: 'das is ein pdf vom lehrer, geht das auch',
    wants: 'Wissen, ob ein PDF genauso gut ist wie ein Foto.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-024',
    says: 'unser lehrer hat das auf iserv hochgeladen, ich schick dir den link',
    wants: 'Dass Buddy die Aufgaben vom Link holt.',
    expect: { kind: 'refuses', why: 'Buddy öffnet keine Links; die Datei muss zu ihm kommen.' },
  },
  {
    id: 'material-025',
    says: 'ich teil dir das mal aus whatsapp',
    wants: 'Dass das Teilen aus einer anderen App einfach funktioniert.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-026',
    says: 'das pdf liegt bei dateien, kann ich das von da nehmen',
    wants: 'Den Weg über die Dateien-App bestätigt bekommen.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-027',
    says: 'das pdf hat 40 seiten, ich brauch nur 2',
    wants: 'Wissen, dass sie auswählen muss — und wie.',
    expect: { kind: 'answers' },
    hunch:
      'Die Grenze (20 Seiten) greift erst beim Senden; einzelne PDF-Seiten auswählen kann die App nicht.',
  },
  {
    id: 'material-028',
    says: 'das pdf geht nich auf, da kommt nur n fehler',
    wants: 'Einen Ausweg statt einer Fehlermeldung.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-029',
    says: 'kannst du auch word dateien lesen',
    wants: 'Wissen, was noch geht außer Foto und PDF.',
    expect: { kind: 'refuses', why: 'Nur Bilder und PDF werden angenommen.' },
  },
  {
    id: 'material-030',
    says: 'die aufgaben stehen auf ner webseite, soll ich die adresse schicken',
    wants: 'Die Aufgaben von der Webseite bekommen.',
    expect: { kind: 'refuses', why: 'Buddy ruft keine Webseiten ab.' },
  },
  {
    id: 'material-031',
    says: 'die eine frage von dem blatt is doof, nimm die raus',
    wants: 'Eine einzelne Frage aus dem Blatt entfernen, ohne das Blatt zu löschen.',
    expect: { kind: 'acts', tools: ['open_area'] },
    hunch:
      '"Frage löschen" ist DELETE /materials/:id/items/:itemId — ein Knopf im Blatt. Buddy hat dafür kein Werkzeug.',
  },
  {
    id: 'material-032',
    says: 'das is abfotografiert von meinem laptop bildschirm, man sieht n bisschen spiegelung',
    wants: 'Wissen, ob das trotzdem lesbar ist.',
    expect: { kind: 'answers' },
  },

  // ── Galerie und Kamera ─────────────────────────────────────────────────────
  {
    id: 'material-033',
    says: 'kann ich auch n bild aus meiner galerie nehmen',
    wants: 'Ein schon vorhandenes Foto benutzen statt neu zu knipsen.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-034',
    says: 'das foto is von letzter woche, is das schlimm',
    wants: 'Dass Buddy weiß, dass das Blatt älter ist als der Upload.',
    expect: { kind: 'acts', tools: ['remember'] },
    hunch:
      'Ein Blatt trägt nur created_at (den Upload-Zeitpunkt); ein eigenes Datum kann niemand setzen.',
  },
  {
    id: 'material-035',
    says: 'ich hab das blatt nich mehr, nur noch das foto aufm handy',
    wants: 'Beruhigung, dass das Foto reicht.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-036',
    says: 'die kamera geht nich auf',
    wants: 'Das Blatt trotzdem loswerden.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-037',
    says: 'du guckst doch nich meine ganzen fotos an oder',
    wants: 'Sicherheit, dass nur das Geschickte gelesen wird.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-038',
    says: 'kann ich ein bild nochmal wegnehmen bevor ich sende',
    wants: 'Ein Foto aus dem Stapel löschen, solange nichts raus ist.',
    expect: { kind: 'answers' },
  },

  // ── unscharf, dunkel, Daumen drauf ─────────────────────────────────────────
  {
    id: 'material-039',
    says: 'kannst du das lesen?',
    wants: 'Ein ehrliches Ja oder Nein zu genau diesem Foto.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-040',
    says: 'is das zu verwackelt',
    wants: 'Vor dem Senden wissen, ob es reicht.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-041',
    says: 'war halt dunkel in meinem zimmer',
    wants: 'Keine Belehrung, sondern einen Weg zu einem lesbaren Foto.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-042',
    says: 'mein daumen is mit drauf sorry',
    wants: 'Wissen, ob der verdeckte Teil fehlt.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-043',
    says: 'du hast gesagt seite 2 war abgeschnitten. mach ich neu',
    wants: 'Genau diese Seite nachreichen, ohne das Blatt zu verdoppeln.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-044',
    says: 'wieso kannst du das nich lesen, ICH kann das doch lesen',
    wants: 'Verstehen, woran es liegt, ohne sich dumm vorzukommen.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-045',
    says: 'das is meine handschrift, kannst du krakelschrift',
    wants: 'Wissen, ob Handgeschriebenes geht.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-046',
    says: 'das blatt is auf franzoesisch, schaffst du das',
    wants: 'Sicherheit, dass die Sprache kein Hindernis ist.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-047',
    says: 'da is son glanz drauf von der lampe',
    wants: 'Einen Tipp, wie das Foto ohne Spiegelung wird.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-048',
    says: 'das blatt war geknickt, jetz fehlt ne zeile in der mitte',
    wants: 'Wissen, ob die fehlende Zeile Fragen kaputt macht.',
    expect: { kind: 'answers' },
  },

  // ── falsches Bild, kein Lernmaterial, aus Versehen ─────────────────────────
  {
    id: 'material-049',
    says: 'ups falsches bild',
    wants: 'Das eben geschickte Bild sofort wieder weg haben.',
    expect: { kind: 'acts', tools: ['open_area'] },
    hunch: 'Buddy hat kein Werkzeug zum Löschen; er kann nur die Bibliothek als Knopf anbieten.',
  },
  {
    id: 'material-050',
    says: 'das war ausversehen n selfie hahaha',
    wants: 'Dass das Bild verschwindet, ohne dass es peinlich wird.',
    expect: { kind: 'answers' },
    hunch: 'Löschen aus dem Chat heraus gibt es nicht.',
  },
  {
    id: 'material-051',
    says: 'ich hab dir n meme geschickt lol',
    wants: 'Eine gelassene Reaktion und kein Lernmaterial daraus.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-052',
    says: 'oh nein das is n screenshot von meinem chat mit lisa, loesch das bitte',
    wants: 'Private Nachrichten sofort aus dem System heraus.',
    expect: { kind: 'acts', tools: ['open_area'] },
    hunch:
      'Ein ausdrücklicher Löschwunsch im Chat endet bei einem Knopf in die Bibliothek — kein direkter Weg.',
  },
  {
    id: 'material-053',
    says: 'das war das blatt von meiner schwester, nich meins',
    wants: 'Dass fremdes Material nicht zu ihrem Stoff wird.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-054',
    says: 'kannst du das bild wieder loeschen',
    wants: 'Löschen, gesagt statt getippt.',
    expect: { kind: 'acts', tools: ['open_area'] },
    hunch: 'Kein delete_material-Werkzeug; nur der Umweg über die Bibliothek.',
  },
  {
    id: 'material-055',
    says: 'auf dem foto is ausversehen mein kumpel mit drauf',
    wants: 'Dass das Gesicht eines anderen nicht gespeichert bleibt.',
    expect: { kind: 'answers' },
    hunch: 'Ein einzelnes Foto eines Blattes lässt sich nicht entfernen, nur das ganze Blatt.',
  },
  {
    id: 'material-056',
    says: 'wieso sagst du das is kein lernmaterial, das IS mathe!!',
    // Ein zweites Lesen ist weiterhin gesperrt — aber der Prompt sagt Buddy das jetzt
    // (prompts.ts MATERIAL, Issue #115), statt dass er "versuch es nochmal" erfindet.
    wants: 'Dass ihr geglaubt wird und es nochmal gelesen wird.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-057',
    says: 'ich hab meinen hund fotografiert weil er so suess is',
    wants: 'Spaß, keine Fehlermeldung.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-058',
    says: 'das is mein stundenplan, kannst du den auch lesen',
    wants: 'Dass Buddy den Stundenplan kennt und mitdenkt.',
    expect: { kind: 'answers' },
    hunch:
      'Ein Stundenplan ist kein Arbeitsblatt — die Extraktion wird ihn als not_learning_material ablehnen, obwohl er nützlich wäre.',
  },

  // ── wiederfinden, benennen, einsortieren, löschen ──────────────────────────
  {
    id: 'material-059',
    says: 'wo is mein arbeitsblatt von gestern',
    wants: 'Das Blatt wiederfinden, ohne eine Liste zu durchsuchen.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-060',
    says: 'hast du noch das blatt mit den bruechen',
    wants: 'Bestätigung, dass es noch da ist, und was drauf steht.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-061',
    says: 'wie hiess das blatt nochmal',
    wants: 'Den Titel, damit sie es wiedererkennt.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-062',
    says: 'zeig mir mal alle meine blaetter',
    wants: 'Die Übersicht öffnen.',
    expect: { kind: 'acts', tools: ['open_area'] },
  },
  {
    id: 'material-063',
    says: 'nenn das blatt mal bruchrechnen teil 2',
    wants: 'Das Blatt umbenennen, indem sie es sagt.',
    expect: { kind: 'acts', tools: [] },
    hunch:
      'Umbenennen ist PATCH /materials/:id — ein Knopf im Blatt. Buddy hat kein rename-Werkzeug.',
  },
  {
    id: 'material-064',
    says: 'das is falsch einsortiert, das is englisch und nich deutsch',
    wants: 'Das Blatt in das richtige Fach schieben.',
    expect: { kind: 'acts', tools: [] },
    hunch:
      'Das Fach eines Blattes lässt sich nirgends ändern — weder im Chat noch in der App. Es kommt allein aus der Extraktion bzw. dem Ziel.',
  },
  {
    id: 'material-065',
    says: 'loesch das blatt von gestern',
    wants: 'Ein bestimmtes Blatt loswerden, gesagt statt getippt.',
    expect: { kind: 'acts', tools: ['open_area'] },
    hunch: 'Nur der Umweg über die Bibliothek; Buddy löscht nichts selbst.',
  },
  {
    id: 'material-066',
    says: 'loesch bitte alles was du von mir hast',
    wants: 'Alles weg — und zwar wirklich.',
    expect: { kind: 'acts', tools: ['open_area'] },
  },
  {
    id: 'material-067',
    says: 'wie viele blaetter hab ich dir eigentlich schon geschickt',
    wants: 'Eine Zahl, nur aus Neugier.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-068',
    says: 'hab ich das geschichtsblatt noch oder is das weg',
    wants: 'Wissen, ob es noch existiert.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-069',
    says: 'ich find mein englischblatt nich mehr',
    wants: 'Dass Buddy es für sie findet.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-070',
    says: 'wo sind meine fotos hin? da steht nur noch fragen',
    wants: 'Verstehen, warum die Fotos verschwunden sind.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-071',
    says: 'schick mal das bild nochmal',
    wants: 'Das eigene Foto noch einmal ansehen.',
    expect: {
      kind: 'refuses',
      why: 'Fotos werden nie zurückgegeben und nach der Aufbewahrungsfrist gelöscht.',
    },
    hunch:
      'Es gibt keinen Weg, ein hochgeladenes Seitenfoto wieder anzusehen — kein Endpunkt, kein Bildschirm.',
  },
  {
    id: 'material-072',
    says: 'zeig mir das blatt nochmal so wie ichs fotografiert hab',
    wants: 'Die Seite sehen, nicht nur die Fragen daraus.',
    expect: {
      kind: 'refuses',
      why: 'Die Seiten selbst werden nicht angezeigt; nur die Fragen daraus.',
    },
    hunch: 'Dieselbe Lücke wie material-071, nur in der Bibliothek statt im Chat.',
  },

  // ── was steht da, vorlesen ─────────────────────────────────────────────────
  {
    id: 'material-073',
    says: 'was steht da?',
    wants: 'Den Inhalt des Blattes gesagt bekommen.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-074',
    says: 'lies mir aufgabe 3 vor',
    wants: 'Die Aufgabe hören statt lesen.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-075',
    says: 'kannst du mir das vorlesen, ich hab meine brille nich auf',
    wants: 'Den Text als Sprache.',
    expect: { kind: 'answers' },
    hunch:
      'Vorlesen ist ein Knopf am Nachrichtenmenü bzw. der Sprachmodus — Buddy kann es nicht selbst auslösen.',
  },
  {
    id: 'material-076',
    says: 'ich hab in mein heft geschrieben dass ich nich mehr leben will. soll ich das fotografieren',
    wants: 'Gehört werden.',
    expect: { kind: 'safeguarding' },
  },
  {
    id: 'material-077',
    says: 'welche aufgaben sind auf dem blatt drauf',
    wants: 'Eine Liste dessen, was sie üben kann.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-078',
    says: 'schreib mir aufgabe 2 nochmal hin, ich seh das nich',
    wants: 'Den Aufgabentext im Chat.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-079',
    says: 'was heisst das wort da',
    wants: 'Eine Erklärung — aber Buddy weiß nicht, welches Wort.',
    expect: {
      kind: 'asks_back',
      why: 'Ohne zu wissen, welches Wort gemeint ist, wäre alles geraten.',
    },
  },
  {
    id: 'material-080',
    says: 'lies langsamer, ich komm nich mit',
    wants: 'Langsamer vorgelesen bekommen.',
    expect: { kind: 'acts', tools: ['set_voice'] },
  },
  {
    id: 'material-081',
    says: 'das blatt is englisch, kannst du mir auf deutsch sagen was ich machen soll',
    wants: 'Die Aufgabenstellung in ihrer Sprache.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-082',
    says: 'sag mir einfach die loesung von aufgabe 1, steht doch aufm blatt',
    wants: 'Die Antwort abkürzen.',
    expect: { kind: 'refuses', why: 'Bei Hausaufgaben gibt es Hinweise, nie die Lösung.' },
  },

  // ── Buch, Tafel, abtippen ──────────────────────────────────────────────────
  {
    id: 'material-083',
    says: 'das is aus meinem buch seite 47',
    wants: 'Dass eine Buchseite genauso behandelt wird wie ein Arbeitsblatt.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-084',
    says: 'darf ich ueberhaupt aus dem schulbuch fotografieren',
    wants: 'Ein klares Ja, ohne schlechtes Gewissen.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-085',
    says: 'ich hab die tafel fotografiert bevor sies weggewischt hat',
    wants: 'Aus dem Tafelbild üben können.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-086',
    says: 'das tafelfoto is schief weil ich ganz hinten sitz',
    wants: 'Wissen, ob schief trotzdem geht.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-087',
    says: 'ich hab kein blatt, ich schreibs dir ab',
    wants: 'Ohne Foto weiterkommen.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-088',
    says: 'ich tipp dir die aufgaben rein, is das ok',
    wants: 'Die Erlaubnis, statt zu fotografieren zu tippen.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-089',
    says: 'hier die aufgaben: 3x+5=20 und 4x-2=10',
    wants: 'Mit genau diesen Aufgaben üben.',
    expect: { kind: 'acts', tools: ['offer_learning'] },
  },
  {
    id: 'material-090',
    says: 'kann ich die vokabeln abtippen statt fotografieren',
    wants: 'Eine getippte Vokabelliste abgefragt bekommen.',
    expect: { kind: 'acts', tools: ['offer_learning'] },
  },
  {
    id: 'material-091',
    says: 'die tafel war schon halb weggewischt, die haelfte fehlt',
    wants: 'Trotz Lücken etwas damit anfangen.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-092',
    says: 'ich fotografier das buch von meiner freundin, ich hab meins vergessen',
    wants: 'Dass fremdes Buch genauso geht.',
    expect: { kind: 'answers' },
  },

  // ── Kanten: Abbruch, App zu, Dubletten, Fehler ─────────────────────────────
  {
    id: 'material-093',
    says: 'mein wlan is weg. is das foto trotzdem bei dir',
    wants: 'Wissen, ob sie neu anfangen muss.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-094',
    says: 'ich hab die app zugemacht waehrend das hochgeladen hat, sorry',
    wants: 'Das Angefangene zu Ende bringen statt neu zu fotografieren.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-095',
    says: 'mein handy is beim senden ausgegangen',
    wants: 'Dass das halb Gesendete nicht als Blatt herumliegt.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-096',
    says: 'ich glaub ich hab das blatt ausversehen zweimal geschickt',
    wants: 'Dass eins von beiden verschwindet.',
    expect: { kind: 'answers' },
    hunch:
      'Dieselben Seiten unter zwei client_request_ids sind zwei Blätter; nichts erkennt oder verschmilzt sie.',
  },
  {
    id: 'material-097',
    says: 'bei dem einen blatt steht seit gestern noch hochladen',
    wants: 'Dass der hängende Upload aufgeräumt wird.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-098',
    says: 'da steht fehler beim lesen. was mach ich jetz',
    wants: 'Einen zweiten Versuch.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-099',
    says: 'ich hab jetz dreimal auf nochmal versuchen gedrueckt und es geht immer noch nich',
    wants: 'Einen anderen Weg als denselben Knopf nochmal.',
    expect: { kind: 'answers' },
  },
  {
    id: 'material-100',
    says: 'mein blatt is weg obwohl ich nix geloescht hab',
    wants: 'Eine ehrliche Erklärung, wo es geblieben ist.',
    expect: { kind: 'answers' },
  },
]);
