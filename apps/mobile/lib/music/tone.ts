// Die Notenzeile, hörbar — ohne Tonarchiv, ohne Serverruf, ohne neue native Abhängigkeit
// (die Zeile aus `contracts/staff.ts`, issue #226).
//
// „Anhören" ist bei einer Notenaufgabe keine Zierde. Eine Note auf der dritten Linie ist für ein
// Kind erst dann ein Ton, wenn es ihn einmal gehört hat, und ein geschriebener Rhythmus erst dann
// ein Rhythmus. Dafür gibt es drei Wege, und zwei davon kosten mehr, als sie wert sind:
//
//   · **Tondateien mitliefern.** Ein Dutzend zeichenbare Töne je Schlüssel, fünf Notenwerte,
//     punktiert oder nicht, und ein Tempo zwischen 40 und 200 — das sind keine zwölf Dateien,
//     das ist eine Matrix, und sie läge im Bundle, das die App beim ersten Start lädt.
//   · **Einen Synthesizer einbinden.** `react-native-audio-api` liegt schon im Baum, aber dann
//     hängt ein Schulfach an einer nativen Bibliothek — und der Browser-Walkthrough, der jede
//     Änderung abnimmt (`scripts/web-walkthrough.sh`), kann sie nicht ausführen. Was der
//     Walkthrough nicht sieht, ist nicht abgenommen.
//   · **Die Bytes hier ausrechnen.** Eine WAV-Datei ist ein 44-Byte-Kopf und danach die Zahlen,
//     und die Zahlen sind eine Formel. Das Ergebnis ist Base64 — genau das, was
//     `lib/speech/naturalAudio.ts` heute schon an den Player gibt: auf dem Handy als kurzlebige
//     Datei im Cache (AVPlayer öffnet keine `data:`-URI), im Browser als `data:`-URI. Es gibt
//     also keinen neuen Abspielweg, nur eine zweite Quelle für denselben.
//
// Deshalb ist dieses Modul rein: kein `react`, kein `react-native`, kein Expo, keine Uhr. Was
// hier herauskommt, lässt sich im Node-Test Byte für Byte nachrechnen und Frequenz für Frequenz
// messen (`tone.test.ts`) — und ein Ton, dessen Frequenz gemessen ist, ist eine andere Zusage als
// ein Ton, von dem jemand sagt, er klinge richtig (CLAUDE.md Regel 5).
//
// ─── Warum ein Dreieck ───
//
// Ein **Sinus** ist auf einem Handylautsprecher der falsche Ton: ein kleiner Treiber ohne
// Volumen gibt unter ein paar hundert Hertz fast nichts her, und ein Sinus hat außer seinem
// Grundton nichts, womit er sich bemerkbar machen könnte — ein C4 (262 Hz) wird dann zum
// Flüstern. Ein **Rechteck** hat das umgekehrte Problem: alle ungeraden Obertöne in voller
// Stärke, das trägt, klingt aber hart und spielzeughaft, und bei einem Kind, das zehn Minuten
// Noten liest, ist das kein Klang, sondern ein Piepsen. Ein **Dreieck** liegt dazwischen: auch
// nur ungerade Obertöne, aber mit 1/n² statt 1/n gedämpft — genug Oberton, um auf dem
// Handylautsprecher als Tonhöhe anzukommen, weich genug, um nach Flöte und nicht nach Alarm zu
// klingen. Und es ist, anders als jede gefilterte Form, in einer Zeile Arithmetik zu haben.
//
// ─── Warum eine Hüllkurve ───
//
// Ohne sie fängt jede Note bei vollem Pegel an und hört bei vollem Pegel auf. Das sind zwei
// Sprünge im Signal, und ein Sprung im Signal ist ein **Knacken** — hörbarer als der Ton selbst.
// Deshalb: ein kurzer linearer Anstieg (8 ms, unter der Schwelle, ab der ein Einsatz „weich"
// klingt statt angeschlagen), ein gehaltener Teil, ein Abfall auf null — und danach eine kleine
// **Lücke bis zum Ende des Zeitfensters**. Die Lücke ist nicht Kosmetik: zwei gleiche Töne
// hintereinander sind ohne sie ein einziger langer Ton, und „zwei Viertel C" wäre nicht von
// „einer halben Note C" zu unterscheiden. Genau das soll die Zeile aber zeigen.
//
// ─── Warum 22050 Hz und 0,35 vom Vollpegel ───
//
// Die Abtastrate steht unten begründet, der Pegel hier: es ist **eine** Stimme, und sie braucht
// keinen Vollpegel. 0,35 lässt Luft nach oben, sodass nichts begrenzt werden muss (der höchste
// Zahlenwert, den dieses Modul schreiben kann, ist 11468 von 32767 — das ist nachgerechnet, kein
// Gefühl), und ein Kind, das das Handy ans Ohr hält, erschrickt nicht.
//
// ─── Die Grenzen, die von außen kommen ───
//
// Eine Zeile ist durch `StaffBars` begrenzt (`BARS_MAX` Takte à `ELEMENTS_PER_BAR_MAX` Elemente,
// zod-geprüft, bevor etwas hier ankommt). Der rechnerisch längste Fall — zwei Takte mit je acht
// punktierten Ganzen bei Tempo 40 — sind 144 Sekunden und damit 6,4 MB PCM; ein wirklich voller
// 4/4-Zweitakter bei Tempo 40 sind 12 Sekunden und 530 kB. Darum wird hier nichts gestreamt und
// nichts zwischengespeichert: die Bytes entstehen einmal pro Antippen und sind danach weg.

import {
  type Pitch,
  type StaffBars,
  type StaffElement,
  TEMPO_DEFAULT,
  TEMPO_MAX,
  TEMPO_MIN,
  frequencyOf,
  ticksOf,
} from '@learnbuddy/shared-types/contracts';

/**
 * Die Abtastrate, in Hertz.
 *
 * 22050 und nicht 44100: die Hälfte von CD, also auf jedem Ausgabeweg ein glattes 2:1 und kein
 * krummes Resampling. Die Nyquist-Grenze liegt damit bei 11025 Hz — der höchste Ton, den ein
 * Schlüssel dieser App zeichnen kann, ist A5 mit 880 Hz, dessen zwölfter Oberton liegt noch
 * darunter, und ein Dreieck hat oberhalb davon ohnehin nur noch Reste (1/n²). Die Hälfte der
 * Bytes heißt gleichzeitig die halbe Arbeit beim Base64-Kodieren, und das passiert in JavaScript
 * auf einem Telefon.
 */
export const SAMPLE_RATE = 22050;

/** Mono: eine Stimme, und zwei gleiche Kanäle wären nur doppelt so viele Bytes. */
const CHANNELS = 1;
/** 16 Bit vorzeichenbehaftet — das Format, das jeder Player ohne Nachfrage öffnet. */
const BITS_PER_SAMPLE = 16;
const BYTES_PER_SAMPLE = (BITS_PER_SAMPLE / 8) * CHANNELS;
/** Der kanonische RIFF/WAVE-Kopf: `RIFF`+Größe+`WAVE`, `fmt ` (16 Byte), `data`+Größe. */
const HEADER_BYTES = 44;

/**
 * Der größte Zahlenwert, den dieses Modul schreibt: 0,35 vom Vollpegel.
 *
 * Als fertige ganze Zahl und nicht als Faktor, damit kein Begrenzen nötig ist: das Dreieck liegt
 * in [−1, 1], die Hüllkurve in [0, 1], das Produkt also in [−11468, 11468] — innerhalb von
 * [−32768, 32767], bewiesen und nicht abgefangen.
 */
const AMPLITUDE = Math.round(0.35 * 32767);

/** Wie viele Zweiunddreißigstel eine Viertelnote ist — der Nenner des Tempos. */
const TICKS_PER_QUARTER = ticksOf('quarter', false);

/** Der weiche Einsatz: 8 ms. Kürzer knackt, länger klingt wie ein Hineinblenden. */
const ATTACK_SECONDS = 0.008;
/** Das Ausklingen: 40 ms auf null — lang genug, um nicht abgeschnitten zu wirken. */
const RELEASE_SECONDS = 0.04;
/** Die Stille am Ende des Zeitfensters, die zwei gleiche Töne trennt: 30 ms. */
const GAP_SECONDS = 0.03;

/**
 * Bei einer sehr kurzen Note (eine Sechzehntel bei Tempo 200 ist 75 ms) passen die drei Zeiten
 * oben nicht mehr nebeneinander. Dann gelten Anteile statt Millisekunden — zusammen höchstens
 * 45 % des klingenden Teils, sodass Anstieg und Abfall sich nie überlappen.
 */
const GAP_SHARE = 0.25;
const ATTACK_SHARE = 0.1;
const RELEASE_SHARE = 0.35;

/** Ein Tempo, mit dem gerechnet werden kann (Viertel pro Minute). */
function clampTempo(tempo: number): number {
  if (!Number.isFinite(tempo)) return TEMPO_DEFAULT;
  return Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, tempo));
}

/**
 * Wie lang ein Zweiunddreißigstel bei diesem Tempo dauert, in Sekunden.
 *
 * Eine Viertelnote bei Tempo T dauert 60/T Sekunden, ein Tick ist ein Achtel davon. Das Tempo
 * wird dabei in [`TEMPO_MIN`, `TEMPO_MAX`] gezogen: eine Zeile mit Tempo 0 oder NaN darf keine
 * Datei von unendlicher Länge ergeben, und ein Wurf ist hier besser vermieden als abgefangen —
 * das Antippen von „Anhören" soll immer etwas zu hören geben.
 */
export function tickSeconds(tempo: number): number {
  return 60 / clampTempo(tempo) / TICKS_PER_QUARTER;
}

/**
 * Wie viele Abtastwerte das Zeitfenster dieses Elements bekommt — Note und Pause gleich, denn
 * eine Pause ist eine Dauer wie jede andere, nur still.
 */
export function samplesOf(element: StaffElement, tempo: number): number {
  return slotSamples(ticksOf(element.value, element.dotted), tempo);
}

function slotSamples(ticks: number, tempo: number): number {
  return Math.round(ticks * tickSeconds(tempo) * SAMPLE_RATE);
}

/**
 * Das Dreieck: Phase 0 → 0, ¼ → +1, ½ → 0, ¾ → −1.
 *
 * Es beginnt bei null und nicht am Scheitel, damit der Anstieg der Hüllkurve nichts mehr
 * glätten muss, was schon glatt ist. Zwei Nulldurchgänge pro Periode, exakt — darauf stützt
 * sich die Frequenzmessung im Test.
 */
function triangle(phase: number): number {
  const p = phase - Math.floor(phase);
  if (p < 0.25) return 4 * p;
  if (p < 0.75) return 2 - 4 * p;
  return 4 * p - 4;
}

/**
 * Einen Ton in die Bytes schreiben: `slot` Abtastwerte ab `at`, davon die letzten still.
 *
 * Alles, was danach noch im Zeitfenster übrig ist, bleibt null — der Puffer kommt genullt, es
 * gibt also nichts zu schreiben. Genau deshalb braucht eine Pause hier keinen eigenen Zweig.
 */
function writeVoice(bytes: Uint8Array, at: number, frequency: number, slot: number): void {
  const gap = Math.min(Math.round(GAP_SECONDS * SAMPLE_RATE), Math.floor(slot * GAP_SHARE));
  const voiced = slot - gap;
  if (voiced <= 0) return;
  const attack = Math.min(
    Math.round(ATTACK_SECONDS * SAMPLE_RATE),
    Math.floor(voiced * ATTACK_SHARE),
  );
  const release = Math.min(
    Math.round(RELEASE_SECONDS * SAMPLE_RATE),
    Math.floor(voiced * RELEASE_SHARE),
  );
  const sustainEnd = voiced - release;
  const step = frequency / SAMPLE_RATE;
  for (let i = 0; i < voiced; i++) {
    let gain = 1;
    if (attack > 0 && i < attack) gain = i / attack;
    else if (release > 0 && i >= sustainEnd) gain = (voiced - i) / release;
    writeI16(bytes, at + i * BYTES_PER_SAMPLE, Math.round(triangle(i * step) * gain * AMPLITUDE));
  }
}

/**
 * Die ganze Zeile als fertige WAV-Datei, Base64 kodiert.
 *
 * Die Taktstriche klingen nicht: zwischen zwei Takten steht keine zusätzliche Pause, denn ein
 * Taktstrich ist eine Lesehilfe und keine Dauer. Eine Pause dort einzufügen hieße, dem Kind
 * einen Rhythmus vorzuspielen, der nicht geschrieben steht.
 *
 * Eine leere Zeile ergibt eine gültige, leere Datei und keinen Wurf — „Anhören" bei nichts
 * Geschriebenem ist Stille, kein Fehler.
 */
export function wavOfLine(bars: StaffBars, tempo: number): string {
  const elements = bars.flat();
  const slots = elements.map((el) => samplesOf(el, tempo));
  const total = slots.reduce((sum, n) => sum + n, 0);
  const bytes = wavBuffer(total);
  let at = HEADER_BYTES;
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i] as StaffElement;
    const slot = slots[i] as number;
    if (el.el === 'note') writeVoice(bytes, at, frequencyOf(el.pitch), slot);
    at += slot * BYTES_PER_SAMPLE;
  }
  return base64Of(bytes);
}

/**
 * Ein einzelner Ton zum Antippen — eine Viertelnote im Standardtempo.
 *
 * Also 0,75 Sekunden, und zwar abgeleitet und nicht erfunden: wer eine Linie antippt, soll genau
 * das hören, was dieselbe Note in einer Zeile klingt. Eine eigene Länge für die Vorschau wäre
 * eine zweite Wahrheit über denselben Ton.
 */
export function wavOfPitch(pitch: Pitch): string {
  const slot = slotSamples(TICKS_PER_QUARTER, TEMPO_DEFAULT);
  const bytes = wavBuffer(slot);
  writeVoice(bytes, HEADER_BYTES, frequencyOf(pitch), slot);
  return base64Of(bytes);
}

// ─────────────── der Kopf und die Bytes ───────────────

/** Ein genullter Puffer mit fertigem RIFF/WAVE-Kopf und Platz für `samples` Abtastwerte. */
function wavBuffer(samples: number): Uint8Array {
  const dataBytes = samples * BYTES_PER_SAMPLE;
  const bytes = new Uint8Array(HEADER_BYTES + dataBytes);
  writeAscii(bytes, 0, 'RIFF');
  // Alles nach diesem Feld, also die Gesamtgröße minus die acht Byte `RIFF` + Größe.
  writeU32(bytes, 4, HEADER_BYTES - 8 + dataBytes);
  writeAscii(bytes, 8, 'WAVE');
  writeAscii(bytes, 12, 'fmt ');
  writeU32(bytes, 16, 16); // Länge des fmt-Blocks für unkomprimiertes PCM
  writeU16(bytes, 20, 1); // 1 = PCM, ohne Kompression
  writeU16(bytes, 22, CHANNELS);
  writeU32(bytes, 24, SAMPLE_RATE);
  writeU32(bytes, 28, SAMPLE_RATE * BYTES_PER_SAMPLE); // byteRate
  writeU16(bytes, 32, BYTES_PER_SAMPLE); // blockAlign
  writeU16(bytes, 34, BITS_PER_SAMPLE);
  writeAscii(bytes, 36, 'data');
  writeU32(bytes, 40, dataBytes);
  return bytes;
}

function writeAscii(bytes: Uint8Array, at: number, text: string): void {
  for (let i = 0; i < text.length; i++) bytes[at + i] = text.charCodeAt(i) & 0x7f;
}

function writeU32(bytes: Uint8Array, at: number, value: number): void {
  bytes[at] = value & 0xff;
  bytes[at + 1] = (value >>> 8) & 0xff;
  bytes[at + 2] = (value >>> 16) & 0xff;
  bytes[at + 3] = (value >>> 24) & 0xff;
}

function writeU16(bytes: Uint8Array, at: number, value: number): void {
  bytes[at] = value & 0xff;
  bytes[at + 1] = (value >>> 8) & 0xff;
}

/**
 * Ein Abtastwert, 16 Bit, **little endian** — Byte für Byte und nicht über eine `Int16Array`.
 *
 * Eine `Int16Array` schreibt in der Reihenfolge des Prozessors. Dass ARM und x86 beide little
 * endian sind, ist wahr und trotzdem kein Grund: WAV schreibt little endian vor, also wird
 * little endian geschrieben. Negative Zahlen kommen dabei von selbst richtig heraus, weil `&`
 * und `>>` in JavaScript auf dem Zweierkomplement arbeiten.
 */
function writeI16(bytes: Uint8Array, at: number, value: number): void {
  bytes[at] = value & 0xff;
  bytes[at + 1] = (value >> 8) & 0xff;
}

/**
 * Die 64 Zeichen von RFC 4648 — der Base64-Standard, den jeder Player und jede `data:`-URI
 * erwartet (also mit `+` und `/`, nicht die URL-Variante).
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Bytes als Base64 — selbst gerechnet, mit Absicht.
 *
 * `Buffer` gibt es nur in Node: in Hermes existiert es nicht, im Browser auch nicht. `btoa` gibt
 * es im Browser, aber nicht verlässlich in Hermes (es kommt erst mit einem Polyfill), und es
 * nimmt eine Zeichenkette — man müsste also erst aus hunderttausenden Bytes einen „binary
 * string" bauen, um ihn gleich wieder zu zerlegen. Beides hieße: der Code, den der Node-Test
 * prüft, ist nicht der Code, der auf dem Telefon läuft. Diese zwanzig Zeilen laufen überall
 * gleich, und damit beweist der Test das, was ausgeliefert wird.
 *
 * Drei Bytes werden zu vier Zeichen; was am Ende fehlt, wird mit `=` auf ein Vielfaches von
 * vier gebracht.
 */
function base64Of(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n =
      ((bytes[i] as number) << 16) | ((bytes[i + 1] as number) << 8) | (bytes[i + 2] as number);
    out +=
      ALPHABET.charAt((n >>> 18) & 63) +
      ALPHABET.charAt((n >>> 12) & 63) +
      ALPHABET.charAt((n >>> 6) & 63) +
      ALPHABET.charAt(n & 63);
  }
  const left = bytes.length - i;
  if (left === 1) {
    const n = (bytes[i] as number) << 16;
    out += `${ALPHABET.charAt((n >>> 18) & 63)}${ALPHABET.charAt((n >>> 12) & 63)}==`;
  } else if (left === 2) {
    const n = ((bytes[i] as number) << 16) | ((bytes[i + 1] as number) << 8);
    out += `${ALPHABET.charAt((n >>> 18) & 63)}${ALPHABET.charAt((n >>> 12) & 63)}${ALPHABET.charAt(
      (n >>> 6) & 63,
    )}=`;
  }
  return out;
}
