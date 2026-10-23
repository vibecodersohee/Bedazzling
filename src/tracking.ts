import { FaceLandmarker, HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { CONFIG } from './config';
import { OneEuroArray } from './oneEuro';

export const FACE_POINTS = 468;
export interface TrackResult {
  face: Float32Array | null; // 468*3 normalized x,y,z (smoothed)
  hand: Float32Array | null; // 21*3
}

export class Tracker {
  private face!: FaceLandmarker;
  private hand!: HandLandmarker;
  private faceF = new OneEuroArray(FACE_POINTS * 3, CONFIG.smoothing.face.minCutoff, CONFIG.smoothing.face.beta, CONFIG.smoothing.face.dCutoff);
  private handF = new OneEuroArray(21 * 3, CONFIG.smoothing.hand.minCutoff, CONFIG.smoothing.hand.beta);
  private lastFace = 0;
  private lastHand = 0;
  private lastHandOut: Float32Array | null = null;
  private buf = new Float32Array(FACE_POINTS * 3);
  private hbuf = new Float32Array(21 * 3);
  /** Triangle indices derived from the tessellation edges. */
  triangles!: Uint16Array;

  async init() {
    const fileset = await FilesetResolver.forVisionTasks(CONFIG.models.wasm);
    const make = async (delegate: 'GPU' | 'CPU') => {
      const face = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: CONFIG.models.face, delegate },
        runningMode: 'VIDEO',
        numFaces: 2,
      });
      const hand = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: CONFIG.models.hand, delegate },
        runningMode: 'VIDEO',
        numHands: 1,
      });
      return { face, hand };
    };
    try {
      ({ face: this.face, hand: this.hand } = await make('GPU'));
    } catch {
      ({ face: this.face, hand: this.hand } = await make('CPU'));
    }
    this.triangles = buildTriangles(FaceLandmarker.FACE_LANDMARKS_TESSELATION);
  }

  detect(video: HTMLVideoElement, nowMs: number, runHand = true): TrackResult {
    const t = nowMs / 1000;
    let face: Float32Array | null = null;
    let hand: Float32Array | null = null;

    const fr = this.face.detectForVideo(video, nowMs);
    if (fr.faceLandmarks.length) {
      // largest face wins
      let best = fr.faceLandmarks[0];
      let bestW = 0;
      for (const f of fr.faceLandmarks) {
        let mn = 1, mx = 0;
        for (let i = 0; i < FACE_POINTS; i++) {
          mn = Math.min(mn, f[i].x);
          mx = Math.max(mx, f[i].x);
        }
        if (mx - mn > bestW) { bestW = mx - mn; best = f; }
      }
      if (nowMs - this.lastFace > 500) this.faceF.reset();
      this.lastFace = nowMs;
      for (let i = 0; i < FACE_POINTS; i++) {
        this.buf[i * 3] = best[i].x;
        this.buf[i * 3 + 1] = best[i].y;
        this.buf[i * 3 + 2] = best[i].z;
      }
      face = this.faceF.filter(this.buf, t);
    }

    if (!runHand) return { face, hand: this.lastHandOut };
    const hr = this.hand.detectForVideo(video, nowMs);
    if (hr.landmarks.length) {
      const h = hr.landmarks[0];
      if (nowMs - this.lastHand > 300) this.handF.reset();
      this.lastHand = nowMs;
      for (let i = 0; i < 21; i++) {
        this.hbuf[i * 3] = h[i].x;
        this.hbuf[i * 3 + 1] = h[i].y;
        this.hbuf[i * 3 + 2] = h[i].z;
      }
      hand = this.handF.filter(this.hbuf, t);
    } else if (this.lastHandOut && nowMs - this.lastHand < CONFIG.gestures.handLostGraceMs) {
      // Pinching often hides fingers for a frame or two: keep the last pose instead of dropping the grab.
      hand = this.lastHandOut;
    }
    this.lastHandOut = hand;
    return { face, hand };
  }
}

/** Every 3-clique in the tessellation edge graph is a mesh triangle. */
function buildTriangles(edges: { start: number; end: number }[]): Uint16Array {
  const adj: Set<number>[] = Array.from({ length: FACE_POINTS }, () => new Set());
  for (const { start, end } of edges) {
    if (start < FACE_POINTS && end < FACE_POINTS) {
      adj[start].add(end);
      adj[end].add(start);
    }
  }
  const out: number[] = [];
  for (let a = 0; a < FACE_POINTS; a++) {
    for (const b of adj[a]) {
      if (b <= a) continue;
      for (const c of adj[b]) {
        if (c <= b) continue;
        if (adj[a].has(c)) out.push(a, b, c);
      }
    }
  }
  return new Uint16Array(out);
}
