// The eval set for essay feedback (issue #258, Abnahme: "≥ 20 Texte je Textsorte, Übereinstimmung
// mit einer Lehrkraft dokumentiert"). Every text here was written for this set — no student's
// essay, nobody's copyright. The three text types are the API's (`EssayType`): a Stellungnahme
// (`argue_linear`), a Pro-Kontra-Erörterung (`argue_dialectic`) and a Textanalyse (`analyse`) of
// three short texts written for the set as well.
//
// How the texts are made, so a teacher can check every expectation: each text is put together
// from paragraphs, and each paragraph either does a key point clearly or clearly does not.
//   · Einleitung: names the topic or the text (title, author, text type) and states a thesis —
//     or is missing (the text starts with an argument / with the analysis).
//   · Argumente: each reason with a concrete example — or bare claims without one.
//   · Gegenargument (Erörterung): a counter-position named and weighed — or none.
//   · Schluss: her own position, drawn from what she wrote — or a last line with no position,
//     or no closing paragraph at all.
//   · Analyse: a device of the text and what it does — or only a retelling of the plot.
//   · Zitat mit Zeile: a quotation with a line that exists — or one without a line, or with a
//     line the text does not have.
//   · Präsens: present tense throughout — or a paragraph retelling in the Präteritum.
// The combinations vary over the cases, so every key point is met in some texts and open in
// others, and some texts are good throughout and some weak throughout. None of the texts tells of
// danger to the writer; several argue about bullying or loss — the feedback must not take a topic
// for distress (`concern` must stay false).
//
// The expectation is the set's author's reading. The teacher's check is the open column of the
// report (`score.ts` `report`): agreement with a teacher is documented only once a teacher has
// filled it in.
// requires live verification in Claude Code session (stand-ins for the outside world; live model)

import type { EssayType, ReadPassage } from '@learnbuddy/shared-types/contracts';

export type Expect = 'met' | 'open';

export type EssayCase = {
  id: string;
  type: EssayType;
  /** The task as she got it. */
  prompt: string;
  topic: string;
  passage: ReadPassage | null;
  text: string;
  /** Per key point of the text type (`ESSAY_POINTS`), in its order. */
  expected: Record<string, Expect>;
};

// ─────────────── argumentieren: Stellungnahme und Erörterung ───────────────

type ArgueTopic = {
  key: string;
  topic: string;
  linear: string;
  dialectic: string;
  intro: string;
  args: string;
  bare: string;
  counter: string;
  conclusion: string;
  noPosition: string;
};

const ARGUE: ArgueTopic[] = [
  {
    key: 'handy',
    topic: 'Handyverbot in den Pausen',
    linear: 'Nimm Stellung: Sollte es an unserer Schule ein Handyverbot in den Pausen geben?',
    dialectic: 'Erörtere: Sollte es an Schulen ein Handyverbot in den Pausen geben?',
    intro:
      'An vielen Schulen wird darüber gestritten, ob Handys in den Pausen verboten werden sollen. Ich bin der Meinung, dass ein Handyverbot in den Pausen sinnvoll ist.',
    args: 'Ein wichtiger Grund ist, dass sich die Schülerinnen und Schüler ohne Handy mehr bewegen. An der Realschule meiner Cousine wurde das Verbot letztes Jahr eingeführt, und seitdem spielen in jeder Pause viel mehr Kinder Fußball oder Tischtennis. Außerdem gibt es weniger Streit über Fotos und Nachrichten. Wenn niemand in der Pause filmen kann, werden auch keine peinlichen Videos von anderen herumgeschickt, wie es in unserer Klasse im Herbst passiert ist.',
    bare: 'Ein Grund ist, dass man sich ohne Handy mehr bewegt. Ein weiterer Grund ist, dass es weniger Streit gibt.',
    counter:
      'Manche sagen, dass man das Handy für Notfälle braucht, zum Beispiel um die Eltern zu erreichen. Dieses Argument ist ernst zu nehmen. Allerdings gibt es im Sekretariat ein Telefon, und nach dem Unterricht darf man das Handy ja wieder benutzen. Deshalb wiegt dieser Einwand für mich weniger schwer.',
    conclusion:
      'Insgesamt bin ich für ein Handyverbot in den Pausen, weil die Pausen dadurch bewegter und friedlicher werden.',
    noPosition: 'Das ist ein schwieriges Thema, zu dem es viele verschiedene Meinungen gibt.',
  },
  {
    key: 'uniform',
    topic: 'Schuluniform',
    linear: 'Nimm Stellung: Sollte an deiner Schule eine Schuluniform eingeführt werden?',
    dialectic: 'Erörtere: Sollten Schulen in Deutschland Schuluniformen einführen?',
    intro:
      'Immer wieder wird diskutiert, ob Schulen eine einheitliche Kleidung vorschreiben sollen. Meine These ist, dass eine Schuluniform mehr Nachteile als Vorteile hat.',
    args: 'Erstens kostet eine Uniform viel Geld. Ein Pullover mit Schullogo kostet an manchen Schulen über 40 Euro, und man braucht mehrere davon. Zweitens kann man mit seiner Kleidung zeigen, wer man ist. Meine Freundin näht sich zum Beispiel ihre Taschen selbst und trägt gern bunte Sachen; mit einer Uniform ginge das nicht mehr.',
    bare: 'Ein Grund ist der Preis. Ein weiterer Grund ist, dass man sich mit Kleidung ausdrücken möchte.',
    counter:
      'Befürworter meinen, eine Uniform verhindere, dass Kinder wegen ihrer Kleidung gemobbt werden. Das ist ein wichtiger Punkt. Ich glaube aber, dass Mobbing andere Ursachen hat und durch gleiche Kleidung nicht verschwindet, sondern sich nur andere Gründe sucht.',
    conclusion:
      'Abschließend bleibe ich bei meiner Meinung: Eine Schuluniform sollte nicht eingeführt werden, weil sie teuer ist und uns die Möglichkeit nimmt, uns selbst auszudrücken.',
    noPosition: 'Das war mein Text zum Thema Schuluniform.',
  },
  {
    key: 'hausaufgaben',
    topic: 'Hausaufgaben abschaffen',
    linear: 'Nimm Stellung: Sollten Hausaufgaben abgeschafft werden?',
    dialectic: 'Erörtere: Sollten Hausaufgaben abgeschafft werden?',
    intro:
      'Viele Schülerinnen und Schüler stöhnen über Hausaufgaben, und manche Schulen haben sie schon abgeschafft. Ich vertrete die Ansicht, dass Hausaufgaben nicht abgeschafft werden sollten.',
    args: 'Hausaufgaben helfen, den Stoff zu üben, bis man ihn wirklich kann. Als wir in Mathe die Bruchrechnung hatten, habe ich sie erst verstanden, als ich zu Hause zwanzig Aufgaben allein gerechnet habe. Außerdem lernt man durch Hausaufgaben, sich die Zeit selbst einzuteilen. Mein Bruder schreibt sich zum Beispiel jeden Montag einen Plan, wann er welche Aufgabe erledigt, und das hilft ihm jetzt auch in der Oberstufe.',
    bare: 'Ein Grund ist das Üben. Ein weiterer Grund ist, dass man lernt, selbstständig zu arbeiten.',
    counter:
      'Gegner der Hausaufgaben sagen, dass Kinder nach einem langen Schultag Freizeit brauchen. Das stimmt, denn Erholung ist wichtig. Trotzdem müssen Hausaufgaben nicht lang sein: Zwanzig Minuten am Tag lassen genug Zeit für Hobbys.',
    conclusion:
      'Zusammenfassend bin ich gegen die Abschaffung, weil Hausaufgaben beim Üben und beim selbstständigen Arbeiten helfen, solange sie kurz bleiben.',
    noPosition: 'So, das waren meine Gedanken zu den Hausaufgaben.',
  },
  {
    key: 'zoo',
    topic: 'Tiere im Zoo',
    linear: 'Nimm Stellung: Sollten Zoos weiterhin Wildtiere halten?',
    dialectic: 'Erörtere: Sollten Zoos weiterhin Wildtiere halten dürfen?',
    intro:
      'Ob Wildtiere in Zoos gehalten werden sollten, ist eine umstrittene Frage. Ich bin der Ansicht, dass gute Zoos Wildtiere halten sollten.',
    args: 'Zoos helfen, bedrohte Tierarten zu retten. Der Wisent war zum Beispiel in freier Wildbahn ausgestorben und konnte nur durch Tiere aus Zoos wieder angesiedelt werden. Außerdem lernen Kinder im Zoo, Tiere zu achten. Als wir mit der Klasse im Zoo waren, hat uns eine Tierpflegerin erklärt, wie viel Platz ein Elefant braucht, und das hat mich mehr beeindruckt als jedes Buch.',
    bare: 'Ein Grund ist der Artenschutz. Ein weiterer Grund ist, dass Kinder dort etwas über Tiere lernen.',
    counter:
      'Tierschützer wenden ein, dass Wildtiere in Gehegen nicht artgerecht leben können. Bei kleinen, alten Gehegen haben sie recht. Moderne Zoos bauen aber große Anlagen, und deshalb überzeugt mich dieser Einwand nicht für alle Zoos.',
    conclusion:
      'Für mich steht deshalb fest, dass Zoos Wildtiere halten sollten, weil sie Arten schützen und Kindern Achtung vor Tieren beibringen.',
    noPosition: 'Es gibt also viel über Zoos zu sagen.',
  },
  {
    key: 'social',
    topic: 'Soziale Netzwerke erst ab 16',
    linear: 'Nimm Stellung: Sollten soziale Netzwerke erst ab 16 Jahren erlaubt sein?',
    dialectic: 'Erörtere: Sollten soziale Netzwerke erst ab 16 Jahren erlaubt sein?',
    intro:
      'In der Politik wird gerade überlegt, soziale Netzwerke erst ab 16 Jahren zu erlauben. Ich finde, dass eine solche Altersgrenze richtig ist.',
    args: 'Jüngere Kinder können schlechter einschätzen, welche Bilder sie besser nicht posten. Ein Mädchen aus meiner alten Schule hat mit elf ein Foto von ihrer Adresse gezeigt, ohne darüber nachzudenken. Außerdem verbringen viele Kinder zu viel Zeit in den Apps. Laut der JIM-Studie sind Jugendliche im Durchschnitt mehrere Stunden am Tag online, und die Zeit fehlt dann für Schlaf und Freunde.',
    bare: 'Ein Grund ist, dass Kinder Gefahren schlechter einschätzen. Ein weiterer Grund ist die viele Zeit in den Apps.',
    counter:
      'Kritiker sagen, dass Jugendliche in sozialen Netzwerken auch Kontakt zu Freunden halten und Neues lernen. Das ist ein berechtigter Einwand. Kontakt halten kann man aber auch über Nachrichten-Apps ohne öffentliche Profile, deshalb bleibt mein Argument stärker.',
    conclusion:
      'Am Ende überzeugt mich die Altersgrenze ab 16, weil jüngere Kinder so besser vor eigenen Fehlern und zu viel Bildschirmzeit geschützt sind.',
    noPosition: 'Das waren meine Gedanken zu sozialen Netzwerken.',
  },
];

/** Which paragraphs a text has: the key points it does, in the type's order. */
type ArgueMix = {
  intro: boolean;
  args: boolean;
  counter: boolean;
  conclusion: 'yes' | 'none' | 'weak';
};

function argueText(t: ArgueTopic, mix: ArgueMix, dialectic: boolean): string {
  return [
    mix.intro ? t.intro : null,
    mix.args ? t.args : t.bare,
    dialectic && mix.counter ? t.counter : null,
    mix.conclusion === 'yes' ? t.conclusion : mix.conclusion === 'weak' ? t.noPosition : null,
  ]
    .filter((p): p is string => p !== null)
    .join('\n');
}

const met = (b: boolean): Expect => (b ? 'met' : 'open');

/** Every combination of the key points, in a fixed order, so the cases cover all of them. */
function mixes(dialectic: boolean): ArgueMix[] {
  const out: ArgueMix[] = [];
  for (const intro of [true, false])
    for (const args of [true, false])
      for (const counter of dialectic ? [true, false] : [false])
        for (const conclusion of ['yes', 'none', 'weak'] as const)
          out.push({ intro, args, counter, conclusion });
  return out;
}

function argueCases(type: 'argue_linear' | 'argue_dialectic'): EssayCase[] {
  const dialectic = type === 'argue_dialectic';
  const all = mixes(dialectic);
  const perTopic = 5;
  return ARGUE.flatMap((t, ti) =>
    Array.from({ length: perTopic }, (_, k) => {
      // Topic by topic through every combination: each one comes up, with a different topic.
      const mix = all[(ti * perTopic + k) % all.length]!;
      const expected: Record<string, Expect> = {
        intro: met(mix.intro),
        arguments: met(mix.args),
        ...(dialectic ? { counter: met(mix.counter) } : {}),
        conclusion: met(mix.conclusion === 'yes'),
      };
      return {
        id: `${dialectic ? 'eroert' : 'stellung'}-${t.key}-${k + 1}`,
        type,
        prompt: dialectic ? t.dialectic : t.linear,
        topic: t.topic,
        passage: null,
        text: argueText(t, mix, dialectic),
        expected,
      };
    }),
  );
}

// ─────────────── analysieren: drei Texte, geschrieben für dieses Set ───────────────

type AnalyseText = {
  key: string;
  prompt: string;
  topic: string;
  passage: ReadPassage;
  intro: string;
  analysis: string;
  /** Only what happens, in the present tense: no device, no effect. */
  retell: string;
  /** The same retelling in the Präteritum. */
  past: string;
  quote: string;
  quoteNoLine: string;
  quoteBadLine: string;
  conclusion: string;
};

const ANALYSE: AnalyseText[] = [
  {
    key: 'platz',
    prompt: 'Analysiere die Kurzgeschichte „Der leere Platz“ von Mara Lind.',
    topic: 'Kurzgeschichte',
    passage: {
      title: 'Der leere Platz',
      lang: 'de',
      lines: [
        'Jonas kommt als Erster in die Klasse.',
        'Er schaut zur dritten Bank am Fenster.',
        'Der Platz ist leer.',
        'Wieder leer.',
        'Seit Lea weggezogen ist, sitzt dort niemand.',
        'Die anderen lachen, werfen Taschen auf die Tische.',
        'Jonas packt sein Heft aus und schreibt das Datum.',
        'Dann legt er seinen Radiergummi auf den leeren Tisch.',
        'Nur für den Fall.',
      ],
    },
    intro:
      'In der Kurzgeschichte „Der leere Platz“ von Mara Lind geht es um einen Jungen, der seine weggezogene Freundin vermisst. Ich möchte zeigen, dass die Geschichte mit wenigen Worten eine große Einsamkeit ausdrückt.',
    analysis:
      'Die Autorin verwendet sehr kurze Sätze und sogar Satzfragmente. Dadurch wirkt der Text stockend, als würde Jonas kaum Worte für seine Gefühle finden. Außerdem steht der lauten Klasse der stille Jonas gegenüber; dieser Gegensatz macht seine Einsamkeit deutlich.',
    retell:
      'Zuerst kommt Jonas in die Klasse. Dann sieht er, dass der Platz von Lea leer ist. Die anderen Kinder kommen auch und lachen. Am Ende legt Jonas seinen Radiergummi auf den Tisch.',
    past: 'Am Anfang kam Jonas als Erster in die Klasse. Er sah zum Fenster und bemerkte den leeren Platz. Danach kamen die anderen Kinder und lachten laut.',
    quote:
      'Wohin Jonas sieht, steht gleich am Anfang: „Er schaut zur dritten Bank am Fenster.“ (Z. 2)',
    quoteNoLine:
      'Wohin Jonas sieht, steht gleich am Anfang: „Er schaut zur dritten Bank am Fenster.“',
    quoteBadLine:
      'Wohin Jonas sieht, steht gleich am Anfang: „Er schaut zur dritten Bank am Fenster.“ (Z. 23)',
    conclusion:
      'Insgesamt erzählt die Geschichte davon, wie sehr Jonas Lea vermisst. Mich überzeugt das offene Ende, weil Jonas die Hoffnung nicht aufgibt.',
  },
  {
    key: 'november',
    prompt: 'Interpretiere das Gedicht „Novembermorgen“ von Tom Berger.',
    topic: 'Gedicht',
    passage: {
      title: 'Novembermorgen',
      lang: 'de',
      lines: [
        'Der Nebel schleicht durch leere Gassen,',
        'die Bäume stehen kahl und stumm.',
        'Die Laternen sind noch nicht verlassen,',
        'sie schauen müde sich herum.',
        '',
        'Ein Vogel sitzt auf grauen Drähten,',
        'er singt ein Lied, ganz leis und klein.',
        'Und zwischen allen Nebelfäden',
        'bricht doch ein erster Sonnenschein.',
      ],
    },
    intro:
      'Das Gedicht „Novembermorgen“ von Tom Berger beschreibt einen grauen Morgen im Herbst. Meine Deutung ist, dass das Gedicht trotz der Traurigkeit Hoffnung ausdrückt.',
    analysis:
      'Das Gedicht besteht aus zwei Strophen mit Kreuzreim. In der ersten Strophe werden Nebel und Laternen personifiziert; sie wirken dadurch lebendig, aber müde, und die Stimmung ist bedrückend. Die zweite Strophe beginnt mit einem Vogel, und das Wort „doch“ markiert eine Wende zum Licht.',
    retell:
      'Im Gedicht ist es Morgen und es ist neblig. Die Bäume haben keine Blätter. Ein Vogel sitzt auf einem Draht und singt. Am Ende scheint die Sonne.',
    past: 'Am Morgen war es neblig. Die Bäume hatten keine Blätter mehr, und ein Vogel saß auf einem Draht und sang.',
    quote: 'Dass es Herbst ist, sieht man an den Bäumen: „die Bäume stehen kahl und stumm“ (Z. 2).',
    quoteNoLine: 'Dass es Herbst ist, sieht man an den Bäumen: „die Bäume stehen kahl und stumm“.',
    quoteBadLine:
      'Dass es Herbst ist, sieht man an den Bäumen: „die Bäume stehen kahl und stumm“ (Z. 14).',
    conclusion:
      'Zusammenfassend drückt das Gedicht für mich aus, dass selbst ein trüber Tag Hoffnung enthält. Diese Deutung überzeugt mich, weil das Gedicht mit Sonnenschein endet.',
  },
  {
    key: 'rede',
    prompt:
      'Analysiere die Rede „Unser Schulhof gehört uns allen“ der Schülersprecherin Nele Kraus.',
    topic: 'Rede',
    passage: {
      title: 'Unser Schulhof gehört uns allen',
      lang: 'de',
      lines: [
        'Liebe Mitschülerinnen und Mitschüler,',
        'wer von euch findet unseren Schulhof schön?',
        'Ich sehe keine Hände.',
        'Wir wollen Bänke. Wir wollen Bäume. Wir wollen Platz zum Spielen.',
        'Der Förderverein hat 3000 Euro gesammelt.',
        'Jetzt fehlt nur noch eins: ihr.',
        'Kommt am Samstag um zehn Uhr und packt mit an!',
        'Denn unser Schulhof gehört uns allen.',
      ],
    },
    intro:
      'In der Rede „Unser Schulhof gehört uns allen“ ruft die Schülersprecherin Nele Kraus dazu auf, den Schulhof gemeinsam umzugestalten. Ich zeige, dass die Rede mit rhetorischen Mitteln die Zuhörer zum Mitmachen bewegen will.',
    analysis:
      'Die Rednerin beginnt mit einer rhetorischen Frage, auf die sie selbst antwortet. So bezieht sie das Publikum sofort ein. Danach verwendet sie eine Anapher mit dreimal „Wir wollen“, wodurch die Forderungen eindringlich und gemeinsam klingen. Am Ende spricht sie die Zuhörer direkt mit „ihr“ an und macht sie verantwortlich.',
    retell:
      'Nele begrüßt die Schüler. Dann sagt sie, dass der Schulhof nicht schön ist. Sie erzählt vom Geld des Fördervereins. Zum Schluss lädt sie alle für Samstag ein.',
    past: 'Nele begrüßte zuerst die Schüler. Dann sagte sie, dass der Schulhof hässlich sei, und erzählte vom Geld des Fördervereins.',
    quote:
      'Wann es losgeht, sagt sie genau: „Kommt am Samstag um zehn Uhr und packt mit an!“ (Z. 7)',
    quoteNoLine:
      'Wann es losgeht, sagt sie genau: „Kommt am Samstag um zehn Uhr und packt mit an!“',
    quoteBadLine:
      'Wann es losgeht, sagt sie genau: „Kommt am Samstag um zehn Uhr und packt mit an!“ (Z. 19)',
    conclusion:
      'Insgesamt finde ich die Rede überzeugend, weil man sich als Zuhörer persönlich angesprochen fühlt und Lust bekommt mitzumachen.',
  },
];

type AnalyseMix = {
  intro: boolean;
  analysis: boolean;
  quote: 'ok' | 'noline' | 'badline';
  present: boolean;
  conclusion: boolean;
};

function analyseText(a: AnalyseText, mix: AnalyseMix): string {
  const quote =
    mix.quote === 'ok' ? a.quote : mix.quote === 'noline' ? a.quoteNoLine : a.quoteBadLine;
  return [
    mix.intro ? a.intro : null,
    mix.present ? null : a.past,
    mix.analysis ? a.analysis : a.retell,
    quote,
    mix.conclusion ? a.conclusion : null,
  ]
    .filter((p): p is string => p !== null)
    .join('\n');
}

function analyseMixes(): AnalyseMix[] {
  const out: AnalyseMix[] = [];
  for (const intro of [true, false])
    for (const analysis of [true, false])
      for (const quote of ['ok', 'noline', 'badline'] as const)
        for (const present of [true, false])
          for (const conclusion of [true, false])
            out.push({ intro, analysis, quote, present, conclusion });
  return out;
}

function analyseCases(): EssayCase[] {
  const all = analyseMixes();
  const perText = 8;
  return ANALYSE.flatMap((a, ai) =>
    Array.from({ length: perText }, (_, k) => {
      // A stride through all 48 combinations, so each text gets good, weak and mixed ones.
      const mix = all[(ai * 3 + k * 7) % all.length]!;
      return {
        id: `analyse-${a.key}-${k + 1}`,
        type: 'analyse' as const,
        prompt: a.prompt,
        topic: a.topic,
        passage: a.passage,
        text: analyseText(a, mix),
        expected: {
          intro: met(mix.intro),
          analysis: met(mix.analysis),
          quotes: met(mix.quote === 'ok'),
          tense: met(mix.present),
          conclusion: met(mix.conclusion),
        },
      };
    }),
  );
}

export const ESSAY_CASES: readonly EssayCase[] = [
  ...argueCases('argue_linear'),
  ...argueCases('argue_dialectic'),
  ...analyseCases(),
];
