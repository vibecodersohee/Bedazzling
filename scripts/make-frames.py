# Resizes the photo-frame PNGs (transparent screen window) to 1080x1350 and
# finds the window quad. Usage: python3 scripts/make-frames.py
import json, sys, math
from collections import deque
from PIL import Image, ImageFilter

SRC = '/private/tmp/claude-501/-Users-sohee-Desktop-Projects-Interactive-web/f075098c-7b21-4659-84b1-72a1fb5a717a/images/'
FRAMES = [('phone', '3.webp', 'Frame 1'), ('tv', '5.webp', 'Frame 2'), ('camera', '4.webp', 'Frame 3')]
W, H = 1080, 1350
out = []
for fid, fn, name in FRAMES:
    im = Image.open(SRC + fn).convert('RGBA').resize((W, H), Image.LANCZOS)
    px = im.load()
    white = bytearray(W * H)
    for y in range(H):
        for x in range(W):
            if px[x, y][3] < 128:
                white[y * W + x] = 1
    seen = bytearray(W * H)
    best = []
    for s in range(W * H):
        if white[s] and not seen[s]:
            comp = []
            q = deque([s]); seen[s] = 1
            while q:
                p = q.popleft(); comp.append(p)
                x, y = p % W, p // W
                for nx, ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
                    if 0 <= nx < W and 0 <= ny < H:
                        n = ny * W + nx
                        if white[n] and not seen[n]:
                            seen[n] = 1; q.append(n)
            if len(comp) > len(best): best = comp
    mask = Image.new('L', (W, H), 0)
    mp = mask.load()
    pts = [(p % W, p // W) for p in best]
    for x, y in pts: mp[x, y] = 255
    tl = min(pts, key=lambda p: p[0] + p[1]); br = max(pts, key=lambda p: p[0] + p[1])
    tr = max(pts, key=lambda p: p[0] - p[1]); bl = min(pts, key=lambda p: p[0] - p[1])
    # tilt from the extreme corners, then the tightest oriented box around the WHOLE window
    th = math.atan2(tr[1] - tl[1], tr[0] - tl[0])
    ux, uy = math.cos(th), math.sin(th)
    us = [x * ux + y * uy for x, y in pts]; vs = [-x * uy + y * ux for x, y in pts]
    u0, u1, v0, v1 = min(us), max(us), min(vs), max(vs)
    def at(u, v): return [round(u * ux - v * uy), round(u * uy + v * ux)]
    tl, tr, br, bl = at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)
    im.save(f'public/assets/frames/{fid}.png', optimize=True)
    out.append({'id': fid, 'name': name, 'file': f'frames/{fid}.png', 'quad': [tl, tr, br, bl]})
    print(fid, len(best), tl, tr, br, bl, file=sys.stderr)
m = json.load(open('public/assets/manifest.json'))
m['frames'] = out
json.dump(m, open('public/assets/manifest.json', 'w'), indent=2)
