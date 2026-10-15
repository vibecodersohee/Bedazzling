import './style.css';
import * as THREE from 'three';
import { CONFIG } from './config';
import { Tracker } from './tracking';
import { Stage } from './stage';
import { COLORS, GemLayer, SHAPES, Shape, Gem, makeGem, resolveColor, shapeOutline, SizeKey } from './gems';
import { HandGestures } from './hand';
import { Audio, TRACKS } from './audio';
import { Background, LayoutKey, Manifest, assetUrl, composeStrip, cropToAspect, loadManifest } from './compose';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const video = $<HTMLVideoElement>('video');
const stageEl = $('stage');
const glCanvas = $<HTMLCanvasElement>('gl');
const fx = $<HTMLCanvasElement>('fx');
const fxg = fx.getContext('2d')!;
const audio = new Audio();

type Phase = 'landing' | 'check' | 'guide' | 'decorate' | 'setup' | 'capture' | 'result' | 'error';
type Tool = 'gem' | 'brush' | 'eraser';
let phase: Phase = 'landing';
let tool: Tool = 'gem';
const sel = { shape: 'round' as Shape, color: 'hot', size: 'medium' as SizeKey };

let stage: Stage;
let layer: GemLayer;
let tracker: Tracker;
let gestures: HandGestures;
let manifest: Manifest;
let VW = CONFIG.video.width;
let VH = CONFIG.video.height;

let gems: Gem[] = [];
let falling: Gem[] = [];
const history: (() => void)[] = [];
let drag: { gem: Gem; existing: boolean; prev?: { mode: Gem['mode']; tri: number; b: [number, number, number] } } | null = null;
let stroke: number[] | null = null;
let strokeSource: 'hand' | 'mouse' | null = null;
let lastTrail: THREE.Vector3 | null = null;
let pointer = { x: -1, y: -1, valid: false };
let erasing = false;

// ---------------------------------------------------------------- helpers
const tmp = new THREE.Vector3();
const tmpN = new THREE.Vector3();
const rand = (a: number, b: number) => a + Math.random() * (b - a);

function show(id: string, on: boolean) {
  $(id).classList.toggle('hidden', !on);
}
let lcdOverride = '';
let lcdUntil = 0;
function say(text: string, ms = 2500) {
  lcdOverride = text;
  lcdUntil = performance.now() + ms;
}
function showError(title: string, body: string) {
  phase = 'error';
  $('errTitle').textContent = title;
  $('errBody').textContent = body;
  setPhase('error');
}

function setPhase(p: Phase) {
  phase = p;
  const dec = p === 'decorate';
  show('landing', p === 'landing');
  show('check', p === 'check');
  show('guide', p === 'guide');
  show('setup', p === 'setup');
  show('result', p === 'result');
  show('error', p === 'error');
  show('toolbar', dec);
  show('tray', dec);
  show('lcd', dec || p === 'check');
  $('check').classList.toggle('clear', true);
  if (p === 'capture') say('', 0);
  $('cropmask').style.display = p === 'capture' ? 'block' : 'none';
}

// ---------------------------------------------------------------- layout
function layout() {
  const s = Math.min(innerWidth / VW, innerHeight / VH);
  stageEl.style.width = VW * s + 'px';
  stageEl.style.height = VH * s + 'px';
  fx.width = Math.round(VW * s);
  fx.height = Math.round(VH * s);
  stage?.updateRect();
  if (phase === 'capture') placeCropMask();
}
addEventListener('resize', layout);

function placeCropMask() {
  const w = currentWindows()[0];
  const a = w.w / w.h;
  const r = stage.rect;
  let cw = r.width, ch = r.height;
  if (r.width / r.height > a) cw = r.height * a;
  else ch = r.width / a;
  const m = $('cropmask');
  m.style.width = cw + 'px';
  m.style.height = ch + 'px';
  m.style.left = (r.width - cw) / 2 + 'px';
  m.style.top = (r.height - ch) / 2 + 'px';
}

// ---------------------------------------------------------------- tray UI
function gemSvg(shape: Shape, colorKey: string, idx: number): string {
  const hex = COLORS[colorKey].hex;
  const css = '#' + hex.toString(16).padStart(6, '0');
  const stops =
    colorKey === 'rainbow'
      ? '<stop offset="0" stop-color="#ff6ec7"/><stop offset=".35" stop-color="#6bbcff"/><stop offset=".7" stop-color="#ffcf4d"/><stop offset="1" stop-color="#b98aff"/>'
      : `<stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="${css}"/><stop offset="1" stop-color="${css}" stop-opacity=".7"/>`;
  const id = 'g' + idx;
  const poly = (pts: [number, number][], dy: number) => pts.map(([x, y]) => `${(x * 17 + 20).toFixed(1)},${(dy - y * 17).toFixed(1)}`).join(' ');
  let body = '';
  if (shape === 'round') body = '<circle cx="20" cy="20" r="14"/>';
  else if (shape === 'teardrop') body = '<path d="M20 4C23 12 32 18 32 26a12 12 0 0 1-24 0C8 18 17 12 20 4Z"/>';
  else if (shape === 'star') body = `<polygon points="${poly(shapeOutline('star'), 21)}"/>`;
  else body = `<polygon points="${poly(shapeOutline('heart'), 22)}"/>`;
  return `<svg viewBox="0 0 40 40"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient></defs><g fill="url(#${id})" stroke="#fff" stroke-width="1.6" stroke-linejoin="round">${body}</g><circle cx="15" cy="14" r="2.6" fill="#fff" opacity=".85"/></svg>`;
}
function buildTray() {
  const sg = $('shapeGrid');
  SHAPES.forEach((sh, i) => {
    const b = document.createElement('button');
    b.className = 'gemBtn';
    b.dataset.shape = sh;
    b.title = sh;
    b.dataset.i = String(i);
    sg.appendChild(b);
  });
  const cg = $('colorGrid');
  for (const c of Object.keys(COLORS)) {
    const b = document.createElement('button');
    b.className = 'colBtn';
    b.dataset.color = c;
    b.title = COLORS[c].label;
    b.style.background =
      c === 'rainbow' ? 'linear-gradient(135deg,#ff6ec7,#6bbcff,#ffcf4d,#b98aff)' : '#' + COLORS[c].hex.toString(16).padStart(6, '0');
    cg.appendChild(b);
  }
  markTray();
}
function markTray() {
  document.querySelectorAll<HTMLElement>('.gemBtn').forEach((b, i) => {
    b.innerHTML = gemSvg(b.dataset.shape as Shape, sel.color, i);
    b.classList.toggle('on', b.dataset.shape === sel.shape);
  });
  document.querySelectorAll<HTMLElement>('.colBtn').forEach((b) => b.classList.toggle('on', b.dataset.color === sel.color));
  document.querySelectorAll<HTMLElement>('[data-size]').forEach((b) => b.classList.toggle('on', b.dataset.size === sel.size));
}
const TOOL_HINT: Record<Tool, string> = {
  gem: 'Gem: pinch a gem on the right, drop it on your face',
  brush: 'Brush: point with one finger (or drag the mouse) over your face',
  eraser: 'Eraser: pinch gems on your face to remove them',
};
function setTool(t: Tool) {
  tool = t;
  if (phase === 'decorate') say(TOOL_HINT[t], 3500);
  document.querySelectorAll<HTMLElement>('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
}

// ---------------------------------------------------------------- gems
const sizePx = (k: string) => CONFIG.gems.sizesPx[k];
const total = () => gems.length + (drag ? 1 : 0);
function capReached() {
  if (total() >= CONFIG.gems.max) {
    say('Fully bedazzled! Remove a gem to add more.');
    return true;
  }
  return false;
}
function snapToFace(g: Gem, sx: number, sy: number): boolean {
  stage.screenToWorld(sx, sy, tmp);
  const h = stage.hitFace(tmp.x, tmp.y);
  if (h) {
    g.mode = 'anchored';
    g.tri = h.tri;
    g.b = h.b;
    return true;
  }
  g.mode = 'free';
  g.pos.set(tmp.x, tmp.y, 300);
  return false;
}
function gemScreen(g: Gem): [number, number] {
  if (g.mode === 'anchored') stage.anchorPos(g, 0, tmp, tmpN);
  else tmp.copy(g.pos);
  return stage.worldToScreen(tmp);
}
function gemAt(sx: number, sy: number): Gem | null {
  let best: Gem | null = null;
  let bd = 1e9;
  for (const g of gems) {
    const [x, y] = gemScreen(g);
    const r = Math.max(g.rel * stage.faceWidth * stage.pxScale * 0.5, 12) + 10;
    const d = Math.hypot(x - sx, y - sy);
    if (d < r && d < bd) { bd = d; best = g; }
  }
  return best;
}
function removeGem(g: Gem, record = true) {
  const i = gems.indexOf(g);
  if (i < 0) return;
  gems.splice(i, 1);
  burstAt(g);
  if (record) {
    const prev = { mode: g.mode, tri: g.tri, b: g.b, pos: g.pos.clone() };
    history.push(() => { Object.assign(g, prev, { lift: false }); gems.push(g); });
  }
}
function burstAt(g: Gem) {
  const c = new THREE.Vector3();
  if (g.mode === 'anchored') stage.anchorPos(g, 0, c, tmpN);
  else c.copy(g.pos);
  stage.burst(c, 6, g.color);
  audio.sparkle();
}
function undo() {
  const f = history.pop();
  if (f) f();
  else say('Nothing to undo');
}

// ---------------------------------------------------------------- brush
function trailPoint(sx: number, sy: number) {
  stage.screenToWorld(sx, sy, tmp);
  const hit = stage.hitFace(tmp.x, tmp.y);
  if (!hit) { lastTrail = null; return; }
  const spacing = CONFIG.gems.trailSpacing * stage.faceWidth * rand(0.8, 1.4);
  if (lastTrail && Math.hypot(lastTrail.x - tmp.x, lastTrail.y - tmp.y) < spacing) return;
  if (total() >= CONFIG.gems.max) return;
  lastTrail = tmp.clone();
  const jx = tmp.x + rand(-1, 1) * spacing * 0.3, jy = tmp.y + rand(-1, 1) * spacing * 0.3;
  const h = stage.hitFace(jx, jy) ?? hit;
  const g = makeGem(Math.random() < 0.8 ? 'round' : 'teardrop', Math.random() < 0.2 ? sizePx('medium') : rand(5, 11), resolveColor(sel.color));
  g.mode = 'anchored';
  g.tri = h.tri;
  g.b = h.b;
  gems.push(g);
  stroke?.push(g.id);
}
function endStroke() {
  if (stroke && stroke.length) {
    const ids = new Set(stroke);
    history.push(() => { gems = gems.filter((g) => !ids.has(g.id)); });
  }
  stroke = null;
  strokeSource = null;
  lastTrail = null;
}

// ---------------------------------------------------------------- pointer logic (mouse + hand share this)
function overUI(el: Element | null) {
  return !!el?.closest('.panel, #lcd, button, .screen');
}
/** Nearest button within a forgiving radius, so pinches don't need pixel accuracy. */
function targetAt(x: number, y: number): Element | null {
  const el = document.elementFromPoint(x, y);
  if (el?.closest('button')) return el;
  let best: Element | null = null;
  let bd = 36;
  document.querySelectorAll<HTMLElement>('#toolbar button, #tray button, .screen:not(.hidden) button').forEach((b) => {
    if (b.offsetParent === null) return;
    const r = b.getBoundingClientRect();
    const d = Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
    if (d < bd) { bd = d; best = b; }
  });
  return best ?? el;
}
function press(x: number, y: number, source: 'mouse' | 'hand') {
  const el = source === 'hand' ? targetAt(x, y) : document.elementFromPoint(x, y);
  const colBtn = el?.closest<HTMLElement>('[data-color]');
  if (colBtn) {
    sel.color = colBtn.dataset.color!;
    markTray();
    say(COLORS[sel.color].label + ' selected', 1800);
    return;
  }
  const gemBtn = el?.closest<HTMLElement>('[data-shape]');
  if (gemBtn) {
    sel.shape = gemBtn.dataset.shape as Shape;
    markTray();
    if (phase !== 'decorate' || tool === 'brush') return;
    if (tool === 'eraser') setTool('gem');
    if (capReached()) return;
    const g = makeGem(sel.shape, sizePx(sel.size), resolveColor(sel.color));
    g.lift = true;
    snapToFace(g, x, y);
    drag = { gem: g, existing: false };
    return;
  }
  if (source === 'hand') {
    const b = el?.closest<HTMLElement>('button');
    if (b) { b.click(); return; }
    const hv = document.elementFromPoint(x, y);
    if (hv && overUI(hv)) return;
  }
  if (phase !== 'decorate' || overUI(document.elementFromPoint(x, y))) return;
  const hit = gemAt(x, y);
  if (tool === 'eraser') {
    erasing = true;
    if (hit) removeGem(hit);
    return;
  }
  if (hit) {
    gems.splice(gems.indexOf(hit), 1);
    drag = { gem: hit, existing: true, prev: { mode: hit.mode, tri: hit.tri, b: hit.b } };
    hit.lift = true;
    return;
  }
  if (tool === 'brush') {
      stroke = [];
      strokeSource = source;
      trailPoint(x, y);
  }
}
function move(x: number, y: number) {
  if (drag) snapToFace(drag.gem, x, y);
  else if (erasing) {
    const g = gemAt(x, y);
    if (g) removeGem(g);
  } else if (stroke && strokeSource) trailPoint(x, y);
}
function release() {
  erasing = false;
  if (stroke && strokeSource === 'mouse') endStroke();
  if (!drag) return;
  const { gem, existing, prev } = drag;
  drag = null;
  gem.lift = false;
  if (gem.mode === 'anchored') {
    gems.push(gem);
    burstAt(gem);
    if (existing && prev) history.push(() => { gems = gems.filter((g) => g !== gem); gem.mode = prev.mode; gem.tri = prev.tri; gem.b = prev.b; gems.push(gem); });
    else history.push(() => { gems = gems.filter((g) => g !== gem); });
  } else if (existing && prev) {
    // dragged off the face: pop
    burstAt(gem);
    history.push(() => { gem.mode = prev.mode; gem.tri = prev.tri; gem.b = prev.b; gems.push(gem); });
  }
}

addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  pointer = { x: e.clientX, y: e.clientY, valid: true };
  const el = e.target as Element;
  if (el.closest('button:not([data-shape]):not([data-color])')) return; // native click handles it
  if (phase === 'decorate') press(e.clientX, e.clientY, 'mouse');
});
addEventListener('pointermove', (e) => {
  pointer = { x: e.clientX, y: e.clientY, valid: true };
  if (phase === 'decorate' && !handDriving) move(e.clientX, e.clientY);
});
addEventListener('pointerup', () => { if (!handDriving) release(); });
addEventListener('contextmenu', (e) => {
  if (phase !== 'decorate') return;
  e.preventDefault();
  const g = gemAt(e.clientX, e.clientY);
  if (g) removeGem(g);
});
addEventListener('keydown', (e) => {
  if (phase !== 'decorate') return;
  if (e.key.toLowerCase() === 'z') undo();
  if (e.key === 'Enter') finishDecorate();
});

// ---------------------------------------------------------------- selfie flow
let selLayout: LayoutKey = '1';
let selBg: Background;
let shots: HTMLCanvasElement[] = [];
let busy = false;
const currentWindows = () => selBg.windows[selLayout];

function finishDecorate() {
  if (phase !== 'decorate') return;
  if (drag) release();
  if (stroke) endStroke();
  setPhase('setup');
  buildSetup();
}
function buildSetup() {
  const lp = $('layoutPick');
  lp.innerHTML = '';
  (Object.keys(manifest.layouts) as LayoutKey[]).forEach((k) => {
    const b = document.createElement('button');
    b.className = 'opt' + (k === selLayout ? ' on' : '');
    b.textContent = manifest.layouts[k].label;
    b.onclick = () => { selLayout = k; buildSetup(); };
    lp.appendChild(b);
  });
  const bp = $('bgPick');
  bp.innerHTML = '';
  manifest.backgrounds.forEach((bg) => {
    const b = document.createElement('button');
    b.className = 'opt' + (bg === selBg ? ' on' : '');
    b.innerHTML = `<img src="${assetUrl(bg.thumb)}" alt=""/>${bg.name}`;
    b.onclick = () => { selBg = bg; buildSetup(); };
    bp.appendChild(b);
  });
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runCapture(indices: number[]) {
  if (busy) return;
  busy = true;
  setPhase('capture');
  placeCropMask();
  const cd = $('countdown');
  audio.duck(true);
  cd.style.fontSize = '5vmin';
  cd.textContent = 'Lower your hand…';
  await sleep(1400);
  cd.style.fontSize = '';
  for (let n = 0; n < indices.length; n++) {
    const i = indices[n];
    for (let s = CONFIG.capture.countdownSeconds; s > 0; s--) {
      cd.textContent = String(s);
      audio.tick();
      await sleep(1000);
    }
    cd.textContent = '';
    audio.shutter();
    const w = currentWindows()[i];
    stage.render(0);
    shots[i] = cropToAspect(stage.canvas, w.w / w.h);
    const f = $('flash');
    f.classList.add('go');
    requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('go')));
    if (n < indices.length - 1) {
      cd.style.fontSize = '5vmin';
      cd.textContent = 'Next pose!';
      await sleep(CONFIG.capture.pauseBetweenMs);
      cd.style.fontSize = '';
    }
  }
  audio.duck(false);
  await showResult();
  busy = false;
}
let finalCanvas: HTMLCanvasElement | null = null;
async function showResult() {
  finalCanvas = await composeStrip(manifest, selBg, selLayout, shots);
  ($('resultImg') as HTMLImageElement).src = finalCanvas.toDataURL('image/png');
  const two = selLayout === '2';
  show('retake1', two);
  show('retake2', two);
  setPhase('result');
}
const allIdx = () => currentWindows().map((_, i) => i);
$('takePhoto').onclick = () => { shots = []; runCapture(allIdx()); };
$('setupBack').onclick = () => setPhase('decorate');
$('retake').onclick = () => runCapture(allIdx());
$('retake1').onclick = () => runCapture([0]);
$('retake2').onclick = () => runCapture([1]);
$('backDecor').onclick = () => setPhase('decorate');
$('startOver').onclick = () => { gems = []; falling = []; history.length = 0; setPhase('decorate'); };
$('save').onclick = () => {
  if (!finalCanvas) return;
  const a = document.createElement('a');
  a.href = finalCanvas.toDataURL('image/png');
  a.download = `bedazzle-booth-${Date.now()}.png`;
  a.click();
  say('Saved. You look unreal.');
};

// ---------------------------------------------------------------- toolbar wiring
document.querySelectorAll<HTMLElement>('[data-tool]').forEach((b) => (b.onclick = () => setTool(b.dataset.tool as Tool)));
document.querySelectorAll<HTMLElement>('[data-size]').forEach(
  (b) => (b.onclick = () => { sel.size = b.dataset.size as SizeKey; markTray(); }),
);
$('undo').onclick = undo;
$('done').onclick = finishDecorate;

// ---------------------------------------------------------------- music UI
const trackSel = $<HTMLSelectElement>('trackSel');
TRACKS.forEach((t, i) => trackSel.add(new Option(t.name, String(i))));
const musicOn = $<HTMLInputElement>('musicOn');
try {
  const saved = sessionStorage.getItem('bb-music');
  if (saved) { const m = JSON.parse(saved); musicOn.checked = m.on; trackSel.value = String(m.track); audio.track = m.track; }
} catch { /* ignore */ }
function applyMusic() {
  audio.setTrack(+trackSel.value);
  audio.setOn(musicOn.checked);
  $('musicBtn').classList.toggle('off', !musicOn.checked);
  try { sessionStorage.setItem('bb-music', JSON.stringify({ on: musicOn.checked, track: +trackSel.value })); } catch { /* ignore */ }
}
musicOn.onchange = applyMusic;
trackSel.onchange = applyMusic;
$('musicBtn').onclick = () => {
  musicOn.checked = !musicOn.checked;
  applyMusic();
};
$('musicBtn').classList.toggle('off', !musicOn.checked);

// ---------------------------------------------------------------- boot
let handDriving = false;
let wasPinch = false;
let dwellEl: HTMLElement | null = null;
let dwellStart = 0;
let dwellDone: HTMLElement | null = null;
let faceOK = false;
let lastFaceT = 0;
let lastVT = -1;
let lastNow = performance.now();
let fps = 30;
let frameNo = 0;
let checkOkSince = 0;
let skipHand = false;
let checkStart = 0;
let started = false;

$('skipHand').onclick = () => { skipHand = true; };

$('start').onclick = async () => {
  if (started) return;
  started = true;
  applyMusic();
  if (!navigator.mediaDevices?.getUserMedia) {
    return showError('Browser not supported', 'Please use a recent version of Chrome, Edge, Safari or Firefox on a desktop computer (and open this page over HTTPS or localhost).');
  }
  setPhase('check');
  $('checkTitle').textContent = 'Starting camera…';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false });
    video.srcObject = stream;
    await video.play();
  } catch {
    return showError('Camera is blocked', 'Bedazzle Booth needs your webcam. Click the camera icon in your browser address bar, allow access, then try again. Nothing is uploaded; all processing stays on your device.');
  }
  VW = video.videoWidth || CONFIG.video.width;
  VH = video.videoHeight || CONFIG.video.height;
  $('checkTitle').textContent = 'Loading trackers…';
  try {
    manifest = await loadManifest();
    selBg = manifest.backgrounds[0];
    stage = new Stage(glCanvas, video, VW, VH);
    layer = new GemLayer(stage.scene);
    tracker = new Tracker();
    await tracker.init();
    stage.setTriangles(tracker.triangles);
  } catch (e) {
    console.error(e);
    return showError('Could not load trackers', 'The face and hand models failed to load. Check your connection and try again.');
  }
  gestures = new HandGestures(VW / VH);
  buildTray();
  layout();
  checkStart = performance.now();
  $('checkTitle').textContent = 'Show your face, then raise a hand';
  requestAnimationFrame(frame);
};

let guideSeen = false;
try { guideSeen = !!sessionStorage.getItem('bb-guide'); } catch { /* ignore */ }
function openGuide() {
  setPhase('guide');
}
function closeGuide() {
  guideSeen = true;
  try { sessionStorage.setItem('bb-guide', '1'); } catch { /* ignore */ }
  setPhase('decorate');
  say('Pinch a gem, drag it onto your face, let go.', 4000);
}
function enterDecorate() {
  if (guideSeen) closeGuide();
  else openGuide();
}
$('guideOk').onclick = closeGuide;
$('help').onclick = openGuide;
function lightGuide(hs: ReturnType<HandGestures['update']>, now: number) {
  const on: Record<string, boolean> = {
    'gc-pinch': hs.pinching, 'gc-point': hs.pointing, 'gc-fist': hs.fist,
    'gc-thumb': hs.thumbsUpProgress > 0,
  };
  for (const k in on) $(k).classList.toggle('live', on[k]);
}

function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastNow) / 1000, 0.1);
  lastNow = now;
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;

  // tracking
  let handPresent = false;
  if (video.readyState >= 2 && video.currentTime !== lastVT) {
    lastVT = video.currentTime;
    const r = tracker.detect(video, now, ++frameNo % 2 === 0);
    if (r.face) {
      stage.setFace(r.face);
      lastFaceT = now;
    }
    const hs = gestures.update(r.hand, now);
    handPresent = hs.present;
    if (phase === 'decorate' || phase === 'setup' || phase === 'result' || phase === 'guide') handleHand(hs);
    if (phase === 'guide') lightGuide(hs, now);
    else $('cursor').classList.add('hidden');
  }
  faceOK = now - lastFaceT < CONFIG.face.lostMs && lastFaceT > 0;
  if (!handPresent) handPresent = gestures.state.present;

  // phase: tracking check
  if (phase === 'check') {
    const chkF = $('chkFace'), chkH = $('chkHand');
    chkF.classList.toggle('ok', faceOK);
    chkF.querySelector('b')!.textContent = faceOK ? 'OK' : 'waiting';
    chkH.classList.toggle('ok', handPresent || skipHand);
    chkH.querySelector('b')!.textContent = skipHand ? 'mouse mode' : handPresent ? 'OK' : 'waiting';
    show('skipHand', now - checkStart > 6000 && !skipHand);
    if (faceOK && (handPresent || skipHand)) {
      if (!checkOkSince) checkOkSince = now;
      if (now - checkOkSince > 800) enterDecorate();
    } else checkOkSince = 0;
  }

  // falling gems (after snap)
  for (let i = falling.length - 1; i >= 0; i--) {
    const g = falling[i];
    g.life += dt;
    g.vel.y -= 900 * dt;
    g.pos.addScaledVector(g.vel, dt);
    if (g.life > 1.4) falling.splice(i, 1);
  }

  // LCD
  if (phase === 'decorate') {
    let text = lcdOverride && now < lcdUntil ? lcdOverride : '';
    if (!text) text = !faceOK ? 'Show your face' : !gestures.state.present ? 'Raise a hand · or use the mouse' : `${gems.length} gems · ${Math.round(fps)} fps`;
    $('lcdText').textContent = text;
    const p = gestures.state.thumbsUpProgress;
    $('thumbBar').style.display = p > 0 ? 'block' : 'none';
    ($('thumbBar').firstElementChild as HTMLElement).style.width = p * 100 + '%';
  }

  // render
  const list = drag ? gems.concat(falling, drag.gem) : gems.concat(falling);
  layer.update(list, stage);
  stage.render(dt);
}

function handleHand(hs: ReturnType<HandGestures['update']>) {
  const cur = $('cursor');
  handDriving = hs.present;
  if (!hs.present) {
    cur.classList.add('hidden');
    if (wasPinch) { release(); wasPinch = false; }
    if (strokeSource === 'hand') endStroke();
    return;
  }
  const r = stage.rect;
  const px = Math.min(Math.max(r.left + hs.x * r.width, 0), innerWidth);
  const py = Math.min(Math.max(r.top + hs.y * r.height, 0), innerHeight);
  pointer = { x: px, y: py, valid: true };
  cur.classList.remove('hidden');
  cur.classList.toggle('pinch', hs.pinching);
  cur.style.left = px + 'px';
  cur.style.top = py + 'px';

  // hover highlight
  document.querySelectorAll('.hover').forEach((e) => e.classList.remove('hover'));
  targetAt(px, py)?.closest('button')?.classList.add('hover');

  // Dwell: hold the cursor over a button (no pinch needed) to press it.
  const tgt = (targetAt(px, py)?.closest('button') as HTMLElement | null) ?? null;
  if (tgt !== dwellEl) { dwellEl = tgt; dwellStart = performance.now(); }
  if (dwellDone && tgt !== dwellDone) dwellDone = null;
  let prog = 0;
  if (tgt && !tgt.dataset.shape && !hs.pinching && tgt !== dwellDone) {
    prog = Math.min(1, (performance.now() - dwellStart) / CONFIG.gestures.dwellMs);
    if (prog >= 1) { dwellDone = tgt; prog = 0; press(px, py, 'hand'); }
  }
  cur.style.setProperty('--p', String(prog));

  if (hs.pinching && !wasPinch) {
    if (tgt) dwellDone = tgt; // a pinch-press must not be followed by a dwell-press
    press(px, py, 'hand');
  } else if (hs.pinching) move(px, py);
  else if (wasPinch) release();
  wasPinch = hs.pinching;

  if (phase !== 'decorate') return;
  // freehand trail while pointing
  if (tool === 'brush' && hs.pointing && !hs.pinching) {
    if (!stroke) { stroke = []; strokeSource = 'hand'; }
    if (strokeSource === 'hand') trailPoint(px, py);
  } else if (strokeSource === 'hand') endStroke();

  for (const ev of hs.events) {
    if (ev === 'undo') undo();
    else if (ev === 'done') finishDecorate();
  }
}

setPhase('landing');
layout();
