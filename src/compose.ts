export interface Frame {
  id: string;
  name: string;
  file: string;
  /** window corners: top-left, top-right, bottom-right, bottom-left (canvas px) */
  quad: [number, number][];
}
export interface Manifest {
  canvas: { width: number; height: number };
  frames: Frame[];
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

const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Width / height of the frame window (measured along the quad's own axes). */
export function windowAspect(f: Frame) {
  return dist(f.quad[0], f.quad[1]) / dist(f.quad[0], f.quad[3]);
}

/** Crop a source canvas to the window aspect (cover, centered). */
export function cropToAspect(src: HTMLCanvasElement, aspect: number): HTMLCanvasElement {
  const sw = src.width, sh = src.height;
  let cw = sw, ch = sh;
  if (sw / sh > aspect) cw = sh * aspect;
  else ch = sw / aspect;
  const out = document.createElement('canvas');
  out.width = Math.round(cw);
  out.height = Math.round(ch);
  out.getContext('2d')!.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, out.width, out.height);
  return out;
}

/** Selfie goes under the frame art, mapped onto the (possibly tilted) window quad. */
export async function composeFrame(m: Manifest, f: Frame, shot: HTMLCanvasElement): Promise<HTMLCanvasElement> {
  const { width, height } = m.canvas;
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffd0e8';
  g.fillRect(0, 0, width, height);

  const [tl, tr, , bl] = f.quad;
  const w = dist(tl, tr), h = dist(tl, bl);
  // Slightly oversize so the frame art hides the seams.
  const pad = 6;
  g.save();
  g.setTransform((tr[0] - tl[0]) / w, (tr[1] - tl[1]) / w, (bl[0] - tl[0]) / h, (bl[1] - tl[1]) / h, tl[0], tl[1]);
  g.drawImage(shot, -pad, -pad, w + pad * 2, h + pad * 2);
  g.restore();

  g.drawImage(await loadImage(f.file), 0, 0, width, height);
  return c;
}
