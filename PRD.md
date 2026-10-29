# PRD: Bedazzle Booth

Version 0.5 | Draft | Updated October 27, 2026
Build tool: Claude Code, one phase at a time (see section 14)

---

## 1. Overview

Bedazzle Booth is a desktop web app that lets people decorate their own face with rhinestones and gemstones using hand gestures, then take a selfie and save it. It combines a bedazzling face filter with a photobooth.

The user sees themselves on webcam. They pinch a gem from a tray, drag it onto their face, and release. The gem sticks to the skin in 3D, so it follows the face as they turn their head, like a face filter. When they are happy with the look, they move to the selfie step, pick a layout and background, and save a PNG.

The look we are chasing (from the reference photos): a few large hero stones, many tiny stones scattered around them, clustered on the cheekbone, temple and forehead, with the eye area and lips kept clear.

## 2. Goals and non goals

### Goals
1. Placing a gem feels magical and easy: pinch, drag, release, and it sticks.
2. Gems stay convincingly attached to the face through head rotation and expression changes.
3. Users can build the full "scattered gems" look quickly, not one stone at a time (freehand trail).
4. The result is a photo worth saving and sharing.
5. The interface feels like a bold, glossy, modern Y2K revival that Gen-Z finds fun.

### Non goals (version 1)
- Mobile support (desktop with webcam only)
- Accounts, backend, cloud storage, share links
- 4 cut photobooth strips (planned later)
- AI generated imagery
- Recording video

## 3. Target user

Gen-Z users on a laptop or desktop with a webcam who enjoy beauty and nostalgia trends and like sharing selfies on social media. Casual, short sessions (2 to 5 minutes).

## 4. Decisions already made

| Topic | Decision |
|---|---|
| Platform | Desktop first, webcam required |
| Flow | Two big steps: Decorate, then Selfie |
| Decoration methods | Single gems (pinch and drag) plus brush |
| Brush | Freehand trail only (point and move). Star and heart stamps were removed in v0.3 |
| Gem tray | Round, teardrop, star, heart, in several sizes and colors |
| Photo | Single selfie to start; user picks 1 cut or 2 cuts |
| 2 cut layout | Two photos stacked vertically |
| Backgrounds | User picks a background for the photo (like a collage board with stamp frames, bows, butterflies) |
| Finish gesture | Thumbs up held for 1 second, with a Done button as fallback |
| Fun feature | None for now. Finger snap was removed in v0.3 because it was confusing next to pinch |
| Onboarding | Gesture guide screen on first Decorate, reopen with the Help button (v0.3) |
| Pressing buttons by hand | Touch: rest the index fingertip (or a pinch) on a button about 0.2 sec. Open hand: hover 2 sec (dwell). Color chips select instantly on touch (v0.5) |
| Music | 3 Y2K style background tracks, user can turn on and off. v0.3 uses synthesized loops, no licensed files |
| Visual style | Bedazzled Y2K gadget: hot pink, glossy, modern, less cute. No device frame. v0.4 implements the Figma design system and screens (Vibe-coding-projects file) |
| Font | DotGothic16 (flip phone style pixel font) |
| Name | Bedazzle Booth (final) |
| Background and sticker art | Sohee creates the final assets. Claude Code builds simple placeholders first, designed to be swapped without code changes (see 8.2) |

## 5. Platform and technical approach

These are recommendations for Claude Code. It can propose alternatives if it finds a better fit.

- **Language and build:** TypeScript with Vite
- **Face tracking:** MediaPipe Face Landmarker (478 3D landmarks, head pose transform), on device in the browser
- **Hand tracking:** MediaPipe Hand Landmarker
- **Rendering:** Three.js. Draw the webcam video as a background plane inside the same WebGL canvas, so a screenshot of the canvas is the finished photo.
- **Gem attachment:** On release, project the drop point onto the face mesh. Store the gem as a position on a specific mesh triangle (barycentric coordinates) plus a small offset along the surface normal. Every frame, recompute the gem position from the current mesh so it follows rotation and expression.
- **Occlusion:** Render the face mesh invisibly as a depth mask, so gems on the far cheek hide when the head turns.
- **Gem look:** Small faceted 3D gems with an environment map and strong specular highlights, so they sparkle as the head moves. Use instanced meshes (one per shape and color) to stay fast with 200 or more gems.
- **Smoothing:** Apply a One Euro filter to hand and face landmarks to reduce jitter.
- **Privacy:** All processing runs in the browser. No video or photos are uploaded.
- **Browsers:** Chrome on desktop is the main target. Safari and Firefox are best effort. Camera access needs HTTPS or localhost.

### Performance targets
- 30 FPS or better on a mid range laptop with 200 gems placed
- Gem position lag under about 100 ms behind face movement
- Models load in under 5 seconds on a typical connection, with a loading screen

## 6. Experience flow

1. **Landing and setup:** Short intro, camera permission request, music setting (on by default), "Start" button.
2. **Tracking check:** Prompt: show your face, then raise a hand. Both indicators turn green, then Decorate begins.
   The landing page footer has "Designed by ©Sohee Lee", an Instagram icon link, a Privacy Policy link (static page at /PrivacyPolicy, `public/PrivacyPolicy/index.html`) and an About Me page (bio, LinkedIn, Instagram, email, with a Back button).
3. **Decorate step:** Live camera, gem tray, tool bar. User places gems with gestures.
4. **Finish:** Thumbs up held for 1 second (or Done button). Hand cursor and tray fade out.
5. **Selfie setup:** User chooses one of 3 photo frames (Pink Phone, Pink TV, Pink Cam; one cut) or No Frame (plain full camera view, 16:9).
6. **Capture:** 3 second countdown, then photo. Gems keep tracking live so the user can pose and turn.
7. **Result:** Preview with Save PNG, Retake and Back to decorate (gems are kept) under the photo, and a Back to frame selection button top left.

## 7. Decorate step: detailed spec

### 7.1 Layout
- The live camera fills the screen and is mirrored.
- Tools panel on the left: Gems, Brush, Erase, Undo. Gems, Brush and Erase stay pressed when selected; Undo is a one-shot click. There is no Clear all button (removed v0.5). Help is top left, Selfie top right.
- Colors panel on the right shows all 8 colors in a column (no scrolling, no swipe gesture). The chosen color stays pressed. Chips have no hover state: touching one selects it.
- Bottom center has two panels, Size (Small, Medium, Large; the chosen one stays pressed) and Shape (circle, sparkle, heart, star; no selected state, touching or pinching one grabs a gem). Both appear only with the Gems tool, not with Brush or Erase.
- The Music panel (checkbox and track dropdown) sits bottom right on every page except during the photo countdown. Music is on by default and starts after the first click on Start. Mouse only for now.
- A hand-tracking overlay (white skeleton over the hand) exists in code but is hidden; it has no button or key until requested.
- A gesture guide shows on the first visit to Decorate. Cards light up when the matching gesture is detected.
- A small status area shows tracking state and short messages in the LCD style (see section 9).
- The camera area stays clean of decoration so the face is the hero.

### 7.2 Gesture specification

| Action | Gesture | Notes |
|---|---|---|
| Move cursor | Index fingertip, blending to the thumb and index midpoint as a pinch closes | Mirrored to match the camera view |
| Press a tool or button | Touch: rest the index fingertip (or a pinch) on it about 0.2 sec. Open hand: hover about 2 sec | Hover shows a highlight; the cursor ring fills during an open-hand hover. Color chips select immediately |
| Pick up a new gem | Touch a shape (the gem follows the fingertip), or pinch it and drag | |
| Place a gem | Touch method: stop pointing (lower the finger). Pinch method: release the pinch | The gem lands where the fingertip was about 0.25 sec before the finger relaxed, because relaxing moves the cursor. Gem snaps to the nearest face surface point. Dropped off the face, a new gem is discarded |
| Move a placed gem | Pinch the gem on the face, drag, release | Pointing at a placed gem does nothing, so it never gets knocked off. Dropped off the face, it returns to where it was |
| Remove a placed gem | Erase tool (point at it), Undo, or mouse right-click | Dragging a gem off the face no longer removes it (v0.5) |
| Freehand trail | With Brush active, point with index finger only (other fingers curled) and move over the face | See 7.3 |
| Finish | Thumbs up held for 1 second, or Selfie button | Show a progress ring while holding |

There are no gestures for changing color (swipe) or undo (fist); both were removed in v0.5.

Gesture rules:
- Pinch uses hysteresis: engage when the thumb to index distance is below about 0.42 of hand size, release when it rises above about 0.62. Hand size is wrist to middle finger base. These numbers are starting points and must be tunable in a config file.
- Pointing (freehand) and pinching must never trigger each other by accident. Use a short confirmation delay (about 150 ms) before switching mode.
- Every gesture has a mouse and keyboard equivalent: click and drag to place, right click or Eraser to remove, Z to undo, Enter for Selfie.
- When the hand covers the face, face tracking can become unstable. Keep existing gems locked to the last good face pose for a short time rather than letting them jump.

### 7.3 Brush (freehand trail)
- With Brush active, point with the index finger only (or drag the mouse) and move across the face.
- Small gems spawn along the path with random size and slight spacing jitter, with an occasional larger one.
- Stop drawing when the finger leaves the face area or the hand changes pose.
- One stroke counts as one undo step.
- Star and heart stamps were tried and removed in v0.3. They can come back later (see section 13).

### 7.5 Gem system

| Property | Options (version 1) |
|---|---|
| Shapes | Circle, sparkle (4 point), heart, star |
| Sizes | Small (7 px), medium (20 px), large (46 px, a hero stone like the heart in the reference photo). Pixel values are at a 420 px wide face and scale with the face |
| Colors | White, yellow #ffcd1e, pink #ff0095, baby pink #ffafdb, red #e5004c, blue #47bfff, purple #c288ff, green #00e79b |
| Behavior | Faces outward along the surface normal, small random rotation, slight random size variation |
| Limit | Cap at about 400 gems total, show a friendly message if reached |

Keep the eye area and lips usable but do not hard block them. Optionally show a subtle "keep clear" hint near the eyes.

## 8. Selfie step: detailed spec

### 8.1 Frame choice (v0.4: one cut only)
- One photo, 4:5 portrait, 1080 x 1350. The 2 cut strip was removed.
- The user picks one of 3 frames (Frame 1 phone, Frame 2 TV, Frame 3 camera), then presses Take photo (disabled until a frame is chosen).

### 8.2 Frames
- Frames are 1080 x 1350 PNGs in `public/assets/frames/` with a transparent window for the selfie. The selfie is drawn under the frame art and mapped onto the window quad, so tilted windows work.
- `assets/manifest.json` lists each frame (id, name, file, window quad). Swapping art = replace the PNG and update the quad (`scripts/make-frames.py` detects it). Adding a frame = one new entry.

### 8.3 Capture
- Hide the HUD. Show "Lower your hand" then a 3 second countdown in large pixel numbers with a shutter sound. A dashed crop box shows what will be in the window.
- Gems stay live during the countdown.
- Compose: selfie (mirrored, as seen) cropped to the window aspect, under the frame.

### 8.4 Result screen
- Frame preview with Save PNG, Retake, Back to decorate (gems kept).

## 9. Visual design: "Bedazzled Gadget"

**Mood:** Modern Y2K revival. Glossy, bold and confident rather than cute. Think a bedazzled pink MP3 player: pearly satin pink, rhinestone trim, a tiny LCD screen with pixel text. No device frame around the app.

### Color (starting palette, to be refined in design)

| Role | Color |
|---|---|
| Primary hot pink | #FF2E93 |
| Secondary bubblegum pink | #FF6EC7 |
| Deep raspberry (shadows, contrast) | #B0125F |
| Pearl blush (backgrounds) | #FFE3F1 |
| White (highlights) | #FFFFFF |
| Chrome silver (accents) | #C0C0C0 |
| LCD screen background | #E9E4EC |
| LCD text | #2B1020 |

Pink is the hero. Silver, white and small hits of icy blue or lilac add sparkle. Avoid too many extra colors.

### Typography
- **DotGothic16** (Google Fonts, Open Font License, free for commercial use) for headings, buttons, labels, countdown and LCD text.
- Use it at multiples of 16 px so the pixels stay crisp.
- A clean sans serif (such as Inter) only for any longer text like permission explanations.
- Optional accent: Doto (dot matrix style, Google Fonts) for the big countdown numbers.

### Components
- **Buttons:** glossy gel pink with a sharp white highlight and a thin rhinestone style trim. Pressed state sinks slightly.
- **Rhinestone trim:** reuse the gem assets for button outlines and panel edges, so the interface feels tied to the product.
- **LCD windows:** small pale silvery pink panels with dark pixel text for status, tooltips and the countdown.
- **Microcopy:** short affirming lines in the LCD voice, for example while counting down or after saving. Keep copy short and confident. Final wording to be written with Sohee.
- **Decoration:** a few butterflies and sparkles as accents. Fewer cartoon shapes than a typical cute theme. The camera area has no decoration on top of it.
- **Motion:** quick glossy hover shines, sparkle bursts on gem placement, springy button presses. Keep animation short so it never slows the interaction.

## 10. Audio

- **3 background tracks** in a Y2K style, looped. Working moods (can change): dreamy R&B, bubbly pop, glossy club.
- A Music panel (checkbox and track dropdown) bottom right on every page. On by default; sound starts after the first click on Start because browsers block autoplay.
- Remember the user's choice for the session.
- Lower the music volume during the countdown and play a shutter sound.
- Keep each track short and compressed (about 1 to 2 MB) with a seamless loop.
- **Licensing is required before launch.** Every track must have a documented license that allows commercial use. Track names, sources and license links go in a LICENSES.md file in the audio folder. Do not use anything that imitates a specific hit song.

## 11. Edge cases and failure states

| Situation | Behavior |
|---|---|
| Camera permission denied | Friendly explanation and instructions to enable it |
| No face detected | Pause gem updates, show "Show your face" message, keep gems frozen at last pose |
| No hand detected | Show a hint, mouse and keyboard still work |
| Poor lighting | Show a tip to face a light source. Consider boosting gem highlights |
| Multiple faces | Track only the largest face |
| Face turned far away | Gems fade out behind the head via depth occlusion |
| Slow device | Reduce gem effects or lower tracking resolution automatically |
| Unsupported browser | Message with recommended browsers |

## 12. Success measures (informal, for early testing)

- A new user places their first gem within 30 seconds of starting.
- Most test users complete a full flow (decorate, selfie, save) without help.
- Gems visibly stay attached during a head turn in testing.
- Testers describe the look as fun and Y2K, not childish.

## 13. Later ideas (not in version 1)

- 4 cut photobooth strip
- Stamp shapes (star, heart, butterfly) and more gem shapes (bow, sparkle)
- Theme packs for gems and backgrounds
- Share sheet or link
- Mobile touch version
- Sound effects pack for placing and snapping gems
- Saved looks

## 14. Build phases for Claude Code

Build one phase at a time, test it in the browser, and commit before the next phase. Each phase has an acceptance check.

**Phase 0: Project setup**
Vite, TypeScript, Three.js, MediaPipe. Camera permission, mirrored live video in a WebGL canvas, config file for tunable values.
Check: video shows, and permission denial is handled.

**Phase 1: Face tracking and gem anchoring (mouse only)**
Face mesh, invisible depth mask, click to place a round gem, store on a mesh triangle, follow head movement, hide when turned away.
Check: a placed gem stays on the same spot of the cheek through rotation and expression changes.

**Phase 2: Hand tracking and pinch**
Fingertip cursor, pinch with hysteresis, One Euro smoothing, pick from tray, drop on face, move gems. (Fist for undo was removed in v0.5.)
Check: a gem can be placed and removed using only the hand.

**Phase 3: Gem set and rendering polish**
Four shapes, sizes, colors, environment map and sparkle, instancing, gem cap.
Check: 200 gems at 30 FPS on a mid range laptop.

**Phase 4: Brush**
Freehand trail with random size and spacing, one undo step per stroke.
Check: a trail on the cheek looks scattered and natural.

**Phase 5: Selfie step**
Done button and thumbs up hold, layout choice (1 cut, 2 cuts stacked), placeholder backgrounds and stickers loaded from the asset manifest, countdown, capture, result screen, PNG save, retake and back to decorate.
Check: a saved 2 cut PNG shows gems, correct mirroring, and the chosen placeholder background. Swapping a placeholder file in the assets folder changes the result without code changes.

**Phase 6: Y2K skin and audio**
Palette, DotGothic16, glossy buttons, rhinestone trim, LCD windows and microcopy, sparkle effects, 3 music tracks with toggle and ducking, shutter sound.
Check: the interface matches the Bedazzled Gadget direction and music toggles cleanly.

**Phase 7: Final polish**
Performance pass, edge case handling, cross browser check.
Check: normal gestures never trigger undo or done by accident.

### Tips for working with Claude Code
- Put this file in the project root as PRD.md and ask Claude Code to read it first.
- Ask it to create a short CLAUDE.md summarizing the stack, the phase list and the rule "build one phase at a time".
- Keep all tunable numbers (pinch thresholds, gem counts, cooldowns) in one config file so they are easy to adjust while testing.

## 15. Open questions

1. Final background and sticker art (Sohee is creating these, placeholders are used until then).
2. Music track sources and final moods.
3. Exact gem color set and whether a hero gem size is needed.
4. Final LCD microcopy wording.
