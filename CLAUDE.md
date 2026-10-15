# Bedazzle Booth

Webcam face-gem filter + photobooth. Spec: PRD.md. Build one phase at a time (PRD section 14).

Stack: Vite + TypeScript, Three.js (ortho scene, video plane + invisible face depth mask + instanced gems), MediaPipe tasks-vision (face + hand, WASM copied to public/mediapipe by `npm install`).

- `src/config.ts` all tunable numbers (pinch thresholds, gem counts, cooldowns)
- `src/tracking.ts` landmarkers + One Euro smoothing; triangles derived from tessellation
- `src/hand.ts` gestures (pinch, point, fist=undo, thumbs up=done)
- `src/stage.ts` scene, face hit-testing, barycentric gem anchoring
- `src/gems.ts` gem types, geometry, instanced renderer
- `src/main.ts` flow, pointer logic (mouse and hand share press/move/release), brush, capture
- `src/compose.ts` + `public/assets/manifest.json` backgrounds/stickers (placeholders, swap without code changes; `node scripts/make-placeholders.mjs` regenerates them)
- `src/audio.ts` synthesized music + SFX (no licensed audio)

Run: `npm run dev` (camera needs localhost or HTTPS). Face/hand model files load from Google storage at runtime.
