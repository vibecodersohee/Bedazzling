import './style.css';
import * as THREE from 'three';
import { CONFIG } from './config';
import { Tracker } from './tracking';
import { Stage } from './stage';
import { COLORS, GemLayer, SHAPES, Shape, Gem, makeGem, resolveColor, SizeKey } from './gems';
import { HandGestures } from './hand';
import { Audio, TRACKS } from './audio';
import { Frame, Manifest, composeFrame, cropToAspect, loadManifest, windowAspect } from './compose';
import iconUndo from 'pixelarticons/svg/undo.svg?raw';
import iconHelp from 'pixelarticons/svg/circle-question.svg?raw';
import iconTrash from 'pixelarticons/svg/trash.svg?raw';
import iconEraser from 'pixelarticons/svg/eraser.svg?raw';
import iconBrush from 'pixelarticons/svg/brush.svg?raw';
import iconGem from 'pixelarticons/svg/diamond-gem.svg?raw';
import iconVolOn from 'pixelarticons/svg/volume-2.svg?raw';
import iconVolOff from 'pixelarticons/svg/volume-x.svg?raw';
import iconUp from 'pixelarticons/svg/chevron-up.svg?raw';
import iconDown from 'pixelarticons/svg/chevron-down.svg?raw';
import iconCheckbox from 'pixelarticons/svg/checkbox.svg?raw';
import iconCheckboxOn from 'pixelarticons/svg/checkbox-on.svg?raw';
import iconCamera from 'pixelarticons/svg/camera.svg?raw';
import iconHeart from 'pixelarticons/svg/heart.svg?raw';
import iconCircle from 'pixelarticons/svg/circle.svg?raw';
import iconStar from 'pixelarticons/svg/star.svg?raw';
import iconSparkle from 'pixelarticons/svg/sparkle.svg?raw';

const ICONS: Record<string, string> = {
  undo: iconUndo, 'circle-question': iconHelp, trash: iconTrash, eraser: iconEraser, brush: iconBrush, 'diamond-gem': iconGem,
  'volume-2': iconVolOn, 'volume-x': iconVolOff, 'chevron-up': iconUp, 'chevron-down': iconDown, checkbox: iconCheckbox,
  'checkbox-on': iconCheckboxOn, camera: iconCamera, heart: iconHeart, circle: iconCircle, star: iconStar, sparkle: iconSparkle,
};
function injectIcons(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-icon]').forEach((el) => {
    el.innerHTML = ICONS[el.dataset.icon!] ?? '';
  });
}
injectIcons();

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const video = $<HTMLVideoElement>('video');
const appEl = $('app');
const stageEl = $('stage');
const glCanvas = $<HTMLCanvasElement>('gl');
const audio = new Audio();

type Phase = 'landing' | 'check' | 'guide' | 'decorate' | 'setup' | 'capture' | 'result' | 'error';
type Tool = 'gem' | 'brush' | 'eraser';
let phase: Phase = 'landing';
let tool: Tool = 'gem';
const sel = { shape: 'round' as Shape, color: 'pink', size: 'medium' as SizeKey };

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
  show('landing', p === 'landing');
  show('check', p === 'check');
  show('guide', p === 'guide');
  show('setup', p === 'setup');
  show('result', p === 'result');
  show('error', p === 'error');
  show('hud', p === 'decorate');
  if (p === 'decorate') updateChevrons();
  show('musicBtn', p !== 'landing' && p !== 'capture' && p !== 'error');
  $('cropmask').style.display = p === 'capture' ? 'block' : 'none';
  if (p !== 'capture') $('countdown').textContent = '';
}

// ---------------------------------------------------------------- layout (1920x1080 design space, scaled to fit)
function layout() {
  // UI is authored at 1920x1080 and scaled to fit; the app box then grows to fill the whole window.
  const s = Math.min(innerWidth / 1920, innerHeight / 1080);
  const aw = innerWidth / s, ah = innerHeight / s;
  appEl.style.setProperty('--s', String(s));
  appEl.style.width = aw + 'px';
  appEl.style.height = ah + 'px';
  // camera covers the whole screen (edges that don't fit are cropped)
  const f = Math.max(aw / VW, ah / VH);
  stageEl.style.width = VW * f + 'px';
  stageEl.style.height = VH * f + 'px';
  stageEl.style.left = (aw - VW * f) / 2 + 'px';
  stageEl.style.top = (ah - VH * f) / 2 + 'px';
  stage?.updateRect();
  if (phase === 'capture') placeCropMask();
}
addEventListener('resize', layout);

function placeCropMask() {
  if (!selFrame) return;
  const a = windowAspect(selFrame);
  const W = stageEl.offsetWidth, H = stageEl.offsetHeight;
  let cw = W, ch = H;
  if (W / H > a) cw = H * a;
  else ch = W / a;
  const m = $('cropmask');
  m.style.width = cw + 'px';
  m.style.height = ch + 'px';
  m.style.left = (W - cw) / 2 + 'px';
  m.style.top = (H - ch) / 2 + 'px';
}

// ---------------------------------------------------------------- tray UI
const SHAPE_ICON: Record<Shape, string> = { round: 'circle', sparkle: 'sparkle', heart: 'heart', star: 'star' };
const COLOR_KEYS = Object.keys(COLORS);
function buildTray() {
  const sg = $('shapeGrid');
  SHAPES.forEach((sh) => {
    const b = document.createElement('button');
    b.className = 'gembtn';
    b.dataset.shape = sh;
    b.title = sh;
    b.innerHTML = `<i data-icon="${SHAPE_ICON[sh]}"></i>`;
    sg.appendChild(b);
  });
  const cl = $('colorList');
  for (const c of COLOR_KEYS) {
    const b = document.createElement('button');
    b.className = 'colbtn';
    b.dataset.color = c;
    b.title = COLORS[c].label;
    b.innerHTML = `<b style="background:#${COLORS[c].hex.toString(16).padStart(6, '0')}"></b>`;
    cl.appendChild(b);
  }
  injectIcons(sg);
  markTray();
}
function scrollColorIntoView() {
  const list = $('colorList');
  const b = list.querySelector<HTMLElement>('.colbtn.on');
  if (b) list.scrollTo({ top: b.offsetTop - list.offsetTop - list.clientHeight / 2 + 24, behavior: 'smooth' });
}
function markTray() {
  document.querySelectorAll<HTMLElement>('.gembtn').forEach((b) => b.classList.toggle('on', b.dataset.shape === sel.shape));
  document.querySelectorAll<HTMLElement>('.colbtn').forEach((b) => b.classList.toggle('on', b.dataset.color === sel.color));
  document.querySelectorAll<HTMLElement>('[data-size]').forEach((b) => b.classList.toggle('on', b.dataset.size === sel.size));
  scrollColorIntoView();
}
function updateChevrons() {
  const l = $('colorList');
  ($('colUp') as HTMLButtonElement).disabled = l.scrollTop <= 1;
  ($('colDown') as HTMLButtonElement).disabled = l.scrollTop + l.clientHeight >= l.scrollHeight - 2;
}
$('colorList').addEventListener('scroll', updateChevrons);
$('colUp').onclick = () => $('colorList').scrollBy({ top: -180, behavior: 'smooth' });
$('colDown').onclick = () => $('colorList').scrollBy({ top: 180, behavior: 'smooth' });
const TOOL_HINT: Record<Tool, string> = {
  gem: 'Pinch a gem, drop it on your face',
  brush: 'Point (or drag) over your face',
  eraser: 'Pinch a gem to remove it',
};
function setTool(t: Tool) {
  tool = t;
  show('gemPanel', t !== 'brush'); // the brush scatters its own gems, so no gem picker
  if (phase === 'decorate') say(TOOL_HINT[t], 3000);
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
function gemAt(sx: number, sy: number, extra = 0): Gem | null {
  let best: Gem | null = null;
  let bd = 1e9;
  for (const g of gems) {
    const [x, y] = gemScreen(g);
    const r = Math.max(g.rel * stage.faceWidth * stage.pxScale * 0.5, 12) + 10 + extra;
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
function cycleColor(d: number) {
  const i = (COLOR_KEYS.indexOf(sel.color) + d + COLOR_KEYS.length) % COLOR_KEYS.length;
  sel.color = COLOR_KEYS[i];
  markTray();
  say(COLORS[sel.color].label, 1500);
  audio.sparkle();
}
function clearAll() {
  if (drag || !gems.length) { say('Nothing to clear'); return; }
  const old = gems;
  gems = [];
  stage.burst(new THREE.Vector3(0, 0, 0), 12);
  audio.sparkle();
  history.push(() => { gems = old.concat(gems); });
  say('Cleared. Undo brings them back', 3500);
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
  const g = makeGem(Math.random() < 0.8 ? 'round' : 'sparkle', Math.random() < 0.2 ? sizePx('medium') : rand(5, 11), resolveColor(sel.color));
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
  document.querySelectorAll<HTMLElement>('#hud button, #musicBtn, .screen:not(.hidden) button').forEach((b) => {
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
    if (phase !== 'decorate') return;
    if (tool !== 'gem') setTool('gem'); // picking a gem always switches to the Gem tool
    if (capReached()) return;
    const g = makeGem(sel.shape, sizePx(sel.size), resolveColor(sel.color));
    g.lift = true;
    snapToFace(g, x, y);
    drag = { gem: g, existing: false };
    audio.grab();
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
    const eh = gemAt(x, y, 10);
    if (eh) removeGem(eh);
    return;
  }
  if (hit) {
    gems.splice(gems.indexOf(hit), 1);
    drag = { gem: hit, existing: true, prev: { mode: hit.mode, tri: hit.tri, b: hit.b } };
    hit.lift = true;
    audio.grab();
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
    const g = gemAt(x, y, 10);
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
  if (e.key === 'ArrowDown') cycleColor(1);
  if (e.key === 'ArrowUp') cycleColor(-1);
});

// ---------------------------------------------------------------- selfie flow
let selFrame: Frame | null = null;
let busy = false;

function finishDecorate() {
  if (phase !== 'decorate') return;
  if (drag) release();
  if (stroke) endStroke();
  setPhase('setup');
  buildSetup();
}
function buildSetup() {
  const fp = $('framePick');
  fp.innerHTML = '';
  manifest.frames.forEach((f) => {
    const b = document.createElement('button');
    b.className = 'btn sq grey' + (f === selFrame ? ' on' : '');
    b.innerHTML = `<i data-icon="camera"></i><span>${f.name}</span>`;
    b.onclick = () => { selFrame = f; buildSetup(); };
    fp.appendChild(b);
  });
  injectIcons(fp);
  ($('takePhoto') as HTMLButtonElement).disabled = !selFrame;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let finalCanvas: HTMLCanvasElement | null = null;

async function runCapture() {
  if (busy || !selFrame) return;
  busy = true;
  setPhase('capture');
  placeCropMask();
  const cd = $('countdown');
  audio.duck(true);
  cd.classList.add('msg');
  cd.textContent = 'Lower your hand…';
  await sleep(1400);
  cd.classList.remove('msg');
  for (let s = CONFIG.capture.countdownSeconds; s > 0; s--) {
    cd.textContent = String(s);
    audio.tick();
    await sleep(1000);
  }
  cd.textContent = '';
  audio.shutter();
  stage.render(0);
  const shot = cropToAspect(stage.canvas, windowAspect(selFrame));
  const f = $('flash');
  f.classList.add('go');
  requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('go')));
  audio.duck(false);
  finalCanvas = await composeFrame(manifest, selFrame, shot);
  ($('resultImg') as HTMLImageElement).src = finalCanvas.toDataURL('image/png');
  setPhase('result');
  busy = false;
}
$('takePhoto').onclick = runCapture;
$('setupBack').onclick = () => setPhase('decorate');
$('retake').onclick = runCapture;
$('backDecor').onclick = () => setPhase('decorate');
$('save').onclick = () => {
  if (!finalCanvas) return;
  const a = document.createElement('a');
  a.href = finalCanvas.toDataURL('image/png');
  a.download = `bedazzle-booth-${Date.now()}.png`;
  a.click();
};

// ---------------------------------------------------------------- toolbar wiring
document.querySelectorAll<HTMLElement>('[data-tool]').forEach((b) => (b.onclick = () => setTool(b.dataset.tool as Tool)));
document.querySelectorAll<HTMLElement>('[data-size]').forEach(
  (b) => (b.onclick = () => { sel.size = b.dataset.size as SizeKey; markTray(); }),
);
// brief "pressed" flash for any button activation (mouse or hand)
document.addEventListener('click', (e) => {
  const b = (e.target as Element).closest<HTMLElement>('.btn:not(.on)');
  if (!b) return;
  b.classList.add('pressed');
  setTimeout(() => b.classList.remove('pressed'), 280);
});
$('undo').onclick = undo;
$('clearAll').onclick = clearAll;
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
  updateMusicBtn();
  try { sessionStorage.setItem('bb-music', JSON.stringify({ on: musicOn.checked, track: +trackSel.value })); } catch { /* ignore */ }
}
musicOn.onchange = applyMusic;
trackSel.onchange = applyMusic;
$('musicBtn').onclick = () => {
  musicOn.checked = !musicOn.checked;
  applyMusic();
};
function updateMusicBtn() {
  const b = $('musicBtn');
  b.classList.toggle('off', !musicOn.checked);
  b.innerHTML = `<i data-icon="${musicOn.checked ? 'volume-2' : 'volume-x'}"></i><span>${musicOn.checked ? 'On' : 'Off'}</span>`;
  injectIcons(b);
}
updateMusicBtn();

// ---------------------------------------------------------------- boot
let handDriving = false;
let wasPinch = false;
let pinchUsed = false;
let dwellEl: HTMLButtonElement | null = null;
let dwellStart = 0;
let dwellSeen = 0;
let dwellDone: HTMLButtonElement | null = null;
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
let swipeFlash = 0;
function lightGuide(hs: ReturnType<HandGestures['update']>, now: number) {
  if (hs.events.some((e) => e === 'swipeUp' || e === 'swipeDown')) swipeFlash = now + 800;
  const on: Record<string, boolean> = {
    'gc-tool': !!document.querySelector('.btn.hover'),
    'gc-pinch': hs.pinching, 'gc-point': hs.pointing, 'gc-fist': hs.fist,
    'gc-thumb': hs.thumbsUpProgress > 0, 'gc-swipe': now < swipeFlash,
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
    if (!text) text = !faceOK ? 'Show your face' : !gestures.state.present ? 'Raise a hand or use the mouse' : '';
    $('lcdText').textContent = text;
    const p = gestures.state.thumbsUpProgress;
    $('lcd').classList.toggle('hidden', !text && p <= 0); // nothing to say: hide the tooltip
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

  // Dwell: hold the cursor over ANY button (no pinch needed) to press it.
  const nowMs = performance.now();
  let tgt = (targetAt(px, py)?.closest('button') as HTMLButtonElement | null) ?? null;
  if (tgt?.disabled) tgt = null;
  if (tgt) dwellSeen = nowMs;
  else if (dwellEl && nowMs - dwellSeen < 250) tgt = dwellEl; // forgive brief jitter off the edge
  if (tgt !== dwellEl) { dwellEl = tgt; dwellStart = nowMs; }
  if (dwellDone && tgt !== dwellDone) dwellDone = null;
  let prog = 0;
  if (tgt && !drag && !stroke && tgt !== dwellDone) {
    prog = Math.min(1, (nowMs - dwellStart) / CONFIG.gestures.dwellMs);
    if (prog >= 1) {
      dwellDone = tgt;
      prog = 0;
      if (tgt.dataset.shape) { // gem shapes: dwell selects (dragging a gem needs a pinch)
        sel.shape = tgt.dataset.shape as Shape;
        markTray();
        say('Pinch and drag to place it', 2500);
      } else press(px, py, 'hand');
    }
  }
  cur.style.setProperty('--p', String(prog));

  if (hs.pinching && !wasPinch) {
    if (tgt) dwellDone = tgt; // a pinch-press must not be followed by a dwell-press
    press(px, py, 'hand');
    pinchUsed = !!(drag || stroke || erasing || tgt);
  } else if (hs.pinching) {
    // Pinch started elsewhere and slid onto a gem (or button): still grab it.
    if (!pinchUsed && !drag && tgt && !tgt.disabled) {
      dwellDone = tgt;
      press(px, py, 'hand');
      pinchUsed = true;
    } else move(px, py);
  } else {
    if (wasPinch) release();
    pinchUsed = false;
  }
  wasPinch = hs.pinching;

  if (phase !== 'decorate') return;
  // freehand trail while pointing
  // eraser: just point (or pinch) at gems, no click needed
  if (tool === 'eraser' && (hs.pointing || hs.pinching)) {
    const g = gemAt(px, py, 18);
    if (g) removeGem(g);
  }
  if (tool === 'brush' && hs.pointing && !hs.pinching) {
    if (!stroke) { stroke = []; strokeSource = 'hand'; }
    if (strokeSource === 'hand') trailPoint(px, py);
  } else if (strokeSource === 'hand') endStroke();

  for (const ev of hs.events) {
    if (ev === 'undo') undo();
    else if (ev === 'done') finishDecorate();
    else if (ev === 'swipeDown') cycleColor(1);
    else if (ev === 'swipeUp') cycleColor(-1);
  }
}

setPhase('landing');
layout();

// Design QA: open a screen without the camera, e.g. /?screen=decorate
const demo = new URLSearchParams(location.search).get('screen') as Phase | null;
if (demo) {
  loadManifest().then((m) => {
    manifest = m;
    buildTray();
    selFrame = m.frames[0];
    if (demo === 'setup') buildSetup();
    if (demo === 'result') {
      ($('resultImg') as HTMLImageElement).src = '/assets/frames/phone.png';
    }
    setPhase(demo);
    layout();
  });
}

// ---------------------------------------------------------------- debug panel (press D, or add ?debug)
const dbgEl = document.createElement('pre');
dbgEl.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2000;margin:0;padding:8px 10px;background:rgba(0,0,0,.75);color:#7CFF9B;font:13px/1.4 monospace;border-radius:6px;pointer-events:none;display:none';
document.body.appendChild(dbgEl);
let dbgOn = new URLSearchParams(location.search).has('debug');
addEventListener('keydown', (e) => { if (e.key.toLowerCase() === 'd') dbgOn = !dbgOn; });
setInterval(() => {
  dbgEl.style.display = dbgOn ? 'block' : 'none';
  if (!dbgOn || !gestures) return;
  const h = gestures.state, d = gestures.dbg;
  const G = CONFIG.gestures;
  const bar = (v: number) => '#'.repeat(Math.max(0, Math.min(20, Math.round(v * 20)))).padEnd(20, '.');
  dbgEl.textContent =
    `hand     ${h.present ? 'yes' : 'NO'}\n` +
    `pinch    ${d.pinchD.toFixed(2)}  [${bar(d.pinchD)}]\n` +
    `engage<  ${G.pinchEngage}   release>  ${G.pinchRelease}\n` +
    `PINCHING ${h.pinching ? 'YES' : 'no'}   fistLike ${d.fistLike ? 'yes' : 'no'}   index ${d.idx.toFixed(2)}\n` +
    `pointing ${h.pointing ? 'yes' : 'no'}   tool ${tool}   holding ${drag ? 'GEM' : 'no'}\n` +
    `cursor   ${Math.round(pointer.x)},${Math.round(pointer.y)}   fps ${Math.round(fps)}`;
}, 100);
