import { CONFIG } from './config';

export type HandEvent = 'undo' | 'done' | 'swipeUp' | 'swipeDown';
export interface HandState {
  present: boolean;
  /** Cursor in mirrored normalized image space (0..1). */
  x: number;
  y: number;
  pinching: boolean;
  pointing: boolean;
  fist: boolean;
  thumbsUpProgress: number; // 0..1
  events: HandEvent[];
}

const G = CONFIG.gestures;
const WRIST = 0;

export class HandGestures {
  state: HandState = { present: false, x: 0.5, y: 0.5, pinching: false, pointing: false, fist: false, thumbsUpProgress: 0, events: [] };
  /** live numbers for the debug panel */
  dbg = { pinchD: 0, fistLike: false, idx: 0, size: 0 };
  private pinching = false;
  private pointRawSince = 0;
  private fistSince = 0;
  private fistFired = false;
  private thumbSince = 0;
  private thumbFired = false;
  private lastUndo = -1e9;
  private trail: { t: number; x: number; y: number }[] = [];
  private lastSwipe = -1e9;
  constructor(private aspect: number) {}

  private d(l: Float32Array, i: number, j: number) {
    const dx = (l[i * 3] - l[j * 3]) * this.aspect;
    const dy = l[i * 3 + 1] - l[j * 3 + 1];
    return Math.hypot(dx, dy);
  }

  update(l: Float32Array | null, now: number): HandState {
    const s = this.state;
    s.events = [];
    if (!l) {
      s.present = false;
      s.pinching = this.pinching = false;
      s.pointing = false;
      s.fist = false;
      s.thumbsUpProgress = 0;
      this.pointRawSince = this.fistSince = this.thumbSince = 0;
      this.fistFired = this.thumbFired = false;
      return s;
    }
    s.present = true;

    const size = Math.max(this.d(l, WRIST, 9), 1e-4);
    const ratio = (tip: number, mcp: number) => this.d(l, tip, WRIST) / Math.max(this.d(l, mcp, WRIST), 1e-4);
    const idx = ratio(8, 5), mid = ratio(12, 9), ring = ratio(16, 13), pinky = ratio(20, 17);
    const curled = (r: number) => r < 1.25;
    const extended = (r: number) => r > 1.55;
    const allCurled = curled(idx) && curled(mid) && curled(ring) && curled(pinky);
    const thumbUp = (l[5 * 3 + 1] - l[4 * 3 + 1]) / size > 0.6;

    // Pinch with hysteresis. A fist must never read as a pinch.
    const pinchD = this.d(l, 4, 8) / size;
    // a real fist has the index tucked right in; a pinch keeps the index a bit out
    const fistLike = allCurled && idx < 1.1 && !thumbUp;
    if (this.pinching) {
      if (pinchD > G.pinchRelease) this.pinching = false;
    } else if (pinchD < G.pinchEngage && (!fistLike || pinchD < 0.3)) {
      this.pinching = true;
    }
    s.pinching = this.pinching;
    this.dbg = { pinchD, fistLike, idx, size };

    // Cursor: index fingertip, drifting to the thumb/index midpoint as a pinch closes (steadier grabbing).
    const w = Math.min(1, Math.max(0, (pinchD - 0.2) / 0.3));
    s.x = 1 - (l[8 * 3] * w + ((l[8 * 3] + l[4 * 3]) / 2) * (1 - w));
    s.y = l[8 * 3 + 1] * w + ((l[8 * 3 + 1] + l[4 * 3 + 1]) / 2) * (1 - w);

    // Pointing: index out, others curled, held for the confirmation delay.
    const pointRaw = extended(idx) && curled(mid) && curled(ring) && curled(pinky) && !this.pinching;
    if (pointRaw) {
      if (!this.pointRawSince) this.pointRawSince = now;
    } else this.pointRawSince = 0;
    s.pointing = pointRaw && now - this.pointRawSince >= G.modeConfirmMs;

    // Fist => undo (hold).
    const isFist = fistLike && !this.pinching;
    s.fist = isFist;
    if (isFist) {
      if (!this.fistSince) this.fistSince = now;
      if (!this.fistFired && now - this.fistSince >= G.fistHoldMs && now - this.lastUndo > G.undoCooldownMs) {
        this.fistFired = true;
        this.lastUndo = now;
        s.events.push('undo');
      }
    } else {
      this.fistSince = 0;
      this.fistFired = false;
    }

    // Thumbs up => done (hold with progress).
    const isThumbs = allCurled && thumbUp;
    if (isThumbs) {
      if (!this.thumbSince) this.thumbSince = now;
      s.thumbsUpProgress = Math.min(1, (now - this.thumbSince) / G.thumbsUpHoldMs);
      if (s.thumbsUpProgress >= 1 && !this.thumbFired) {
        this.thumbFired = true;
        s.events.push('done');
      }
    } else {
      this.thumbSince = 0;
      this.thumbFired = false;
      s.thumbsUpProgress = 0;
    }


    // Swipe: open flat hand sweeping up or down the screen.
    const openCount = [idx, mid, ring, pinky].filter((r) => r > G.swipeOpenRatio).length;
    const open = openCount >= 3; // mostly open hand
    if (open && !this.pinching) {
      this.trail.push({ t: now, x: 1 - l[9 * 3], y: l[9 * 3 + 1] });
      while (this.trail.length && now - this.trail[0].t > G.swipeWindowMs) this.trail.shift();
      const a = this.trail[0];
      const b = this.trail[this.trail.length - 1];
      const dy = b.y - a.y; // fraction of screen height (down is positive)
      const dx = (b.x - a.x) * this.aspect; // same units as dy
      if (now - this.lastSwipe > G.swipeCooldownMs && Math.abs(dy) > G.swipeDistance && Math.abs(dy) > G.swipeStraight * Math.abs(dx)) {
        this.lastSwipe = now;
        this.trail = [];
        s.events.push(dy > 0 ? 'swipeDown' : 'swipeUp');
      }
    } else this.trail = [];
    return s;
  }
}
