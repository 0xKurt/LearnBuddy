#!/usr/bin/env node
// LearnBuddy promo renderer: scenes.json + a screen recording of the app (webm) + optional
// voice-over WAVs → 1080×1920 H.264/AAC MP4.
//
//   node render.mjs --scenes ../scenes.json --shots ../shots --out ../out/learnbuddy-promo-{lang}.mp4 --lang de
//   node render.mjs --scenes ../scenes.json --shots ../shots --lang all --out ../out/promo-{lang}.mp4
//   node render.mjs --scenes ../scenes.json --shots ../shots --lang de --preview
//
// Options
//   --scenes <file>     scenes.json (required)
//   --shots <dir>       folder the recording and audio paths in scenes.json are relative to
//                       (default: the folder of scenes.json)
//   --lang <code|all>   language block to render (default: the only one, else "de")
//   --out <file.mp4>    output; "{lang}" is replaced by the language code
//   --fps <n>           frame rate (default 30)
//   --preview           only one PNG per segment (intro, middle of every scene, outro) → render/preview/<lang>/
//   --at <s,s,…>        also write PNGs at these film times (seconds) → render/preview/<lang>/
//   --workers <n>       parallel browser pages (default 2)
//   --keep-frames       keep render/frames/ after encoding
//
// The film is a pure function of time: page.html gets the plan built here and window.seek(t) sets
// the state of time t. Frames are screenshots of seek(i / fps); ffmpeg encodes them and mixes the
// voice-over: "audio" per intro/scene/outro is one file or a list (mp3 or wav), the files of a list
// play in order with 350 ms between them, starting 250 ms into the segment. A segment lasts at
// least its audio + 600 ms; a scene longer than its clip section holds the section's last frame.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const FFMPEG = process.env.FFMPEG || (fs.existsSync('/usr/local/bin/ffmpeg') ? '/usr/local/bin/ffmpeg' : 'ffmpeg');
const FFPROBE = process.env.FFPROBE || (fs.existsSync('/usr/local/bin/ffprobe') ? '/usr/local/bin/ffprobe' : 'ffprobe');
const ICON = path.resolve(HERE, '../../apps/mobile/assets/icon.png');

const RULES = {
  introMinMs: 2500,     // intro = max(2.5 s, audio + 0.6 s)
  outroMinMs: 3500,     // outro = max(3.5 s, audio + 0.6 s), its last 0.4 s fade to the background
  outroFadeMs: 400,
  audioPadMs: 600,      // a segment lasts at least its audio + 600 ms …
  audioLeadMs: 250,     // … and its audio starts 250 ms after the segment starts
  audioGapMs: 350,      // pause between the files of one segment ("audio": [a.mp3, b.mp3])
};

class UserError extends Error {}
const fail = (msg) => { throw new UserError(msg); };

// ---- arguments ------------------------------------------------------------------------------
function parseArgs(argv) {
  const flags = new Set(['--preview', '--keep-frames']);
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) fail(`Unbekanntes Argument: ${a}`);
    if (flags.has(a)) { o[a.slice(2)] = true; continue; }
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) fail(`${a} braucht einen Wert`);
    o[a.slice(2)] = v; i++;
  }
  return o;
}

// ---- tools ----------------------------------------------------------------------------------
function run(cmd, args, what) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) fail(`${what}: ${cmd} nicht ausführbar (${r.error.message})`);
  if (r.status !== 0) fail(`${what} fehlgeschlagen:\n${(r.stderr || '').trim().split('\n').slice(-12).join('\n')}`);
  return r.stdout;
}
function probe(file) {
  return JSON.parse(run(FFPROBE, ['-v', 'error', '-show_entries',
    'stream=index,codec_type,codec_name,width,height,r_frame_rate,pix_fmt,nb_frames,duration,sample_rate,channels:format=duration',
    '-of', 'json', file], `ffprobe ${file}`));
}
function audioPart(file, where) {
  if (!fs.existsSync(file)) fail(`Audio fehlt: ${file} (${where})`);
  const p = probe(file);
  const a = (p.streams || []).find((s) => s.codec_type === 'audio');
  if (!a) fail(`Keine Audiospur in ${file} (${where})`);
  const sec = Number(a.duration ?? p.format?.duration);
  if (!Number.isFinite(sec) || sec <= 0) fail(`Audiodauer nicht lesbar: ${file} (${where})`);
  return { file, ms: sec * 1000 };
}
// `audio` is one file or a list of files (mp3/wav), played one after another with a pause.
function audioInfo(files, where) {
  const parts = files.map((f) => audioPart(f, where));
  let at = 0;
  for (const p of parts) { p.offsetMs = at; at += p.ms + RULES.audioGapMs; }
  return { parts, ms: at - RULES.audioGapMs };
}

// ---- scenes.json ----------------------------------------------------------------------------
function loadScenes(file) {
  if (!fs.existsSync(file)) fail(`scenes.json nicht gefunden: ${file}`);
  let j;
  try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { fail(`scenes.json ist kein gültiges JSON (${file}): ${e.message}`); }
  if (!j.languages) j = { ...j, languages: { de: j } }; // a single-language file is accepted as "de"
  if (!Object.keys(j.languages).length) fail('scenes.json: "languages" ist leer');
  return j;
}

// Extracts the recording to JPEG frames at the film's fps (cached per file + fps).
function extractClip(video, fps, keep) {
  const st = fs.statSync(video);
  const key = crypto.createHash('sha1').update(`${video}|${st.size}|${st.mtimeMs}|${fps}`).digest('hex').slice(0, 12);
  const root = path.join(HERE, 'clip');
  const dir = path.join(root, key);
  keep.add(key);
  const stamp = path.join(dir, '.done.json');
  if (fs.existsSync(stamp)) return { ...JSON.parse(fs.readFileSync(stamp, 'utf8')), dir };
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  process.stdout.write(`  Aufnahme → Frames (${path.basename(video)}, ${fps} fps) … `);
  run(FFMPEG, ['-v', 'error', '-i', video, '-vf', `fps=${fps}`, '-q:v', '2', '-start_number', '1', path.join(dir, '%06d.jpg')], 'Frame-Extraktion');
  const count = fs.readdirSync(dir).filter((f) => f.endsWith('.jpg')).length;
  if (!count) fail(`Aus ${video} wurden keine Frames extrahiert`);
  const s = probe(path.join(dir, '000001.jpg')).streams[0];
  const info = { video, count, width: s.width, height: s.height, durationMs: (count * 1000) / fps };
  fs.writeFileSync(stamp, JSON.stringify(info));
  console.log(`${count} Frames, ${s.width}×${s.height}`);
  return { ...info, dir };
}

// The whole timeline, in frames, so every boundary sits on the frame grid and the film is exactly
// intro + Σ scenes + outro long.
function buildPlan(doc, lang, opts) {
  const L = doc.languages[lang];
  if (!L) fail(`Sprache "${lang}" fehlt in scenes.json (vorhanden: ${Object.keys(doc.languages).join(', ')})`);
  const fps = opts.fps, fms = 1000 / fps;
  const frames = (ms) => Math.ceil(ms / fms - 1e-6);
  const media = (p, dir) => (path.isAbsolute(p) ? p : path.resolve(dir, p));
  const where = (s) => `Sprache ${lang}, ${s}`;

  const recName = L.recording ?? doc.recording;
  if (!recName) fail(`Keine Aufnahme angegeben: "recording" fehlt (${where('Sprachebene')})`);
  const recording = media(recName, opts.shots);
  if (!fs.existsSync(recording)) fail(`Aufnahme nicht gefunden: ${recording} ("recording": "${recName}", relativ zu --shots ${opts.shots})`);
  const clip = extractClip(recording, fps, opts.keepClips);

  const aud = (a, w) => {
    if (a === undefined || a === null || (Array.isArray(a) && !a.length)) return null;
    const list = Array.isArray(a) ? a : [a];
    if (list.some((x) => typeof x !== 'string' || !x)) fail(`"audio" muss ein Pfad oder eine Liste von Pfaden sein (${where(w)})`);
    return audioInfo(list.map((x) => media(x, opts.audioDir)), where(w));
  };
  const intro = L.intro || {}, outro = L.outro || {};
  if (!Array.isArray(L.scenes) || !L.scenes.length) fail(`Keine Szenen (${where('"scenes"')})`);

  const segs = [];
  const introAudio = aud(intro.audio, 'Intro');
  segs.push({ kind: 'intro', label: 'Intro', frames: frames(Math.max(RULES.introMinMs, introAudio ? introAudio.ms + RULES.audioPadMs : 0)), audio: introAudio });
  const total = doc.counterTotal ?? L.counterTotal ?? L.scenes.length;
  L.scenes.forEach((s, i) => {
    const n = s.n ?? i + 1;
    const w = `Szene ${n}`;
    if (!s.headline) fail(`headline fehlt (${where(w)})`);
    if (!Number.isFinite(s.fromMs) || !Number.isFinite(s.toMs)) fail(`fromMs/toMs fehlen oder sind keine Zahlen (${where(w)})`);
    if (s.toMs <= s.fromMs) fail(`toMs (${s.toMs}) muss größer als fromMs (${s.fromMs}) sein (${where(w)})`);
    if (s.fromMs < 0 || s.toMs > clip.durationMs + fms) fail(`Clip-Abschnitt ${s.fromMs}–${s.toMs} ms liegt außerhalb der Aufnahme ${path.basename(recording)} (0–${Math.round(clip.durationMs)} ms) (${where(w)})`);
    const a = aud(s.audio, w);
    const clipMs = s.toMs - s.fromMs;
    const f = frames(Math.max(clipMs, a ? a.ms + RULES.audioPadMs : 0));
    segs.push({
      kind: 'scene', label: w, n, frames: f, audio: a, fromMs: s.fromMs, toMs: Math.min(s.toMs, clip.durationMs),
      headline: s.headline, caption: s.caption ?? '', counter: s.counter ?? `${n} / ${total}`,
      freezeMs: Math.max(0, f * fms - clipMs),
    });
  });
  const outroAudio = aud(outro.audio, 'Outro');
  segs.push({ kind: 'outro', label: 'Outro', frames: frames(Math.max(RULES.outroMinMs, outroAudio ? outroAudio.ms + RULES.audioPadMs : 0)), audio: outroAudio });

  let at = 0;
  for (const s of segs) { s.startFrame = at; at += s.frames; }
  const totalFrames = at;
  const sec = (f) => f / fps;
  const scenes = segs.filter((s) => s.kind === 'scene');
  const [si, so] = [segs[0], segs[segs.length - 1]];
  const plan = {
    lang, fps, totalFrames, totalMs: (totalFrames * 1000) / fps,
    orb: doc.orb === 'css' || !fs.existsSync(ICON) ? 'css' : 'icon',
    iconUrl: pathToFileURL(ICON).href,
    clip: { dirUrl: pathToFileURL(clip.dir).href + '/', count: clip.count, width: clip.width, height: clip.height },
    intro: { start: 0, dur: sec(si.frames), title: intro.title || 'LearnBuddy', sub: intro.sub || '' },
    outro: { start: sec(so.startFrame), dur: sec(so.frames), fade: RULES.outroFadeMs / 1000, wordmark: outro.wordmark || 'LearnBuddy', title: outro.title || '', sub: outro.sub || '' },
    scenes: scenes.map((s) => ({
      n: s.n, start: sec(s.startFrame), dur: sec(s.frames), fromMs: s.fromMs, toMs: s.toMs,
      clipStart: Math.min(clip.count - 1, Math.floor((s.fromMs * fps) / 1000 + 1e-4)),
      headline: s.headline, caption: s.caption, counter: s.counter,
    })),
  };
  const warnings = [];
  scenes.forEach((s) => { if (s.frames < fps * 1.2) warnings.push(`${s.label} ist nur ${(s.frames / fps).toFixed(2)} s lang — Text-Ein-/Ausblendung wirkt gedrängt.`); });
  for (let i = 1; i < scenes.length; i++) {
    const gap = scenes[i].fromMs - scenes[i - 1].toMs;
    if (Math.abs(gap) > fms) warnings.push(`Zwischen ${scenes[i - 1].label} und ${scenes[i].label} ${gap > 0 ? 'fehlen' : 'überlappen'} ${Math.abs(gap)} ms der Aufnahme (harter Schnitt im Phone).`);
  }
  return { plan, segs, clip, recording, warnings };
}

function printPlan({ plan, segs, clip, recording }) {
  const f = (x) => (x / plan.fps).toFixed(3).padStart(7);
  console.log(`\nSprache ${plan.lang} · Aufnahme ${path.basename(recording)} (${(clip.durationMs / 1000).toFixed(2)} s, ${clip.width}×${clip.height})`);
  console.log('  Segment     Start    Dauer   Clip [ms]      Audio');
  for (const s of segs) {
    const clipTxt = s.kind === 'scene' ? `${s.fromMs}–${s.toMs}`.padEnd(14) : '–'.padEnd(14);
    const a = s.audio ? `${s.audio.parts.map((p) => path.basename(p.file)).join(' + ')} ${(s.audio.ms / 1000).toFixed(2)} s ab +${RULES.audioLeadMs} ms` : 'stumm';
    const fr = s.freezeMs > 0.5 ? `  · Freeze ${(s.freezeMs / 1000).toFixed(2)} s` : '';
    console.log(`  ${s.label.padEnd(10)} ${f(s.startFrame)}  ${f(s.frames)}   ${clipTxt} ${a}${fr}`);
  }
  console.log(`  Gesamt ${(plan.totalMs / 1000).toFixed(3)} s = ${plan.totalFrames} Frames @ ${plan.fps} fps`);
}

// ---- browser ----------------------------------------------------------------------------------
async function openPage(browser, plan) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(pathToFileURL(path.join(HERE, 'page.html')).href);
  let info;
  try { info = await page.evaluate((p) => window.init(p), plan); } catch (e) { fail(`page.html init: ${e.message.split('\n')[0]}${errors.length ? '\n' + errors.join('\n') : ''}`); }
  return { page, info, errors };
}

async function seek(page, ms) {
  try { return await page.evaluate((t) => window.seek(t), ms); } catch (e) { fail(`seek(${ms.toFixed(1)}): ${e.message.split('\n')[0]}`); }
}

function cleanDir(dir, ext) {
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (f.endsWith(ext)) fs.rmSync(path.join(dir, f));
}

async function stills(browser, plan, times, dir) {
  const { page } = await openPage(browser, plan);
  for (const [name, ms] of times) {
    const t = Math.round((ms * plan.fps) / 1000) * (1000 / plan.fps); // on the frame grid, as in the film
    await seek(page, t);
    await page.screenshot({ path: path.join(dir, name), type: 'png' });
    console.log(`  ${path.join(path.relative(process.cwd(), dir), name)}  (t = ${(t / 1000).toFixed(3)} s)`);
  }
  await page.close();
}

async function renderFrames(browser, plan, framesDir, workers) {
  const n = plan.totalFrames;
  const per = Math.ceil(n / workers);
  let done = 0, lastLog = 0;
  const t0 = Date.now();
  const work = async (w) => {
    const a = w * per, b = Math.min(n, a + per);
    if (a >= b) return;
    const { page } = await openPage(browser, plan);
    for (let i = a; i < b; i++) {
      await seek(page, (i * 1000) / plan.fps);
      await page.screenshot({ path: path.join(framesDir, `f${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92 });
      done++;
      if (done - lastLog >= 60 || done === n) {
        lastLog = done;
        const el = (Date.now() - t0) / 1000;
        process.stdout.write(`\r  Frames ${done}/${n}  (${(done / el).toFixed(1)} fps, noch ~${Math.round(((n - done) * el) / done)} s)   `);
      }
    }
    await page.close();
  };
  await Promise.all(Array.from({ length: workers }, (_, w) => work(w)));
  process.stdout.write('\n');
}

// ---- encode + check -------------------------------------------------------------------------
function encode(plan, segs, framesDir, out) {
  const T = (plan.totalFrames / plan.fps).toFixed(6);
  const args = ['-y', '-v', 'error', '-framerate', String(plan.fps), '-start_number', '0', '-i', path.join(framesDir, 'f%05d.jpg')];
  // every audio file goes to its own start: segment start + 250 ms + the files before it + pauses
  const voiced = segs.flatMap((s) => (s.audio ? s.audio.parts.map((p) => ({ file: p.file, at: (s.startFrame * 1000) / plan.fps + RULES.audioLeadMs + p.offsetMs })) : []));
  const parts = [];
  if (voiced.length) {
    voiced.forEach((v, k) => {
      args.push('-i', v.file);
      parts.push(`[${k + 1}:a]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,adelay=delays=${Math.round(v.at)}:all=1[a${k}]`);
    });
    const ins = voiced.map((_, k) => `[a${k}]`).join('');
    parts.push(`${ins}amix=inputs=${voiced.length}:duration=longest:dropout_transition=0:normalize=0,apad=whole_dur=${T},atrim=end=${T},asetpts=N/SR/TB[aout]`);
  } else {
    args.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
    parts.push(`[1:a]atrim=end=${T},asetpts=N/SR/TB[aout]`);
  }
  args.push('-filter_complex', parts.join(';'), '-map', '0:v', '-map', '[aout]',
    // JPEG frames are BT.601 full range; convert to BT.709 limited range and tag it, so players
    // show the palette as the page drew it.
    // (measured against the palette: every token within ±1 level when decoded as BT.709/TV)
    '-vf', 'scale=out_range=tv:out_color_matrix=bt709:flags=accurate_rnd+full_chroma_int,format=yuv420p',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow', '-r', String(plan.fps),
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2',
    '-movflags', '+faststart', out);
  run(FFMPEG, args, 'ffmpeg-Encode');
}

function verify(plan, out) {
  const p = probe(out);
  const v = p.streams.find((s) => s.codec_type === 'video');
  const a = p.streams.find((s) => s.codec_type === 'audio');
  const expect = plan.totalFrames / plan.fps;
  const rows = [];
  const check = (name, ok, got) => rows.push({ name, ok, got });
  check('Video H.264 1080×1920', v && v.codec_name === 'h264' && v.width === 1080 && v.height === 1920, v ? `${v.codec_name} ${v.width}×${v.height}` : 'fehlt');
  check(`${plan.fps} fps`, v && v.r_frame_rate === `${plan.fps}/1`, v?.r_frame_rate);
  check('yuv420p', v && v.pix_fmt === 'yuv420p', v?.pix_fmt);
  check(`${plan.totalFrames} Frames`, v && Number(v.nb_frames) === plan.totalFrames, v?.nb_frames);
  check(`Videodauer ${expect.toFixed(3)} s`, v && Math.abs(Number(v.duration) - expect) < 0.0015, v?.duration);
  check('Audio AAC 48 kHz stereo', a && a.codec_name === 'aac' && a.sample_rate === '48000' && a.channels === 2, a ? `${a.codec_name} ${a.sample_rate} Hz ${a.channels} ch` : 'fehlt');
  check('Audiodauer = Videodauer (±25 ms)', a && Math.abs(Number(a.duration) - expect) <= 0.025, a?.duration);
  console.log(`  ffprobe ${path.basename(out)}:`);
  for (const r of rows) console.log(`    ${r.ok ? 'OK    ' : 'FEHLER'} ${r.name.padEnd(34)} ${r.got ?? ''}`);
  if (rows.some((r) => !r.ok)) fail(`ffprobe-Prüfung von ${out} fehlgeschlagen`);
}

// ---- main -----------------------------------------------------------------------------------
async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!o.scenes) fail('--scenes <scenes.json> fehlt');
  const scenesFile = path.resolve(o.scenes);
  const doc = loadScenes(scenesFile);
  const shots = path.resolve(o.shots ?? path.dirname(scenesFile));
  if (!fs.existsSync(shots)) fail(`--shots-Ordner nicht gefunden: ${shots}`);
  const fps = Number(o.fps ?? doc.fps ?? 30);
  if (!Number.isInteger(fps) || fps < 1 || fps > 120) fail(`--fps muss eine ganze Zahl sein (${o.fps})`);
  const langs = o.lang === 'all' ? Object.keys(doc.languages)
    : [o.lang ?? (Object.keys(doc.languages).length === 1 ? Object.keys(doc.languages)[0] : 'de')];
  const preview = !!o.preview;
  const atList = o.at ? String(o.at).split(',').map(Number) : [];
  if (atList.some((x) => !Number.isFinite(x))) fail(`--at erwartet Sekunden, kommagetrennt (${o.at})`);
  if (!preview && !atList.length && !o.out) fail('--out <datei.mp4> fehlt (oder --preview / --at)');
  if (o.out && !preview && langs.length > 1 && !o.out.includes('{lang}')) fail('Mehrere Sprachen: --out braucht den Platzhalter {lang}');
  const workers = Math.max(1, Number(o.workers ?? Math.min(2, os.cpus().length)));
  const keepClips = new Set();

  // Plans first: every missing file is reported before the first frame is drawn.
  const built = langs.map((lang) => buildPlan(doc, lang, { fps, shots, audioDir: path.resolve(o['audio-dir'] ?? shots), keepClips }));
  for (const b of built) { printPlan(b); for (const w of b.warnings) console.log(`  Hinweis: ${w}`); }
  // drop clip caches of recordings no longer in use
  const clipRoot = path.join(HERE, 'clip');
  for (const d of fs.existsSync(clipRoot) ? fs.readdirSync(clipRoot) : []) if (!keepClips.has(d)) fs.rmSync(path.join(clipRoot, d), { recursive: true, force: true });

  // The sandbox has `playwright` globally; in the repo the browser comes with @playwright/test.
  const { chromium } = (() => {
    for (const id of ['playwright', '@playwright/test']) {
      try {
        return require(id);
      } catch {
        /* next */
      }
    }
    return require(path.resolve(HERE, '../../node_modules/@playwright/test'));
  })();
  const browser = await chromium.launch(
    process.env.LB_CHROMIUM ? { executablePath: process.env.LB_CHROMIUM } : {},
  );
  try {
    for (const b of built) {
      const { plan, segs } = b;
      const probePage = await openPage(browser, plan);
      for (const w of probePage.info.warnings) console.log(`  Hinweis: ${w}`);
      for (const f of probePage.info.fits) console.log(`  Szene ${f.n}: Headline ${f.headlinePx}px, Caption ${f.captionPx}px / ${f.captionLines} Zeile(n)`);
      await probePage.page.close();

      if (preview || atList.length) {
        const dir = path.join(HERE, 'preview', plan.lang);
        cleanDir(dir, '.png');
        const times = [];
        if (preview) {
          times.push(['00-intro.png', Math.min(plan.intro.dur - 0.5, 1.6) * 1000]);
          plan.scenes.forEach((s, i) => times.push([`${String(i + 1).padStart(2, '0')}-szene-${s.n}.png`, (s.start + s.dur / 2) * 1000]));
          times.push(['99-outro.png', (plan.outro.start + Math.min(plan.outro.dur - plan.outro.fade - 0.3, 2.0)) * 1000]);
        }
        for (const s of atList) times.push([`at-${s.toFixed(3)}s.png`, s * 1000]);
        console.log(`  Previews → ${dir}`);
        await stills(browser, plan, times, dir);
        if (preview) continue;
      }
      if (!o.out) continue;

      const out = path.resolve(o.out.replaceAll('{lang}', plan.lang));
      fs.mkdirSync(path.dirname(out), { recursive: true });
      const framesDir = path.join(HERE, 'frames');
      cleanDir(framesDir, '.jpg');
      console.log(`  Rendere ${plan.totalFrames} Frames mit ${workers} Seite(n) …`);
      await renderFrames(browser, plan, framesDir, workers);
      console.log('  ffmpeg: H.264 + AAC …');
      encode(plan, segs, framesDir, out);
      verify(plan, out);
      if (!o['keep-frames']) cleanDir(framesDir, '.jpg');
      console.log(`  → ${out}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  if (e instanceof UserError) { console.error(`\nFehler: ${e.message}`); process.exit(2); }
  console.error(e); process.exit(1);
});
