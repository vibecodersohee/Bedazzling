# Assets

- `frames/*.png`: 1080 x 1350 PNG with a **transparent window** where the selfie shows through.
  The selfie is drawn underneath, so the frame art covers its edges.
- `manifest.json`: one entry per frame: `id`, `name` (button label), `file`, and `quad`,
  the window corners [top-left, top-right, bottom-right, bottom-left] in canvas px.
  The selfie is rotated/cropped to fit the quad, so tilted windows work.
- `pattern.svg`: pixel icon background used on the pink screens (made by `scripts/make-pattern.mjs`).

Swap a frame by replacing its PNG and updating `quad` (run `python3 scripts/make-frames.py` to detect it
from the transparent area). Add a frame = one new entry.
