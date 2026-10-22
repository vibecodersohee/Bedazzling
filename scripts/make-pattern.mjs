// Builds public/assets/pattern.svg from pixelarticons (heart, circle, star, sparkle).
import { readFileSync, writeFileSync } from 'node:fs';
const d = (n) => /<path d="([^"]+)"/.exec(readFileSync(`node_modules/pixelarticons/svg/${n}.svg`, 'utf8'))[1];
const icons = ['heart', 'circle', 'star', 'sparkle'].map(d);
const S = 56, G = 112; // icon size (scale of 24 viewBox), grid step
const k = S / 24;
let body = '';
const place = (i, x, y) => `<g transform="translate(${x} ${y}) scale(${k})"><path d="${icons[i % 4]}"/></g>`;
// tile = 4 columns x 2 rows, second row shifted by half a step
for (let c = 0; c < 4; c++) body += place(c, c * G + 28, 28);
const TW = 4 * G;
for (let c = 0; c < 4; c++) {
  const x = c * G + 28 + G / 2;
  body += place(c + 2, x, 28 + G);
  if (x + S > TW) body += place(c + 2, x - TW, 28 + G); // wrap so tiles join seamlessly
}
const w = 4 * G, h = 2 * G;
writeFileSync('public/assets/pattern.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><g fill="#ff2e93" fill-opacity=".2">${body}</g></svg>`);
console.log('pattern written');
