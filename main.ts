// The World in One Day - Sunday 22 November 2026.
// A deterministic program that draws one 1024x1024 PNG summing up the
// day's world news. Standard library only, no network, no randomness,
// no clock: the same input always produces the same bytes.
// Run: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// The image is written to <MAKEFUN_OUTPUT_DIR>/entry.png (default /output).

import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

// ---------------------------------------------------------------- raster

const W = 1024;
const H = 1024;
const img = new Uint8Array(W * H * 3);

type RGB = [number, number, number];

function setPx(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  img[i] = c[0];
  img[i + 1] = c[1];
  img[i + 2] = c[2];
}

function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) setPx(i, j, c);
  }
}

function hline(x0: number, x1: number, y: number, c: RGB): void {
  for (let x = x0; x <= x1; x++) setPx(x, y, c);
}

function vline(x: number, y0: number, y1: number, c: RGB): void {
  for (let y = y0; y <= y1; y++) setPx(x, y, c);
}

function line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  for (let guard = 0; guard < 4096; guard++) {
    setPx(x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

function disc(cx: number, cy: number, r: number, c: RGB): void {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r * r) setPx(x, y, c);
    }
  }
}

function ring(cx: number, cy: number, r: number, c: RGB): void {
  for (let a = 0; a < 360; a += 1) {
    const t = (a * Math.PI) / 180;
    setPx(Math.round(cx + r * Math.cos(t)), Math.round(cy + r * Math.sin(t)), c);
  }
}

function tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: RGB): void {
  const minX = Math.min(x0, x1, x2);
  const maxX = Math.max(x0, x1, x2);
  const minY = Math.min(y0, y1, y2);
  const maxY = Math.max(y0, y1, y2);
  const d = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
  if (d === 0) return;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const a = ((x1 - x) * (y2 - y) - (y1 - y) * (x2 - x)) / d;
      const b = ((x2 - x) * (y0 - y) - (y2 - y) * (x0 - x)) / d;
      const g = 1 - a - b;
      if (a >= 0 && b >= 0 && g >= 0) setPx(x, y, c);
    }
  }
}

// ------------------------------------------------------------------ font

// 5x7 bitmap font. Every glyph is 7 rows of 5 bits, "1" = ink.
const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  ";": ["00000", "01100", "01100", "00000", "01100", "00100", "01000"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00110", "00100", "00000", "00100"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000"],
  '"': ["01010", "01010", "00000", "00000", "00000", "00000", "00000"],
  "[": ["01110", "01000", "01000", "01000", "01000", "01000", "01110"],
  "]": ["01110", "00010", "00010", "00010", "00010", "00010", "01110"],
  "*": ["00000", "10101", "01110", "10101", "00000", "00000", "00000"],
  _: ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
  "#": ["01010", "01010", "11111", "01010", "11111", "01010", "01010"],
  "@": ["01110", "10001", "10111", "10101", "10110", "10000", "01110"],
  $: ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
  "<": ["00010", "00100", "01000", "10000", "01000", "00100", "00010"],
  ">": ["01000", "00100", "00010", "00001", "00010", "00100", "01000"],
  "|": ["00100", "00100", "00100", "00100", "00100", "00100", "00100"],
  "^": ["00100", "01010", "10001", "00000", "00000", "00000", "00000"],
  "`": ["01000", "00100", "00000", "00000", "00000", "00000", "00000"],
  "\\": ["10000", "01000", "01000", "00100", "00010", "00010", "00001"],
  "~": ["00000", "00000", "01001", "10110", "00000", "00000", "00000"],
};

function textWidth(s: string, scale: number): number {
  if (s.length === 0) return 0;
  return s.length * 6 * scale - scale;
}

function drawText(s: string, x: number, y: number, scale: number, c: RGB): void {
  let cx = x;
  for (const ch of s.toUpperCase()) {
    const g = FONT[ch] || FONT["?"];
    for (let r = 0; r < 7; r++) {
      for (let col = 0; col < 5; col++) {
        if (g[r][col] === "1") {
          fillRect(cx + col * scale, y + r * scale, scale, scale, c);
        }
      }
    }
    cx += 6 * scale;
  }
}

function wrapText(s: string, maxWidth: number, scale: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur === "" ? w : cur + " " + w;
    if (textWidth(trial, scale) <= maxWidth) {
      cur = trial;
    } else {
      if (cur !== "") lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

// ------------------------------------------------------------------- png

const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function encodePNG(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter: none
    raw.set(img.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// --------------------------------------------------------------- palette

const NAVY: RGB = [11, 21, 38];
const NAVY2: RGB = [21, 42, 69];
const PANEL: RGB = [245, 240, 230];
const INK: RGB = [20, 33, 61];
const GOLD: RGB = [232, 180, 74];
const WHITE: RGB = [245, 246, 248];
const MUTED: RGB = [168, 178, 196];
const RED: RGB = [198, 60, 44];
const ORANGE: RGB = [230, 126, 34];
const FLAME: RGB = [243, 156, 18];
const SEA: RGB = [23, 68, 104];
const SEA_DARK: RGB = [14, 48, 76];
const GREEN: RGB = [46, 125, 50];
const STEEL: RGB = [44, 95, 124];
const PURPLE: RGB = [108, 52, 131];
const SAND: RGB = [183, 121, 31];
const SKY: RGB = [214, 132, 74];
const SMOKE: RGB = [120, 128, 140];

// -------------------------------------------------------------- pictures

function drawGlobe(cx: number, cy: number, r: number, lineC: RGB, landC: RGB): void {
  disc(cx, cy, r, [38, 92, 140]);
  // land blobs
  disc(cx - Math.floor(r * 0.35), cy - Math.floor(r * 0.25), Math.floor(r * 0.42), landC);
  disc(cx + Math.floor(r * 0.4), cy + Math.floor(r * 0.3), Math.floor(r * 0.34), landC);
  disc(cx + Math.floor(r * 0.15), cy - Math.floor(r * 0.55), Math.floor(r * 0.22), landC);
  ring(cx, cy, r, lineC);
  // latitude + longitude strokes
  hline(cx - r + 4, cx + r - 4, cy, lineC);
  vline(cx, cy - r + 4, cy + r - 4, lineC);
  ring(cx, cy, Math.floor(r * 0.55), lineC);
}

// Lead scene: a tanker on a burning sea under missile trails.
function drawLeadScene(x: number, y: number, w: number, h: number): void {
  // dusk sky bands
  const bands: RGB[] = [
    [52, 34, 58],
    [94, 52, 62],
    [150, 74, 58],
    [214, 132, 74],
  ];
  const bh = Math.floor(h * 0.62 / bands.length);
  for (let i = 0; i < bands.length; i++) {
    fillRect(x, y + i * bh, w, bh + 1, bands[i]);
  }
  const seaY = y + Math.floor(h * 0.62);
  fillRect(x, seaY, w, y + h - seaY, SEA);
  fillRect(x, seaY, w, 3, [120, 170, 210]);
  // sea wave strokes
  for (let i = 0; i < 5; i++) {
    const wy = seaY + 14 + i * 16;
    const off = i * 53;
    for (let wx = x + 10 + ((off * 7) % 60); wx < x + w - 40; wx += 64) {
      hline(wx, wx + 34, wy, [90, 140, 185]);
    }
  }
  // missile trails: two dotted arcs across the sky
  for (let t = 0; t <= 20; t++) {
    const px0 = x + 20 + Math.floor((t / 20) * (w * 0.52));
    const py0 = y + 58 - Math.floor(Math.sin((t / 20) * Math.PI) * 44);
    disc(px0, py0, 2, [255, 236, 190]);
    const px1 = x + w - 30 - Math.floor((t / 20) * (w * 0.4));
    const py1 = y + 96 - Math.floor(Math.sin((t / 20) * Math.PI) * 52);
    disc(px1, py1, 2, [255, 236, 190]);
  }
  disc(x + 20 + Math.floor(w * 0.52), y + 58, 5, WHITE);
  disc(x + w - 30 - Math.floor(w * 0.4), y + 96, 5, WHITE);
  // tanker silhouette
  const hx = x + Math.floor(w * 0.12);
  const hy = seaY - 34;
  const hw = Math.floor(w * 0.76);
  fillRect(hx, hy, hw, 34, [24, 30, 40]);
  fillRect(hx + 8, hy - 22, 52, 22, [24, 30, 40]); // bridge block
  fillRect(hx + hw - 66, hy - 30, 26, 30, [150, 40, 30]); // funnel
  fillRect(hx + hw - 66, hy - 34, 26, 4, GOLD);
  // deck containers
  fillRect(hx + 70, hy - 14, 60, 14, [70, 96, 130]);
  fillRect(hx + 140, hy - 14, 60, 14, [96, 110, 130]);
  // flames on the deck
  const fx = hx + Math.floor(hw * 0.55);
  tri(fx, hy - 52, fx + 14, hy - 8, fx + 28, hy - 52, FLAME);
  tri(fx + 22, hy - 40, fx + 34, hy - 8, fx + 46, hy - 40, ORANGE);
  tri(fx + 44, hy - 30, fx + 54, hy - 8, fx + 64, hy - 30, FLAME);
  // smoke puffs
  disc(fx + 14, hy - 62, 9, SMOKE);
  disc(fx + 30, hy - 74, 11, SMOKE);
  disc(fx + 48, hy - 88, 8, SMOKE);
  // hull reflection
  for (let i = 0; i < 4; i++) {
    hline(hx + 12 + i * 8, hx + hw - 12 - i * 8, seaY + 8 + i * 7, [60, 100, 140]);
  }
}

// Small pictograms for the five grid stories, drawn in a 72x72 box.
function drawIcon(kind: string, x: number, y: number): void {
  if (kind === "cop") {
    drawGlobe(x + 36, y + 34, 30, WHITE, GREEN);
    tri(x + 52, y + 52, x + 60, y + 66, x + 68, y + 52, GREEN);
    tri(x + 60, y + 58, x + 66, y + 70, x + 72, y + 58, [120, 200, 90]);
  } else if (kind === "riyadh") {
    fillRect(x + 6, y + 30, 16, 38, STEEL);
    fillRect(x + 26, y + 18, 18, 50, NAVY2);
    fillRect(x + 48, y + 38, 14, 30, STEEL);
    tri(x + 26, y + 18, x + 35, y + 6, x + 44, y + 18, GOLD);
    // interceptor arc
    for (let t = 0; t <= 12; t++) {
      const px0 = x + 8 + Math.floor((t / 12) * 56);
      const py0 = y + 12 - Math.floor(Math.sin((t / 12) * Math.PI) * 10);
      disc(px0, py0, 2, ORANGE);
    }
    disc(x + 64, y + 2, 3, ORANGE);
  } else if (kind === "baltic") {
    fillRect(x + 8, y + 40, 56, 14, [24, 30, 40]);
    tri(x + 8, y + 40, x + 8, y + 54, x + 20, y + 54, [24, 30, 40]);
    fillRect(x + 20, y + 28, 22, 12, [24, 30, 40]);
    fillRect(x + 52, y + 24, 6, 16, [150, 40, 30]);
    tri(x + 24, y + 26, x + 32, y + 6, x + 40, y + 26, FLAME);
    tri(x + 40, y + 28, x + 47, y + 12, x + 54, y + 28, ORANGE);
    hline(x + 4, x + 68, y + 62, [90, 140, 185]);
    hline(x + 12, x + 60, y + 68, [90, 140, 185]);
  } else if (kind === "manipur") {
    fillRect(x + 26, y + 8, 20, 10, PURPLE);
    fillRect(x + 30, y + 18, 12, 8, PURPLE);
    fillRect(x + 22, y + 26, 28, 40, PURPLE);
    fillRect(x + 26, y + 34, 20, 24, [220, 170, 220]);
    // medical cross
    fillRect(x + 52, y + 44, 16, 6, RED);
    fillRect(x + 57, y + 39, 6, 16, RED);
  } else if (kind === "iraq") {
    // cooling tower
    tri(x + 16, y + 66, x + 28, y + 10, x + 40, y + 10, STEEL);
    tri(x + 56, y + 66, x + 44, y + 10, x + 32, y + 10, STEEL);
    fillRect(x + 24, y + 10, 24, 8, STEEL);
    // lightning bolt
    tri(x + 46, y + 20, x + 58, y + 20, x + 50, y + 40, GOLD);
    tri(x + 54, y + 40, x + 42, y + 40, x + 50, y + 60, GOLD);
    // flame at base
    tri(x + 18, y + 66, x + 26, y + 50, x + 34, y + 66, FLAME);
  }
}

// ---------------------------------------------------------------- layout

fillRect(0, 0, W, H, NAVY);

// Header
drawGlobe(66, 76, 38, GOLD, [64, 160, 90]);
drawText("THE WORLD IN ONE DAY", 126, 34, 5, WHITE);
drawText("SUNDAY, 22 NOVEMBER 2026", 126, 92, 3, GOLD);
drawText("SIX STORIES THAT DEFINED THE DAY", 126, 122, 2, MUTED);
fillRect(24, 148, W - 48, 3, GOLD);

// Lead story panel
const LX = 24;
const LY = 164;
const LW = W - 48;
const LH = 288;
fillRect(LX, LY, LW, LH, NAVY2);
fillRect(LX, LY, LW, 4, RED);
drawText("LEAD STORY - MIDDLE EAST", LX + 24, LY + 22, 2, [255, 120, 100]);
drawText("GULF ON FIRE", LX + 24, LY + 48, 4, GOLD);
const leadBody = wrapText(
  "IRAN STRIKES US BASES IN BAHRAIN AND TWO OIL TANKERS ARE HIT NEAR THE STRAIT OF HORMUZ. BAHRAIN SAYS A CIVILIAN SITE CAUGHT FIRE; NO INJURIES REPORTED.",
  560,
  2,
);
let ly = LY + 108;
for (const ln of leadBody) {
  drawText(ln, LX + 24, ly, 2, WHITE);
  ly += 22;
}
drawLeadScene(LX + 620, LY + 24, 340, LH - 48);
drawText("IRAN - BAHRAIN - HORMUZ", LX + 24, LY + LH - 30, 2, MUTED);

// Grid of five stories
interface Story {
  kicker: string;
  headline: string;
  body: string;
  accent: RGB;
  icon: string;
}
const stories: Story[] = [
  {
    kicker: "CLIMATE - TURKEY",
    headline: "COP31 DEADLOCKED",
    body: "CLIMATE TALKS IN ANTALYA ENTER A SECOND OVERTIME DAY AS THE DRAFT DEAL DROPS ALL MENTION OF FOSSIL FUELS.",
    accent: GREEN,
    icon: "cop",
  },
  {
    kicker: "SAUDI ARABIA",
    headline: "MISSILES OVER RIYADH",
    body: "SAUDI DEFENCES INTERCEPT THREE HOUTHI BALLISTIC MISSILES AIMED AT THE CAPITAL.",
    accent: SAND,
    icon: "riyadh",
  },
  {
    kicker: "BALTIC SEA",
    headline: "SHIP ABLAZE AT SEA",
    body: "RUSSIAN CARGO SHIP SPARTA II IS HIT BY DRONES; ITS 16 CREW ARE EVACUATED OFF FINLAND.",
    accent: STEEL,
    icon: "baltic",
  },
  {
    kicker: "INDIA",
    headline: "POISON LIQUOR KILLS 16",
    body: "TOXIC LIQUOR IN MANIPUR LEAVES ABOUT 600 PEOPLE IN HOSPITAL; SIX ARE ARRESTED.",
    accent: PURPLE,
    icon: "manipur",
  },
  {
    kicker: "IRAQ",
    headline: "POWER PLANT FIRE KILLS 4",
    body: "A BLAZE AT THE HARTHA STATION NEAR BASRA INJURES 35 AND SHUTS THE PLANT DOWN.",
    accent: ORANGE,
    icon: "iraq",
  },
];

const GX = 24;
const GY = 468;
const GW = 476;
const GH = 148;
const GAP = 12;
for (let i = 0; i < stories.length; i++) {
  const col = i % 2;
  const row = Math.floor(i / 2);
  const px0 = GX + col * (GW + GAP);
  const py0 = GY + row * (GH + GAP);
  const s = stories[i];
  fillRect(px0, py0, GW, GH, PANEL);
  fillRect(px0, py0, GW, 5, s.accent);
  drawText(s.kicker, px0 + 16, py0 + 16, 2, s.accent);
  drawText(s.headline, px0 + 16, py0 + 36, 3, INK);
  drawIcon(s.icon, px0 + 16, py0 + 66);
  const bodyLines = wrapText(s.body, GW - 128, 2);
  let by = py0 + 70;
  for (const ln of bodyLines) {
    drawText(ln, px0 + 104, by, 2, INK);
    by += 20;
  }
}
// Sixth cell: the day in numbers
const nx = GX + (GW + GAP);
const ny = GY + 2 * (GH + GAP);
fillRect(nx, ny, GW, GH, NAVY2);
fillRect(nx, ny, GW, 5, GOLD);
drawText("THE DAY IN NUMBERS", nx + 16, ny + 16, 2, GOLD);
drawText("2 TANKERS HIT", nx + 16, ny + 40, 3, WHITE);
drawText("3 MISSILES DOWN", nx + 16, ny + 66, 3, WHITE);
drawText("16 CREW SAVED", nx + 16, ny + 92, 3, WHITE);
drawText("600 IN HOSPITAL", nx + 16, ny + 118, 3, WHITE);

// Footer
drawText("SOURCES: REUTERS - AP - AL JAZEERA - UKMTO - XINHUA - CNN", 170, 968, 2, MUTED);
drawText("THE WORLD IN ONE DAY - 22 NOVEMBER 2026", 252, 992, 2, [110, 120, 140]);

// ------------------------------------------------------------------ write

const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "entry.png"), encodePNG());
