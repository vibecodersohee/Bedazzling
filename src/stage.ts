import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { FACE_POINTS } from './tracking';
import type { Gem } from './gems';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/** Three.js scene: mirrored video plane, invisible face depth mask, gems, sparkles. */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  readonly verts = new Float32Array(FACE_POINTS * 3);
  faceWidth = 420;
  hasFace = false;
  rect: DOMRect;
  private tris = new Uint16Array(0);
  private faceGeo = new THREE.BufferGeometry();
  private sparkles: { s: THREE.Sprite; v: THREE.Vector3; life: number; max: number }[] = [];
  private sparkTex: THREE.Texture;

  constructor(readonly canvas: HTMLCanvasElement, video: HTMLVideoElement, readonly W: number, readonly H: number) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(W, H, false);
    this.camera = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 1, 4000);
    this.camera.position.z = 2000;
    this.rect = canvas.getBoundingClientRect();

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;

    // mirrored video backdrop
    const tex = new THREE.VideoTexture(video);
    tex.colorSpace = THREE.SRGBColorSpace;
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: tex, depthWrite: false, depthTest: false, toneMapped: false }));
    bg.scale.x = -1;
    bg.position.z = -1000;
    bg.renderOrder = -10;
    this.scene.add(bg);

    // invisible face mesh -> depth occlusion for gems
    this.faceGeo.setAttribute('position', new THREE.BufferAttribute(this.verts, 3));
    const mask = new THREE.Mesh(this.faceGeo, new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide }));
    mask.frustumCulled = false;
    mask.renderOrder = 1;
    this.scene.add(mask);

    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, '#fff');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.9)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#fff';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(32, 2); g.lineTo(32, 62); g.moveTo(2, 32); g.lineTo(62, 32);
    g.stroke();
    this.sparkTex = new THREE.CanvasTexture(c);
  }

  setTriangles(t: Uint16Array) {
    this.tris = new Uint16Array(t);
    this.faceGeo.setIndex(new THREE.BufferAttribute(this.tris, 1));
  }

  updateRect() {
    this.rect = this.canvas.getBoundingClientRect();
  }

  setFace(lm: Float32Array) {
    const { W, H, verts } = this;
    for (let i = 0; i < FACE_POINTS; i++) {
      verts[i * 3] = (0.5 - lm[i * 3]) * W;
      verts[i * 3 + 1] = (0.5 - lm[i * 3 + 1]) * H;
      verts[i * 3 + 2] = -lm[i * 3 + 2] * W;
    }
    const dx = verts[234 * 3] - verts[454 * 3];
    const dy = verts[234 * 3 + 1] - verts[454 * 3 + 1];
    const dz = verts[234 * 3 + 2] - verts[454 * 3 + 2];
    this.faceWidth = Math.max(80, Math.hypot(dx, dy, dz));
    this.faceGeo.attributes.position.needsUpdate = true;
    this.hasFace = true;
  }

  // ---- coordinate helpers (screen px <-> world) ----
  screenToWorld(px: number, py: number, out = new THREE.Vector3()) {
    const r = this.rect;
    return out.set(((px - r.left) / r.width - 0.5) * this.W, (0.5 - (py - r.top) / r.height) * this.H, 0);
  }
  worldToScreen(p: THREE.Vector3): [number, number] {
    const r = this.rect;
    return [r.left + (p.x / this.W + 0.5) * r.width, r.top + (0.5 - p.y / this.H) * r.height];
  }
  get pxScale() {
    return this.rect.width / this.W;
  }

  /** Front-most mesh triangle under a world XY point. */
  hitFace(wx: number, wy: number): { tri: number; b: [number, number, number] } | null {
    if (!this.hasFace || !this.tris.length) return null;
    const v = this.verts;
    let best = -1, bestZ = -1e9;
    let bb: [number, number, number] = [0, 0, 0];
    for (let t = 0; t < this.tris.length; t += 3) {
      const i0 = this.tris[t] * 3, i1 = this.tris[t + 1] * 3, i2 = this.tris[t + 2] * 3;
      const x0 = v[i0], y0 = v[i0 + 1], x1 = v[i1], y1 = v[i1 + 1], x2 = v[i2], y2 = v[i2 + 1];
      const den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
      if (Math.abs(den) < 1e-6) continue;
      const l0 = ((y1 - y2) * (wx - x2) + (x2 - x1) * (wy - y2)) / den;
      const l1 = ((y2 - y0) * (wx - x2) + (x0 - x2) * (wy - y2)) / den;
      const l2 = 1 - l0 - l1;
      if (l0 < -0.001 || l1 < -0.001 || l2 < -0.001) continue;
      const z = l0 * v[i0 + 2] + l1 * v[i1 + 2] + l2 * v[i2 + 2];
      if (z > bestZ) {
        bestZ = z;
        best = t / 3;
        bb = [l0, l1, l2];
      }
    }
    return best < 0 ? null : { tri: best, b: bb };
  }

  /** World position (and outward normal) of an anchored gem, `lift` along the normal. */
  anchorPos(g: Gem, lift: number, outPos: THREE.Vector3, outN: THREE.Vector3) {
    const v = this.verts, t = g.tri * 3;
    const i0 = this.tris[t] * 3, i1 = this.tris[t + 1] * 3, i2 = this.tris[t + 2] * 3;
    outPos.set(
      g.b[0] * v[i0] + g.b[1] * v[i1] + g.b[2] * v[i2],
      g.b[0] * v[i0 + 1] + g.b[1] * v[i1 + 1] + g.b[2] * v[i2 + 1],
      g.b[0] * v[i0 + 2] + g.b[1] * v[i1 + 2] + g.b[2] * v[i2 + 2],
    );
    _a.set(v[i1] - v[i0], v[i1 + 1] - v[i0 + 1], v[i1 + 2] - v[i0 + 2]);
    _b.set(v[i2] - v[i0], v[i2 + 1] - v[i0 + 1], v[i2 + 2] - v[i0 + 2]);
    outN.crossVectors(_a, _b).normalize();
    if (outN.z < 0) outN.negate();
    outPos.addScaledVector(outN, lift);
  }

  // ---- sparkles ----
  burst(p: THREE.Vector3, count: number, color = 0xffffff) {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({ map: this.sparkTex, color, transparent: true, depthTest: false, blending: THREE.AdditiveBlending });
      const s = new THREE.Sprite(mat);
      s.position.copy(p);
      s.position.z = 400;
      s.renderOrder = 5;
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 140;
      this.sparkles.push({ s, v: new THREE.Vector3(Math.cos(a) * sp, Math.sin(a) * sp, 0), life: 0, max: 0.5 + Math.random() * 0.4 });
      this.scene.add(s);
    }
  }
  private stepSparkles(dt: number) {
    for (let i = this.sparkles.length - 1; i >= 0; i--) {
      const p = this.sparkles[i];
      p.life += dt;
      if (p.life >= p.max) {
        this.scene.remove(p.s);
        (p.s.material as THREE.Material).dispose();
        this.sparkles.splice(i, 1);
        continue;
      }
      const k = p.life / p.max;
      p.s.position.addScaledVector(p.v, dt);
      p.s.scale.setScalar((1 - k) * 22 + 4);
      (p.s.material as THREE.SpriteMaterial).opacity = 1 - k;
    }
  }

  render(dt: number) {
    this.stepSparkles(dt);
    this.renderer.render(this.scene, this.camera);
  }
}
