// Generates clearly-labelled placeholder backgrounds + stickers + manifest.
// Sohee: replace the files in public/assets and edit manifest.json instead.
import { writeFileSync } from 'node:fs';
const out = 'public/assets/';
const L = { '1': { w: 1080, h: 1350 }, '2': { w: 1080, h: 1920 } };
const WIN = {
  '1': [{ x: 90, y: 90, w: 900, h: 1125 }],
  '2': [{ x: 140, y: 50, w: 800, h: 850 }, { x: 140, y: 940, w: 800, h: 850 }],
};
const label = (name, w, h) => `<text x="${w / 2}" y="${h - 36}" text-anchor="middle" font-family="monospace" font-size="28" fill="#B0125F">PLACEHOLDER · ${name}</text>`;
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

function pearl(k) {
  const { w, h } = L[k];
  return svg(w, h, `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0f7"/><stop offset="1" stop-color="#ffd0e8"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/>${label('Pearl Pink', w, h)}`);
}
function iridescent(k) {
  const { w, h } = L[k];
  let tiles = '';
  const cols = ['#ff9ad0', '#ffc2e6', '#d9b8ff', '#b8dcff', '#ffe3f1'];
  for (let y = 0; y < h; y += 90) for (let x = 0; x < w; x += 90) tiles += `<rect x="${x + 3}" y="${y + 3}" width="84" height="84" rx="10" fill="${cols[((x + y) / 90) % cols.length | 0]}"/>`;
  return svg(w, h, `<rect width="${w}" height="${h}" fill="#ff6ec7"/>${tiles}${label('Iridescent Tile', w, h)}`);
}
function scallop(k) {
  const { w, h } = L[k];
  let dots = '';
  for (let x = 20; x < w; x += 60) dots += `<circle cx="${x}" cy="20" r="30" fill="#fff"/><circle cx="${x}" cy="${h - 20}" r="30" fill="#fff"/>`;
  for (let y = 20; y < h; y += 60) dots += `<circle cx="20" cy="${y}" r="30" fill="#fff"/><circle cx="${w - 20}" cy="${y}" r="30" fill="#fff"/>`;
  return svg(w, h, `<rect width="${w}" height="${h}" fill="#ff6ec7"/>${dots}${label('Stamp Frame', w, h)}`);
}
const bgs = [
  { id: 'pearl', name: 'Pearl Pink', fn: pearl },
  { id: 'tile', name: 'Iridescent Tile', fn: iridescent },
  { id: 'stamp', name: 'Stamp Frame', fn: scallop },
];
for (const b of bgs) for (const k of ['1', '2']) writeFileSync(`${out}backgrounds/${b.id}-${k}.svg`, b.fn(k));
for (const b of bgs) writeFileSync(`${out}backgrounds/${b.id}-thumb.svg`, svg(120, 150, b.fn('1').replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '').replace(/<text.*<\/text>/, '')).replace('<svg ', '<svg ').replace(/width="120" height="150" viewBox="0 0 120 150"/, 'width="120" height="150" viewBox="0 0 1080 1350"'));

writeFileSync(`${out}stickers/bow.svg`, svg(160, 120, `<path d="M80 60 L10 15 L10 105 Z" fill="#ff2e93"/><path d="M80 60 L150 15 L150 105 Z" fill="#ff2e93"/><circle cx="80" cy="60" r="16" fill="#b0125f"/>`));
writeFileSync(`${out}stickers/butterfly.svg`, svg(140, 120, `<ellipse cx="40" cy="40" rx="36" ry="30" fill="#d9b8ff"/><ellipse cx="100" cy="40" rx="36" ry="30" fill="#d9b8ff"/><ellipse cx="45" cy="84" rx="26" ry="22" fill="#b98aff"/><ellipse cx="95" cy="84" rx="26" ry="22" fill="#b98aff"/><rect x="66" y="25" width="8" height="75" rx="4" fill="#2b1020"/>`));
writeFileSync(`${out}stickers/bubble.svg`, svg(100, 100, `<circle cx="50" cy="50" r="44" fill="#b8dcff" fill-opacity=".55" stroke="#fff" stroke-width="4"/><circle cx="34" cy="34" r="9" fill="#fff"/>`));

const manifest = {
  layouts: { '1': { ...L['1'], width: 1080, height: 1350, label: '1 cut' }, '2': { width: 1080, height: 1920, label: '2 cuts' } },
  backgrounds: bgs.map((b) => ({
    id: b.id,
    name: b.name,
    thumb: `backgrounds/${b.id}-thumb.svg`,
    files: { '1': `backgrounds/${b.id}-1.svg`, '2': `backgrounds/${b.id}-2.svg` },
    windows: WIN,
  })),
  stickers: [
    { file: 'stickers/bow.svg', layout: '1', backgrounds: [], x: 20, y: 20, w: 140, h: 105, rotate: -15 },
    { file: 'stickers/butterfly.svg', layout: '1', backgrounds: [], x: 900, y: 1225, w: 130, h: 110, rotate: 12 },
    { file: 'stickers/bubble.svg', layout: '1', backgrounds: [], x: 60, y: 1230, w: 90, h: 90 },
    { file: 'stickers/bow.svg', layout: '2', backgrounds: [], x: 20, y: 10, w: 140, h: 105, rotate: -15 },
    { file: 'stickers/butterfly.svg', layout: '2', backgrounds: [], x: 920, y: 1800, w: 130, h: 110, rotate: 12 },
    { file: 'stickers/bubble.svg', layout: '2', backgrounds: [], x: 40, y: 1800, w: 90, h: 90 },
  ],
};
delete manifest.layouts['1'].w; delete manifest.layouts['1'].h;
writeFileSync(`${out}manifest.json`, JSON.stringify(manifest, null, 2));
writeFileSync(`${out}README.md`, `# Assets

Everything here is a **placeholder**. Swap files and edit \`manifest.json\`, no code changes needed.

- \`backgrounds/\`: one image per layout. 1 cut = **1080 x 1350**, 2 cuts = **1080 x 1920**. PNG (transparency OK) or SVG.
- \`stickers/\`: any size; positioned and sized in the manifest (canvas px, optional rotation).
- \`manifest.json\`
  - \`backgrounds[].files\`: image per layout key ("1", "2")
  - \`backgrounds[].windows\`: where the selfie shows through, per layout (list of {x,y,w,h}). Any aspect works; the photo is cropped to fit.
  - \`backgrounds[].thumb\`: picker thumbnail
  - \`stickers[]\`: file, layout, backgrounds (ids, empty = all), x, y, w, h, rotate

Stickers are drawn above the photo, so keep them away from the window.
Add a new background = one new entry in \`backgrounds\`.
`);
console.log('placeholders written');
