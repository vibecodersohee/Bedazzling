import * as THREE from 'three';
import { CONFIG } from './config';
import type { Stage } from './stage';

export type Shape = 'round' | 'sparkle' | 'heart' | 'star';
export const SHAPES: Shape[] = ['round', 'sparkle', 'heart', 'star'];
export type SizeKey = 'small' | 'medium' | 'large';

// Palette from the design system (Figma "Color chip")
export const COLORS: Record<string, { label: string; hex: number }> = {
  white: { label: 'White', hex: 0xffffff },
  yellow: { label: 'Yellow', hex: 0xffcd1e },
  pink: { label: 'Pink', hex: 0xff0095 },
  babypink: { label: 'Baby pink', hex: 0xffafdb },
  red: { label: 'Red', hex: 0xe5004c },
  blue: { label: 'Blue', hex: 0x47bfff },
  purple: { label: 'Purple', hex: 0xc288ff },
  green: { label: 'Green', hex: 0x00e79b },
};
export const resolveColor = (key: string): number => COLORS[key].hex;

export interface Gem {
  id: number;
  shape: Shape;
  /** size relative to face width */
  rel: number;
  color: number;
  mode: 'anchored' | 'free' | 'falling';
  tri: number;
  b: [number, number, number];
  roll: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  lift: boolean;
}
let nextId = 1;
export function makeGem(shape: Shape, px: number, color: number): Gem {
  const jitter = 0.9 + Math.random() * 0.2;
  return {
    id: nextId++,
    shape,
    rel: (px * jitter) / CONFIG.gems.refFaceWidth,
    color,
    mode: 'free',
    tri: 0,
    b: [1 / 3, 1 / 3, 1 / 3],
    roll: shape === 'round' ? Math.random() * Math.PI : (Math.random() - 0.5) * 1.1,
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    life: 0,
    lift: false,
  };
}

// ---- geometry -------------------------------------------------------------
function normalize(g: THREE.BufferGeometry, depth: number) {
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const c = bb.getCenter(new THREE.Vector3());
  g.translate(-c.x, -c.y, -c.z);
  const size = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y);
  g.scale(1 / size, 1 / size, 1 / size);
  void depth;
  return g;
}
function extrude(shape: THREE.Shape, curveSegments: number) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: 0.2,
    curveSegments,
    bevelEnabled: true,
    bevelThickness: 0.12,
    bevelSize: 0.1,
    bevelSegments: 1,
  });
  return normalize(g, 0.2);
}
function polyShape(pts: [number, number][]) {
  const s = new THREE.Shape();
  pts.forEach((p, i) => (i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])));
  return s;
}
function makeGeometry(shape: Shape): THREE.BufferGeometry {
  if (shape === 'round') {
    // brilliant cut: table, crown, girdle, pavilion
    const pts = [
      [0, 0.34], [0.24, 0.34], [0.5, 0.14], [0.5, 0.06], [0.0, -0.3],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const g = new THREE.LatheGeometry(pts, 10);
    g.rotateX(Math.PI / 2);
    return normalize(g, 0);
  }
  const s = new THREE.Shape();
  const pts = shapeOutline(shape, 24);
  if (shape === 'sparkle') return extrude(polyShape(pts), 1);
  pts.forEach((p, i) => (i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])));
  return extrude(s, 1);
}

/** Outline in roughly [-1,1] space, y up. Used for gems and stamp previews. */
export function shapeOutline(shape: Shape, n = 48): [number, number][] {
  const out: [number, number][] = [];
  if (shape === 'sparkle') {
    for (let i = 0; i < 8; i++) {
      const r = i % 2 ? 0.22 : 1;
      const a = Math.PI / 2 + (i * Math.PI) / 4;
      out.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  } else if (shape === 'star') {
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.45 : 1;
      const a = Math.PI / 2 + (i * Math.PI) / 5;
      out.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  } else {
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      out.push([x / 17, (y + 2) / 17]);
    }
  }
  return out;
}

// ---- instanced renderer ----------------------------------------------------
const _q = new THREE.Quaternion();
const _qr = new THREE.Quaternion();
const _z = new THREE.Vector3(0, 0, 1);
const _n = new THREE.Vector3();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _c = new THREE.Color();

export class GemLayer {
  private meshes = new Map<Shape, THREE.InstancedMesh>();
  constructor(scene: THREE.Scene) {
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.2,
      roughness: 0.06,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      flatShading: true,
      envMapIntensity: 1.8,
    });
    for (const sh of SHAPES) {
      const m = new THREE.InstancedMesh(makeGeometry(sh), mat, CONFIG.gems.max + 64);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, _c.set(0xffffff));
      m.frustumCulled = false;
      m.renderOrder = 2;
      m.count = 0;
      scene.add(m);
      this.meshes.set(sh, m);
    }
  }

  update(gems: Gem[], stage: Stage) {
    const counts: Record<string, number> = {};
    for (const g of gems) {
      const mesh = this.meshes.get(g.shape)!;
      const i = counts[g.shape] ?? 0;
      if (i >= mesh.instanceMatrix.count) continue;
      counts[g.shape] = i + 1;
      const px = g.rel * stage.faceWidth * (g.lift ? 1.3 : 1);
      if (g.mode === 'anchored') {
        stage.anchorPos(g, px * CONFIG.gems.sitOnSurface, _p, _n);
      } else {
        _p.copy(g.pos);
        _n.set(0, 0, 1);
      }
      _q.setFromUnitVectors(_z, _n);
      _qr.setFromAxisAngle(_z, g.roll);
      _q.multiply(_qr);
      const fade = g.mode === 'falling' ? Math.max(0, 1 - g.life / 1.4) : 1;
      _s.setScalar(px * fade);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, _c.setHex(g.color));
    }
    for (const sh of SHAPES) {
      const mesh = this.meshes.get(sh)!;
      mesh.count = counts[sh] ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}
