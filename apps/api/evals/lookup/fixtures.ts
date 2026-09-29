// A realistic child's library and the queries children actually write (issues
// #23, #26): compounds a full-text search cannot decompose, typos, synonyms,
// and exact topic words as the control group. Shared by the retrieval eval
// (retrieval.ts, live embeddings) and the turn eval (run.ts, live model).
// requires live verification in Claude Code session (used with the live model)

export type Sheet = { key: string; title: string; subject: string; text: string };

export const SHEETS: Sheet[] = [
  {
    key: 'brueche',
    title: 'Brüche rechnen',
    subject: 'Mathe',
    text:
      'Brüche erweitern und kürzen: Zähler und Nenner mit derselben Zahl multiplizieren ' +
      'oder durch dieselbe Zahl teilen.\n\n' +
      'Brüche vergleichen: Bringe beide Brüche auf den gleichen Nenner. ' +
      'Beispielaufgabe: Welcher Bruch ist größer, 2/3 oder 3/5?\n\n' +
      'Gemischte Zahlen: 7/4 = 1 3/4. Ein unechter Bruch hat einen größeren Zähler als Nenner.',
  },
  {
    key: 'einmaleins',
    title: 'Das kleine Einmaleins',
    subject: 'Mathe',
    text:
      'Multiplikation bis 100: die Reihen von 2 bis 9 üben.\n\n' +
      'Die 7er-Reihe: 7, 14, 21, 28, 35, 42, 49, 56, 63, 70. ' +
      'Tauschaufgaben: 3 · 7 = 7 · 3.\n\n' +
      'Kernaufgaben helfen beim Merken: 5 · 7 = 35, dann 6 · 7 = 35 + 7.',
  },
  {
    key: 'division',
    title: 'Division mit Rest',
    subject: 'Mathe',
    text:
      'Teilen mit Rest: 17 : 5 = 3 Rest 2.\n\n' +
      'Die Umkehraufgabe prüft das Ergebnis: 3 · 5 + 2 = 17. ' +
      'Halbschriftliches Dividieren: 84 : 4 = 80 : 4 + 4 : 4 = 21.',
  },
  {
    key: 'photosynthese',
    title: 'Photosynthese',
    subject: 'Biologie',
    text:
      'Die Photosynthese wandelt Lichtenergie in Zucker um. ' +
      'Pflanzen brauchen dazu Wasser, Kohlenstoffdioxid und Licht.\n\n' +
      'In den Chloroplasten sitzt der grüne Farbstoff Chlorophyll. ' +
      'Als Abfallprodukt entsteht Sauerstoff.',
  },
  {
    key: 'roemer',
    title: 'Die Römer',
    subject: 'Geschichte',
    text:
      'Augustus wurde 27 v. Chr. der erste römische Kaiser. ' +
      'Rom wurde der Sage nach 753 v. Chr. gegründet.\n\n' +
      'Die Römer bauten Aquädukte, um Wasser in die Städte zu leiten. ' +
      'Eine Legion bestand aus etwa 5000 Soldaten.',
  },
  {
    key: 'wasserkreislauf',
    title: 'Der Wasserkreislauf',
    subject: 'Sachkunde',
    text:
      'Wasser verdunstet über Meeren und Seen und steigt als Wasserdampf auf.\n\n' +
      'In den Wolken kondensiert der Dampf und fällt als Regen oder Schnee. ' +
      'Flüsse tragen das Wasser zurück ins Meer.',
  },
  {
    key: 'vokabeln',
    title: 'Unité 3 – La maison',
    subject: 'Französisch',
    text:
      'la chambre – das Zimmer\nla cuisine – die Küche\nle jardin – der Garten\n\n' +
      'le salon – das Wohnzimmer\nla salle de bains – das Badezimmer',
  },
];

export type RetrievalCase = {
  id: string;
  kind: 'kompositum' | 'synonym' | 'vertipper' | 'exakt';
  query: string;
  expected: Sheet['key'];
};

export const RETRIEVAL_CASES: RetrievalCase[] = [
  // Komposita: tsvector never decomposes them (the reason for issue #23).
  { id: 'bruchrechnung', kind: 'kompositum', query: 'Bruchrechnung', expected: 'brueche' },
  { id: 'malaufgaben', kind: 'kompositum', query: 'Malaufgaben', expected: 'einmaleins' },
  {
    id: 'teilungsaufgaben',
    kind: 'kompositum',
    query: 'Teilaufgaben mit Rest',
    expected: 'division',
  },
  {
    id: 'wasserdampf_wolken',
    kind: 'kompositum',
    query: 'Wolkenbildung',
    expected: 'wasserkreislauf',
  },
  // Synonyme / Umschreibungen, wie Kinder fragen.
  { id: 'geteilt_rechnen', kind: 'synonym', query: 'geteilt rechnen', expected: 'division' },
  { id: 'mal_rechnen', kind: 'synonym', query: 'mal rechnen üben', expected: 'einmaleins' },
  {
    id: 'pflanzen_licht',
    kind: 'synonym',
    query: 'wie Pflanzen aus Licht Essen machen',
    expected: 'photosynthese',
  },
  {
    id: 'franz_woerter',
    kind: 'synonym',
    query: 'französische Wörter fürs Haus',
    expected: 'vokabeln',
  },
  // Vertipper, wie sie im Chat wirklich ankommen.
  { id: 'fotosyntese', kind: 'vertipper', query: 'Fotosyntese', expected: 'photosynthese' },
  { id: 'divsion', kind: 'vertipper', query: 'Divsion mit Rest', expected: 'division' },
  { id: 'bruche', kind: 'vertipper', query: 'Brühe erweitern', expected: 'brueche' },
  // Exakte Topic-Wörter: die Kontrollgruppe — hier muss auch FTS allein treffen.
  { id: 'roemer_kaiser', kind: 'exakt', query: 'Römer Kaiser', expected: 'roemer' },
  { id: 'chlorophyll', kind: 'exakt', query: 'Chlorophyll', expected: 'photosynthese' },
  { id: 'einmaleins_exakt', kind: 'exakt', query: 'Einmaleins Reihen', expected: 'einmaleins' },
];
