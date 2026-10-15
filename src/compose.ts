export type LayoutKey = '1' | '2';
export interface Rect { x: number; y: number; w: number; h: number }
export interface Background {
  id: string;
  name: string;
  thumb: string;
  files: Record<LayoutKey, string>;
  windows: Record<LayoutKey, Rect[]>;
}
export interface Sticker {
  file: string;
  layout: LayoutKey;
  backgrounds: string[]; // empty = all
  x: number; y: number; w: number; h: number;
  rotate?: number;
}
export interface Manifest {
  layouts: Record<LayoutKey, { width: number; height: number; label: string }>;
  backgrounds: Background[];
  stickers: Sticker[];
}

const base = import.meta.env.BASE_URL + 'assets/';

export async function loadManifest(): Promise<Manifest> {
  const r = await fetch(base + 'manifest.json');
  return r.json();
}

const cache = new Map<string, Promise<HTMLImageElement>>();
function loadImage(file: string): Promise<HTMLImageElement> {
  let p = cache.get(file);
  if (!p) {
    p = new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('Could not load ' + file));
      i.src = base + file;
    });
    cache.set(file, p);
  }
  return p;
}
export const assetUrl = (file: string) => base + file;

/** Crop a source canvas to the window aspect (cover, centered). */
export function cropToAspect(src: HTMLCanvasElement | HTMLVideoElement, aspect: number): HTMLCanvasElement {
  const sw = src instanceof HTMLVideoElement ? src.videoWidth : src.width;
  const sh = src instanceof HTMLVideoElement ? src.videoHeight : src.height;
  let cw = sw, ch = sh;
  if (sw / sh > aspect) cw = sh * aspect;
  else ch = sw / aspect;
  const out = document.createElement('canvas');
  out.width = Math.round(cw);
  out.height = Math.round(ch);
  out.getContext('2d')!.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, out.width, out.height);
  return out;
}

export async function composeStrip(m: Manifest, bg: Background, layout: LayoutKey, shots: HTMLCanvasElement[]): Promise<HTMLCanvasElement> {
  const { width, height } = m.layouts[layout];
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffe3f1';
  g.fillRect(0, 0, width, height);
  try {
    g.drawImage(await loadImage(bg.files[layout]), 0, 0, width, height);
  } catch { /* placeholder missing: keep flat pink */ }
  bg.windows[layout].forEach((w, i) => {
    const s = shots[i];
    if (s) g.drawImage(s, w.x, w.y, w.w, w.h);
  });
  for (const st of m.stickers) {
    if (st.layout !== layout) continue;
    if (st.backgrounds.length && !st.backgrounds.includes(bg.id)) continue;
    try {
      const img = await loadImage(st.file);
      g.save();
      g.translate(st.x + st.w / 2, st.y + st.h / 2);
      g.rotate(((st.rotate ?? 0) * Math.PI) / 180);
      g.drawImage(img, -st.w / 2, -st.h / 2, st.w, st.h);
      g.restore();
    } catch { /* skip missing sticker */ }
  }
  return c;
}
