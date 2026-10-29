# Dev log

Newest first. One entry per commit (what changed, why, what to check next).

## 2026-10-28 · Privacy Policy, About Me, No Frame
- **Landing footer** (Figma): credit line, Instagram icon, Privacy Policy and About Me links.
- **Privacy Policy**: static page `public/PrivacyPolicy/index.html` (served at /Bedazzling/PrivacyPolicy), text as provided. Note it is a generic generator template (mentions accounts, cookies, marketing emails) that does not mention the camera; worth reviewing.
- **About Me** screen with bio and links; Back returns to the landing page.
- **No Frame** option in the selfie setup: saves the plain 16:9 camera view with gems.
- **Selfie time screen** (Figma): title and "Select a frame!", four 184px buttons (No Frame, Pink Phone, Pink TV, Pink Cam), Back to decorate + Take photo row. Result screen: buttons under the photo and a Back to frame selection button.
- **Favicon**: pink gem icon (32px favicon + 180px apple-touch icon) on the app and the Privacy Policy page.
- **Check next**: Privacy Policy link works on the live site after the next sync.

## 2026-10-27 · Touch to click, new Gems layout, simpler gestures
- **Touch = click**: resting the index fingertip on a button for ~0.2 s presses it (also when the thumb is tucked and it reads as a pinch). Color chips select instantly with no hover state. Open-hand hover still needs 2 s. `touchMs` in `src/config.ts`.
- **Gems by touch**: touching a shape picks up a new gem that follows the fingertip; it drops where the fingertip was ~0.25 s before the finger stopped pointing (relaxing the finger moves the cursor, which used to throw gems off the face). Placed gems are not re-grabbed by pointing; dropping a picked-up gem off the face puts it back.
- **Removed**: swipe-to-change-color, fist-to-undo, Clear button, Hand tracking toggle (overlay code is kept but hidden).
- **UI from Figma**: Size and Shape are two panels at the bottom center (only for the Gems tool), Colors show all 8 with no scrolling, Selfie top right, Music panel (checkbox + track) bottom right on every page, music on by default, 2x2 Gesture guide.
- **Check next**: do touch presses feel reliable with a real hand? Friends' feedback.

## 2026-10-23 · Prepare for GitHub Pages
- Vite `base` now comes from `VITE_BASE` (set by the workflow to `/<repo-name>/`), `.github/workflows/deploy.yml` builds and deploys to GitHub Pages on every push to `main`, README added.
- **Live** at https://vibecodersohee.github.io/Bedazzling/ (link added to README). First workflow run failed only because Pages was not enabled yet; re-running fixed it.
- Vercel was the first choice but account creation failed, so GitHub Pages it is (needs a public repo on the free plan).
- **Check next**: friends' feedback; use the D debug panel to report pinch problems.

## 2026-10-23 · Pinch debugging, grab sound, quieter status panel
- **Debug panel** (press D or `?debug`): live pinch distance vs thresholds, pinching/fist state, tool, holding, cursor, fps. Use it to tune `pinchEngage` / `pinchRelease` in `src/config.ts`.
- **Hand-loss grace**: the tracker keeps the last hand pose for 300 ms when detection blinks out (pinching hides fingers), so grabs aren't dropped (`handLostGraceMs`).
- **Grab sound**: short rising blip when a gem is picked up (tray or face); sparkle still plays on drop.
- Status panel no longer shows gem count / fps; it hides when there is nothing to say.
- **Check next**: what the debug panel reads when a pinch fails (see DEVLOG 2026-10-22 notes).

## 2026-10-22 · Figma UI, 1-cut frames, gesture tuning
- Removed the three reference `Selfie time - Frame*.png` exports from the repo root (app frames live in `public/assets/frames/`).
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
