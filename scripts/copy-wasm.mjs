// Copies MediaPipe WASM runtime into public/ so it is served locally.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
const src = 'node_modules/@mediapipe/tasks-vision/wasm';
if (existsSync(src)) {
  mkdirSync('public/mediapipe', { recursive: true });
  cpSync(src, 'public/mediapipe/wasm', { recursive: true });
  console.log('Copied MediaPipe wasm to public/mediapipe/wasm');
}
