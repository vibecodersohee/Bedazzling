# Assets

Everything here is a **placeholder**. Swap files and edit `manifest.json`, no code changes needed.

- `backgrounds/`: one image per layout. 1 cut = **1080 x 1350**, 2 cuts = **1080 x 1920**. PNG (transparency OK) or SVG.
- `stickers/`: any size; positioned and sized in the manifest (canvas px, optional rotation).
- `manifest.json`
  - `backgrounds[].files`: image per layout key ("1", "2")
  - `backgrounds[].windows`: where the selfie shows through, per layout (list of {x,y,w,h}). Any aspect works; the photo is cropped to fit.
  - `backgrounds[].thumb`: picker thumbnail
  - `stickers[]`: file, layout, backgrounds (ids, empty = all), x, y, w, h, rotate

Stickers are drawn above the photo, so keep them away from the window.
Add a new background = one new entry in `backgrounds`.
