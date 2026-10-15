// Draws the text signs around the Proving Ground onto canvas textures.

import * as THREE from 'three';

const PX_PER_M = 320;
const INK = '#ece7d6';
const ACCENT = '#e8b14a';
const PANEL = '#273023';
const HEAD = '"Barlow Condensed", "Arial Narrow", sans-serif';

/** Largest font size (px) at which `text` fits in `maxWidth`. */
function fit(g, text, weight, size, maxWidth) {
  for (; size > 8; size -= 2) {
    g.font = `${weight} ${size}px ${HEAD}`;
    if (g.measureText(text).width <= maxWidth) break;
  }
  return size;
}

function drawArrow(g, x, y, s, dir) {
  const angle = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[dir];
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.beginPath();
  g.moveTo(s * 0.5, 0);
  g.lineTo(-s * 0.3, -s * 0.45);
  g.lineTo(-s * 0.3, s * 0.45);
  g.closePath();
  g.fill();
  g.restore();
}

/**
 * @param {{title:string, lines?:string[], size:number[], arrow?:string, plain?:boolean}} sign
 *   plain: painted straight onto the surface (no panel), like a floor stencil
 */
export function signTexture(sign) {
  const w = Math.round(sign.size[0] * PX_PER_M);
  const h = Math.round(sign.size[1] * PX_PER_M);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  const lines = sign.lines ?? [];
  const pad = Math.round(Math.min(w, h) * 0.1);

  if (!sign.plain) {
    g.fillStyle = PANEL;
    g.fillRect(0, 0, w, h);
    g.fillStyle = ACCENT;
    g.fillRect(0, 0, w, Math.max(4, h * 0.05)); // amber stripe along the top
  }

  let left = pad;
  if (sign.arrow) {
    const s = Math.min(h * 0.5, w * 0.22);
    g.fillStyle = ACCENT;
    const ax = sign.arrow === 'right' ? w - pad - s * 0.5 : pad + s * 0.5;
    drawArrow(g, ax, h / 2, s, sign.arrow);
    if (sign.arrow !== 'right') left += s + pad * 0.5;
  }
  const right = sign.arrow === 'right' ? w - pad * 1.5 - Math.min(h * 0.5, w * 0.22) : w - pad;
  const textWidth = right - left;
  const centerX = left + textWidth / 2;

  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = sign.plain ? 'rgba(236,231,214,0.82)' : INK;

  const titleSize = fit(g, sign.title, 700, Math.round(h * (lines.length ? 0.4 : 0.62)), textWidth);
  const lineSize = lines.length
    ? Math.min(...lines.map((l) => fit(g, l, 500, Math.round((h * 0.42) / lines.length), textWidth)))
    : 0;
  const total = titleSize + lines.length * lineSize * 1.15;
  let y = (h - total) / 2 + titleSize / 2 + (sign.plain ? 0 : h * 0.02);
  g.font = `700 ${titleSize}px ${HEAD}`;
  g.fillText(sign.title, centerX, y);
  y += titleSize / 2 + lineSize * 0.65;
  g.font = `500 ${lineSize}px ${HEAD}`;
  g.fillStyle = sign.plain ? 'rgba(236,231,214,0.7)' : 'rgba(236,231,214,0.78)';
  for (const line of lines) {
    g.fillText(line, centerX, y);
    y += lineSize * 1.15;
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
