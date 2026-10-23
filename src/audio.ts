import { CONFIG } from './config';

// Procedural Y2K-style loops synthesized with WebAudio, so there are no
// licensed audio files to track. Swap in real tracks later if wanted.
interface TrackDef {
  name: string;
  bpm: number;
  root: number;
  prog: number[][];
  wave: OscillatorType;
  kick: number[];
  hat: number[];
  arp: boolean;
  swing: number;
}
export const TRACKS: TrackDef[] = [
  { name: 'Dreamy R&B', bpm: 78, root: 57, prog: [[0, 3, 7, 10], [5, 8, 12, 15], [3, 7, 10, 14], [7, 10, 14, 17]], wave: 'triangle', kick: [0, 7, 10], hat: [4, 12], arp: false, swing: 0.12 },
  { name: 'Bubbly Pop', bpm: 116, root: 60, prog: [[0, 4, 7, 11], [9, 12, 16, 19], [5, 9, 12, 16], [7, 11, 14, 17]], wave: 'square', kick: [0, 8], hat: [2, 6, 10, 14], arp: true, swing: 0 },
  { name: 'Glossy Club', bpm: 124, root: 55, prog: [[0, 3, 7, 10], [0, 3, 7, 10], [8, 12, 15, 19], [5, 8, 12, 15]], wave: 'sawtooth', kick: [0, 4, 8, 12], hat: [2, 6, 10, 14], arp: true, swing: 0.04 },
];

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private timer = 0;
  private step = 0;
  private nextT = 0;
  track = 0;
  on = false;
  private ducked = false;

  private ensure() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = CONFIG.musicVolume;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 0.5;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setOn(v: boolean) {
    this.on = v;
    if (v) {
      this.ensure();
      this.ctx!.resume();
      if (!this.timer) {
        this.step = 0;
        this.nextT = this.ctx!.currentTime + 0.05;
        this.timer = window.setInterval(() => this.schedule(), 25);
      }
    } else if (this.timer) {
      clearInterval(this.timer);
      this.timer = 0;
    }
  }
  setTrack(i: number) {
    this.track = i;
    this.step = 0;
  }
  duck(v: boolean) {
    this.ducked = v;
    if (this.ctx) this.master.gain.setTargetAtTime(v ? CONFIG.musicDuckVolume : CONFIG.musicVolume, this.ctx.currentTime, 0.15);
  }

  private tone(t: number, f: number, dur: number, type: OscillatorType, vol: number, glideTo?: number) {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  private hat(t: number, vol = 0.05) {
    const c = this.ctx!;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(f).connect(g).connect(this.master);
    s.start(t);
    s.stop(t + 0.08);
  }

  private schedule() {
    const c = this.ctx!;
    const T = TRACKS[this.track];
    const sixteenth = 60 / T.bpm / 4;
    while (this.nextT < c.currentTime + 0.12) {
      const s = this.step % 16;
      const bar = Math.floor(this.step / 16) % T.prog.length;
      const chord = T.prog[bar];
      const t = this.nextT + (s % 2 ? sixteenth * T.swing : 0);
      if (s === 0) {
        for (const n of chord) this.tone(t, mtof(T.root + n + 12), sixteenth * 15, 'sine', 0.035);
        this.tone(t, mtof(T.root + chord[0] - 12), sixteenth * 7, T.wave === 'sawtooth' ? 'sawtooth' : 'sine', 0.12);
      }
      if (s === 8) this.tone(t, mtof(T.root + chord[0] - 12), sixteenth * 5, 'sine', 0.1);
      if (T.kick.includes(s)) this.tone(t, 150, 0.14, 'sine', 0.3, 40);
      if (T.hat.includes(s)) this.hat(t);
      if (T.arp && s % 2 === 0) this.tone(t, mtof(T.root + 12 + chord[(s / 2) % chord.length]), sixteenth * 1.6, T.wave, 0.03);
      this.nextT += sixteenth;
      this.step++;
    }
  }

  // ---- one shots (work even if music is off) ----
  private ensureOneShot() {
    this.ensure();
    this.ctx!.resume();
  }
  shutter() {
    this.ensureOneShot();
    const t = this.ctx!.currentTime;
    this.hat(t, 0.5);
    this.tone(t, 1800, 0.06, 'square', 0.12, 400);
  }
  tick() {
    this.ensureOneShot();
    this.tone(this.ctx!.currentTime, 880, 0.08, 'sine', 0.12);
  }
  /** short rising blip: "got it" when a gem is picked up */
  grab() {
    this.ensureOneShot();
    const t = this.ctx!.currentTime;
    this.tone(t, 520, 0.07, 'square', 0.09, 780);
    this.tone(t + 0.06, 1040, 0.09, 'triangle', 0.08);
  }
  sparkle() {
    this.ensureOneShot();
    const t = this.ctx!.currentTime;
    this.tone(t, 1760, 0.12, 'triangle', 0.06);
    this.tone(t + 0.05, 2637, 0.14, 'triangle', 0.05);
  }
}
