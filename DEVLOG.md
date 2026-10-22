# Dev log

Newest first. One entry per commit (what changed, why, what to check next).

## 2026-10-22 · Figma UI, 1-cut frames, gesture tuning
- **Figma design implemented** (design system + screens): glossy gel buttons with hover/pressed/disabled states, pixel-icon pattern backgrounds, pixelarticons icons, Tools / Colors / Gems panels, tooltip, music button. UI is authored at 1920x1080 and scaled to fit; camera now covers the full window.
- **Selfie**: 1 cut only. Three photo frames (phone, TV, camera) from transparent-window PNGs in `public/assets/frames/`, selfie mapped onto the window box (`scripts/make-frames.py`). Selfie time screen picks a frame, then countdown and result.
- **Gems panel** bottom center; shapes are circle, sparkle, heart, star; 8 design-system colors in a scrolling list with chevrons. Gems panel hides while the Brush tool is active.
- **Gestures**: color change is now an open-hand swipe up/down (down = next). Erase works by just pointing at or pinching gems. Hold-to-press (dwell) is 2 s on every button. Pinch loosened (engage 0.42, release 0.62) and no longer blocked by the fist check; sliding a pinch onto a gem still grabs it; picking a gem switches to the Gem tool.
- Tracking-check screen is transparent over the camera again.
- `/?screen=decorate|guide|setup|result` opens a screen without the camera for design QA.
- PRD updated to v0.4.
- **Check next**: pinch reliability with real hands (cursor turns solid pink when a pinch registers), accidental swipes when moving the hand fast, live capture inside frames.

## 2026-10-19 · Clear all, swipe colors, pressed states, fingertip cursor
- **Clear all** button on the toolbar (undoable) replaces the removed finger snap.
- **Swipe to change color**: open flat hand sweeping left/right cycles colors (arrow keys on keyboard). New Swipe card in the gesture guide. Tunables: `swipeDistance`, `swipeWindowMs`, `swipeCooldownMs`.
- **Pressed look** for selected tools, sizes, colors, shapes; action buttons flash pressed when fired.
- **Cursor** is the index fingertip when pointing, easing to the thumb/index midpoint while pinching.
- PRD gesture table and toolbar description updated.
- **Check next**: accidental swipes when moving an open hand fast; toolbar height on short screens.

## 2026-10-15 · Brush trail only, bigger sizes, less lag, easier buttons
- **Removed** star/heart stamps. Brush is freehand trail only (point or drag the mouse). One stroke = one undo step.
- **Sizes**: S 7 px (same), M 20 px (old L), L 46 px (hero gem like the reference heart).
- **Tracking lag**: lighter face smoothing (minCutoff 4, beta 120, dCutoff 8) and hand model runs every other frame. FPS now shows in the status panel.
- **Buttons by hand**: hold the cursor over a button about 1 s to press it (ring fills), in addition to pinch. Pinch thresholds tightened (engage 0.36, release 0.58). Cursor is the thumb/index midpoint.
- **Tool/color discoverability**: tray reordered as "1 Pick a color / Size / 2 Pinch a gem", Tools label, status hints when switching tools.
- **Gesture guide** screen on first Decorate, reopen with Help. Cards light up on detection.
- **Removed** finger snap (clashed with pinch). Clear all may return as a button.
- PRD updated to v0.3 to match.
- **Check next**: face lag on fast head turns (watch fps), pinch feel, trail density.

## 2026-10-13 · v0.1 first build
- Vite + TypeScript + Three.js + MediaPipe app covering PRD phases 0 to 7: face-anchored gems, hand gestures, gem set, selfie flow (1 or 2 cuts), placeholder backgrounds, Y2K skin, synthesized music.
